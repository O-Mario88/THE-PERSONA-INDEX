package main

import (
	"net/http"
	"reflect"
	"strings"
	"testing"
	"time"
)

// Acceptance tests for the edition: every player shares one numbered edition
// a day, and the end of a session names tomorrow's themes, never its questions.

type twoDayBank struct{}

func (twoDayBank) GetSet(date string) (DailySet, bool) {
	switch date {
	case today:
		return todaySet, true
	case "2026-10-13":
		return DailySet{Date: date, Questions: []Question{
			{ID: "t1", Theme: "money", Prompt: "secret one", Options: todaySet.Questions[1].Options},
			{ID: "t2", Theme: "friendship", Prompt: "secret two", Options: todaySet.Questions[1].Options},
			{ID: "t3", Theme: "money", Prompt: "secret three", Options: todaySet.Questions[1].Options},
		}}, true
	}
	return DailySet{}, false
}

func TestEdition(t *testing.T) {
	t.Run("today's set carries its edition number", func(t *testing.T) {
		body := decode[DailySet](t, get(t, newTestServer(), "/api/questions/today"))
		want := editionNumber(today)
		if body.Edition != want || want < 1 {
			t.Fatalf("expected edition %d, got %d", want, body.Edition)
		}
	})

	t.Run("edition numbers go up by one a day", func(t *testing.T) {
		if a, b := editionNumber("2026-10-12"), editionNumber("2026-10-13"); b != a+1 {
			t.Fatalf("expected consecutive editions, got %d then %d", a, b)
		}
		if editionNumber(editionEpoch) != 1 {
			t.Fatalf("the first edition is #1")
		}
	})

	t.Run("names tomorrow's themes once each, and never tomorrow's questions", func(t *testing.T) {
		s := NewServer(func() time.Time { return fixedNow }, twoDayBank{}, newMemoryStore(), newDeviceSigner(testSecret))
		w := get(t, s, "/api/questions/today")
		expectStatus(t, w, http.StatusOK)
		if body := w.Body.String(); containsAny(body, "secret one", "secret two", "\"t1\"") {
			t.Fatalf("tomorrow's questions leaked: %s", body)
		}
		got := decode[DailySet](t, w).TomorrowThemes
		if !reflect.DeepEqual(got, []string{"money", "friendship"}) {
			t.Fatalf("expected [money friendship], got %v", got)
		}
	})

	t.Run("says nothing about tomorrow when it is not published", func(t *testing.T) {
		body := decode[DailySet](t, get(t, newTestServer(), "/api/questions/today"))
		if len(body.TomorrowThemes) != 0 {
			t.Fatalf("expected no themes, got %v", body.TomorrowThemes)
		}
	})
}

func containsAny(s string, subs ...string) bool {
	for _, sub := range subs {
		if strings.Contains(s, sub) {
			return true
		}
	}
	return false
}
