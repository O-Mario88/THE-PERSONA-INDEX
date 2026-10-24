package main

import (
	"encoding/json"
	"net/http"
	"os"
	"regexp"
	"slices"
	"strings"
	"testing"
)

// Stage 2 of the proposal of 2026-10-24 ("What you're reaching for"): every
// answer option names the need it reaches for, the card can offer a second
// step for that need, and a step started from it keeps its own text in the
// mirror and the export.

func TestNeedsMatchTheFrontend(t *testing.T) {
	raw, err := os.ReadFile("../frontend/src/needs.ts")
	if err != nil {
		t.Fatal(err)
	}
	m := regexp.MustCompile(`export const NEEDS = \[([^\]]*)\] as const`).FindSubmatch(raw)
	if m == nil {
		t.Fatal("NEEDS not found in frontend/src/needs.ts")
	}
	var front []string
	for _, id := range regexp.MustCompile(`'([a-z]+)'`).FindAllSubmatch(m[1], -1) {
		front = append(front, string(id[1]))
	}
	var back []string
	for id := range needSteps {
		back = append(back, id)
	}
	slices.Sort(front)
	slices.Sort(back)
	if !slices.Equal(front, back) {
		t.Fatalf("needs.ts has %v, needs.go has %v", front, back)
	}
}

func TestEveryNeedIsReachedForInTheBank(t *testing.T) {
	b := shippedBank(t)
	seen := map[string]int{}
	for _, q := range b.byID {
		for _, o := range q.Options {
			seen[o.Need]++
		}
	}
	for need := range needSteps {
		if seen[need] == 0 {
			t.Errorf("no answer in the bank reaches for %q", need)
		}
	}
}

func TestEditionCarriesNeedAndNeedStep(t *testing.T) {
	b := shippedBank(t)
	for _, q := range b.byID {
		for _, o := range b.dailyQuestion(*q, "2026-10-12").Options {
			if !validNeed(o.Need) {
				t.Fatalf("%s/%s: need %q reached the phone", q.ID, o.ID, o.Need)
			}
			if o.Insight == nil || o.Insight.NeedStep != needSteps[o.Need] {
				t.Fatalf("%s/%s: expected the %s step on the card", q.ID, o.ID, o.Need)
			}
		}
	}
	raw, err := json.Marshal(b.dailyQuestion(*b.byID["habits-first-move"], "2026-10-12"))
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`"need":"calm"`, `"needStep":"` + needSteps["calm"]} {
		if !strings.Contains(string(raw), want) {
			t.Errorf("the API shape does not carry %s: %s", want, raw)
		}
	}
}

func TestNeedStepKeepsItsText(t *testing.T) {
	cardStep := "Wash one plate the moment you finish."

	t.Run("a need step shows its own text in the mirror and the export", func(t *testing.T) {
		s := mirrorServer(mon)
		answer(t, s, "a", mon, "tidy", "now")
		expectStatus(t, postStep(t, s, "a", StepRequest{QuestionID: mon + "-tidy", OptionID: "now", Status: "started", Date: mon, NeedStep: true}), http.StatusOK)

		m := getMirror(t, s, "a", mon)
		if len(m.Steps) != 1 || m.Steps[0].Step != needSteps["calm"] {
			t.Fatalf("expected the calm step in the mirror, got %+v", m.Steps)
		}
		e := getExport(t, s, "a")
		if len(e.Steps) != 1 || e.Steps[0].Step != needSteps["calm"] {
			t.Fatalf("expected the calm step in the export, got %+v", e.Steps)
		}
	})

	t.Run("saying how it went keeps the step it started as", func(t *testing.T) {
		s := mirrorServer(mon)
		answer(t, s, "a", mon, "tidy", "now")
		expectStatus(t, postStep(t, s, "a", StepRequest{QuestionID: mon + "-tidy", OptionID: "now", Status: "started", Date: mon, NeedStep: true}), http.StatusOK)
		onDay(s, tue)
		expectStatus(t, postStep(t, s, "a", StepRequest{QuestionID: mon + "-tidy", OptionID: "now", Status: stepHelped, Date: mon}), http.StatusOK)

		m := getMirror(t, s, "a", tue)
		if len(m.Steps) != 1 || m.Steps[0].Step != needSteps["calm"] || m.Steps[0].Status != stepHelped {
			t.Fatalf("expected the calm step, helped, got %+v", m.Steps)
		}
	})

	t.Run("a card step stays the card's own", func(t *testing.T) {
		s := mirrorServer(mon)
		answer(t, s, "a", mon, "tidy", "now")
		expectStatus(t, postStep(t, s, "a", StepRequest{QuestionID: mon + "-tidy", OptionID: "now", Status: "started", Date: mon}), http.StatusOK)
		if m := getMirror(t, s, "a", mon); len(m.Steps) != 1 || m.Steps[0].Step != cardStep {
			t.Fatalf("expected the card's step, got %+v", m.Steps)
		}
	})

	t.Run("an answer with no need has no need step to start", func(t *testing.T) {
		s := mirrorServer(mon)
		answer(t, s, "a", mon, "tidy", "pile")
		expectError(t, postStep(t, s, "a", StepRequest{QuestionID: mon + "-tidy", OptionID: "pile", Status: "started", Date: mon, NeedStep: true}), http.StatusNotFound, "unknown_answer")
	})
}
