package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"runtime"
	"runtime/debug"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Metrics in the Prometheus text format, written by hand so the server has no
// metrics dependency. Labels are route patterns, status codes and job names:
// never a device, an address, a date or anything a person chose.

// durationBuckets are the request-latency buckets, in seconds.
var durationBuckets = []float64{0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5}

type requestKey struct {
	route string
	code  int
}

type histogram struct {
	counts []uint64 // one per bucket, then +Inf
	sum    float64
	n      uint64
}

func (h *histogram) observe(v float64) {
	i, _ := slices.BinarySearch(durationBuckets, v)
	h.counts[i]++
	h.sum += v
	h.n++
}

type jobStat struct {
	lastSuccess time.Time
	lastSeconds float64
	errors      uint64
	rows        uint64
}

type metrics struct {
	mu        sync.Mutex
	started   time.Time
	requests  map[requestKey]uint64
	durations map[string]*histogram
	panics    uint64
	refused   uint64 // requests without the edge secret
	jobs      map[string]*jobStat
}

func newMetrics(now time.Time) *metrics {
	return &metrics{
		started:   now,
		requests:  map[requestKey]uint64{},
		durations: map[string]*histogram{},
		jobs:      map[string]*jobStat{},
	}
}

func (m *metrics) observeRequest(route string, code int, d time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.requests[requestKey{route, code}]++
	h := m.durations[route]
	if h == nil {
		h = &histogram{counts: make([]uint64, len(durationBuckets)+1)}
		m.durations[route] = h
	}
	h.observe(d.Seconds())
}

func (m *metrics) countPanic() {
	m.mu.Lock()
	m.panics++
	m.mu.Unlock()
}

func (m *metrics) countRefused() {
	m.mu.Lock()
	m.refused++
	m.mu.Unlock()
}

// observeJob records one run of a background job: when it last worked, how
// long it took, how many rows it touched, and failures.
func (m *metrics) observeJob(name string, at time.Time, d time.Duration, rows int, err error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	j := m.jobs[name]
	if j == nil {
		j = &jobStat{}
		m.jobs[name] = j
	}
	j.lastSeconds = d.Seconds()
	if err != nil {
		j.errors++
		return
	}
	j.lastSuccess = at
	if rows > 0 {
		j.rows += uint64(rows)
	}
}

// jobLastSuccess is when the job last ran without error (zero if never).
func (m *metrics) jobLastSuccess(name string) time.Time {
	m.mu.Lock()
	defer m.mu.Unlock()
	if j := m.jobs[name]; j != nil {
		return j.lastSuccess
	}
	return time.Time{}
}

// backlogStore is a store that can say how far the tally worker is behind:
// how many accepted votes are not counted yet. (Votes keep only the hour they
// came in, so the backlog has no meaningful age; the tally job's last success
// says how fresh the counting is.)
type backlogStore interface {
	Backlog(ctx context.Context) (votes int64, err error)
}

// poolStore is a store with a connection pool to report on.
type poolStore interface {
	PoolStats() PoolStats
}

// PoolStats is the database pool, as the metrics show it.
type PoolStats struct {
	Max, Total, Idle, InUse int32
	Waits                   int64         // acquires that found the pool empty and waited
	AcquireTime             time.Duration // total time spent acquiring
}

// buildVersion is the commit the binary was built from: set with
// -ldflags "-X main.version=<sha>" (the Dockerfile does), or read from the
// Go build info, or "dev".
var version = ""

func buildVersion() string {
	if version != "" {
		return version
	}
	if info, ok := debug.ReadBuildInfo(); ok {
		for _, s := range info.Settings {
			if s.Key == "vcs.revision" && len(s.Value) >= 12 {
				return s.Value[:12]
			}
		}
	}
	return "dev"
}

