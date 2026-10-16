package main

import (
	"context"
	"errors"
	"net/http"
	"testing"
	"time"
)

// Privacy contract (review of 2026-10-15). The store tests run against the
// in-memory store always and against Postgres too when
// PERSONA_TEST_DATABASE_URL is set, so both keep the same promises.

func ballotFor(device, question, option string) Ballot {
	key := "dev-" + device
	return Ballot{
		Vote:      Vote{QuestionID: question, OptionID: option, VoterHash: "hash-" + device + "-" + question},
		DeviceKey: key,
		Answer:    &MirrorAnswer{DeviceKey: key, QuestionID: question, Date: mon, Theme: "habits", OptionID: option, Depth: 1},
	}
}

func historyOf(t *testing.T, st Store, device string) []MirrorAnswer {
	t.Helper()
	answers, _, err := st.DeviceHistory(context.Background(), "dev-"+device, "0001-01-01", "9999-12-31")
	if err != nil {
		t.Fatal(err)
	}
	return answers
}

func TestStoreContract(t *testing.T) {
	ctx := context.Background()
	at := fixedNow.Truncate(time.Hour)

	t.Run("a vote and its answer are stored in one step", func(t *testing.T) {
		st := testStore()
		e, err := st.Accept(ctx, "k1", ballotFor("a", "q1", "now"), at)
		if err != nil || e.ID == "" {
			t.Fatalf("expected the ballot accepted, got %+v (%v)", e, err)
		}
		if got := historyOf(t, st, "a"); len(got) != 1 || got[0].OptionID != "now" {
			t.Fatalf("expected the answer kept with the vote, got %+v", got)
		}
	})

	t.Run("a retried ballot returns the first event and stores an answer that went missing", func(t *testing.T) {
		st := testStore()
		bare := ballotFor("a", "q1", "now")
		bare.Answer = nil
		first, err := st.Accept(ctx, "k1", bare, at)
		if err != nil {
			t.Fatal(err)
		}
		again, err := st.Accept(ctx, "k1", ballotFor("a", "q1", "now"), at.Add(time.Hour))
		if err != nil || again.ID != first.ID {
			t.Fatalf("expected the first event back, got %+v (%v), first %+v", again, err, first)
		}
		if got := historyOf(t, st, "a"); len(got) != 1 {
			t.Fatalf("expected the retry to store the answer, got %+v", got)
		}
	})

	t.Run("a different vote under the same key, or a second vote, stores nothing", func(t *testing.T) {
		st := testStore()
		if _, err := st.Accept(ctx, "k1", ballotFor("a", "q1", "now"), at); err != nil {
			t.Fatal(err)
		}
		if _, err := st.Accept(ctx, "k1", ballotFor("a", "q1", "later"), at); !errors.Is(err, ErrIdempotencyKeyReuse) {
			t.Fatalf("expected ErrIdempotencyKeyReuse, got %v", err)
		}
		if _, err := st.Accept(ctx, "k2", ballotFor("a", "q1", "later"), at); !errors.Is(err, ErrDuplicateVote) {
			t.Fatalf("expected ErrDuplicateVote, got %v", err)
		}
		if got := historyOf(t, st, "a"); len(got) != 1 || got[0].OptionID != "now" {
			t.Fatalf("expected only the first answer, got %+v", got)
		}
		if n, err := st.Tally(ctx, 10); err != nil || n != 1 {
			t.Fatalf("expected one vote to count, got %d (%v)", n, err)
		}
	})

	t.Run("a rating notes the answer once, and counts once per question", func(t *testing.T) {
		st := testStore()
		if _, err := st.Accept(ctx, "k1", ballotFor("a", "q1", "now"), at); err != nil {
			t.Fatal(err)
		}
		rating := func(verdict string) Ballot {
			return Ballot{Vote: Vote{QuestionID: ratingKey("q1"), OptionID: ratingOption("now", verdict), VoterHash: "hash-a-rating"},
				DeviceKey: "dev-a", Rating: &Rating{QuestionID: "q1", Verdict: verdict}}
		}
		if _, err := st.Accept(ctx, "r1", rating(verdictPartly), at); err != nil {
			t.Fatal(err)
		}
		if _, err := st.Accept(ctx, "r2", rating(verdictNotMe), at); !errors.Is(err, ErrDuplicateVote) {
			t.Fatalf("expected a second rating refused, got %v", err)
		}
		if got := historyOf(t, st, "a"); len(got) != 1 || got[0].Verdict != verdictPartly {
			t.Fatalf("expected the answer marked partly, got %+v", got)
		}
	})

	t.Run("delete everything removes the device's rows and votes, and only them", func(t *testing.T) {
		st := testStore()
		for _, b := range []Ballot{ballotFor("a", "q1", "now"), ballotFor("a", "q2", "call"), ballotFor("b", "q1", "pile")} {
			if _, err := st.Accept(ctx, b.QuestionID+b.DeviceKey, b, at); err != nil {
				t.Fatal(err)
			}
		}
		if err := st.SaveStep(ctx, MirrorStep{DeviceKey: "dev-a", QuestionID: "q1", OptionID: "now", Started: mon, Status: stepStarted, UpdatedAt: at}); err != nil {
			t.Fatal(err)
		}
		f, err := st.ForgetDevice(ctx, "dev-a", []string{"hash-a-q1", "hash-a-q2", "hash-a-never"}, mon)
		if err != nil || f != (Forgotten{Answers: 2, Steps: 1, Votes: 2}) {
			t.Fatalf("expected 2 answers, 1 step and 2 votes deleted, got %+v (%v)", f, err)
		}
		if got := historyOf(t, st, "a"); len(got) != 0 {
			t.Fatalf("expected nothing left, got %+v", got)
		}
		if k, err := st.DeviceData(ctx, "dev-b", []string{"hash-b-q1"}); err != nil || k.Answers != 1 || k.Votes != 1 {
			t.Fatalf("expected the other device untouched, got %+v (%v)", k, err)
		}
		if n, err := st.Tally(ctx, 10); err != nil || n != 1 {
			t.Fatalf("expected only the other device's vote left to count, got %d (%v)", n, err)
		}
	})

	t.Run("after delete everything the old pass takes no writes until its mark expires", func(t *testing.T) {
		st := testStore()
		if _, err := st.Accept(ctx, "k1", ballotFor("a", "q1", "now"), at); err != nil {
			t.Fatal(err)
		}
		if _, err := st.ForgetDevice(ctx, "dev-a", []string{"hash-a-q1"}, mon); err != nil {
			t.Fatal(err)
		}
		if _, err := st.Accept(ctx, "k1", ballotFor("a", "q1", "now"), at); !errors.Is(err, ErrDeviceForgotten) {
			t.Fatalf("a retried vote: expected ErrDeviceForgotten, got %v", err)
		}
		if _, err := st.Accept(ctx, "k2", ballotFor("a", "q2", "now"), at); !errors.Is(err, ErrDeviceForgotten) {
			t.Fatalf("a new vote: expected ErrDeviceForgotten, got %v", err)
		}
		if err := st.SaveAnswer(ctx, *ballotFor("a", "q3", "now").Answer); !errors.Is(err, ErrDeviceForgotten) {
			t.Fatalf("an answer: expected ErrDeviceForgotten, got %v", err)
		}
		if err := st.SaveStep(ctx, MirrorStep{DeviceKey: "dev-a", QuestionID: "q1", OptionID: "now", Started: mon, Status: stepHelped, UpdatedAt: at}); !errors.Is(err, ErrDeviceForgotten) {
			t.Fatalf("a step: expected ErrDeviceForgotten, got %v", err)
		}
		if err := st.SaveWeekSummaries(ctx, []WeekSummary{{DeviceKey: "dev-a", Monday: mon, Answers: 1}}); err != nil {
			t.Fatal(err)
		}
		if k, err := st.DeviceData(ctx, "dev-a", []string{"hash-a-q1", "hash-a-q2"}); err != nil || k != (Kept{}) {
			t.Fatalf("expected nothing written, got %+v (%v)", k, err)
		}
		if n, err := st.Tally(ctx, 10); err != nil || n != 0 {
			t.Fatalf("expected nothing to count, got %d (%v)", n, err)
		}
		// The mark goes with the rest of the mirror; nothing it guarded is left.
		if _, err := st.DeleteMirrorBefore(ctx, mustDate(mon).AddDate(0, 0, 1).Format(dateLayout)); err != nil {
			t.Fatal(err)
		}
		if _, err := st.Accept(ctx, "k3", ballotFor("a", "q4", "now"), at); err != nil {
			t.Fatalf("expected the mark gone, got %v", err)
		}
	})

	t.Run("raw votes keep no more than the hour they came in", func(t *testing.T) {
		s := newTestServer()
		s.clock = func() time.Time { return fixedNow.Add(37*time.Minute + 12*time.Second) }
		expectStatus(t, postVote(t, s, vote, "k1"), http.StatusAccepted)
		for _, at := range storedVoteTimes(t, s) {
			if !at.Equal(fixedNow) {
				t.Fatalf("expected the vote kept at %s, got %s", fixedNow, at)
			}
		}
	})
}

