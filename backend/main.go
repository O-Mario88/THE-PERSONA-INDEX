package main

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
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
	defaultRetention = 30 * 24 * time.Hour
	// minRetention keeps raw votes well past the last moment any question
	// accepts votes (its day plus rolloverGrace), so deleting them can never
	// reopen a question to a device that already voted.
	minRetention = 7 * 24 * time.Hour
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

// Configuration (environment):
//
//	DATABASE_URL            Postgres URL. Without it votes live in memory and are lost on restart.
//	DATABASE_MAX_CONNS      pool size per instance (default 20).
//	DEVICE_TOKEN_SECRET     32+ bytes; signs device tokens. Required with DATABASE_URL.
//	TRUST_CF_CONNECTING_IP  "1" when the only route in is through Cloudflare.
//	RUN_TALLY_WORKER        "0" to stop this instance tallying (default on; safe on every instance).
//	VOTE_RETENTION_DAYS     raw-vote retention (default 30, minimum 7).
//	PORT                    listen port (default 8080).
func main() {
	bank, err := loadContentBank(questionsJSON)
	if err != nil {
		log.Fatal(err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	var votes VoteStore
	secret := []byte(os.Getenv("DEVICE_TOKEN_SECRET"))
	if url := os.Getenv("DATABASE_URL"); url != "" {
		if len(secret) < 32 {
			log.Fatal("DEVICE_TOKEN_SECRET must be set (32+ bytes) when DATABASE_URL is set")
		}
		st, err := openPGStore(ctx, url, int32(envInt("DATABASE_MAX_CONNS", 20)))
		if err != nil {
			log.Fatal(err)
		}
		defer st.Close()
		votes = st
	} else {
		log.Println("WARNING: DATABASE_URL not set; votes are kept in memory and lost on restart")
		votes = newMemoryStore()
		if len(secret) < 32 {
			log.Println("WARNING: DEVICE_TOKEN_SECRET not set; using a random one, so device tokens reset on restart")
			secret = make([]byte, 32)
			rand.Read(secret)
		}
	}

	srv := NewServer(time.Now, bank, votes, newDeviceSigner(secret))
	srv.trustCF = os.Getenv("TRUST_CF_CONNECTING_IP") == "1"

	if os.Getenv("RUN_TALLY_WORKER") != "0" {
		retention := max(time.Duration(envInt("VOTE_RETENTION_DAYS", 30))*24*time.Hour, minRetention)
		go runWorker(ctx, srv, retention)
	}

	httpSrv := newHTTPServer(":"+strconv.Itoa(envInt("PORT", 8080)), srv.Routes())
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		httpSrv.Shutdown(shutdown)
	}()
	log.Printf("listening on %s", httpSrv.Addr)
	if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
	srv.RunAggregation() // fold what is left before exiting
}

func runWorker(ctx context.Context, srv *Server, retention time.Duration) {
	tick := time.NewTicker(aggregationInterval)
	defer tick.Stop()
	lastCleanup := time.Time{}
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
		if err := srv.RunAggregation(); err != nil {
			log.Printf("tally: %v", err)
		}
		if time.Since(lastCleanup) > time.Hour {
			lastCleanup = time.Now()
			if n, err := srv.votes.DeleteTalliedBefore(ctx, time.Now().Add(-retention)); err != nil {
				log.Printf("retention: %v", err)
			} else if n > 0 {
				log.Printf("retention: deleted %d raw votes", n)
			}
			// Fold finished weeks before their answers can go. Folding is
			// idempotent, so instances doing it at once only repeat work.
			if n, err := srv.FoldWeeks(ctx); err != nil {
				log.Printf("mirror fold: %v", err)
			} else if n > 0 {
				log.Printf("mirror fold: folded %d weeks", n)
			}
			if n, err := srv.mirror.DeleteWeeksBefore(ctx, time.Now().Add(-weekSummaryRetention).UTC().Format(dateLayout)); err != nil {
				log.Printf("week summary retention: %v", err)
			} else if n > 0 {
				log.Printf("week summary retention: deleted %d rows", n)
			}
			if n, err := srv.mirror.DeleteMirrorBefore(ctx, time.Now().Add(-mirrorRetention).UTC().Format(dateLayout)); err != nil {
				log.Printf("mirror retention: %v", err)
			} else if n > 0 {
				log.Printf("mirror retention: deleted %d rows", n)
			}
		}
	}
}

func envInt(name string, def int) int {
	if v, err := strconv.Atoi(os.Getenv(name)); err == nil && v > 0 {
		return v
	}
	return def
}
