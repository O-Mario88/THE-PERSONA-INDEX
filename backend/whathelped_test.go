package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

// Acceptance tests for What Helped (Insights Release 2, 2026-10-26): after
// saving "Something you could try", a person may say how it went: tried and
// it helped a lot, helped a little, no change, or didn't try. The reports are
// their own dataset, apart from votes and the mirror, and the totals show
// only once 50 reports stand after folding; an outcome fewer than 10 gave is
// folded, with no number, and left out of the total.

func postHelped(t *testing.T, s *Server, device string, body HelpedRequest) *httptest.ResponseRecorder {
	t.Helper()
	if device != "" {
		body.VoterID = tokenFor(s, device)
	}
	raw, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/what-helped", bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	return do(t, s, req)
}

func getHelped(t *testing.T, s *Server) WhatHelped {
	t.Helper()
	w := get(t, s, "/api/what-helped")
	expectStatus(t, w, http.StatusOK)
	expectPublicCache(t, w)
	return decode[WhatHelped](t, w)
}

// reportTidy has n devices, named prefix0…, answer "Right away" to Monday's
// dishes question and report outcome on its step.
func reportTidy(t *testing.T, s *Server, prefix string, n int, outcome string) {
	t.Helper()
	for i := range n {
		device := fmt.Sprintf("%s%d", prefix, i)
		answer(t, s, device, mon, "tidy", "now")
		expectStatus(t, postHelped(t, s, device, HelpedRequest{QuestionID: mon + "-tidy", OptionID: "now", Outcome: outcome, Date: mon}), http.StatusOK)
	}
}

func helpedStep(h WhatHelped, questionID, optionID string) (WhatHelpedStep, bool) {
	for _, st := range h.Steps {
		if st.QuestionID == questionID && st.OptionID == optionID {
			return st, true
		}
	}
	return WhatHelpedStep{}, false
}

func outcomeOf(st WhatHelpedStep, outcome string) HelpedCount {
	for _, c := range st.Outcomes {
		if c.Outcome == outcome {
			return c
		}
	}
	return HelpedCount{}
}

