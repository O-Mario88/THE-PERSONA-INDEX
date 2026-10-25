package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"regexp"
	"slices"
	"strings"
	"testing"
	"time"
)

// shippedRegionalFiles decodes the regional bank and the main bank as shipped.
func shippedRegionalFiles(t *testing.T) (regionalFile, bankFile) {
	t.Helper()
	var f regionalFile
	if err := decodeStrict(regionalJSON, &f); err != nil {
		t.Fatal(err)
	}
	var main bankFile
	if err := decodeStrict(questionsJSON, &main); err != nil {
		t.Fatal(err)
	}
	return f, main
}

func regionalServer(t *testing.T) *Server {
	t.Helper()
	s := newTestServer()
	var err error
	if s.regional, s.regionalTag, err = loadShippedRegional(); err != nil {
		t.Fatal(err)
	}
	return s
}

func TestRegionalPack(t *testing.T) {
	t.Run("ships enough questions for every region, all through the gate", func(t *testing.T) {
		body, tag, err := loadShippedRegional()
		if err != nil {
			t.Fatal(err)
		}
		if !regexp.MustCompile(`^"[0-9a-f]{16}"$`).MatchString(tag) {
			t.Fatalf("ETag %q", tag)
		}
		var pack RegionalPack
		if err := json.Unmarshal(body, &pack); err != nil {
			t.Fatal(err)
		}
		if !slices.Equal(pack.Regions, regionKeys) {
			t.Fatalf("regions %v, want %v", pack.Regions, regionKeys)
		}
		per := map[string]int{}
		dated := regexp.MustCompile(`^\d{4}-\d{2}-\d{2}-`)
		for _, q := range pack.Questions {
			per[q.Region]++
			// The phone adds the day; the region key leads so ids never clash.
			if dated.MatchString(q.ID) || !strings.HasPrefix(q.ID, q.Region+"-") {
				t.Errorf("%s: id should start with its region and carry no date", q.ID)
			}
			if q.Care == careIntimate {
				t.Errorf("%s: intimacy in the regional pack", q.ID)
			}
			cited := false
			for _, o := range q.Options {
				if o.Insight == nil || o.Insight.Step == "" {
					t.Errorf("%s/%s: no card", q.ID, o.ID)
					continue
				}
				// As in the main bank, a cited card carries its source (the
				// phone keeps it out of sight).
				cited = cited || o.Insight.SourceURL != ""
				if o.Need != "" && o.Insight.NeedStep == "" {
					t.Errorf("%s/%s: need %s has no second step", q.ID, o.ID, o.Need)
				}
			}
			if !cited {
				t.Errorf("%s: no card cites a source", q.ID)
			}
		}
		for _, r := range regionKeys {
			if per[r] < minPerRegion {
				t.Errorf("region %s has %d questions, needs at least %d", r, per[r], minPerRegion)
			}
		}
	})

	t.Run("the gate refuses what does not belong", func(t *testing.T) {
		f, main := shippedRegionalFiles(t)
		if len(f.Questions) == 0 {
			t.Fatal("no regional questions shipped")
		}
		cases := []struct {
			name, want string
			change     func(f *regionalFile)
		}{
			{"a region nobody maps to", `region "mars"`, func(f *regionalFile) { f.Questions[0].Region = "mars" }},
			{"an intimacy question", "never about intimacy", func(f *regionalFile) { f.Questions[0].Theme = "intimacy" }},
			{"an id the main bank already uses", "duplicate question id", func(f *regionalFile) { f.Questions[0].ID = main.Questions[0].ID }},
			{"too few for a region to rest between", "needs at least", func(f *regionalFile) {
				r := f.Questions[0].Region
				f.Questions = slices.DeleteFunc(f.Questions, func(q regionalQuestion) bool { return q.Region == r })
			}},
			{"a card that fails the main gate", "reveal", func(f *regionalFile) {
				f.Questions[0].Options[0].Insight.Reveal = "Too short."
			}},
		}
		for _, c := range cases {
			t.Run(c.name, func(t *testing.T) {
				// A deep copy, so one case never leaks into the next.
				var g regionalFile
				if err := decodeStrict(regionalJSON, &g); err != nil {
					t.Fatal(err)
				}
				c.change(&g)
				errs := validateRegional(g, main)
				if !slices.ContainsFunc(errs, func(e error) bool { return strings.Contains(e.Error(), c.want) }) {
					t.Fatalf("expected an error containing %q, got %v", c.want, errs)
				}
			})
		}
	})

	t.Run("the server will not start with a failing bank or an unknown field", func(t *testing.T) {
		var g regionalFile
		if err := decodeStrict(regionalJSON, &g); err != nil {
			t.Fatal(err)
		}
		g.Questions[0].Region = "mars"
		raw, _ := json.Marshal(g)
		if _, _, err := loadRegional(raw, questionsJSON); err == nil || !strings.Contains(err.Error(), "regional bank fails") {
			t.Fatalf("expected the gate to stop it, got %v", err)
		}
		if _, _, err := loadRegional([]byte(`{"questions":[],"country":"x"}`), questionsJSON); err == nil {
			t.Fatal("an unknown field was dropped")
		}
	})
}

