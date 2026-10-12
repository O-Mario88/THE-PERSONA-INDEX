package main

import (
	"net/http"
	"testing"
	"time"
)

func TestTodayQuestionsMissingSet(t *testing.T) {
	t.Run("returns 404 when no set is published for today", func(t *testing.T) {
		s := NewServer(func() time.Time { return fixedNow.AddDate(0, 0, 1) }, fixtureBank{})
		expectError(t, get(t, s, "/api/questions/today"), http.StatusNotFound, "no_questions_today")
	})

	t.Run("uses the UTC date even when the clock is in another zone", func(t *testing.T) {
		// 01:00 on Oct 13 in UTC+3 is still Oct 12 in UTC.
		zone := time.FixedZone("UTC+3", 3*60*60)
		at := time.Date(2026, 10, 13, 1, 0, 0, 0, zone)
		s := NewServer(func() time.Time { return at }, fixtureBank{})
		expectStatus(t, get(t, s, "/api/questions/today"), http.StatusOK)
	})
}
