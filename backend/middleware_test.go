package main

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func serve(s *Server, req *http.Request) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, req)
	return w
}

func TestAPIResponsesCarryTheSecurityHeaders(t *testing.T) {
	s := newTestServer()
	for _, path := range []string{"/api/health", "/api/editions/" + today, "/api/editions/1999-01-01", "/api/nothing-here", "/elsewhere"} {
		w := serve(s, httptest.NewRequest(http.MethodGet, path, nil))
		for k, v := range apiHeaders {
			if got := w.Header().Get(k); got != v {
				t.Errorf("%s (%d): %s = %q, want %q", path, w.Code, k, got, v)
			}
		}
		if w.Header().Get("X-Request-Id") == "" {
			t.Errorf("%s: no request id", path)
		}
	}
	if w := serve(s, httptest.NewRequest(http.MethodGet, "/elsewhere", nil)); w.Code != http.StatusNotFound || !strings.Contains(w.Body.String(), "not_found") {
		t.Errorf("a path outside the API with no static site: %d %s", w.Code, w.Body)
	}
}

func TestRequestIDComesFromTheEdgeOnlyWhenTrusted(t *testing.T) {
	s := newTestServer()
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	req.Header.Set("CF-Ray", "8f00aa-LHR")
	if got := serve(s, req).Header().Get("X-Request-Id"); got == "8f00aa-LHR" {
		t.Error("an untrusted CF-Ray was used")
	}
	s.trustCF = true
	if got := serve(s, req).Header().Get("X-Request-Id"); got != "8f00aa-LHR" {
		t.Errorf("request id = %q, want the edge's", got)
	}
}

func TestEdgeSecretKeepsTheOriginBehindTheEdge(t *testing.T) {
	s := newTestServer()
	s.edgeSecret = strings.Repeat("s", 40)
	path := "/api/editions/" + today

	if w := serve(s, httptest.NewRequest(http.MethodGet, path, nil)); w.Code != http.StatusForbidden || !strings.Contains(w.Body.String(), "edge_only") {
		t.Errorf("without the secret: %d %s", w.Code, w.Body)
	}
	wrong := httptest.NewRequest(http.MethodGet, path, nil)
	wrong.Header.Set("X-Edge-Secret", strings.Repeat("x", 40))
	if w := serve(s, wrong); w.Code != http.StatusForbidden {
		t.Errorf("with a wrong secret: %d", w.Code)
	}
	right := httptest.NewRequest(http.MethodGet, path, nil)
	right.Header.Set("X-Edge-Secret", s.edgeSecret)
	if w := serve(s, right); w.Code != http.StatusOK {
		t.Errorf("with the secret: %d %s", w.Code, w.Body)
	}
	for _, open := range []string{"/api/health", "/api/ready"} {
		if w := serve(s, httptest.NewRequest(http.MethodGet, open, nil)); w.Code != http.StatusOK {
			t.Errorf("%s is for the host's checks and needs no secret: %d", open, w.Code)
		}
	}
	var b strings.Builder
	s.writeMetrics(context.Background(), &b)
	if !strings.Contains(b.String(), "persona_edge_refused_total 2") {
		t.Errorf("refusals not counted:\n%s", grepLines(b.String(), "refused"))
	}
}

func TestSameSecret(t *testing.T) {
	if !sameSecret("abc", "abc") || sameSecret("abd", "abc") || sameSecret("", "") || sameSecret("abc", "") {
		t.Error("sameSecret is wrong")
	}
}

func TestAPanicIsAnswered500AndCounted(t *testing.T) {
	s := newTestServer()
	h := s.observe(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("a bug") }))
	var logs bytes.Buffer
	defer slog.SetDefault(slog.Default())
	slog.SetDefault(slog.New(slog.NewTextHandler(&logs, nil)))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/x", nil))
	if w.Code != http.StatusInternalServerError || !strings.Contains(w.Body.String(), "internal") {
		t.Errorf("panic answered %d %s", w.Code, w.Body)
	}
	if !strings.Contains(logs.String(), "a bug") {
		t.Errorf("panic not logged: %s", logs.String())
	}
	var b strings.Builder
	s.writeMetrics(context.Background(), &b)
	if !strings.Contains(b.String(), "persona_http_panics_total 1") {
		t.Error("panic not counted")
	}
}

