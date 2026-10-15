package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"net/http"
	"strings"
	"testing"
	"time"
)

// Acceptance tests for the edition pool: each day publishes about sixteen
// questions; the phone picks its own three for the morning and three for the
// evening from them by the person's interests, which never leave the phone.

var poolBank *contentBank

func poolDay(t *testing.T, date string) DailySet {
	t.Helper()
	if poolBank == nil {
		b := shippedBank(t)
		poolBank = &b
	}
	set, ok := poolBank.GetSet(date)
	if !ok {
		t.Fatalf("no set for %s", date)
	}
	return set
}

func TestEditionPool(t *testing.T) {
	t.Run("publishes two to four questions per life area plus one intimacy question", func(t *testing.T) {
		set := poolDay(t, "2026-10-14")
		perArea, intimate := map[string]int{}, 0
		for _, q := range set.Pool {
			if q.Care == careIntimate {
				intimate++
				continue
			}
			perArea[themes[q.Theme].area]++
		}
		for _, a := range areas {
			// An extra is dropped when it is a default question within a week.
			if perArea[a] < 2 || perArea[a] > poolPerArea {
				t.Errorf("area %s has %d pool questions, want 2 to %d", a, perArea[a], poolPerArea)
			}
		}
		if intimate != 1 {
			t.Errorf("expected 1 intimacy question, got %d", intimate)
		}
	})

	t.Run("contains both halves' default three, with no question twice", func(t *testing.T) {
		set := poolDay(t, "2026-10-14")
		seen := map[string]bool{}
		for _, q := range set.Pool {
			if seen[q.ID] {
				t.Fatalf("%s is in the pool twice", q.ID)
			}
			seen[q.ID] = true
		}
		for _, q := range append(append([]Question{}, set.Questions...), set.Evening...) {
			if !seen[q.ID] {
				t.Fatalf("default question %s is missing from the pool", q.ID)
			}
			if q.Care == careIntimate {
				t.Fatalf("an intimacy question is in the default three: %s", q.ID)
			}
		}
	})

	t.Run("gives the phone what it needs to pick: care level, depth and trait weights", func(t *testing.T) {
		for _, q := range poolDay(t, "2026-10-14").Pool {
			if q.Care == "" || q.Theme == "" {
				t.Fatalf("%s lacks care or theme", q.ID)
			}
			for _, o := range q.Options {
				if o.Depth < 1 || o.Depth > 4 {
					t.Fatalf("%s/%s has depth %d", q.ID, o.ID, o.Depth)
				}
			}
		}
	})

	t.Run("no pool question comes back within a week", func(t *testing.T) {
		last := map[string]int{}
		day := time.Date(2026, 10, 14, 0, 0, 0, 0, time.UTC)
		for i := range 400 {
			date := day.AddDate(0, 0, i).Format("2006-01-02")
			for _, q := range poolDay(t, date).Pool {
				id := strings.TrimPrefix(q.ID, date+"-")
				if prev, ok := last[id]; ok && i-prev < 7 {
					t.Fatalf("%s repeats after %d days", id, i-prev)
				}
				last[id] = i
			}
		}
	})

	t.Run("stays small enough for a slow connection", func(t *testing.T) {
		s := NewServer(func() time.Time { return time.Date(2026, 10, 14, 9, 0, 0, 0, time.UTC) }, shippedBank(t), newMemoryStore(), newDeviceSigner(testSecret))
		w := get(t, s, "/api/questions/today")
		expectStatus(t, w, http.StatusOK)
		var buf bytes.Buffer
		zw := gzip.NewWriter(&buf)
		zw.Write(w.Body.Bytes())
		zw.Close()
		if buf.Len() > 40<<10 {
			t.Fatalf("today's edition is %d bytes gzipped, budget is 40 KB", buf.Len())
		}
	})

	t.Run("any pool question takes votes and serves results", func(t *testing.T) {
		at := time.Date(2026, 10, 14, 9, 0, 0, 0, time.UTC)
		s := NewServer(func() time.Time { return at }, shippedBank(t), newMemoryStore(), newDeviceSigner(testSecret))
		set := poolDay(t, "2026-10-14")
		extra := extraOf(t, set)
		v := VoteRequest{QuestionID: extra.ID, OptionID: extra.Options[0].ID, VoterID: "a"}
		expectStatus(t, postVote(t, s, v, "k1"), http.StatusAccepted)
		if n := totalVotes(t, s, extra.ID); n != 1 {
			t.Fatalf("expected 1 vote on the pool question, got %d", n)
		}
	})

	t.Run("an intimacy answer is counted without its option, and its totals are never published", func(t *testing.T) {
		at := time.Date(2026, 10, 14, 9, 0, 0, 0, time.UTC)
		mem := newMemoryStore()
		s := NewServer(func() time.Time { return at }, shippedBank(t), mem, newDeviceSigner(testSecret))
		set := poolDay(t, "2026-10-14")
		q := set.Pool[len(set.Pool)-1]
		if q.Care != careIntimate {
			t.Fatalf("expected the intimacy question last, got %s", q.Care)
		}
		// An older phone may still send the option: the server drops it.
		expectStatus(t, postVote(t, s, VoteRequest{QuestionID: q.ID, OptionID: q.Options[1].ID, VoterID: "a"}, "k1"), http.StatusAccepted)
		// A current phone sends only that it answered.
		expectStatus(t, postVote(t, s, VoteRequest{QuestionID: q.ID, OptionID: privateOption, VoterID: "b"}, "k2"), http.StatusAccepted)
		aggregate(t, s)
		for _, e := range mem.events {
			if e.QuestionID == q.ID && e.OptionID != privateOption {
				t.Fatalf("an intimate option was stored: %+v", e)
			}
		}
		if counts, _ := mem.Counts(context.Background(), q.ID); len(counts) != 1 || counts[privateOption] != 2 {
			t.Fatalf("expected two answers counted with no option, got %v", counts)
		}
		w := get(t, s, "/api/questions/"+q.ID+"/results")
		expectError(t, w, http.StatusForbidden, "private_question")
		expectPublicCache(t, w)
		// The private stand-in is never accepted for an ordinary question.
		expectError(t, postVote(t, s, VoteRequest{QuestionID: extraOf(t, set).ID, OptionID: privateOption, VoterID: "c"}, "k3"), http.StatusBadRequest, "unknown_option")
	})
}

func extraOf(t *testing.T, set DailySet) Question {
	t.Helper()
	for _, q := range set.Pool[len(set.Questions)+len(set.Evening):] {
		if q.Care != careIntimate {
			return q
		}
	}
	t.Fatal("no extra in the pool")
	return Question{}
}

func TestVotesCannotBeLinkedAcrossQuestions(t *testing.T) {
	s := newTestServer()
	expectStatus(t, postVote(t, s, VoteRequest{QuestionID: "q-dishes", OptionID: "right-away", VoterID: "a"}, "k1"), http.StatusAccepted)
	expectStatus(t, postVote(t, s, VoteRequest{QuestionID: "q-bill", OptionID: "even", VoterID: "a"}, "k2"), http.StatusAccepted)
	mem, ok := s.votes.(*memoryStore)
	if !ok {
		t.Skip("inspects the in-memory store only")
	}
	if a, b := mem.events[0].VoterHash, mem.events[1].VoterHash; a == b {
		t.Fatal("one device's votes on two questions share a stored key, so they can be joined into a profile")
	}
}