// writeMetrics writes every metric in the Prometheus text format.
func (s *Server) writeMetrics(ctx context.Context, w io.Writer) {
	m := s.metrics
	var b strings.Builder
	family := func(name, kind, help string) {
		fmt.Fprintf(&b, "# HELP %s %s\n# TYPE %s %s\n", name, help, name, kind)
	}
	num := func(v float64) string { return strconv.FormatFloat(v, 'g', -1, 64) }

	family("persona_build_info", "gauge", "The running build.")
	fmt.Fprintf(&b, "persona_build_info{version=%q,go=%q} 1\n", buildVersion(), runtime.Version())
	family("persona_start_time_seconds", "gauge", "When this instance started (unix seconds).")
	fmt.Fprintf(&b, "persona_start_time_seconds %d\n", m.started.Unix())

	m.mu.Lock()
	keys := make([]requestKey, 0, len(m.requests))
	for k := range m.requests {
		keys = append(keys, k)
	}
	slices.SortFunc(keys, func(a, b requestKey) int {
		if c := strings.Compare(a.route, b.route); c != 0 {
			return c
		}
		return a.code - b.code
	})
	family("persona_http_requests_total", "counter", "HTTP requests by route pattern and status code.")
	for _, k := range keys {
		fmt.Fprintf(&b, "persona_http_requests_total{route=%q,code=\"%d\"} %d\n", k.route, k.code, m.requests[k])
	}
	routes := make([]string, 0, len(m.durations))
	for r := range m.durations {
		routes = append(routes, r)
	}
	slices.Sort(routes)
	family("persona_http_request_duration_seconds", "histogram", "Time to answer a request, by route pattern.")
	for _, r := range routes {
		h := m.durations[r]
		var cum uint64
		for i, le := range durationBuckets {
			cum += h.counts[i]
			fmt.Fprintf(&b, "persona_http_request_duration_seconds_bucket{route=%q,le=%q} %d\n", r, num(le), cum)
		}
		cum += h.counts[len(durationBuckets)]
		fmt.Fprintf(&b, "persona_http_request_duration_seconds_bucket{route=%q,le=\"+Inf\"} %d\n", r, cum)
		fmt.Fprintf(&b, "persona_http_request_duration_seconds_sum{route=%q} %s\n", r, num(h.sum))
		fmt.Fprintf(&b, "persona_http_request_duration_seconds_count{route=%q} %d\n", r, h.n)
	}
	family("persona_http_panics_total", "counter", "Requests that hit a bug and were answered 500.")
	fmt.Fprintf(&b, "persona_http_panics_total %d\n", m.panics)
	family("persona_edge_refused_total", "counter", "Requests refused for arriving without the edge secret.")
	fmt.Fprintf(&b, "persona_edge_refused_total %d\n", m.refused)

	jobs := make([]string, 0, len(m.jobs))
	for name := range m.jobs {
		jobs = append(jobs, name)
	}
	slices.Sort(jobs)
	family("persona_job_last_success_timestamp_seconds", "gauge", "When each background job last ran without error (unix seconds, 0 if never).")
	for _, name := range jobs {
		var t int64
		if j := m.jobs[name]; !j.lastSuccess.IsZero() {
			t = j.lastSuccess.Unix()
		}
		fmt.Fprintf(&b, "persona_job_last_success_timestamp_seconds{job=%q} %d\n", name, t)
	}
	family("persona_job_last_duration_seconds", "gauge", "How long each background job's last run took.")
	for _, name := range jobs {
		fmt.Fprintf(&b, "persona_job_last_duration_seconds{job=%q} %s\n", name, num(m.jobs[name].lastSeconds))
	}
	family("persona_job_errors_total", "counter", "Background job runs that failed.")
	for _, name := range jobs {
		fmt.Fprintf(&b, "persona_job_errors_total{job=%q} %d\n", name, m.jobs[name].errors)
	}
	family("persona_job_rows_total", "counter", "Rows each background job counted, folded or deleted.")
	for _, name := range jobs {
		fmt.Fprintf(&b, "persona_job_rows_total{job=%q} %d\n", name, m.jobs[name].rows)
	}
	m.mu.Unlock()

	if bs, ok := s.votes.(backlogStore); ok {
		ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
		n, err := bs.Backlog(ctx)
		cancel()
		family("persona_tally_backlog_votes", "gauge", "Accepted votes not counted yet (-1 if the database did not answer).")
		if err != nil {
			n = -1
		}
		fmt.Fprintf(&b, "persona_tally_backlog_votes %d\n", n)
	}
	if ps, ok := s.votes.(poolStore); ok {
		p := ps.PoolStats()
		family("persona_db_connections", "gauge", "Database pool connections by state.")
		fmt.Fprintf(&b, "persona_db_connections{state=\"max\"} %d\npersona_db_connections{state=\"open\"} %d\n", p.Max, p.Total)
		fmt.Fprintf(&b, "persona_db_connections{state=\"idle\"} %d\npersona_db_connections{state=\"in_use\"} %d\n", p.Idle, p.InUse)
		family("persona_db_acquire_waits_total", "counter", "Times a request waited for a free database connection.")
		fmt.Fprintf(&b, "persona_db_acquire_waits_total %d\n", p.Waits)
		family("persona_db_acquire_seconds_total", "counter", "Total time spent getting database connections from the pool.")
		fmt.Fprintf(&b, "persona_db_acquire_seconds_total %s\n", num(p.AcquireTime.Seconds()))
	}

	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)
	family("persona_go_goroutines", "gauge", "Goroutines running.")
	fmt.Fprintf(&b, "persona_go_goroutines %d\n", runtime.NumGoroutine())
	family("persona_go_heap_bytes", "gauge", "Heap memory in use.")
	fmt.Fprintf(&b, "persona_go_heap_bytes %d\n", mem.HeapAlloc)
	family("persona_go_gc_pause_seconds_total", "counter", "Time the garbage collector paused the program.")
	fmt.Fprintf(&b, "persona_go_gc_pause_seconds_total %s\n", num(float64(mem.PauseTotalNs)/1e9))
	io.WriteString(w, b.String())
}

// MetricsHandler serves the metrics. On the main port it needs the bearer
// token; on the private metrics listener (METRICS_ADDR) token is empty.
func (s *Server) MetricsHandler(token string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			writeError(w, http.StatusMethodNotAllowed, "method_not_allowed")
			return
		}
		if token != "" && !sameSecret(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "), token) {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		s.writeMetrics(r.Context(), w)
	})
}