func TestMetricsNameRoutesNeverPaths(t *testing.T) {
	s := newTestServer()
	serve(s, httptest.NewRequest(http.MethodGet, "/api/editions/"+today, nil))
	serve(s, httptest.NewRequest(http.MethodGet, "/api/editions/1999-01-01", nil))
	serve(s, httptest.NewRequest(http.MethodGet, "/api/what?who=me", nil))
	var b strings.Builder
	s.writeMetrics(context.Background(), &b)
	out := b.String()
	for _, want := range []string{
		`persona_http_requests_total{route="GET /api/editions/{date}",code="200"} 1`,
		`persona_http_requests_total{route="GET /api/editions/{date}",code="404"} 1`,
		`persona_http_requests_total{route="unmatched",code="404"} 1`,
		`persona_http_request_duration_seconds_count{route="GET /api/editions/{date}"} 2`,
		`persona_tally_backlog_votes 0`,
		`persona_build_info{version=`,
	} {
		if !strings.Contains(out, want) {
			t.Errorf("metrics lack %s", want)
		}
	}
	for _, never := range []string{today, "1999-01-01", "who=me", "/api/what"} {
		if strings.Contains(out, never) {
			t.Errorf("metrics hold %q", never)
		}
	}
}

func TestMetricsOnTheMainPortNeedTheToken(t *testing.T) {
	s := newTestServer()
	if w := serve(s, httptest.NewRequest(http.MethodGet, "/metrics", nil)); w.Code != http.StatusNotFound {
		t.Errorf("metrics served without a token set: %d", w.Code)
	}
	s.metricsToken = strings.Repeat("m", 32)
	if w := serve(s, httptest.NewRequest(http.MethodGet, "/metrics", nil)); w.Code != http.StatusUnauthorized {
		t.Errorf("metrics without the token: %d", w.Code)
	}
	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	req.Header.Set("Authorization", "Bearer "+s.metricsToken)
	w := serve(s, req)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "# TYPE persona_http_requests_total counter") {
		t.Errorf("metrics with the token: %d", w.Code)
	}
	// The private listener (METRICS_ADDR) needs none.
	w = httptest.NewRecorder()
	s.MetricsHandler("").ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	if w.Code != http.StatusOK {
		t.Errorf("private metrics: %d", w.Code)
	}
}

type downStore struct{ *memoryStore }

func (downStore) Ping(context.Context) error { return errors.New("connection refused") }

func TestReady(t *testing.T) {
	s := newTestServer()
	if w := serve(s, httptest.NewRequest(http.MethodGet, "/api/ready", nil)); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "ready") {
		t.Errorf("ready: %d %s", w.Code, w.Body)
	}
	s.draining.Store(true)
	if w := serve(s, httptest.NewRequest(http.MethodGet, "/api/ready", nil)); w.Code != http.StatusServiceUnavailable {
		t.Errorf("ready while shutting down: %d", w.Code)
	}
	if w := serve(s, httptest.NewRequest(http.MethodGet, "/api/health", nil)); w.Code != http.StatusOK {
		t.Errorf("health while shutting down: %d (it only says the process is alive)", w.Code)
	}

	down := NewServer(newTestServer().clock, fixtureBank{}, downStore{newMemoryStore()}, newDeviceSigner(testSecret))
	if w := serve(down, httptest.NewRequest(http.MethodGet, "/api/ready", nil)); w.Code != http.StatusServiceUnavailable || !strings.Contains(w.Body.String(), "database") {
		t.Errorf("ready with the database down: %d %s", w.Code, w.Body)
	}
}

func TestAccessLog(t *testing.T) {
	var logs bytes.Buffer
	defer slog.SetDefault(slog.Default())
	slog.SetDefault(slog.New(slog.NewJSONHandler(&logs, nil)))

	s := newTestServer()
	req := httptest.NewRequest(http.MethodGet, "/api/editions/"+today+"?secret=1", nil)
	req.RemoteAddr = "203.0.113.9:4000"
	serve(s, req)
	if logs.Len() != 0 {
		t.Errorf("errors-only log wrote a line for a 200: %s", logs.String())
	}
	s.accessLog = "all"
	serve(s, req)
	line := logs.String()
	if !strings.Contains(line, `"route":"GET /api/editions/{date}"`) || !strings.Contains(line, `"status":200`) {
		t.Errorf("access log line = %s", line)
	}
	for _, never := range []string{today, "secret", "203.0.113.9"} {
		if strings.Contains(line, never) {
			t.Errorf("access log holds %q: %s", never, line)
		}
	}
	logs.Reset()
	s.accessLog = "off"
	serve(s, req)
	if logs.Len() != 0 {
		t.Errorf("access log off still wrote: %s", logs.String())
	}
}

func grepLines(s, sub string) string {
	var out []string
	for _, l := range strings.Split(s, "\n") {
		if strings.Contains(l, sub) {
			out = append(out, l)
		}
	}
	return strings.Join(out, "\n")
}
