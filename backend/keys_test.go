package main

import (
	"bytes"
	"net/http"
	"strings"
	"testing"
)

// Key handling (review of 2026-10-15): one secret signs passes and can be
// rotated without signing anyone out; another keys every stored hash and is
// never rotated, so a rotation never orphans anyone's history.

var (
	tokenSecretA = []byte("token-secret-A-0123456789abcdef-0123")
	tokenSecretB = []byte("token-secret-B-0123456789abcdef-0123")
	dataSecret   = []byte("data-secret-0123456789abcdef-012345")
)

func keyring(t *testing.T, c KeyConfig) *deviceSigner {
	t.Helper()
	d, err := newKeyring(c)
	if err != nil {
		t.Fatal(err)
	}
	return d
}

func TestKeys(t *testing.T) {
	t.Run("refuses short secrets and a data secret equal to a token secret", func(t *testing.T) {
		for name, c := range map[string]KeyConfig{
			"short token":          {TokenSecret: []byte("short"), DataSecret: dataSecret},
			"short data":           {TokenSecret: tokenSecretA, DataSecret: []byte("short")},
			"short previous":       {TokenSecret: tokenSecretA, PreviousTokenSecret: []byte("short"), DataSecret: dataSecret},
			"data equals token":    {TokenSecret: tokenSecretA, DataSecret: tokenSecretA},
			"data equals previous": {TokenSecret: tokenSecretA, PreviousTokenSecret: tokenSecretB, DataSecret: tokenSecretB},
		} {
			if _, err := newKeyring(c); err == nil {
				t.Errorf("%s: expected an error", name)
			}
		}
	})

	t.Run("a pass names its key and carries no personal data", func(t *testing.T) {
		d := keyring(t, KeyConfig{TokenSecret: tokenSecretA, DataSecret: dataSecret})
		tok := d.Issue()
		kid, id, _, ok := parseToken(tok)
		if !ok || !strings.HasPrefix(tok, tokenVersion+d.signing[0].kid+".") || kid != d.signing[0].kid || len(id) != 22 {
			t.Fatalf("unexpected pass %q", tok)
		}
		if got, ok := d.Verify(tok); !ok || got != id {
			t.Fatalf("expected the pass to verify as %q, got %q %v", id, got, ok)
		}
	})

	t.Run("after a rotation old passes still work and keep their history", func(t *testing.T) {
		before := keyring(t, KeyConfig{TokenSecret: tokenSecretA, DataSecret: dataSecret})
		after := keyring(t, KeyConfig{TokenSecret: tokenSecretB, PreviousTokenSecret: tokenSecretA, DataSecret: dataSecret})
		old := before.Issue()
		id, ok := after.Verify(old)
		if !ok {
			t.Fatal("expected a pass signed before the rotation to verify")
		}
		if after.voterHash(id, "q") != before.voterHash(id, "q") || after.mirrorKey(id) != before.mirrorKey(id) || after.privateQuestionID("q") != before.privateQuestionID("q") {
			t.Fatal("a rotation changed a stored hash")
		}
		fresh := after.Issue()
		if !strings.HasPrefix(fresh, tokenVersion+after.signing[0].kid+".") || after.signing[0].kid == before.signing[0].kid {
			t.Fatalf("expected new passes signed with the new key, got %q", fresh)
		}
		if _, ok := before.Verify(fresh); ok {
			t.Fatal("the old key verified a pass it never signed")
		}
		// Once the previous secret is dropped, old passes stop verifying.
		later := keyring(t, KeyConfig{TokenSecret: tokenSecretB, DataSecret: dataSecret})
		if _, ok := later.Verify(old); ok {
			t.Fatal("expected the old pass refused once its key is gone")
		}
		if _, ok := later.Holder(old); !ok {
			t.Fatal("expected the old pass still able to delete its rows")
		}
	})

	t.Run("a vote made before a rotation still counts once after it", func(t *testing.T) {
		s := newTestServer()
		s.devices = keyring(t, KeyConfig{TokenSecret: tokenSecretA, DataSecret: dataSecret})
		old := s.devices.Issue()
		expectStatus(t, postVote(t, s, VoteRequest{QuestionID: "q-dishes", OptionID: "right-away", VoterID: old}, "k1"), http.StatusAccepted)
		s.devices = keyring(t, KeyConfig{TokenSecret: tokenSecretB, PreviousTokenSecret: tokenSecretA, DataSecret: dataSecret})
		expectError(t, postVote(t, s, VoteRequest{QuestionID: "q-dishes", OptionID: "when-full", VoterID: old}, "k2"), http.StatusConflict, "duplicate_vote")
	})

	t.Run("each stored hash uses its own key", func(t *testing.T) {
		d := keyring(t, KeyConfig{TokenSecret: tokenSecretA, DataSecret: dataSecret})
		keys := [][]byte{d.signing[0].key, d.hashVoter, d.hashMirror, d.hashPrivate}
		for i := range keys {
			for j := i + 1; j < len(keys); j++ {
				if bytes.Equal(keys[i], keys[j]) {
					t.Fatalf("keys %d and %d are the same", i, j)
				}
			}
		}
		if d.mirrorKey("id") == d.voterHash("id", "") {
			t.Fatal("the mirror key equals a voter hash")
		}
	})

	t.Run("refuses malformed passes, including the old format", func(t *testing.T) {
		d := keyring(t, KeyConfig{TokenSecret: tokenSecretA, DataSecret: dataSecret})
		good := d.Issue()
		for _, bad := range []string{"", "v1.abc.def", good + "x", strings.Replace(good, "v2.", "v3.", 1), good[:len(good)-1] + "!", strings.Repeat("a", 200)} {
			if _, ok := d.Verify(bad); ok {
				t.Errorf("%q verified", bad)
			}
			if _, ok := d.Holder(bad); ok && bad != good {
				t.Errorf("%q accepted for delete", bad)
			}
		}
	})
}
