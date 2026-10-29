package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"slices"
)

// Product counts (Edwin, 2026-10-29; docs/first-release.md): whether people
// get a useful first result, use their brief, come back for another Mirror
// and find that a step helped, counted as daily totals and nothing more.
//
//   - Only a phone whose person said yes to "Count how I use the app" sends
//     one, and only a fixed event name: no pass, account, words, answers or
//     question can travel with it (anything else in the body is refused).
//   - The server adds one to that event's count for its own day, and keeps no
//     address, time or anything that could tell two phones apart.
//   - The rate limit counts per network address in memory only, as the other
//     anonymous endpoints do; the address is never stored.
//
// The fifth signal, still paying after the first renewal, is worked out from
// purchase records once real payments exist; it is not sent by phones.

var productEvents = []string{"first_result", "brief_used", "second_mirror", "step_helped"}

// ProductCountStore keeps the daily totals.
type ProductCountStore interface {
	AddProductCount(ctx context.Context, day, event string) error
	// ProductCounts gives day -> event -> count for days from..to.
	ProductCounts(ctx context.Context, from, to string) (map[string]map[string]int, error)
}

// CountRequest is the whole body of POST /api/counts.
type CountRequest struct {
	Event string `json:"event"`
}

func (s *Server) SaveCount(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if ok, retry := s.countLimit.Allow(clientAddress(r, s.trustCF), s.clock()); !ok {
		rateLimited(w, retry)
		return
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxVoteBodyBytes))
	dec.DisallowUnknownFields()
	var req CountRequest
	if err := dec.Decode(&req); err != nil || !slices.Contains(productEvents, req.Event) {
		writeError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	if err := s.productCounts.AddProductCount(r.Context(), s.today(), req.Event); err != nil {
		log.Printf("product count: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	writeJSON(w, http.StatusAccepted, struct{}{})
}

func (m *memoryStore) AddProductCount(_ context.Context, day, event string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.productCounts[day] == nil {
		m.productCounts[day] = map[string]int{}
	}
	m.productCounts[day][event]++
	return nil
}

func (m *memoryStore) ProductCounts(_ context.Context, from, to string) (map[string]map[string]int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := map[string]map[string]int{}
	for day, byEvent := range m.productCounts {
		if day < from || day > to {
			continue
		}
		out[day] = map[string]int{}
		for e, n := range byEvent {
			out[day][e] = n
		}
	}
	return out, nil
}

func (p *pgStore) AddProductCount(ctx context.Context, day, event string) error {
	if _, err := p.pool.Exec(ctx, `INSERT INTO product_counts (day, event, count) VALUES ($1, $2, 1)
		ON CONFLICT (day, event) DO UPDATE SET count = product_counts.count + 1`, day, event); err != nil {
		return fmt.Errorf("add product count: %w", err)
	}
	return nil
}

func (p *pgStore) ProductCounts(ctx context.Context, from, to string) (map[string]map[string]int, error) {
	rows, err := p.pool.Query(ctx, `SELECT day::text, event, count FROM product_counts WHERE day BETWEEN $1 AND $2`, from, to)
	if err != nil {
		return nil, fmt.Errorf("product counts: %w", err)
	}
	defer rows.Close()
	out := map[string]map[string]int{}
	for rows.Next() {
		var day, event string
		var n int
		if err := rows.Scan(&day, &event, &n); err != nil {
			return nil, fmt.Errorf("product counts: %w", err)
		}
		if out[day] == nil {
			out[day] = map[string]int{}
		}
		out[day][event] = n
	}
	return out, rows.Err()
}
