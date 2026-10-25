package main

import (
	"os"
	"strings"
	"testing"
)

// TestRegionalDraft checks a draft of new regional questions before they are
// added to content/regional.json, with the same gate the server uses:
//
//	REGIONAL_DRAFT=draft.json go test -run TestRegionalDraft .
//
// Only the regions the draft covers need their minimum. New sources go in
// content/sources.json first, each opened and checked (docs/writing-guide.md).
func TestRegionalDraft(t *testing.T) {
	path := os.Getenv("REGIONAL_DRAFT")
	if path == "" {
		t.Skip("set REGIONAL_DRAFT to a draft file to check it")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var draft regionalFile
	if err := decodeStrict(raw, &draft); err != nil {
		t.Fatalf("draft: %v", err)
	}
	var main bankFile
	if err := decodeStrict(questionsJSON, &main); err != nil {
		t.Fatal(err)
	}
	var shipped regionalFile
	if err := decodeStrict(regionalJSON, &shipped); err != nil {
		t.Fatal(err)
	}
	// Check the draft together with what already ships, so ids and capped
	// phrases are counted across both.
	all := regionalFile{Questions: append(shipped.Questions, draft.Questions...)}
	for _, err := range validateRegional(all, main) {
		if strings.Contains(err.Error(), " has 0 questions") {
			continue
		}
		t.Error(err)
	}
	fail := func(format string, args ...any) { t.Errorf(format, args...) }
	checkSources(fail)
}