func TestWhatHelped(t *testing.T) {
	t.Run("nothing shows until 50 reports stand after folding, and an outcome under 10 has no number", func(t *testing.T) {
		s := mirrorServer(mon)
		h := getHelped(t, s)
		if h.Min != whatHelpedMin || h.Few != whatHelpedFew || len(h.Steps) != 0 {
			t.Fatalf("expected the thresholds and no steps yet, got %+v", h)
		}

		reportTidy(t, s, "lot", 41, helpedLot)
		reportTidy(t, s, "same", 9, helpedNoChange)
		if _, shown := helpedStep(getHelped(t, s), mon+"-tidy", "now"); shown {
			t.Fatal("50 reports with 9 folded leave 41: too few to show")
		}
		reportTidy(t, s, "little", 9, helpedLittle)
		if _, shown := helpedStep(getHelped(t, s), mon+"-tidy", "now"); shown {
			t.Fatal("two outcomes under 10 are both folded: still 41")
		}
		reportTidy(t, s, "little-more", 1, helpedLittle)

		st, shown := helpedStep(getHelped(t, s), mon+"-tidy", "now")
		if !shown || st.Total != 51 {
			t.Fatalf("expected the step with 51 counted (41 + 10), got %+v (shown %v)", st, shown)
		}
		if c := outcomeOf(st, helpedLot); c.Count != 41 || c.Few {
			t.Fatalf("expected 41 helped a lot, got %+v", c)
		}
		if c := outcomeOf(st, helpedLittle); c.Count != 10 || c.Few {
			t.Fatalf("expected 10 helped a little, got %+v", c)
		}
		if c := outcomeOf(st, helpedNoChange); !c.Few || c.Count != 0 {
			t.Fatalf("9 is folded: a few, with no number, got %+v", c)
		}
		if c := outcomeOf(st, helpedNotTried); c.Few || c.Count != 0 {
			t.Fatalf("nobody said they didn't try: a real zero, got %+v", c)
		}
		if len(st.Outcomes) != len(helpedOutcomes) {
			t.Fatalf("every outcome is listed, in order, got %+v", st.Outcomes)
		}
		for i, c := range st.Outcomes {
			if c.Outcome != helpedOutcomes[i] {
				t.Fatalf("outcomes go in a fixed order, got %+v", st.Outcomes)
			}
		}
	})

	t.Run("one report per phone per step: sending again changes it, never adds one", func(t *testing.T) {
		s := mirrorServer(mon)
		reportTidy(t, s, "lot", 45, helpedLot)
		reportTidy(t, s, "little", 10, helpedLittle)
		for range 3 {
			expectStatus(t, postHelped(t, s, "lot0", HelpedRequest{QuestionID: mon + "-tidy", OptionID: "now", Outcome: helpedLot, Date: mon}), http.StatusOK)
		}
		st, _ := helpedStep(getHelped(t, s), mon+"-tidy", "now")
		if st.Total != 55 {
			t.Fatalf("a resend counts once: expected 55, got %+v", st)
		}
		onDay(s, tue)
		expectStatus(t, postHelped(t, s, "lot0", HelpedRequest{QuestionID: mon + "-tidy", OptionID: "now", Outcome: helpedLittle, Date: tue}), http.StatusOK)
		st, _ = helpedStep(getHelped(t, s), mon+"-tidy", "now")
		if outcomeOf(st, helpedLot).Count != 44 || outcomeOf(st, helpedLittle).Count != 11 || st.Total != 55 {
			t.Fatalf("a changed report moves, it is not added: got %+v", st)
		}
	})

	t.Run("only a step from an answer the phone gave, with a known outcome, on a date that is today somewhere", func(t *testing.T) {
		s := mirrorServer(mon)
		answer(t, s, "a", mon, "tidy", "now")
		answer(t, s, "a", mon, "night", "a")
		ok := HelpedRequest{QuestionID: mon + "-tidy", OptionID: "now", Outcome: helpedLot, Date: mon}

		bad := ok
		bad.Outcome = "helped"
		expectError(t, postHelped(t, s, "a", bad), http.StatusBadRequest, "invalid_request")
		bad = ok
		bad.Date = "2026-09-01"
		expectError(t, postHelped(t, s, "a", bad), http.StatusBadRequest, "invalid_request")
		bad = ok
		bad.QuestionID = ""
		expectError(t, postHelped(t, s, "a", bad), http.StatusBadRequest, "invalid_request")
		bad = ok
		bad.VoterID = "made-up"
		expectError(t, postHelped(t, s, "", bad), http.StatusUnauthorized, "invalid_device")

		bad = ok
		bad.OptionID = "pile" // the phone chose "now"
		expectError(t, postHelped(t, s, "a", bad), http.StatusNotFound, "unknown_answer")
		expectError(t, postHelped(t, s, "b", ok), http.StatusNotFound, "unknown_answer") // b never answered
		private := HelpedRequest{QuestionID: mon + "-night", OptionID: "a", Outcome: helpedLot, Date: mon}
		expectError(t, postHelped(t, s, "a", private), http.StatusNotFound, "unknown_answer")

		w := postHelped(t, s, "a", ok)
		expectStatus(t, w, http.StatusOK)
		if cc := w.Header().Get("Cache-Control"); cc != "no-store" {
			t.Fatalf("expected no-store, got %q", cc)
		}
	})

	t.Run("reports are kept under their own key, never the mirror's or a vote's", func(t *testing.T) {
		s := mirrorServer(mon)
		id := deviceIDFor(s, "a")
		key := s.devices.helpedKey(id)
		if key == "" || key == s.devices.mirrorKey(id) || key == s.devices.voterHash(id, mon+"-tidy") {
			t.Fatalf("expected a key of its own, got %q", key)
		}
		if key != s.devices.helpedKey(id) || key == s.devices.helpedKey(deviceIDFor(s, "b")) {
			t.Fatal("the key is the same for one phone and differs between phones")
		}
	})

	t.Run("the phone's own reports are in its export, written out, and counted in What I keep", func(t *testing.T) {
		s := mirrorServer(mon)
		answer(t, s, "a", mon, "tidy", "now")
		onDay(s, tue)
		expectStatus(t, postHelped(t, s, "a", HelpedRequest{QuestionID: mon + "-tidy", OptionID: "now", Outcome: helpedLittle, Date: tue}), http.StatusOK)
		answer(t, s, "b", mon, "tidy", "now")
		expectStatus(t, postHelped(t, s, "b", HelpedRequest{QuestionID: mon + "-tidy", OptionID: "now", Outcome: helpedLot, Date: mon}), http.StatusOK)

		e := getExport(t, s, "a")
		want := []ExportReport{{Week: mon, Question: "Dishes after dinner?", Step: "Wash one plate the moment you finish.", Outcome: helpedLittle}}
		if len(e.Reports) != 1 || e.Reports[0] != want[0] {
			t.Fatalf("expected the phone's one report, written out, got %+v", e.Reports)
		}
		if k := dataKept(t, s, "a"); k.Kept.Reports != 1 {
			t.Fatalf("expected What I keep to count the report, got %+v", k.Kept)
		}
	})

	t.Run("delete everything takes the phone's reports, and its old pass adds no more", func(t *testing.T) {
		s := mirrorServer(mon)
		reportTidy(t, s, "lot", 50, helpedLot)
		reportTidy(t, s, "little", 10, helpedLittle)
		f := forget(t, s, "/api/device/data", "lot0")
		if f.Deleted.Reports != 1 {
			t.Fatalf("expected one report deleted, got %+v", f.Deleted)
		}
		st, _ := helpedStep(getHelped(t, s), mon+"-tidy", "now")
		if outcomeOf(st, helpedLot).Count != 49 || st.Total != 59 {
			t.Fatalf("expected the report gone from the totals, got %+v", st)
		}
		w := postHelped(t, s, "lot0", HelpedRequest{QuestionID: mon + "-tidy", OptionID: "now", Outcome: helpedLot, Date: mon})
		if w.Code == http.StatusOK {
			t.Fatal("a forgotten phone's old pass must not report again")
		}
		if st, _ := helpedStep(getHelped(t, s), mon+"-tidy", "now"); st.Total != 59 {
			t.Fatalf("still 59, got %+v", st)
		}
	})
}
