package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHealthCheck(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	w := httptest.NewRecorder()

	HealthCheckHandler(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	expected := `{"status":"ok"}`
	if w.Body.String() != expected {
		t.Fatalf("expected body %s, got %s", expected, w.Body.String())
	}
}
