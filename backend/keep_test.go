package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Acceptance tests for Phase 3 of the review of 2026-10-15, "Yours to keep":
// plan checks that carry nothing but "did it" or "not yet", the export of
// everything the server holds for a phone, and the answers behind a read.

func postPlanCheck(t *testing.T, s *Server, device, key string, body PlanCheckRequest) *httptest.ResponseRecorder {
	t.Helper()
	if device != "" {
		body.VoterID = tokenFor(s, device)
	}
	raw, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/plans/checks", bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	if key != "" {
		req.Header.Set("Idempotency-Key", key)
	}
	return do(t, s, req)
}

func TestPlanChecks(t *testing.T) {
	t.Run("a check is kept once, with its date and status only, and counts in the week", func(t *testing.T) {
		s := mirrorServer(tue)
		answer(t, s, "a", mon, "tidy", "now")
		onDay(s, tue)
		for _, c := range []struct{ key, status string }{{"c1", planDid}, {"c2", planNotYet}, {"c3", planDid}} {
			w := postPlanCheck(t, s, "a", c.key, PlanCheckRequest{Status: c.status, Date: tue})
			expectStatus(t, w, http.StatusOK)
			if cc := w.Header().Get("Cache-Control"); cc != "no-store" {
				t.Fatalf("expected no-store, got %q", cc)
			}
		}
		expectStatus(t, postPlanCheck(t, s, "a", "c1", PlanCheckRequest{Status: planDid, Date: tue}), http.StatusOK) // a resend
		expectStatus(t, postPlanCheck(t, s, "b", "c1", PlanCheckRequest{Status: planNotYet, Date: tue}), http.StatusOK)

		m := getMirror(t, s, "a", tue)
		if m.Stats.PlansDid != 2 || m.Stats.PlansNotYet != 1 {
			t.Fatalf("expected 2 did and 1 not yet this week, got %+v", m.Stats)
		}
		checks, err := s.mirror.PlanChecks(context.Background(), s.devices.mirrorKey(deviceIDFor(s, "a")), mon, sun)
		if err != nil || len(checks) != 3 {
			t.Fatalf("expected three checks kept, got %+v (%v)", checks, err)
		}
		for _, c := range checks {
			if c.Date != tue || (c.Status != planDid && c.Status != planNotYet) {
				t.Fatalf("a check keeps the phone's date and its status, got %+v", c)
			}
		}
		if k := dataKept(t, s, "a"); k.Kept.PlanChecks != 3 {
			t.Fatalf("expected What I keep to count the checks, got %+v", k.Kept)
		}
		if next := getMirror(t, s, "a", day(mon, 7)); next.Stats.PlansDid != 0 || next.Stats.PlansNotYet != 0 {
			t.Fatalf("last week's checks are not this week's, got %+v", next.Stats)
		}
	})

	t.Run("only did and not yet are taken, on a date that is today somewhere", func(t *testing.T) {
		s := mirrorServer(mon)
		expectError(t, postPlanCheck(t, s, "a", "", PlanCheckRequest{Status: planDid, Date: mon}), http.StatusBadRequest, "missing_idempotency_key")
		expectError(t, postPlanCheck(t, s, "a", "bad key!", PlanCheckRequest{Status: planDid, Date: mon}), http.StatusBadRequest, "invalid_request")
		expectError(t, postPlanCheck(t, s, "a", "k", PlanCheckRequest{Status: "changed", Date: mon}), http.StatusBadRequest, "invalid_request")
		expectError(t, postPlanCheck(t, s, "a", "k", PlanCheckRequest{Status: planDid, Date: "2026-09-01"}), http.StatusBadRequest, "invalid_request")
		w := postPlanCheck(t, s, "", "k", PlanCheckRequest{Status: planDid, Date: mon, VoterID: "made-up"})
		expectError(t, w, http.StatusUnauthorized, "invalid_device")

		// A plan's words sent by mistake are not read, let alone kept.
		raw := `{"status":"did","date":"` + mon + `","voterId":"` + tokenFor(s, "a") + `","when":"I get home","will":"call my sister"}`
		req := httptest.NewRequest(http.MethodPost, "/api/plans/checks", strings.NewReader(raw))
		req.Header.Set("Idempotency-Key", "k2")
		expectStatus(t, do(t, s, req), http.StatusOK)
		export := getExport(t, s, "a")
		if b, _ := json.Marshal(export); strings.Contains(string(b), "sister") || strings.Contains(string(b), "I get home") {
			t.Fatalf("a plan's words must never be kept: %s", b)
		}
	})

	t.Run("delete everything takes the checks, and the old pass takes no more", func(t *testing.T) {
		s := mirrorServer(mon)
		answer(t, s, "a", mon, "tidy", "now")
		expectStatus(t, postPlanCheck(t, s, "a", "c1", PlanCheckRequest{Status: planDid, Date: mon}), http.StatusOK)
		expectStatus(t, postPlanCheck(t, s, "b", "c1", PlanCheckRequest{Status: planDid, Date: mon}), http.StatusOK)
		if got := forget(t, s, "/api/device/data", "a"); got.Deleted.PlanChecks != 1 || got.Deleted.Answers != 1 {
			t.Fatalf("expected the check deleted with the answer, got %+v", got.Deleted)
		}
		expectError(t, postPlanCheck(t, s, "a", "c2", PlanCheckRequest{Status: planDid, Date: mon}), http.StatusGone, "device_forgotten")
		if k := dataKept(t, s, "b"); k.Kept.PlanChecks != 1 {
			t.Fatalf("another phone's check stays, got %+v", k.Kept)
		}
	})

	t.Run("checks go after five weeks with the rest of the mirror", func(t *testing.T) {
		ctx := context.Background()
		st := testStore()
		for _, c := range []PlanCheck{{"k", "old", "2026-09-01", planDid}, {"k", "new", mon, planNotYet}} {
			if err := st.SavePlanCheck(ctx, c); err != nil {
				t.Fatal(err)
			}
		}
		if n, err := st.DeleteMirrorBefore(ctx, "2026-09-07"); err != nil || n != 1 {
			t.Fatalf("expected the old check deleted, got %d (%v)", n, err)
		}
		checks, err := st.PlanChecks(ctx, "k", "0001-01-01", "9999-12-31")
		if err != nil || len(checks) != 1 || checks[0].Key != "new" {
			t.Fatalf("expected only the recent check kept, got %+v (%v)", checks, err)
		}
	})
}

