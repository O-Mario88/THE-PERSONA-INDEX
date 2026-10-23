package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"log/slog"
	"net/http"
	"runtime/debug"
	"strings"
	"time"
)

// The safety layers around the API (Phase 4 of the review of 2026-10-15,
// "ready for people"): every response carries the security headers, a
// request that skipped the edge is refused when EDGE_SECRET is set, a bug in
// one request is answered 500 instead of dropping the connection, and each
// request is counted for the metrics by its route pattern alone.

// slowRequest is how long a request may take before the access log notes it.
const slowRequest = time.Second

// apiHeaders go on every API response. The API returns JSON only, so its
// content policy allows nothing to load or frame it.
var apiHeaders = map[string]string{
	"X-Content-Type-Options":       "nosniff",
	"Referrer-Policy":              "no-referrer",
	"X-Frame-Options":              "DENY",
	"Cross-Origin-Resource-Policy": "same-origin",
	"Content-Security-Policy":      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
	"Strict-Transport-Security":    "max-age=31536000",
}

// openPaths answer without the edge secret: the host's own health checks
// reach the instance directly, and they show nothing about anyone.
var openPaths = map[string]bool{"/api/health": true, "/api/ready": true}

// Handler is the whole HTTP surface of one instance: the API, the static
// site when one is set (SetStatic), metrics behind a token when one is set,
// and the safety layers around them.
func (s *Server) Handler() http.Handler {
	api := s.Routes()
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasPrefix(r.URL.Path, "/api/"):
			for k, v := range apiHeaders {
				w.Header().Set(k, v)
			}
			api.ServeHTTP(w, r)
		case r.URL.Path == "/metrics" && s.metricsToken != "":
			s.MetricsHandler(s.metricsToken).ServeHTTP(w, r)
		case s.static != nil:
			s.static.ServeHTTP(w, r)
		default:
			for k, v := range apiHeaders {
				w.Header().Set(k, v)
			}
			writeError(w, http.StatusNotFound, "not_found")
		}
	})
	return s.observe(s.edgeOnly(inner))
}

// edgeOnly refuses requests that did not come through the edge, when an edge
// secret is set.
func (s *Server) edgeOnly(next http.Handler) http.Handler {
	if s.edgeSecret == "" {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !openPaths[r.URL.Path] && !sameSecret(r.Header.Get("X-Edge-Secret"), s.edgeSecret) {
			s.metrics.countRefused()
			for k, v := range apiHeaders {
				w.Header().Set(k, v)
			}
			writeError(w, http.StatusForbidden, "edge_only")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// sameSecret compares in constant time, whatever the lengths.
func sameSecret(got, want string) bool {
	a, b := sha256.Sum256([]byte(got)), sha256.Sum256([]byte(want))
	return subtle.ConstantTimeCompare(a[:], b[:]) == 1 && want != ""
}

type requestIDKey struct{}

// requestID is the edge's own id for the request (Cloudflare's CF-Ray, when
// the edge is trusted) or a fresh random one, for matching a log line to a
// report.
func (s *Server) requestID(r *http.Request) string {
	if s.trustCF {
		if ray := r.Header.Get("CF-Ray"); ray != "" && len(ray) <= 64 {
			return ray
		}
	}
	var b [8]byte
	rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

// statusWriter remembers the status and size of a response.
type statusWriter struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (w *statusWriter) WriteHeader(code int) {
	if w.status == 0 {
		w.status = code
	}
	w.ResponseWriter.WriteHeader(code)
}

func (w *statusWriter) Write(b []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	n, err := w.ResponseWriter.Write(b)
	w.bytes += n
	return n, err
}

func (w *statusWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

// observe gives each request an id, answers a panic with 500, and counts and
// logs the request by its route pattern: never its address, pass, query or
// body.
func (s *Server) observe(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		id := s.requestID(r)
		w.Header().Set("X-Request-Id", id)
		r = r.WithContext(context.WithValue(r.Context(), requestIDKey{}, id))
		sw := &statusWriter{ResponseWriter: w}
		defer func() {
			if p := recover(); p != nil {
				if p == http.ErrAbortHandler {
					panic(p)
				}
				s.metrics.countPanic()
				slog.Error("panic", "request_id", id, "route", routeOf(r), "panic", fmt.Sprint(p), "stack", string(debug.Stack()))
				if sw.status == 0 {
					writeError(sw, http.StatusInternalServerError, "internal")
				}
			}
			d := time.Since(start)
			route := routeOf(r)
			s.metrics.observeRequest(route, sw.status, d)
			if s.accessLog == "all" || (s.accessLog == "errors" && (sw.status >= 500 || d >= slowRequest)) {
				level := slog.LevelInfo
				if sw.status >= 500 {
					level = slog.LevelError
				} else if d >= slowRequest {
					level = slog.LevelWarn
				}
				slog.Log(r.Context(), level, "request", "request_id", id, "method", r.Method, "route", route,
					"status", sw.status, "duration_ms", float64(d.Microseconds())/1000, "bytes", sw.bytes)
			}
		}()
		next.ServeHTTP(sw, r)
		if sw.status == 0 {
			sw.status = http.StatusOK
		}
	})
}

// routeOf names a request by the pattern that served it, so the metrics
// never hold a date, a question id or anything typed into the address bar.
func routeOf(r *http.Request) string {
	switch {
	case r.Pattern != "":
		return r.Pattern
	case r.URL.Path == "/metrics":
		return "metrics"
	case strings.HasPrefix(r.URL.Path, "/api/"):
		return "unmatched"
	default:
		return "static"
	}
}

// pinger is a store that can check the database answers.
type pinger interface {
	Ping(ctx context.Context) error
}

// Ready is GET /api/ready: 200 when this instance can serve (its database
// answers and it is not shutting down), else 503, so a host sends traffic
// elsewhere. GET /api/health stays a bare liveness check.
func (s *Server) Ready(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if s.draining.Load() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "shutting_down"})
		return
	}
	if p, ok := s.votes.(pinger); ok {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := p.Ping(ctx); err != nil {
			slog.Warn("ready: database did not answer", "error", err)
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "database_unavailable"})
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}
