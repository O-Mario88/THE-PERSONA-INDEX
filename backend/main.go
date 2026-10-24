package main

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"
)

func HealthCheckHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, `{"status":"ok"}`)
}

const (
	// aggregationInterval is how often each instance's tally worker drains new votes.
	aggregationInterval = time.Second
	// Raw votes are deleted this long after they are tallied; tallies stay.
	// Seven days, the shortest the one-vote rule allows (decision recommended
	// in the 2026-10-15 proposal): less kept is less to protect.
	defaultRetention = 7 * 24 * time.Hour
	// minRetention keeps raw votes well past the last moment any question
	// accepts votes (its day plus rolloverGrace), so deleting them can never
	// reopen a question to a device that already voted.
	minRetention = 7 * 24 * time.Hour
	// shutdownGrace is how long in-flight requests get to finish on SIGTERM.
	shutdownGrace = 10 * time.Second
	// drainDelay is how long /api/ready answers 503 before the listener
	// closes, so the host's load balancer stops sending new requests first.
	drainDelay = 3 * time.Second
)

// newHTTPServer bounds every phase of a request so slow or stalled clients
// cannot hold connections open.
func newHTTPServer(addr string, h http.Handler) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           h,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    16 << 10,
	}
}

// Configuration is read and checked by loadConfig (config.go); every setting
// is described in docs/operations.md.
//
// Commands besides serving:
//
//	go run . schedule     maintains the frozen schedule (schedule.go)
//	go run . cards        lists the insight cards people say do not fit them (cards.go)
//	go run . check        checks a database: schema, backlog, retention (check.go)
//	api healthcheck       exits 0 when this instance answers /api/ready (for Docker's HEALTHCHECK)
func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "schedule":
			os.Exit(runScheduleCommand(os.Args[2:], time.Now(), os.Stdout, os.Stderr))
		case "healthcheck":
			os.Exit(runHealthcheck(os.Getenv("PORT")))
		case "cards", "check":
			// These read a database and need nothing else: no secrets, so a
			// restored copy can be checked without the production keys.
			ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
			code := runDatabaseCommand(ctx, os.Args[1], os.Args[2:], os.Getenv, os.Stdout, os.Stderr)
			stop()
			os.Exit(code)
		default:
			fmt.Fprintf(os.Stderr, "unknown command %q (schedule, cards, check or healthcheck)\n", os.Args[1])
			os.Exit(2)
		}
	}
	cfg, warnings, err := loadConfig(os.Getenv)
	setupLogging(cfg.LogFormat)
	if err != nil {
		slog.Error("configuration", "error", err)
		os.Exit(1)
	}
	for _, w := range warnings {
		slog.Warn(w)
	}
	bank, err := loadShippedBank()
	if err != nil {
		slog.Error("question bank", "error", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	var store Store
	keys := cfg.Keys
	if cfg.DatabaseURL != "" {
		st, err := openPGStore(ctx, cfg.DatabaseURL, cfg.MaxConns)
		if err != nil {
			slog.Error("database", "error", err)
			os.Exit(1)
		}
		defer st.Close()
		store = st
	} else {
		slog.Warn("DATABASE_URL not set; votes are kept in memory and lost on restart")
		store = newMemoryStore()
		for name, k := range map[string]*[]byte{"DEVICE_TOKEN_SECRET": &keys.TokenSecret, "DATA_KEY_SECRET": &keys.DataSecret} {
			if len(*k) < minSecretBytes {
				slog.Warn(name + " is not set; using a random one until this process stops")
				*k = make([]byte, 32)
				rand.Read(*k)
			}
		}
	}
	devices, err := newKeyring(keys)
	if err != nil {
		slog.Error("keys", "error", err)
		os.Exit(1)
	}

	srv := NewServer(time.Now, bank, store, devices)
	if srv.regional, srv.regionalTag, err = loadShippedRegional(); err != nil {
		slog.Error("regional bank", "error", err)
		os.Exit(1)
	}
	srv.trustCF = cfg.TrustCF
	srv.voteRetention = cfg.VoteRetention
	srv.edgeSecret = cfg.EdgeSecret
	srv.metricsToken = cfg.MetricsToken
	srv.accessLog = cfg.AccessLog
	if cfg.StaticDir != "" {
		site, err := newStaticSite(cfg.StaticDir)
		if err != nil {
			slog.Error("static site", "error", err)
			os.Exit(1)
		}
		srv.static = site
	}
	if days := bank.scheduledUntil().Sub(time.Now()).Hours() / 24; days < scheduleWarnDays {
		slog.Warn(fmt.Sprintf("the frozen schedule ends in %.0f days; run `cd backend && go run . schedule` and ship the result", days))
	}

	if cfg.RunWorker {
		go runWorker(ctx, srv)
	}
	if cfg.MetricsAddr != "" {
		metricsSrv := newHTTPServer(cfg.MetricsAddr, srv.MetricsHandler(""))
		go func() {
			if err := metricsSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
				slog.Error("metrics listener", "error", err)
			}
		}()
		defer metricsSrv.Close()
	}

	httpSrv := newHTTPServer(":"+strconv.Itoa(cfg.Port), srv.Handler())
	go func() {
		<-ctx.Done()
		// Tell the load balancer first, then stop taking new requests and
		// let the ones in flight finish.
		slog.Info("draining", "delay", drainDelay.String(), "grace", shutdownGrace.String())
		srv.draining.Store(true)
		time.Sleep(drainDelay)
		shutdown, cancel := context.WithTimeout(context.Background(), shutdownGrace)
		defer cancel()
		httpSrv.Shutdown(shutdown)
	}()
	slog.Info("listening", "addr", httpSrv.Addr, "version", buildVersion(), "static", cfg.StaticDir != "", "worker", cfg.RunWorker)
	if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("listen", "error", err)
		os.Exit(1)
	}
	if err := srv.RunAggregation(); err != nil { // count what is left before exiting
		slog.Error("final tally", "error", err)
	}
	slog.Info("stopped")
}

