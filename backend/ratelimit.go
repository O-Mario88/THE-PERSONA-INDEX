package main

import (
	"net"
	"net/http"
	"net/netip"
	"sync"
	"time"
)

// Per-instance abuse floor. The edge (Cloudflare rate-limiting rules, see
// docs/operations.md) is the first line; these limits make sure a client that
// reaches an instance directly still cannot stuff the ballot box.
const (
	votesPerDevicePerMinute  = 30  // a sitting of three needs 3 votes, 3 ratings and a few steps
	devicesPerAddressPerHour = 20  // households and shared networks need a few
	countsPerAddrHour        = 120 // product counts: a handful a day per phone, with room for a shared network
	forgetsPerAddressPerHour = 20  // "Delete everything" is rare; a made-up pass deletes nothing
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

// Blocked reports, without counting an event, whether key is over the limit
// in its current window.
func (l *windowLimiter) Blocked(key string, now time.Time) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	c, ok := l.counts[key]
	if !ok || now.Sub(c.start) >= l.window || c.n < l.limit {
		return false, 0
	}
	return true, c.start.Add(l.window).Sub(now)
}

// clientAddress is the address the per-address limits are keyed on. It is
// held in memory for at most an hour and never stored. Behind Cloudflare, set
// TRUST_CF_CONNECTING_IP=1 so the real client address is used (and
// EDGE_SECRET, so nobody can reach the origin and forge it).
//
// An IPv6 client is keyed on its /64 network: one home or phone is given a
// whole /64 and can pick a fresh address in it at will, so counting single
// addresses would let one person look like millions.
func clientAddress(r *http.Request, trustCF bool) string {
	addr := ""
	if trustCF {
		addr = r.Header.Get("CF-Connecting-IP")
	}
	if addr == "" {
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			host = r.RemoteAddr
		}
		addr = host
	}
	return limitKey(addr)
}

// limitKey is an IPv4 address as it is, an IPv6 address as its /64, and
// anything unreadable as it came.
func limitKey(addr string) string {
	ip, err := netip.ParseAddr(addr)
	if err != nil {
		return addr
	}
	ip = ip.Unmap()
	if ip.Is4() {
		return ip.String()
	}
	p, err := ip.WithZone("").Prefix(64)
	if err != nil {
		return addr
	}
	return p.String()
}
