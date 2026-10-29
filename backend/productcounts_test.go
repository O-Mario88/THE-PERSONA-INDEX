package main

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

// Edwin, 2026-10-29: track the five signals as aggregate product events,
// never anyone's writing. A phone that said yes to "Count how I use the app"
// sends a fixed event name; the server adds one to that day's count.
func postCount(t *testing.T, s *Server, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/counts", bytes.NewReader([]byte(body)))
	req.Header.Set("Content-Type", "application/json")
	return do(t, s, req)
}

func TestProductCounts(t *testing.T) {
	today := fixedNow.Format(dateLayout)

	t.Run("adds one to today's count for a known event, with no pass", func(t *testing.T) {
		s := newTestServer()
		expectStatus(t, postCount(t, s, `{"event":"brief_used"}`), http.StatusAccepted)
		expectStatus(t, postCount(t, s, `{"event":"brief_used"}`), http.StatusAccepted)
		expectStatus(t, postCount(t, s, `{"event":"first_result"}`), http.StatusAccepted)
		got, err := s.productCounts.ProductCounts(context.Background(), today, today)
		if err != nil || got[today]["brief_used"] != 2 || got[today]["first_result"] != 1 || len(got[today]) != 2 {
			t.Fatalf("expected today's counts, got %v (%v)", got, err)
		}
	})

	t.Run("takes only the four events the phone can send", func(t *testing.T) {
		s := newTestServer()
		for _, e := range []string{"first_result", "brief_used", "second_mirror", "step_helped"} {
			expectStatus(t, postCount(t, s, `{"event":"`+e+`"}`), http.StatusAccepted)
		}
		expectError(t, postCount(t, s, `{"event":"opened_app"}`), http.StatusBadRequest, "invalid_request")
		expectError(t, postCount(t, s, `{}`), http.StatusBadRequest, "invalid_request")
	})

	t.Run("refuses anything more than the event, so nothing else can travel with it", func(t *testing.T) {
		s := newTestServer()
		expectError(t, postCount(t, s, `{"event":"brief_used","voterId":"x"}`), http.StatusBadRequest, "invalid_request")
		expectError(t, postCount(t, s, `{"event":"brief_used","text":"my words"}`), http.StatusBadRequest, "invalid_request")
		got, _ := s.productCounts.ProductCounts(context.Background(), today, today)
		if len(got) != 0 {
			t.Fatalf("expected nothing counted, got %v", got)
		}
	})
}