// setupLogging sends all logs, the log package's included, through slog:
// JSON lines in production (one event per line, for the host's log search),
// plain text locally.
func setupLogging(format string) {
	var h slog.Handler
	if format == "json" {
		h = slog.NewJSONHandler(os.Stderr, nil)
	} else {
		h = slog.NewTextHandler(os.Stderr, nil)
	}
	slog.SetDefault(slog.New(h))
}

// runHealthcheck asks this instance's /api/ready, for container health
// checks on images with no shell or curl.
func runHealthcheck(port string) int {
	if port == "" {
		port = "8080"
	}
	c := http.Client{Timeout: 3 * time.Second}
	res, err := c.Get("http://127.0.0.1:" + port + "/api/ready")
	if err != nil {
		fmt.Fprintln(os.Stderr, "healthcheck:", err)
		return 1
	}
	res.Body.Close()
	if res.StatusCode != http.StatusOK {
		fmt.Fprintln(os.Stderr, "healthcheck: status", res.StatusCode)
		return 1
	}
	return 0
}

// runDatabaseCommand runs `cards` or `check` against DATABASE_URL. Only
// `cards` may bring the schema up to date; `check` only reads, so it can be
// pointed at a restored backup as it is.
func runDatabaseCommand(ctx context.Context, name string, args []string, getenv func(string) string, out, errOut io.Writer) int {
	url := strings.TrimSpace(getenv("DATABASE_URL"))
	if url == "" {
		fmt.Fprintf(errOut, "%s: set DATABASE_URL to the database to read\n", name)
		return 2
	}
	bank, err := loadShippedBank()
	if err != nil {
		fmt.Fprintf(errOut, "%s: question bank: %v\n", name, err)
		return 2
	}
	st, err := connectPG(ctx, url, 2)
	if err != nil {
		fmt.Fprintf(errOut, "%s: %v\n", name, err)
		return 2
	}
	defer st.Close()
	if name == "cards" {
		if err := st.migrate(ctx); err != nil {
			fmt.Fprintf(errOut, "%s: %v\n", name, err)
			return 2
		}
		return runCardsCommand(ctx, args, st, bank, out, errOut)
	}
	return runCheckCommand(ctx, args, st, bank, time.Now(), out, errOut)
}
