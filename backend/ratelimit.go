package main

import (
	"net"
	"net/http"
	"sync"
	"time"
)

// Per-instance abuse floor. The edge (Cloudflare rate-limiting rules, see
// docs/operations.md) is the first line; these limits make sure a client that
// reaches an instance directly still cannot stuff the ballot box.
const (
	votesPerDevicePerMinute  = 30 // a sitting of three needs 3 votes, 3 ratings and a few steps
	devicesPerAddressPerHour = 20 // households and shared networks need a few
	forgetsPerAddressPerHour = 20 // "Delete everything" is rare; a made-up pass deletes nothing
)

// windowLimiter counts events per key in fixed windows. Memory is bounded by
// dropping finished windows whenever the map is swept.
type windowLimiter struct {
	mu     sync.Mutex
	limit  int
	window time.Duration
	counts map[string]windowCount
	swept  time.Time
}

type windowCount struct {
	start time.Time
	n     int
}

func newWindowLimiter(limit int, window time.Duration) *windowLimiter {
	return &windowLimiter{limit: limit, window: window, counts: map[string]windowCount{}}
}

// Allow records one event for key and reports whether it is within the limit.
// When it is not, retryAfter says when the window ends.
func (l *windowLimiter) Allow(key string, now time.Time) (ok bool, retryAfter time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if now.Sub(l.swept) > l.window {
		for k, c := range l.counts {
			if now.Sub(c.start) >= l.window {
				delete(l.counts, k)
			}
		}
		l.swept = now
	}
	c := l.counts[key]
	if c.start.IsZero() || now.Sub(c.start) >= l.window {
		c = windowCount{start: now}
	}
	c.n++
	l.counts[key] = c
	if c.n > l.limit {
		return false, c.start.Add(l.window).Sub(now)
	}
	return true, 0
}

// clientAddress is the address the device limit is keyed on. It is held in
// memory for at most an hour and never stored. Behind Cloudflare, set
// TRUST_CF_CONNECTING_IP=1 so the real client address is used.
func clientAddress(r *http.Request, trustCF bool) string {
	if trustCF {
		if ip := r.Header.Get("CF-Connecting-IP"); ip != "" {
			return ip
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
