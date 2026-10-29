package main

import (
	"net/http"
	"strings"
	"testing"
)

// Reflect together (Edwin, 2026-10-29): one person sends a trusted friend a
// question; both answer privately first; each then chooses whether to
// reveal. An answer is seen only when both chose to reveal, so the first
// answer stays honest. No scores, ever.

func TestReflectTogether(t *testing.T) {
	s, codes := accountServer(t)
	ama, kofi, joel := named(t, s, codes, "Ama"), named(t, s, codes, "Kofi"), named(t, s, codes, "Joel")
	befriend(t, s, ama, kofi)

	list := func(who SignedIn) ReflectTogetherView {
		t.Helper()
		return decode[ReflectTogetherView](t, send(t, s, "GET", "/api/reflect-together", who.AccountToken, nil))
	}

	t.Run("offers a fixed list of questions, each with a way in for overlap and for difference", func(t *testing.T) {
		qs := list(ama).Questions
		if len(qs) < 4 || qs[0].ID == "" || len(qs[0].Options) < 3 || qs[0].Same == "" || qs[0].Differ == "" {
			t.Fatalf("expected questions with options and both prompts, got %+v", qs)
		}
		for _, q := range qs {
			for _, line := range []string{q.Prompt, q.Same, q.Differ} {
				if strings.Contains(strings.ToLower(line), "compatib") || strings.Contains(line, "%") {
					t.Fatalf("no scores or compatibility: %q", line)
				}
			}
		}
	})

	var id string
	t.Run("only between friends, and the asker answers privately first", func(t *testing.T) {
		q := list(ama).Questions[0]
		expectStatus(t, send(t, s, "POST", "/api/reflect-together", ama.AccountToken, map[string]string{"friendId": joel.Account.ID, "questionId": q.ID, "optionId": q.Options[0].ID}), http.StatusNotFound)
		w := send(t, s, "POST", "/api/reflect-together", ama.AccountToken, map[string]string{"friendId": kofi.Account.ID, "questionId": q.ID, "optionId": q.Options[0].ID})
		expectStatus(t, w, http.StatusCreated)
		id = decode[map[string]string](t, w)["id"]
		got := list(kofi).Items
		if len(got) != 1 || got[0].With.Name != "Ama" || got[0].Mine != "" || got[0].Theirs != "" || !got[0].TheyAnswered {
			t.Fatalf("Kofi is invited, sees that Ama answered, never what: %+v", got)
		}
	})

	t.Run("keeps both answers hidden until both choose to reveal", func(t *testing.T) {
		q := list(ama).Questions[0]
		expectStatus(t, send(t, s, "POST", "/api/reflect-together/"+id+"/answer", kofi.AccountToken, map[string]string{"optionId": q.Options[1].ID}), http.StatusNoContent)
		expectStatus(t, send(t, s, "POST", "/api/reflect-together/"+id+"/reveal", kofi.AccountToken, map[string]bool{"reveal": true}), http.StatusNoContent)
		if it := list(kofi).Items[0]; it.Theirs != "" || it.Mine != q.Options[1].ID || !it.IRevealed {
			t.Fatalf("Kofi revealed, Ama not yet: Kofi must not see Ama's answer: %+v", it)
		}
		if it := list(ama).Items[0]; it.Theirs != "" || !it.TheyAnswered {
			t.Fatalf("Ama has not revealed: she must not see Kofi's answer: %+v", it)
		}
		expectStatus(t, send(t, s, "POST", "/api/reflect-together/"+id+"/reveal", ama.AccountToken, map[string]bool{"reveal": true}), http.StatusNoContent)
		if it := list(kofi).Items[0]; it.Theirs != q.Options[0].ID {
			t.Fatalf("both revealed: Kofi sees Ama's answer, got %+v", it)
		}
		if it := list(ama).Items[0]; it.Theirs != q.Options[1].ID || it.Mine != q.Options[0].ID {
			t.Fatalf("both revealed: Ama sees Kofi's answer, got %+v", it)
		}
	})

	t.Run("lets someone keep their answer private, and anyone leave", func(t *testing.T) {
		q := list(ama).Questions[1]
		w := send(t, s, "POST", "/api/reflect-together", kofi.AccountToken, map[string]string{"friendId": ama.Account.ID, "questionId": q.ID, "optionId": q.Options[0].ID})
		expectStatus(t, w, http.StatusCreated)
		other := decode[map[string]string](t, w)["id"]
		expectStatus(t, send(t, s, "POST", "/api/reflect-together/"+other+"/answer", ama.AccountToken, map[string]string{"optionId": q.Options[2].ID}), http.StatusNoContent)
		expectStatus(t, send(t, s, "POST", "/api/reflect-together/"+other+"/reveal", kofi.AccountToken, map[string]bool{"reveal": true}), http.StatusNoContent)
		expectStatus(t, send(t, s, "POST", "/api/reflect-together/"+other+"/reveal", ama.AccountToken, map[string]bool{"reveal": false}), http.StatusNoContent)
		for _, it := range list(kofi).Items {
			if it.ID == other && (it.Theirs != "" || !it.TheyKept) {
				t.Fatalf("Ama kept hers private: Kofi sees only that, got %+v", it)
			}
		}
		expectStatus(t, send(t, s, "DELETE", "/api/reflect-together/"+other, joel.AccountToken, nil), http.StatusNotFound)
		expectStatus(t, send(t, s, "DELETE", "/api/reflect-together/"+other, ama.AccountToken, nil), http.StatusNoContent)
		for _, it := range list(kofi).Items {
			if it.ID == other {
				t.Fatalf("a left reflection is gone for both")
			}
		}
	})

	t.Run("takes only options of the question, and one answer each", func(t *testing.T) {
		q := list(ama).Questions[2]
		expectStatus(t, send(t, s, "POST", "/api/reflect-together", ama.AccountToken, map[string]string{"friendId": kofi.Account.ID, "questionId": q.ID, "optionId": "nonsense"}), http.StatusBadRequest)
		expectStatus(t, send(t, s, "POST", "/api/reflect-together", ama.AccountToken, map[string]string{"friendId": kofi.Account.ID, "questionId": "nonsense", "optionId": q.Options[0].ID}), http.StatusBadRequest)
		expectStatus(t, send(t, s, "POST", "/api/reflect-together/"+id+"/answer", kofi.AccountToken, map[string]string{"optionId": list(ama).Questions[0].Options[2].ID}), http.StatusConflict)
	})
}
