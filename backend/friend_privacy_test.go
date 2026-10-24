package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"regexp"
	"slices"
	"strings"
	"testing"
)

// Friend questions and the Outside Mirror. What a friend says about someone
// is kept with no sender: a keyed mark counts distinct friends and nothing
// more. The mirror opens only when three different friends have answered.

// mesh signs in the named people and connects every pair.
func mesh(t *testing.T, s *Server, codes *fakeSender, names ...string) []SignedIn {
	t.Helper()
	var out []SignedIn
	for _, n := range names {
		out = append(out, named(t, s, codes, n))
	}
	for i := range out {
		for j := i + 1; j < len(out); j++ {
			befriend(t, s, out[i], out[j])
		}
	}
	return out
}

func friendToday(t *testing.T, s *Server, who SignedIn) FriendToday {
	t.Helper()
	w := send(t, s, "GET", "/api/friends/today?date="+today, who.AccountToken, nil)
	expectStatus(t, w, http.StatusOK)
	return decode[FriendToday](t, w)
}

func TestFriendAnswersKeepNoSender(t *testing.T) {
	t.Run("the kept shape has no sender", func(t *testing.T) {
		var fields []string
		typ := reflect.TypeFor[FriendInput]()
		for i := range typ.NumField() {
			fields = append(fields, typ.Field(i).Name)
		}
		if want := []string{"Subject", "Monday", "QuestionID", "OptionID", "Mark"}; !slices.Equal(fields, want) {
			t.Fatalf("FriendInput holds %v; anything beyond %v needs a privacy review", fields, want)
		}
	})
	t.Run("the tables cannot be joined back to a sender", func(t *testing.T) {
		raw, err := os.ReadFile("migrations/008_accounts_circle.sql")
		if err != nil {
			t.Fatal(err)
		}
		table := func(name string) string {
			m := regexp.MustCompile(`(?s)CREATE TABLE IF NOT EXISTS ` + name + ` \((.*?)\n\);`).FindStringSubmatch(string(raw))
			if m == nil {
				t.Fatalf("no table %s", name)
			}
			return m[1]
		}
		inputs := table("friend_mirror_inputs")
		for _, col := range []string{"asker", "sender", "from", "author", "account_id", "asked_on", "date"} {
			if regexp.MustCompile(`(?m)^\s+` + col + `\s`).MatchString(inputs) {
				t.Errorf("friend_mirror_inputs has a %q column", col)
			}
		}
		log := table("friend_prompt_log")
		for _, col := range []string{"subject", "question_id", "option_id", "mark", "monday"} {
			if regexp.MustCompile(`(?m)^\s+` + col + `\s`).MatchString(log) {
				t.Errorf("friend_prompt_log has a %q column", col)
			}
		}
	})
}

func TestFriendQuestionNeedsThreeFriends(t *testing.T) {
	s, codes := accountServer(t)
	p := mesh(t, s, codes, "Ama", "Kofi", "Esi")
	ama := p[0]
	ft := friendToday(t, s, ama)
	if ft.Open || ft.Have != 2 || ft.Need != 3 || ft.Question != nil {
		t.Fatalf("two friends is not enough: %+v", ft)
	}
	expectError(t, send(t, s, "POST", "/api/friends/votes", ama.AccountToken, friendVote{Date: today, FriendID: p[1].Account.ID, QuestionID: "fq-work-01", OptionID: "a"}),
		http.StatusForbidden, "circle_too_small")

	yaw := named(t, s, codes, "Yaw")
	befriend(t, s, ama, yaw)
	if ft := friendToday(t, s, ama); !ft.Open || ft.Have != 3 {
		t.Fatalf("three friends opens it: %+v", ft)
	}
	t.Run("a muted friend does not count and is never asked about", func(t *testing.T) {
		expectStatus(t, send(t, s, "PATCH", "/api/circle/friends/"+yaw.Account.ID, ama.AccountToken, map[string]any{"muted": true}), http.StatusOK)
		if ft := friendToday(t, s, ama); ft.Open || ft.Have != 2 {
			t.Fatalf("muted: %+v", ft)
		}
		expectStatus(t, send(t, s, "PATCH", "/api/circle/friends/"+yaw.Account.ID, ama.AccountToken, map[string]any{"muted": false}), http.StatusOK)
	})
}