func getExport(t *testing.T, s *Server, device string) DeviceExport {
	t.Helper()
	w := do(t, s, withDevice(s, httptest.NewRequest(http.MethodGet, "/api/device/export", nil), device))
	expectStatus(t, w, http.StatusOK)
	if cc := w.Header().Get("Cache-Control"); !strings.Contains(cc, "no-store") || !strings.Contains(cc, "private") {
		t.Fatalf("expected a private, uncached response, got %q", cc)
	}
	if cd := w.Header().Get("Content-Disposition"); !strings.Contains(cd, "attachment") {
		t.Fatalf("expected the export as a file, got %q", cd)
	}
	return decode[DeviceExport](t, w)
}

func TestDeviceExport(t *testing.T) {
	t.Run("everything the server holds, written out", func(t *testing.T) {
		s := mirrorServer(mon)
		answer(t, s, "a", mon, "tidy", "now")
		answer(t, s, "a", mon, "night", "b")
		rate(t, s, "a", mon, "tidy", "now", verdictMe)
		rate(t, s, "a", mon, "night", "b", verdictPartly)
		expectStatus(t, postStep(t, s, "a", StepRequest{QuestionID: mon + "-tidy", OptionID: "now", Status: stepStarted, Date: mon}), http.StatusOK)
		expectStatus(t, postPlanCheck(t, s, "a", "c1", PlanCheckRequest{Status: planNotYet, Date: mon}), http.StatusOK)
		answer(t, s, "b", mon, "call", "call")

		e := getExport(t, s, "a")
		if e.Made != mon || e.About == "" || e.KeptFor.BackupDays != 400 {
			t.Fatalf("unexpected header %+v", e)
		}
		if len(e.Answers) != 2 {
			t.Fatalf("expected two answers, got %+v", e.Answers)
		}
		var open, private ExportAnswer
		for _, a := range e.Answers {
			if a.Private {
				private = a
			} else {
				open = a
			}
		}
		if open.Question != "Dishes after dinner?" || open.Answer != "Right away" || open.Verdict != verdictMe || open.Sitting != "morning" || open.Theme != "habits" {
			t.Fatalf("expected the answer written out, got %+v", open)
		}
		if private.Question != privateQuestionText || private.Answer != privateAnswerText || private.Depth != 0 {
			t.Fatalf("a private answer was never kept with its question or option, got %+v", private)
		}
		if len(e.Steps) != 1 || e.Steps[0].Step != "Wash one plate the moment you finish." || e.Steps[0].Question != "Dishes after dinner?" {
			t.Fatalf("expected the step written out, got %+v", e.Steps)
		}
		if len(e.PlanChecks) != 1 || e.PlanChecks[0] != (ExportPlanCheck{Date: mon, Status: planNotYet}) {
			t.Fatalf("expected the check, got %+v", e.PlanChecks)
		}
		if len(e.Votes) != 4 {
			t.Fatalf("expected two votes and two ratings, got %+v", e.Votes)
		}
		want := map[string]bool{
			"answer|Dishes after dinner?|Right away":                       true,
			"answer|A private question.|" + privateAnswerText:              true,
			"rating|Dishes after dinner?|Right away: That's me":            true,
			"rating|A private question.|" + privateAnswerText + ": Partly": true,
		}
		for _, v := range e.Votes {
			if !want[v.Kind+"|"+v.Question+"|"+v.Answer] || !strings.HasSuffix(v.Hour, ":00Z") {
				t.Fatalf("unexpected vote %+v", v)
			}
		}
		if raw, _ := json.Marshal(e); strings.Contains(string(raw), `"B"`) {
			t.Fatalf("a private choice must not appear: %s", raw)
		}
		if other := getExport(t, s, "b"); len(other.Answers) != 1 || other.Answers[0].Question != "A friend goes quiet for a week. You…" {
			t.Fatalf("expected only the other phone's own answer, got %+v", other.Answers)
		}
	})

	t.Run("a new phone gets empty lists, and a missing pass gets nothing", func(t *testing.T) {
		s := mirrorServer(mon)
		e := getExport(t, s, "new")
		if e.Answers == nil || e.Steps == nil || e.PlanChecks == nil || e.Weeks == nil || e.Votes == nil ||
			len(e.Answers)+len(e.Steps)+len(e.PlanChecks)+len(e.Weeks)+len(e.Votes) != 0 {
			t.Fatalf("expected empty lists, never made-up rows, got %+v", e)
		}
		expectError(t, do(t, s, httptest.NewRequest(http.MethodGet, "/api/device/export", nil)), http.StatusUnauthorized, "invalid_device")
	})
}