func TestRegionalEndpoint(t *testing.T) {
	t.Run("serves everyone the same pack, cached at the edge", func(t *testing.T) {
		s := regionalServer(t)
		w := get(t, s, "/api/regional")
		expectStatus(t, w, http.StatusOK)
		if cc := w.Header().Get("Cache-Control"); cc != "public, max-age=3600, s-maxage=3600" {
			t.Fatalf("Cache-Control %q", cc)
		}
		if w.Header().Get("ETag") != s.regionalTag || !strings.HasPrefix(w.Header().Get("Content-Type"), "application/json") {
			t.Fatalf("headers %v", w.Header())
		}
		if w.Body.String() != string(s.regional) {
			t.Fatal("body differs from the pack")
		}
		// Nothing about the asker changes the answer: no pass is needed, and
		// one sent anyway, a language or an address make no difference.
		req := httptest.NewRequest(http.MethodGet, "/api/regional", nil)
		req.Header.Set("Authorization", "Bearer "+tokenFor(s, "someone"))
		req.Header.Set("Accept-Language", "sw-KE")
		req.Header.Set("X-Forwarded-For", "41.90.0.1")
		other := do(t, s, req)
		expectStatus(t, other, http.StatusOK)
		if other.Body.String() != w.Body.String() || other.Header().Get("ETag") != w.Header().Get("ETag") {
			t.Fatal("the pack changed with the asker")
		}
		if sc := other.Header().Get("Set-Cookie"); sc != "" {
			t.Fatalf("set a cookie: %q", sc)
		}
	})

	t.Run("answers a phone that already has it with 304", func(t *testing.T) {
		s := regionalServer(t)
		req := httptest.NewRequest(http.MethodGet, "/api/regional", nil)
		req.Header.Set("If-None-Match", s.regionalTag)
		w := do(t, s, req)
		expectStatus(t, w, http.StatusNotModified)
		if w.Body.Len() != 0 {
			t.Fatal("304 with a body")
		}
	})

	t.Run("says there is none when no pack is loaded", func(t *testing.T) {
		w := get(t, newTestServer(), "/api/regional")
		expectError(t, w, http.StatusNotFound, "no_regional")
		if cc := w.Header().Get("Cache-Control"); cc != "public, max-age=30, s-maxage=30" {
			t.Fatalf("Cache-Control %q", cc)
		}
	})

	t.Run("its questions take no votes or card taps: their answers stay on the phone", func(t *testing.T) {
		at := time.Date(2026, 10, 14, 9, 0, 0, 0, time.UTC)
		s := NewServer(func() time.Time { return at }, shippedBank(t), newMemoryStore(), newDeviceSigner(testSecret))
		f, _ := shippedRegionalFiles(t)
		q := f.Questions[0]
		id := "2026-10-14-" + q.ID
		expectError(t, postVote(t, s, VoteRequest{QuestionID: id, OptionID: q.Options[0].ID, VoterID: "a"}, "k1"), http.StatusNotFound, "unknown_question")
		r := RatingRequest{QuestionID: id, OptionID: q.Options[0].ID, Verdict: verdictMe, VoterID: "a"}
		expectError(t, postRating(t, s, r, "r1"), http.StatusNotFound, "unknown_question")
	})
}

// TestRegionsMatchTheFrontend keeps the phone's list of regions, which maps
// each country to one, in step with the server's.
func TestRegionsMatchTheFrontend(t *testing.T) {
	src, err := os.ReadFile("../frontend/src/regions.ts")
	if err != nil {
		t.Fatal(err)
	}
	m := regexp.MustCompile(`export const REGIONS = \[([^\]]*)\]`).FindSubmatch(src)
	if m == nil {
		t.Fatal("REGIONS not found in regions.ts")
	}
	var got []string
	for _, s := range regexp.MustCompile(`'([^']+)'`).FindAllSubmatch(m[1], -1) {
		got = append(got, string(s[1]))
	}
	if !slices.Equal(got, regionKeys) {
		t.Fatalf("frontend regions %v, backend %v", got, regionKeys)
	}
}
