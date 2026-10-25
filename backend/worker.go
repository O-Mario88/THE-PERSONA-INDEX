package main

import (
	"context"
	"log/slog"
	"time"
)

// The background work each instance runs (RUN_TALLY_WORKER, on by default):
// counting votes every second, and every hour the retention and folding
// jobs. Each run is timed and recorded for the metrics, so a job that stops
// working shows up there (persona_job_last_success_timestamp_seconds) and in
// the logs. Every job is safe to run on several instances at once.

const hourlyEvery = time.Hour

// job is one piece of background work: it returns how many rows it touched.
type job struct {
	name string
	run  func(ctx context.Context, now time.Time) (int, error)
}

// tallyAll counts accepted votes until none are left.
func (s *Server) tallyAll(ctx context.Context, _ time.Time) (int, error) {
	total := 0
	for {
		n, err := s.votes.Tally(ctx, aggregationBatch)
		total += n
		if err != nil {
			return total, err
		}
		if n > 0 {
			s.resultCache.clear()
		}
		if n < aggregationBatch {
			return total, nil
		}
	}
}

// hourlyJobs are the retention and folding jobs, in the order they run:
// weeks are folded before their answers can be deleted.
func (s *Server) hourlyJobs() []job {
	day := func(now time.Time, back time.Duration) string { return now.Add(-back).UTC().Format(dateLayout) }
	return []job{
		{"vote_retention", func(ctx context.Context, now time.Time) (int, error) {
			return s.votes.DeleteTalliedBefore(ctx, now.Add(-s.voteRetention))
		}},
		{"mirror_fold", func(ctx context.Context, _ time.Time) (int, error) { return s.FoldWeeks(ctx) }},
		{"week_retention", func(ctx context.Context, now time.Time) (int, error) {
			return s.mirror.DeleteWeeksBefore(ctx, day(now, weekSummaryRetention))
		}},
		{"mirror_retention", func(ctx context.Context, now time.Time) (int, error) {
			return s.mirror.DeleteMirrorBefore(ctx, day(now, mirrorRetention))
		}},
		{"backup_retention", func(ctx context.Context, now time.Time) (int, error) {
			return s.vaults.DeleteVaultsBefore(ctx, day(now, vaultRetention))
		}},
		{"social_retention", func(ctx context.Context, now time.Time) (int, error) {
			return s.social.DeleteSocialBefore(ctx, day(now, friendRetention*24*time.Hour), now)
		}},
	}
}

// runJob runs one job and records how it went.
func (s *Server) runJob(ctx context.Context, j job) {
	start := time.Now()
	n, err := j.run(ctx, s.clock())
	s.metrics.observeJob(j.name, s.clock(), time.Since(start), n, err)
	switch {
	case err != nil && ctx.Err() == nil:
		slog.Error("job failed", "job", j.name, "error", err, "rows", n)
	case n > 0 && j.name != "tally":
		slog.Info("job done", "job", j.name, "rows", n, "duration_ms", time.Since(start).Milliseconds())
	}
}

// runHourly runs the hourly jobs once, in order.
func (s *Server) runHourly(ctx context.Context) {
	for _, j := range s.hourlyJobs() {
		if ctx.Err() != nil {
			return
		}
		s.runJob(ctx, j)
	}
}

// runWorker counts votes every second and runs the hourly jobs, until ctx
// ends. The hourly jobs run beside the counting, so a long retention pass at
// scale never holds up the tallies.
func runWorker(ctx context.Context, s *Server) {
	tally := job{"tally", s.tallyAll}
	hourlyDone := make(chan struct{})
	defer func() { <-hourlyDone }() // return only once the hourly jobs have stopped too
	go func() {
		defer close(hourlyDone)
		s.runHourly(ctx)
		t := time.NewTicker(hourlyEvery)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				s.runHourly(ctx)
			}
		}
	}()
	t := time.NewTicker(aggregationInterval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.runJob(ctx, tally)
		}
	}
}