func TestFriendVoteTakesOnlyTodaysPick(t *testing.T) {
	s, codes := accountServer(t)
	p := mesh(t, s, codes, "Ama", "Kofi", "Esi", "Yaw")
	ama := p[0]
	ft := friendToday(t, s, ama)
	if !ft.Open || ft.Friend == nil || ft.Question == nil || ft.Answered {
		t.Fatalf("today: %+v", ft)
	}
	if again := friendToday(t, s, ama); again.Friend.ID != ft.Friend.ID || again.Question.ID != ft.Question.ID {
		t.Fatal("the same friend and question all day")
	}
	if strings.Contains(ft.Question.Prompt, "{name}") || !strings.Contains(ft.Question.Prompt, ft.Friend.Name) {
		t.Fatalf("prompt should carry the friend's name: %q", ft.Question.Prompt)
	}
	if len(ft.Question.Options) != 4 {
		t.Fatalf("options: %+v", ft.Question.Options)
	}
	var other string
	for _, x := range p[1:] {
		if x.Account.ID != ft.Friend.ID {
			other = x.Account.ID
		}
	}
	opt := ft.Question.Options[0].ID
	vote := func(v friendVote) *httptest.ResponseRecorder {
		return send(t, s, "POST", "/api/friends/votes", ama.AccountToken, v)
	}
	expectError(t, vote(friendVote{Date: today, FriendID: other, QuestionID: ft.Question.ID, OptionID: opt}), http.StatusBadRequest, "not_todays_question")
	expectError(t, vote(friendVote{Date: today, FriendID: ft.Friend.ID, QuestionID: "fq-work-02x", OptionID: opt}), http.StatusBadRequest, "not_todays_question")
	expectError(t, vote(friendVote{Date: today, FriendID: ft.Friend.ID, QuestionID: ft.Question.ID, OptionID: "z"}), http.StatusBadRequest, "unknown_option")
	expectError(t, vote(friendVote{Date: "2026-09-01", FriendID: ft.Friend.ID, QuestionID: ft.Question.ID, OptionID: opt}), http.StatusBadRequest, "invalid_date")
	expectStatus(t, vote(friendVote{Date: today, FriendID: ft.Friend.ID, QuestionID: ft.Question.ID, OptionID: opt}), http.StatusAccepted)
	expectError(t, vote(friendVote{Date: today, FriendID: ft.Friend.ID, QuestionID: ft.Question.ID, OptionID: opt}), http.StatusConflict, "already_answered")
	if !friendToday(t, s, ama).Answered {
		t.Fatal("answered today")
	}

	ins, err := s.social.FriendInputs(context.Background(), ft.Friend.ID, "2000-01-01")
	if err != nil || len(ins) != 1 {
		t.Fatalf("inputs %v %v", ins, err)
	}
	in := ins[0]
	if in.Mark == "" || strings.Contains(in.Mark, ama.Account.ID) || in.Mark == ama.Account.ID {
		t.Fatalf("the mark must not be the sender: %+v", in)
	}
	if in.Mark != s.devices.friendMarkOf(ama.Account.ID, ft.Friend.ID) || in.Mark == s.devices.friendMarkOf(p[1].Account.ID, ft.Friend.ID) {
		t.Fatal("the mark is stable for a pair and differs between senders")
	}
	if in.Monday != mondayOf(today) {
		t.Fatalf("kept by week, not day: %s", in.Monday)
	}
}

