package main

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestHourlyJobsRunInOrderAndAreRecorded(t *testing.T) {
	s := newTestServer()
	names := []string{}
	for _, j := range s.hourlyJobs() {
		names = append(names, j.name)
	}
	if strings.Join(names, ",") != "vote_retention,mirror_fold,week_retention,mirror_retention,backup_retention" {
		t.Fatalf("jobs = %v (weeks must fold before their answers can go)", names)
	}

	// A vote counted long ago goes; today's stays.
	postVote(t, s, VoteRequest{QuestionID: todaySet.Questions[0].ID, OptionID: "right-away", VoterID: "voter-a"}, "k1")
	if err := s.RunAggregation(); err != nil {
		t.Fatal(err)
	}
	later := fixedNow.Add(s.voteRetention + 2*time.Hour)
	s.clock = func() time.Time { return later }
	s.runHourly(context.Background())

	for _, name := range names {
		if got := s.metrics.jobLastSuccess(name); !got.Equal(later) {
			t.Errorf("%s last success = %v, want %v", name, got, later)
		}
	}
	var b strings.Builder
	s.writeMetrics(context.Background(), &b)
	if !strings.Contains(b.String(), `persona_job_rows_total{job="vote_retention"} 1`) {
		t.Errorf("the deleted vote was not counted:\n%s", grepLines(b.String(), "persona_job_rows_total"))
	}
}

type failingRetention struct{ *memoryStore }

func (failingRetention) DeleteTalliedBefore(context.Context, time.Time) (int, error) {
	return 0, errors.New("database went away")
}

func TestAFailingJobIsCountedAndTheRestStillRun(t *testing.T) {
	s := NewServer(func() time.Time { return fixedNow }, fixtureBank{}, failingRetention{newMemoryStore()}, newDeviceSigner(testSecret))
	s.runHourly(context.Background())
	if !s.metrics.jobLastSuccess("vote_retention").IsZero() {
		t.Error("a failed job recorded a success")
	}
	if s.metrics.jobLastSuccess("backup_retention").IsZero() {
		t.Error("the jobs after a failure did not run")
	}
	var b strings.Builder
	s.writeMetrics(context.Background(), &b)
	if !strings.Contains(b.String(), `persona_job_errors_total{job="vote_retention"} 1`) {
		t.Error("the failure was not counted")
	}
}

func TestWorkerStopsWithItsContext(t *testing.T) {
	s := newTestServer()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { runWorker(ctx, s); close(done) }()
	postVote(t, s, VoteRequest{QuestionID: todaySet.Questions[1].ID, OptionID: "even", VoterID: "voter-b"}, "k2")
	deadline := time.Now().Add(5 * time.Second)
	for s.metrics.jobLastSuccess("tally").IsZero() && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	if s.metrics.jobLastSuccess("tally").IsZero() {
		t.Error("the worker never counted")
	}
	cancel()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("the worker did not stop")
	}
}

func TestLimitKeyGroupsIPv6ByNetwork(t *testing.T) {
	for in, want := range map[string]string{
		"203.0.113.9":                "203.0.113.9",
		"::ffff:203.0.113.9":         "203.0.113.9",
		"2001:db8:1:2:aaaa::1":       "2001:db8:1:2::/64",
		"2001:db8:1:2:ffff:ffff::99": "2001:db8:1:2::/64",
		"fe80::1%eth0":               "fe80::/64",
		"not an address":             "not an address",
	} {
		if got := limitKey(in); got != want {
			t.Errorf("limitKey(%q) = %q, want %q", in, got, want)
		}
	}
}