// storedVoteTimes reads accepted_at as the store holds it.
func storedVoteTimes(t *testing.T, s *Server) []time.Time {
	t.Helper()
	var out []time.Time
	switch st := s.votes.(type) {
	case *memoryStore:
		for _, e := range st.events {
			out = append(out, e.AcceptedAt)
		}
	case *pgStore:
		rows, err := st.pool.Query(context.Background(), `SELECT accepted_at FROM votes`)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		for rows.Next() {
			var at time.Time
			if err := rows.Scan(&at); err != nil {
				t.Fatal(err)
			}
			out = append(out, at)
		}
	}
	if len(out) == 0 {
		t.Fatal("no votes stored")
	}
	return out
}

func TestAnswerKeepsItsSittingNotItsMoment(t *testing.T) {
	s := mirrorServer(mon)
	for q, sitting := range map[string]string{"tidy": "morning", "call": "evening", "queue": ""} {
		v := VoteRequest{QuestionID: mon + "-" + q, OptionID: map[string]string{"tidy": "now", "call": "text", "queue": "polite"}[q], VoterID: "a", Sitting: sitting}
		expectStatus(t, postVote(t, s, v, "k-"+q), http.StatusAccepted)
	}
	answers, _, err := s.mirror.DeviceHistory(context.Background(), mirrorKeyOf(s, "a"), mon, mon)
	if err != nil || len(answers) != 3 {
		t.Fatalf("expected three answers, got %+v (%v)", answers, err)
	}
	for _, a := range answers {
		if want := a.QuestionID == mon+"-call"; a.Evening != want {
			t.Fatalf("%s: evening %v, want %v", a.QuestionID, a.Evening, want)
		}
	}
	bad := VoteRequest{QuestionID: mon + "-heavy", OptionID: "light", VoterID: "a", Sitting: "noon"}
	expectError(t, postVote(t, s, bad, "k-bad"), http.StatusBadRequest, "invalid_request")
}