func TestReadShowsTheAnswersBehindIt(t *testing.T) {
	s := mirrorServer(mon)
	answer(t, s, "a", mon, "tidy", "now")
	answer(t, s, "a", tue, "tidy", "pile")
	answer(t, s, "a", wed, "tidy", "now")
	answer(t, s, "a", thu, "tidy", "now")
	answer(t, s, "a", thu, "night", "a") // private: never behind a read
	rate(t, s, "a", wed, "tidy", "now", verdictNotMe)

	r, ok := traitOf(getMirror(t, s, "a", thu), "conscientiousness")
	if !ok {
		t.Fatal("expected a read")
	}
	if len(r.Behind) != r.Answers || r.Answers != 3 {
		t.Fatalf("expected the three answers the read counts behind it, got %d: %+v", r.Answers, r.Behind)
	}
	got := []string{}
	for _, b := range r.Behind {
		got = append(got, b.Date+" "+b.Answer+" "+b.Leans)
		if b.Question != "Dishes after dinner?" || b.Theme != "habits" {
			t.Fatalf("expected the question written out, got %+v", b)
		}
	}
	if want := thu + " Right away high," + tue + " When the pile is high low," + mon + " Right away high"; strings.Join(got, ",") != want {
		t.Fatalf("expected newest first, without the 'Not me' answer:\n got %s\nwant %s", strings.Join(got, ","), want)
	}

	for _, tr := range getMirror(t, s, "b", thu).Traits {
		t.Fatalf("another phone sees no read of these answers, got %+v", tr)
	}
}

func TestCardReport(t *testing.T) {
	b, err := loadShippedBank()
	if err != nil {
		t.Fatal(err)
	}
	var q bankQuestion
	for _, qs := range b.byArea {
		q = qs[0]
		break
	}
	if len(q.Options) < 3 {
		t.Fatalf("expected a question with three options, got %+v", q)
	}
	o1, o2, o3 := q.Options[0].ID, q.Options[1].ID, q.Options[2].ID
	tallies := map[string]map[string]int{
		ratingKey(mon + "-" + q.ID): {o1 + "/me": 8, o1 + "/partly": 2, o2 + "/partly": 6, o2 + "/me": 3, o3 + "/not": 12, privateOption + "/not": 50},
		ratingKey(tue + "-" + q.ID): {o1 + "/me": 12, o2 + "/partly": 6, o2 + "/not": 5, o3 + "/not": 6, o3 + "/me": 2},
		ratingKey(tue + "-gone"):    {"x/not": 99},
	}
	flags, judged := cardReport(tallies, b, 20)
	if judged != 3 {
		t.Fatalf("expected three cards with 20 or more taps, counted across days, got %d", judged)
	}
	if len(flags) != 2 || flags[0].OptionID != o3 || flags[0].Reason != "misses" || flags[0].NotMe != 18 || flags[0].Me != 2 ||
		flags[1].OptionID != o2 || flags[1].Reason != "vague" || flags[1].Partly != 12 {
		t.Fatalf("expected the card that misses, then the vague one, got %+v", flags)
	}
	if flags[0].Prompt != q.Prompt || flags[0].Label != q.Options[2].Label || flags[0].Reveal == "" {
		t.Fatalf("expected the card written out, got %+v", flags[0])
	}

	var out, errs bytes.Buffer
	if code := runCardsCommand(context.Background(), nil, newMemoryStore(), b, &out, &errs); code != 0 ||
		!strings.Contains(out.String(), "no card has 20 taps yet") {
		t.Fatalf("an empty database judges nothing and says so: %d %q %q", code, out.String(), errs.String())
	}
}
