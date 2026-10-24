package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseHeaders(t *testing.T) {
	rules, err := parseHeaders(`# a comment
/*
  X-One: a
  Cache-Control: no-cache

/assets/*
  ! Cache-Control
  Cache-Control: max-age=60

/read/:slug/
  X-One: b
`)
	if err != nil {
		t.Fatal(err)
	}
	for path, want := range map[string]map[string]string{
		"/":            {"X-One": "a", "Cache-Control": "no-cache"},
		"/assets/x.js": {"X-One": "a", "Cache-Control": "max-age=60"},
		"/read/sleep/": {"X-One": "a, b", "Cache-Control": "no-cache"},
		"/read/a/b/":   {"X-One": "a"},
	} {
		h := http.Header{}
		applyHeaders(h, rules, path)
		for k, v := range want {
			if got := h.Get(k); got != v {
				t.Errorf("%s: %s = %q, want %q", path, k, got, v)
			}
		}
	}
	for name, bad := range map[string]string{
		"header before a path": "  X-One: a\n",
		"path without a slash": "read/*\n  X-One: a\n",
		"header without value": "/*\n  X-One:\n",
		"header without colon": "/*\n  X-One a\n",
	} {
		if _, err := parseHeaders(bad); err == nil {
			t.Errorf("%s: no error", name)
		}
	}
}

// The site's real _headers file: the app may run only its own scripts, the
// read pages run none, and each kind of file is cached as it should be.
func TestTheSiteHeadersFile(t *testing.T) {
	raw, err := os.ReadFile("../frontend/public/_headers")
	if err != nil {
		t.Fatal(err)
	}
	rules, err := parseHeaders(string(raw))
	if err != nil {
		t.Fatal(err)
	}
	at := func(path string) http.Header {
		h := http.Header{}
		applyHeaders(h, rules, path)
		return h
	}
	for _, path := range []string{"/", "/read/", "/read/sleep/", "/assets/index-abc.js", "/sw.js"} {
		h := at(path)
		for _, k := range []string{"Strict-Transport-Security", "X-Content-Type-Options", "Referrer-Policy", "Content-Security-Policy"} {
			if h.Get(k) == "" {
				t.Errorf("%s has no %s", path, k)
			}
		}
		if strings.Contains(h.Get("Content-Security-Policy"), ",") {
			t.Errorf("%s gets two content policies: %s", path, h.Get("Content-Security-Policy"))
		}
	}
	app := at("/").Get("Content-Security-Policy")
	for _, want := range []string{"default-src 'self'", "script-src 'self'", "frame-ancestors 'none'", "object-src 'none'"} {
		if !strings.Contains(app, want) {
			t.Errorf("app policy lacks %s: %s", want, app)
		}
	}
	for _, d := range strings.Split(app, ";") {
		if d = strings.TrimSpace(d); strings.HasPrefix(d, "script-src") && d != "script-src 'self'" {
			t.Errorf("app scripts must come from the site alone: %s", d)
		}
	}
	if strings.Contains(app, "unsafe-") {
		t.Errorf("app policy allows something unsafe: %s", app)
	}
	read := at("/read/sleep/").Get("Content-Security-Policy")
	if !strings.Contains(read, "default-src 'none'") || strings.Contains(read, "script-src") {
		t.Errorf("read pages must run no script: %s", read)
	}
	if got := at("/assets/index-abc.js").Get("Cache-Control"); !strings.Contains(got, "immutable") {
		t.Errorf("assets cached as %q", got)
	}
	for _, path := range []string{"/", "/sw.js", "/read/sleep/"} {
		if got := at(path).Get("Cache-Control"); got != "no-cache" {
			t.Errorf("%s cached as %q, want no-cache", path, got)
		}
	}
}

func writeSite(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	for name, body := range map[string]string{
		"index.html":            "<!doctype html><title>app</title>",
		"read/index.html":       "<!doctype html><title>reads</title>",
		"read/sleep/index.html": "<!doctype html><title>sleep</title>",
		"assets/index-abc.js":   "console.log(1)",
		"manifest.webmanifest":  "{}",
		".env":                  "SECRET=1",
		"_headers":              "/*\n  X-Site: yes\n/read/*\n  X-Read: yes\n",
	} {
		p := filepath.Join(dir, name)
		os.MkdirAll(filepath.Dir(p), 0o755)
		if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

func TestStaticSite(t *testing.T) {
	site, err := newStaticSite(writeSite(t))
	if err != nil {
		t.Fatal(err)
	}
	s := newTestServer()
	s.static = site
	get := func(method, path string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		s.Handler().ServeHTTP(w, httptest.NewRequest(method, path, nil))
		return w
	}
	for path, want := range map[string]string{"/": "app", "/c/abcdefghjk": "app", "/read/": "reads", "/read/sleep/": "sleep", "/assets/index-abc.js": "console"} {
		w := get(http.MethodGet, path)
		if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), want) {
			t.Errorf("%s: %d %q", path, w.Code, w.Body)
		}
		if w.Header().Get("X-Site") != "yes" {
			t.Errorf("%s lacks the site headers", path)
		}
	}
	if w := get(http.MethodGet, "/read/sleep/"); w.Header().Get("X-Read") != "yes" {
		t.Error("read page lacks its own headers")
	}
	if w := get(http.MethodGet, "/manifest.webmanifest"); w.Header().Get("Content-Type") != "application/manifest+json" {
		t.Errorf("manifest served as %q", w.Header().Get("Content-Type"))
	}
	for _, hidden := range []string{"/_headers", "/.env", "/assets/", "/nowhere", "/c/short", "/c/abcdefghjk/x"} {
		if w := get(http.MethodGet, hidden); w.Code != http.StatusNotFound {
			t.Errorf("%s: %d, want 404", hidden, w.Code)
		}
	}
	if w := get(http.MethodPost, "/"); w.Code != http.StatusMethodNotAllowed {
		t.Errorf("POST /: %d", w.Code)
	}
	// The API is still the API, with its own headers, beside the site.
	w := get(http.MethodGet, "/api/health")
	if w.Code != http.StatusOK || w.Header().Get("X-Site") != "" || w.Header().Get("Content-Security-Policy") != apiHeaders["Content-Security-Policy"] {
		t.Errorf("API beside the site: %d %v", w.Code, w.Header())
	}
	if _, err := newStaticSite(t.TempDir()); err == nil {
		t.Error("a folder without index.html was accepted")
	}
}
