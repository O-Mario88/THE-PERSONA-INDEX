package main

import (
	"bufio"
	"errors"
	"fmt"
	"io/fs"
	"mime"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"
)

// The static site (STATIC_DIR, the frontend build): the app, the public read
// pages, the service worker and the icons, served by the same instance as the
// API, so one container is a whole deploy on any host. Its response headers
// come from the build's _headers file (frontend/public/_headers), the format
// Cloudflare Pages reads, so the site gets the same headers whichever serves
// it, and they are written down in one place.

func init() {
	// Go's table has no entry for the web app manifest.
	mime.AddExtensionType(".webmanifest", "application/manifest+json")
}

type staticSite struct {
	files   http.Handler
	headers []headerRule
}

// newStaticSite serves dir, which must hold index.html, with the headers in
// dir/_headers if it has one.
func newStaticSite(dir string) (*staticSite, error) {
	if _, err := os.Stat(filepath.Join(dir, "index.html")); err != nil {
		return nil, fmt.Errorf("static site %s: %w", dir, err)
	}
	site := &staticSite{files: http.FileServer(siteFS{http.Dir(dir)})}
	raw, err := os.ReadFile(filepath.Join(dir, "_headers"))
	switch {
	case errors.Is(err, fs.ErrNotExist):
	case err != nil:
		return nil, err
	default:
		if site.headers, err = parseHeaders(string(raw)); err != nil {
			return nil, fmt.Errorf("%s/_headers: %w", dir, err)
		}
	}
	return site, nil
}

func (s *staticSite) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	applyHeaders(w.Header(), s.headers, r.URL.Path)
	// An invite link (personaindex.com/c/<code>) opens the app, which reads
	// the code from the address (frontend/src/social.ts). frontend/public/
	// _redirects says the same for Cloudflare Pages.
	if invitePath.MatchString(r.URL.Path) {
		r = r.Clone(r.Context())
		r.URL.Path = "/"
	}
	s.files.ServeHTTP(w, r)
}

var invitePath = regexp.MustCompile(`^/c/[a-z2-9]{10}$`)

// siteFS hides what is not part of the site (the _headers and _redirects
// files, dot files) and never lists a folder: a folder without index.html is
// not found. Other underscore names are the site's own: the React Native web
// build keeps its script under /_expo/ (mobile/scripts/build-web.mjs).
type siteFS struct{ fs http.FileSystem }

func (s siteFS) Open(name string) (http.File, error) {
	for _, part := range strings.Split(name, "/") {
		if strings.HasPrefix(part, ".") || part == "_headers" || part == "_redirects" {
			return nil, fs.ErrNotExist
		}
	}
	f, err := s.fs.Open(name)
	if err != nil {
		return nil, err
	}
	if st, err := f.Stat(); err == nil && st.IsDir() {
		index, err := s.fs.Open(path.Join(name, "index.html"))
		if err != nil {
			f.Close()
			return nil, fs.ErrNotExist
		}
		index.Close()
	}
	return f, nil
}

// A _headers file, as Cloudflare Pages reads it: a URL path pattern on its
// own line, then indented "Name: value" lines for it, or "! Name" to remove
// a header an earlier rule set. In a pattern, * matches anything and :name
// matches one path segment. Every rule that matches applies, in file order;
// a header set by two rules has its values joined with a comma.

type headerRule struct {
	pattern *regexp.Regexp
	source  string
	ops     []headerOp
}

type headerOp struct {
	name   string
	value  string
	detach bool
}

var placeholder = regexp.MustCompile(`:[A-Za-z]\w*`)

func parseHeaders(raw string) ([]headerRule, error) {
	var rules []headerRule
	sc := bufio.NewScanner(strings.NewReader(raw))
	line := 0
	for sc.Scan() {
		line++
		text := sc.Text()
		trimmed := strings.TrimSpace(text)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		indented := text[0] == ' ' || text[0] == '\t'
		if !indented {
			if !strings.HasPrefix(trimmed, "/") {
				return nil, fmt.Errorf("line %d: a rule starts with a path beginning with /, not %q", line, trimmed)
			}
			var re strings.Builder
			re.WriteString("^")
			rest := trimmed
			for rest != "" {
				switch {
				case rest[0] == '*':
					re.WriteString(".*")
					rest = rest[1:]
				case placeholder.MatchString(rest) && placeholder.FindStringIndex(rest)[0] == 0:
					loc := placeholder.FindStringIndex(rest)
					re.WriteString("[^/]+")
					rest = rest[loc[1]:]
				default:
					re.WriteString(regexp.QuoteMeta(rest[:1]))
					rest = rest[1:]
				}
			}
			re.WriteString("$")
			rules = append(rules, headerRule{pattern: regexp.MustCompile(re.String()), source: trimmed})
			continue
		}
		if len(rules) == 0 {
			return nil, fmt.Errorf("line %d: a header before any path", line)
		}
		rule := &rules[len(rules)-1]
		if name, ok := strings.CutPrefix(trimmed, "!"); ok {
			rule.ops = append(rule.ops, headerOp{name: http.CanonicalHeaderKey(strings.TrimSpace(name)), detach: true})
			continue
		}
		name, value, ok := strings.Cut(trimmed, ":")
		name, value = strings.TrimSpace(name), strings.TrimSpace(value)
		if !ok || name == "" || value == "" || strings.ContainsAny(name, " \t") {
			return nil, fmt.Errorf("line %d: expected \"Name: value\", not %q", line, trimmed)
		}
		rule.ops = append(rule.ops, headerOp{name: http.CanonicalHeaderKey(name), value: value})
	}
	return rules, sc.Err()
}

// applyHeaders sets on h every header the rules give urlPath.
func applyHeaders(h http.Header, rules []headerRule, urlPath string) {
	set := map[string]bool{}
	for _, r := range rules {
		if !r.pattern.MatchString(urlPath) {
			continue
		}
		for _, op := range r.ops {
			switch {
			case op.detach:
				h.Del(op.name)
				delete(set, op.name)
			case set[op.name]:
				h.Set(op.name, h.Get(op.name)+", "+op.value)
			default:
				h.Set(op.name, op.value)
				set[op.name] = true
			}
		}
	}
}