func TestOutsideMirrorOpensAtThreeFriends(t *testing.T) {
	bank := mustFriendBank()
	q := bank.byID["fq-work-01"]
	input := func(mark, option, monday string) FriendInput {
		return FriendInput{Subject: "ama", Monday: monday, QuestionID: q.ID, OptionID: option, Mark: mark}
	}
	monday := mondayOf(today)

	t.Run("two friends, however often, keep it closed", func(t *testing.T) {
		m := bank.blend([]FriendInput{input("k", "a", monday), input("k", "a", monday), input("e", "a", monday)})
		if m.Open || m.Friends != 2 || len(m.Traits) != 0 {
			t.Fatalf("got %+v", m)
		}
	})
	t.Run("three friends open the traits all three spoke to", func(t *testing.T) {
		m := bank.blend([]FriendInput{input("k", "a", monday), input("e", "a", monday), input("y", "a", monday)})
		if !m.Open || m.Friends != 3 || m.Weeks != friendWindowWeeks {
			t.Fatalf("got %+v", m)
		}
		want, _ := traitPosition(q.asQuestion(), "a", "conscientiousness")
		i := slices.IndexFunc(m.Traits, func(x OutsideLean) bool { return x.Trait == "conscientiousness" })
		if i < 0 || m.Traits[i].Position != float64(int(want*1000+0.5))/10 {
			t.Fatalf("conscientiousness: %+v (want %.1f)", m.Traits, want*100)
		}
		for _, x := range m.Traits {
			if x.Position < 0 || x.Position > 100 {
				t.Fatalf("position out of range: %+v", x)
			}
		}
	})
	t.Run("a trait only two friends spoke to stays hidden", func(t *testing.T) {
		two := func(id, trait string) friendQuestion {
			return friendQuestion{ID: id, Tag: "work", Options: []friendOption{
				{ID: "a", Traits: map[string]int{trait: 2}}, {ID: "b", Traits: map[string]int{trait: -1}},
				{ID: "c", Traits: map[string]int{trait: 1}}, {ID: "d", Traits: map[string]int{trait: -2}}}}
		}
		small := friendBank{byID: map[string]friendQuestion{"x": two("x", "agreeableness"), "y": two("y", "openness")}}
		in := func(qid, mark string) FriendInput {
			return FriendInput{Subject: "ama", Monday: monday, QuestionID: qid, OptionID: "a", Mark: mark}
		}
		m := small.blend([]FriendInput{in("x", "k"), in("x", "e"), in("x", "y"), in("y", "k"), in("y", "e"), in("y", "k")})
		if len(m.Traits) != 1 || m.Traits[0].Trait != "agreeableness" || m.Traits[0].Position != 100 {
			t.Fatalf("only agreeableness had three friends: %+v", m.Traits)
		}
	})
	t.Run("unknown questions are ignored, never counted", func(t *testing.T) {
		m := bank.blend([]FriendInput{{QuestionID: "gone", OptionID: "a", Mark: "k"}})
		if m.Friends != 0 {
			t.Fatalf("got %+v", m)
		}
	})

	t.Run("served only to its subject, over the last three weeks", func(t *testing.T) {
		s, codes := accountServer(t)
		ama := named(t, s, codes, "Ama")
		askers := map[string]string{}
		for mark, name := range map[string]string{"k": "Kofi", "e": "Esi", "y": "Yaw"} {
			askers[mark] = named(t, s, codes, name).Account.ID
		}
		ctx := context.Background()
		old := mustDate(monday).AddDate(0, 0, -7*friendWindowWeeks).Format(dateLayout)
		for i, mark := range []string{"k", "e", "y"} {
			when := monday
			if i == 2 {
				when = old // the third friend answered too long ago
			}
			in := input(mark, "a", when)
			in.Subject = ama.Account.ID
			if err := s.social.AnswerFriend(ctx, askers[mark], today, in); err != nil {
				t.Fatal(err)
			}
		}
		w := send(t, s, "GET", "/api/friends/mirror", ama.AccountToken, nil)
		expectStatus(t, w, http.StatusOK)
		if m := decode[OutsideMirror](t, w); m.Open || m.Friends != 2 || m.Need != 3 {
			t.Fatalf("the old answer falls out of the window: %+v", m)
		}
		in := input("y", "a", monday)
		in.Subject = ama.Account.ID
		if err := s.social.AnswerFriend(ctx, askers["y"], "2026-10-13", in); err != nil {
			t.Fatal(err)
		}
		if m := decode[OutsideMirror](t, send(t, s, "GET", "/api/friends/mirror", ama.AccountToken, nil)); !m.Open || m.Friends != 3 {
			t.Fatalf("three this window: %+v", m)
		}
		expectStatus(t, send(t, s, "GET", "/api/friends/mirror", "", nil), http.StatusUnauthorized)
	})
}

func TestFriendBankShipsThirtyPerTag(t *testing.T) {
	b := mustFriendBank()
	for _, tag := range circleTags {
		if len(b.byTag[tag]) != 30 {
			t.Errorf("%s has %d questions", tag, len(b.byTag[tag]))
		}
	}
	if _, err := loadFriendBank([]byte(`{"version":1,"questions":[{"id":"fq-work-01","tag":"work","prompt":"No name here at all, which is not allowed now.","options":[]}]}`)); err == nil {
		t.Fatal("a bad bank must be refused")
	}
}
