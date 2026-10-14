package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"
)

// Acceptance tests for the pre-traffic fixes from the 2026-10-14 architecture
// review: server-signed device tokens, the UTC midnight rollover, abuse limits
// and a raw device id that never reaches storage.

func issueDevice(t *testing.T, s *Server, remoteAddr string) string {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/device", nil)
	if remoteAddr != "" {
		req.RemoteAddr = remoteAddr
	}
	w := do(t, s, req)
	expectStatus(t, w, http.StatusCreated)
	if cc := w.Header().Get("Cache-Control"); cc != "no-store" {
		t.Fatalf("device tokens must never be cached, got %q", cc)
	}
	tok := decode[DeviceIssued](t, w).Token
	if tok == "" {
		t.Fatal("expected a token")
	}
	return tok
}

func TestDeviceTokens(t *testing.T) {
	t.Run("the server issues a signed device token that can vote", func(t *testing.T) {
		s := newTestServer()
		tok := issueDevice(t, s, "")
		v := VoteRequest{QuestionID: "q-dishes", OptionID: "right-away", VoterID: tok}
		expectStatus(t, postVote(t, s, v, "k1"), http.StatusAccepted)
	})

	t.Run("two issued tokens are two different devices", func(t *testing.T) {
		s := newTestServer()
		a, b := issueDevice(t, s, ""), issueDevice(t, s, "")
		if a == b {
			t.Fatal("expected distinct tokens")
		}
		expectStatus(t, postVote(t, s, VoteRequest{QuestionID: "q-bill", OptionID: "even", VoterID: a}, "k"), http.StatusAccepted)
		expectStatus(t, postVote(t, s, VoteRequest{QuestionID: "q-bill", OptionID: "even", VoterID: b}, "k"), http.StatusAccepted)
	})

	t.Run("a device id the browser made up cannot vote", func(t *testing.T) {
		s := newTestServer()
		for i, forged := range []string{"made-up-id", "v1.AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA", "has spaces"} {
			v := VoteRequest{QuestionID: "q-dishes", OptionID: "right-away", VoterID: forged}
			expectError(t, postRaw(t, s, v, fmt.Sprintf("k%d", i)), http.StatusUnauthorized, "invalid_device")
		}
	})

	t.Run("a token signed with another server's secret cannot vote", func(t *testing.T) {
		other := newDeviceSigner([]byte("a-different-secret-of-enough-length"))
		v := VoteRequest{QuestionID: "q-dishes", OptionID: "right-away", VoterID: other.Issue()}
		expectError(t, postRaw(t, newTestServer(), v, "k1"), http.StatusUnauthorized, "invalid_device")
	})

	t.Run("a tampered token cannot vote", func(t *testing.T) {
		s := newTestServer()
		tok := issueDevice(t, s, "")
		i := strings.LastIndexByte(tok, '.') - 1
		flipped := tok[:i] + string("AB"[boolToInt(tok[i] == 'A')]) + tok[i+1:]
		v := VoteRequest{QuestionID: "q-dishes", OptionID: "right-away", VoterID: flipped}
		expectError(t, postRaw(t, s, v, "k1"), http.StatusUnauthorized, "invalid_device")
	})

	t.Run("the raw device id never reaches the vote store", func(t *testing.T) {
		s := newTestServer()
		tok := issueDevice(t, s, "")
		expectStatus(t, postVote(t, s, VoteRequest{QuestionID: "q-dishes", OptionID: "right-away", VoterID: tok}, "k1"), http.StatusAccepted)
		id, _ := s.devices.Verify(tok)
		_ = id
		mem, ok := s.votes.(*memoryStore)
		if !ok {
			t.Skip("inspects the in-memory store only")
		}
		for _, e := range mem.events {
			if e.VoterHash == id || e.VoterHash == tok || strings.Contains(e.VoterHash, id) {
				t.Fatalf("stored voter key leaks the device id: %q", e.VoterHash)
			}
		}
	})
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func TestAbuseLimits(t *testing.T) {
	t.Run("one device cannot fire unlimited votes", func(t *testing.T) {
		s := newTestServer()
		tok := issueDevice(t, s, "")
		limited := 0
		for i := range votesPerDevicePerMinute + 5 {
			v := VoteRequest{QuestionID: "q-dishes", OptionID: "right-away", VoterID: tok}
			if postVote(t, s, v, fmt.Sprintf("k%d", i)).Code == http.StatusTooManyRequests {
				limited++
			}
		}
		if limited != 5 {
			t.Fatalf("expected 5 requests over the limit to get 429, got %d", limited)
		}
	})

	t.Run("the vote limit resets after a minute", func(t *testing.T) {
		s := newTestServer()
		now := fixedNow
		s.clock = func() time.Time { return now }
		tok := issueDevice(t, s, "")
		v := VoteRequest{QuestionID: "q-dishes", OptionID: "right-away", VoterID: tok}
		for i := range votesPerDevicePerMinute {
			postVote(t, s, v, fmt.Sprintf("k%d", i))
		}
		expectError(t, postVote(t, s, v, "over"), http.StatusTooManyRequests, "rate_limited")
		now = now.Add(time.Minute)
		expectStatus(t, postVote(t, s, v, "k0"), http.StatusAccepted)
	})

	t.Run("one network address cannot mint unlimited devices", func(t *testing.T) {
		s := newTestServer()
		for range devicesPerAddressPerHour {
			issueDevice(t, s, "203.0.113.7:4000")
		}
		req := httptest.NewRequest(http.MethodPost, "/api/device", nil)
		req.RemoteAddr = "203.0.113.7:5000"
		w := do(t, s, req)
		expectError(t, w, http.StatusTooManyRequests, "rate_limited")
		if w.Header().Get("Retry-After") == "" {
			t.Fatal("expected a Retry-After header")
		}
		issueDevice(t, s, "198.51.100.1:4000") // another address is unaffected
	})
}

func TestMidnightRollover(t *testing.T) {
	nextDay := func(h, m int) time.Time { return time.Date(2026, 10, 13, h, m, 0, 0, time.UTC) }

	t.Run("a vote on yesterday's question just after midnight is accepted", func(t *testing.T) {
		s := newTestServer()
		s.clock = func() time.Time { return nextDay(0, 3) }
		expectStatus(t, postVote(t, s, vote, "k1"), http.StatusAccepted)
	})

	t.Run("yesterday's questions stop taking votes once the grace window ends", func(t *testing.T) {
		s := newTestServer()
		s.clock = func() time.Time { return nextDay(0, 0).Add(rolloverGrace + time.Second) }
		expectError(t, postVote(t, s, vote, "k1"), http.StatusNotFound, "unknown_question")
	})

	t.Run("yesterday's final results stay readable the next day", func(t *testing.T) {
		s := newTestServer()
		expectStatus(t, postVote(t, s, vote, "k1"), http.StatusAccepted)
		s.clock = func() time.Time { return nextDay(15, 0) }
		if n := totalVotes(t, s, "q-dishes"); n != 1 {
			t.Fatalf("expected yesterday's 1 vote, got %d", n)
		}
	})

	t.Run("the edge never holds today's set past midnight", func(t *testing.T) {
		s := newTestServer()
		s.clock = func() time.Time { return time.Date(2026, 10, 12, 23, 59, 30, 0, time.UTC) }
		w := get(t, s, "/api/questions/today")
		expectStatus(t, w, http.StatusOK)
		for _, d := range []string{"max-age", "s-maxage"} {
			if n := directive(t, w.Header().Get("Cache-Control"), d); n > 30 {
				t.Fatalf("%s=%d outlives the set, which ends in 30s", d, n)
			}
		}
	})

	t.Run("the cache window plus the edge lifetime fits inside the grace window", func(t *testing.T) {
		if todayEdgeTTL+todayBrowserTTL >= rolloverGrace {
			t.Fatalf("a client holding a cached set could vote after the grace window: %v + %v >= %v",
				todayEdgeTTL, todayBrowserTTL, rolloverGrace)
		}
	})
}

// directive returns the seconds value of a Cache-Control directive.
func directive(t *testing.T, cc, name string) int {
	t.Helper()
	for _, part := range strings.Split(cc, ",") {
		k, v, ok := strings.Cut(strings.TrimSpace(part), "=")
		if ok && k == name {
			n, err := strconv.Atoi(v)
			if err != nil {
				t.Fatalf("bad %s in %q", name, cc)
			}
			return n
		}
	}
	t.Fatalf("no %s in %q", name, cc)
	return 0
}

func TestServerHardening(t *testing.T) {
	srv := newHTTPServer(":0", http.NotFoundHandler())
	if srv.ReadHeaderTimeout == 0 || srv.ReadTimeout == 0 || srv.WriteTimeout == 0 || srv.IdleTimeout == 0 {
		t.Fatalf("every server timeout must be set: %+v", srv)
	}
	if srv.MaxHeaderBytes == 0 || srv.MaxHeaderBytes > 64<<10 {
		t.Fatalf("expected a small header limit, got %d", srv.MaxHeaderBytes)
	}
}
