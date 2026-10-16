package main

import (
	"net/http"
	"reflect"
	"testing"
	"time"
)

// Acceptance tests for local days (2026-10-15): each phone plays the edition
// for its own date, so the morning questions arrive in the person's morning
// wherever they live. A date can be fetched, and its questions voted on, only
// while it is today somewhere on Earth (UTC-12 to UTC+14).

// everyDayBank publishes a set for any date, so these tests prove the window,
// not the bank.
type everyDayBank struct{}

func (everyDayBank) GetSet(date string) (DailySet, bool) {
	if date == "2026-10-13" {
		return twoDayBank{}.GetSet(date)
	}
	set := todaySet
	set.Date = date
	set.Questions = nil
	for _, q := range todaySet.Questions {
		q.ID = date + "-" + q.ID
		set.Questions = append(set.Questions, q)
	}
	return set, true
}

func localDayServer(at time.Time) *Server {
	return NewServer(func() time.Time { return at }, everyDayBank{}, testStore(), newDeviceSigner(testSecret))
}

func TestLocalDayEditions(t *testing.T) {
	// fixedNow is 10:00 UTC on Oct 12: 22:00 on Oct 11 in UTC-12, and
	// midnight on Oct 13 in UTC+14.
	t.Run("serves the edition for a date that is today somewhere", func(t *testing.T) {
		for _, date := range []string{"2026-10-11", "2026-10-12", "2026-10-13"} {
			w := get(t, localDayServer(fixedNow), "/api/editions/"+date)
			expectStatus(t, w, http.StatusOK)
			expectPublicCache(t, w)
			set := decode[DailySet](t, w)
			if set.Date != date || set.Edition != editionNumber(date) || len(set.Questions) == 0 {
				t.Fatalf("%s: expected that day's numbered edition, got %+v", date, set)
			}
		}
	})

	t.Run("does not serve a date before it is today anywhere", func(t *testing.T) {
		w := get(t, localDayServer(fixedNow.Add(-time.Minute)), "/api/editions/2026-10-13")
		expectError(t, w, http.StatusNotFound, "no_edition")
		if n := directive(t, w.Header().Get("Cache-Control"), "s-maxage"); n > 60 {
			t.Fatalf("a not-yet-open edition must not be cached for long, got s-maxage=%d", n)
		}
		expectError(t, get(t, localDayServer(fixedNow), "/api/editions/2026-10-14"), http.StatusNotFound, "no_edition")
	})

	t.Run("does not serve a date that has ended everywhere", func(t *testing.T) {
		expectError(t, get(t, localDayServer(fixedNow), "/api/editions/2026-10-10"), http.StatusNotFound, "no_edition")
	})

	t.Run("says so when no set is published for an open date", func(t *testing.T) {
		s := NewServer(func() time.Time { return fixedNow }, fixtureBank{}, newMemoryStore(), newDeviceSigner(testSecret))
		expectError(t, get(t, s, "/api/editions/2026-10-13"), http.StatusNotFound, "no_edition")
	})

	t.Run("rejects a malformed date", func(t *testing.T) {
		for _, bad := range []string{"today", "2026-13-01", "2026-10-1", "20261012"} {
			expectError(t, get(t, localDayServer(fixedNow), "/api/editions/"+bad), http.StatusBadRequest, "invalid_request")
		}
	})

	t.Run("names the next day's themes, never its questions", func(t *testing.T) {
		w := get(t, localDayServer(fixedNow), "/api/editions/2026-10-12")
		expectStatus(t, w, http.StatusOK)
		if containsAny(w.Body.String(), "secret one", "secret two", "\"t1\"") {
			t.Fatalf("the next day's questions leaked: %s", w.Body.String())
		}
		if got := decode[DailySet](t, w).TomorrowThemes; !reflect.DeepEqual(got, []string{"money", "friendship"}) {
			t.Fatalf("expected [money friendship], got %v", got)
		}
	})

	t.Run("an edition is cached no longer than today's set", func(t *testing.T) {
		w := get(t, localDayServer(fixedNow), "/api/editions/2026-10-12")
		cc := w.Header().Get("Cache-Control")
		if directive(t, cc, "s-maxage") > int(todayEdgeTTL.Seconds()) || directive(t, cc, "max-age") > int(todayBrowserTTL.Seconds()) {
			t.Fatalf("expected the same short lifetimes as today's set, got %q", cc)
		}
	})
}

func TestLocalDayVotes(t *testing.T) {
	ballot := func(questionID string) VoteRequest {
		return VoteRequest{QuestionID: questionID, OptionID: "right-away", VoterID: "voter-a"}
	}

	t.Run("the next day's questions take votes once it is today in the easternmost zone", func(t *testing.T) {
		v := VoteRequest{QuestionID: "t1", OptionID: "even", VoterID: "voter-a"}
		expectError(t, postVote(t, localDayServer(fixedNow.Add(-time.Minute)), v, "k1"), http.StatusNotFound, "unknown_question")
		expectStatus(t, postVote(t, localDayServer(fixedNow), v, "k2"), http.StatusAccepted)
	})

	t.Run("a day's questions take votes until it ends in the westernmost zone", func(t *testing.T) {
		// Oct 12 ends in UTC-12 at 12:00 UTC on Oct 13.
		late := time.Date(2026, 10, 13, 11, 59, 0, 0, time.UTC)
		expectStatus(t, postVote(t, localDayServer(late), ballot("2026-10-12-q-dishes"), "k1"), http.StatusAccepted)
	})

	t.Run("then for the rollover grace, and no longer", func(t *testing.T) {
		end := time.Date(2026, 10, 13, 12, 0, 0, 0, time.UTC)
		expectStatus(t, postVote(t, localDayServer(end.Add(rolloverGrace-time.Second)), ballot("2026-10-12-q-dishes"), "k1"), http.StatusAccepted)
		expectError(t, postVote(t, localDayServer(end.Add(rolloverGrace+time.Second)), ballot("2026-10-12-q-dishes"), "k2"), http.StatusNotFound, "unknown_question")
	})

	t.Run("one vote per question per device still holds across time zones", func(t *testing.T) {
		s := localDayServer(fixedNow)
		expectStatus(t, postVote(t, s, ballot("2026-10-12-q-dishes"), "k1"), http.StatusAccepted)
		s.clock = func() time.Time { return fixedNow.Add(20 * time.Hour) }
		expectError(t, postVote(t, s, ballot("2026-10-12-q-dishes"), "k2"), http.StatusConflict, "duplicate_vote")
	})

	t.Run("a day's results stay readable for a day after it ends everywhere", func(t *testing.T) {
		s := localDayServer(fixedNow)
		expectStatus(t, postVote(t, s, ballot("2026-10-12-q-dishes"), "k1"), http.StatusAccepted)
		s.clock = func() time.Time { return time.Date(2026, 10, 14, 11, 0, 0, 0, time.UTC) }
		if n := totalVotes(t, s, "2026-10-12-q-dishes"); n != 1 {
			t.Fatalf("expected 1 vote, got %d", n)
		}
	})
}
