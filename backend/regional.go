package main

import (
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"strings"
)

// The regional bank: optional questions about everyday moments that belong to
// one part of the world, such as a relative asking for money, waiting for
// papers, or a meal eaten alone (Edwin, 2026-10-24: "I want the app to speak
// to any ethnicity in the world"; the plan in docs/research/regions/report.md,
// "tailor the setting, never the person").
//
// The country someone gives stays on their phone (frontend/src/country.ts).
// So the server never picks for anyone: every phone that wants regional
// questions downloads the same pack from GET /api/regional, maps its own
// country to one of the regions below, and picks there. Answers to these
// questions are never sent at all, not even as a private marker, because a
// question id alone would say which part of the world someone lives in.
//
// The questions pass the same quality gate as the main bank, and a few more
// rules (validateRegional). The server refuses to start if any card fails.

//go:embed content/regional.json
var regionalJSON []byte

// regionKeys are the six regions, used only to organise this optional content,
// never to describe a person. frontend/src/regions.ts maps each country to
// one of them (or to none); TestRegionsMatchTheFrontend keeps the lists in step.
var regionKeys = []string{"africa", "mena", "south-asia", "east-asia", "latin-america", "west"}

// minPerRegion keeps each region's questions from repeating too soon: the
// phone shows one at most every few days and none twice in three weeks.
const minPerRegion = 3

type regionalFile struct {
	Questions []regionalQuestion `json:"questions"`
}

type regionalQuestion struct {
	bankQuestion
	Region string `json:"region"`
}

// RegionalQuestion is one question of the pack, in the edition's shape plus
// its region. Its id carries no date: the phone adds the day it is shown.
type RegionalQuestion struct {
	Question
	Region string `json:"region"`
}

// RegionalPack is the response of GET /api/regional: the same for everyone.
type RegionalPack struct {
	Regions   []string           `json:"regions"`
	Questions []RegionalQuestion `json:"questions"`
}

// validateRegional returns every rule the regional bank breaks. main is the
// main bank: ids may not clash with it, and the voice rules that count
// phrases across the bank count both together, since a phone shows both.
func validateRegional(f regionalFile, main bankFile) []error {
	var errs []error
	fail := func(format string, args ...any) { errs = append(errs, fmt.Errorf(format, args...)) }
	ids := map[string]bool{}
	for _, q := range main.Questions {
		ids[q.ID] = true
	}
	perRegion := map[string]int{}
	all := bankFile{Questions: slices.Clone(main.Questions)}
	for _, q := range f.Questions {
		if !slices.Contains(regionKeys, q.Region) {
			fail("%s: region %q is not one of %s", q.ID, q.Region, strings.Join(regionKeys, ", "))
		}
		if t, ok := themes[q.Theme]; ok && t.care == careIntimate {
			fail("%s: a regional question is never about intimacy", q.ID)
		}
		perRegion[q.Region]++
		checkQuestion(fail, q.bankQuestion, ids)
		all.Questions = append(all.Questions, q.bankQuestion)
	}
	for _, r := range regionKeys {
		if perRegion[r] < minPerRegion {
			fail("region %s has %d questions, needs at least %d", r, perRegion[r], minPerRegion)
		}
	}
	return append(errs, checkVoice(all)...)
}

// loadRegional checks the regional bank against the gate and the main bank,
// and returns the pack, encoded once, with its ETag.
func loadRegional(raw, mainRaw []byte) (body []byte, etag string, err error) {
	var f regionalFile
	if err := decodeStrict(raw, &f); err != nil {
		return nil, "", fmt.Errorf("regional bank: %w", err)
	}
	var main bankFile
	if err := decodeStrict(mainRaw, &main); err != nil {
		return nil, "", fmt.Errorf("question bank: %w", err)
	}
	sum := sha256.Sum256(append(append([]byte("regional\x00"), raw...), mainRaw...))
	if _, ok := passedGate.Load(sum); !ok {
		if errs := validateRegional(f, main); len(errs) > 0 {
			return nil, "", fmt.Errorf("regional bank fails %d checks, first: %w", len(errs), errs[0])
		}
		passedGate.Store(sum, true)
	}
	pack := RegionalPack{Regions: regionKeys, Questions: []RegionalQuestion{}}
	for _, q := range f.Questions {
		out := contentBank{}.dailyQuestion(q.bankQuestion, "")
		out.ID = q.ID // no date: the phone adds the day it shows it
		pack.Questions = append(pack.Questions, RegionalQuestion{Question: out, Region: q.Region})
	}
	body, err = json.Marshal(pack)
	if err != nil {
		return nil, "", err
	}
	h := sha256.Sum256(body)
	return body, `"` + hex.EncodeToString(h[:8]) + `"`, nil
}

// loadShippedRegional is the regional pack built into the binary.
func loadShippedRegional() ([]byte, string, error) { return loadRegional(regionalJSON, questionsJSON) }

// regionalTTL: the pack changes only when the server is updated.
const regionalTTL = 3600

// Regional serves the pack. Nothing about the phone is asked for or kept: no
// device pass, and the request is the same from everyone.
func (s *Server) Regional(w http.ResponseWriter, r *http.Request) {
	if s.regional == nil {
		w.Header().Set("Cache-Control", "public, max-age=30, s-maxage=30")
		writeError(w, http.StatusNotFound, "no_regional")
		return
	}
	w.Header().Set("Cache-Control", fmt.Sprintf("public, max-age=%d, s-maxage=%d", regionalTTL, regionalTTL))
	w.Header().Set("ETag", s.regionalTag)
	if r.Header.Get("If-None-Match") == s.regionalTag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(s.regional)
}
