package main

import (
	"context"
	"maps"
	"slices"
	"sort"
	"strings"
	"time"
)

// The in-memory SocialStore, for local runs and the default test suite. It
// shares the memory store's lock.

type memorySocial struct {
	accounts map[string]Account
	logins   map[string]Login // login key -> login
	sessions map[string]Session
	codes    map[string]LoginCode
	sync     map[string][]byte
	friends  map[string]map[string]Friend // a -> b -> b as a files them (name etc. filled on read)
	invites  map[string]Invite
	rooms    map[string]Room
	members  map[string]map[string]bool // room -> account ids
	asks     map[string]bool            // a\x00b
	dismiss  map[string]bool            // a\x00b
	inputs   []FriendInput
	prompts  map[string]bool // asker\x00date
	promptOn map[string]string
	nods     []Nod
	together map[string]Together
}

func newMemorySocial() memorySocial {
	return memorySocial{
		accounts: map[string]Account{}, logins: map[string]Login{}, sessions: map[string]Session{},
		codes: map[string]LoginCode{}, sync: map[string][]byte{}, friends: map[string]map[string]Friend{},
		invites: map[string]Invite{}, rooms: map[string]Room{}, members: map[string]map[string]bool{},
		asks: map[string]bool{}, dismiss: map[string]bool{}, prompts: map[string]bool{}, promptOn: map[string]string{},
		together: map[string]Together{},
	}
}

func pair(a, b string) string { return a + "\x00" + b }

func (m *memoryStore) CreateAccount(_ context.Context, a Account, l Login) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.social.logins[l.Key]; ok {
		return ErrLoginTaken
	}
	if a.Handle != "" {
		for _, x := range m.social.accounts {
			if x.Handle == a.Handle {
				return ErrHandleTaken
			}
		}
	}
	m.social.accounts[a.ID] = a
	l.AccountID = a.ID
	m.social.logins[l.Key] = l
	return nil
}

func (m *memoryStore) AccountByLogin(_ context.Context, key string) (Account, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	l, ok := m.social.logins[key]
	if !ok {
		return Account{}, ErrNoAccount
	}
	return m.social.accounts[l.AccountID], nil
}

func (m *memoryStore) GetAccount(_ context.Context, id string) (Account, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	a, ok := m.social.accounts[id]
	if !ok {
		return Account{}, ErrNoAccount
	}
	return a, nil
}

func (m *memoryStore) AccountByHandle(_ context.Context, handle string) (Account, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, a := range m.social.accounts {
		if a.Handle == handle {
			return a, nil
		}
	}
	return Account{}, ErrNoAccount
}

func (m *memoryStore) UpdateAccount(_ context.Context, a Account) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	prev, ok := m.social.accounts[a.ID]
	if !ok {
		return ErrNoAccount
	}
	if a.Handle != "" {
		for _, x := range m.social.accounts {
			if x.ID != a.ID && x.Handle == a.Handle {
				return ErrHandleTaken
			}
		}
	}
	prev.Name, prev.Handle, prev.Suggest, prev.Connect, prev.Epoch, prev.Sync = a.Name, a.Handle, a.Suggest, a.Connect, a.Epoch, a.Sync
	m.social.accounts[a.ID] = prev
	return nil
}

func (m *memoryStore) AddLogin(_ context.Context, l Login) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if prev, ok := m.social.logins[l.Key]; ok {
		if prev.AccountID == l.AccountID {
			return nil
		}
		return ErrLoginTaken
	}
	m.social.logins[l.Key] = l
	return nil
}

func (m *memoryStore) Logins(_ context.Context, id string) ([]Login, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []Login
	for _, l := range m.social.logins {
		if l.AccountID == id {
			out = append(out, l)
		}
	}
	slices.SortFunc(out, func(x, y Login) int { return strings.Compare(x.Kind+x.Key, y.Kind+y.Key) })
	return out, nil
}

func (m *memoryStore) DeleteAccount(_ context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	s := &m.social
	delete(s.accounts, id)
	maps.DeleteFunc(s.logins, func(_ string, l Login) bool { return l.AccountID == id })
	maps.DeleteFunc(s.sessions, func(_ string, x Session) bool { return x.AccountID == id })
	delete(s.sync, id)
	delete(s.friends, id)
	for _, f := range s.friends {
		delete(f, id)
	}
	maps.DeleteFunc(s.invites, func(_ string, i Invite) bool { return i.AccountID == id })
	for code, r := range s.rooms {
		if r.AccountID == id {
			delete(s.rooms, code)
			delete(s.members, code)
		}
	}
	for _, mem := range s.members {
		delete(mem, id)
	}
	maps.DeleteFunc(s.asks, func(k string, _ bool) bool { a, b, _ := strings.Cut(k, "\x00"); return a == id || b == id })
	maps.DeleteFunc(s.dismiss, func(k string, _ bool) bool { a, b, _ := strings.Cut(k, "\x00"); return a == id || b == id })
	s.inputs = slices.DeleteFunc(s.inputs, func(in FriendInput) bool { return in.Subject == id })
	maps.DeleteFunc(s.prompts, func(k string, _ bool) bool { a, _, _ := strings.Cut(k, "\x00"); return a == id })
	s.nods = slices.DeleteFunc(s.nods, func(n Nod) bool { return n.From == id || n.To == id })
	maps.DeleteFunc(s.together, func(_ string, t Together) bool { return t.Asker == id || t.Invitee == id })
	m.closer.forgetAccount(id)
	m.forgetReflectTogether(id)
	m.forgetOutsideNotes(id)
	m.forgetPushTokens(id)
	return nil
}

func (m *memoryStore) PutSession(_ context.Context, x Session) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.social.sessions[x.ID] = x
	return nil
}

func (m *memoryStore) TouchSession(_ context.Context, id, today string) (Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	x, ok := m.social.sessions[id]
	if !ok {
		return Session{}, ErrNoSession
	}
	x.SeenOn = today
	m.social.sessions[id] = x
	if a, ok := m.social.accounts[x.AccountID]; ok {
		a.SeenOn = today
		m.social.accounts[a.ID] = a
	}
	return x, nil
}

func (m *memoryStore) Sessions(_ context.Context, accountID string) ([]Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []Session
	for _, x := range m.social.sessions {
		if x.AccountID == accountID {
			out = append(out, x)
		}
	}
	slices.SortFunc(out, func(a, b Session) int { return strings.Compare(b.SeenOn+a.ID, a.SeenOn+b.ID) })
	return out, nil
}

func (m *memoryStore) DeleteSession(_ context.Context, accountID, id string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	x, ok := m.social.sessions[id]
	if !ok || x.AccountID != accountID {
		return false, nil
	}
	delete(m.social.sessions, id)
	return true, nil
}

func (m *memoryStore) PutCode(_ context.Context, c LoginCode) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.social.codes[c.Key] = c
	return nil
}

func (m *memoryStore) CheckCode(_ context.Context, key, hash string, now time.Time) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	c, ok := m.social.codes[key]
	if !ok {
		return false, nil
	}
	if !now.Before(c.Expires) {
		delete(m.social.codes, key)
		return false, nil
	}
	if c.CodeHash == hash {
		delete(m.social.codes, key)
		return true, nil
	}
	c.Tries++
	if c.Tries >= maxCodeTries {
		delete(m.social.codes, key)
	} else {
		m.social.codes[key] = c
	}
	return false, nil
}

func (m *memoryStore) PutSyncPhrase(_ context.Context, id string, sealed []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.social.sync[id] = slices.Clone(sealed)
	return nil
}

func (m *memoryStore) SyncPhrase(_ context.Context, id string) ([]byte, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.social.sync[id]
	if !ok {
		return nil, ErrNotFound
	}
	return slices.Clone(s), nil
}

func (m *memoryStore) DeleteSyncPhrase(_ context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.social.sync, id)
	return nil
}

func (m *memoryStore) MoveMirror(_ context.Context, from, to string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if from == to {
		return nil
	}
	mm := &m.mirror
	if mm.forgotten[to] != "" {
		return ErrDeviceForgotten
	}
	if src := mm.answers[from]; src != nil {
		dst := mm.answers[to]
		if dst == nil {
			dst = map[string]MirrorAnswer{}
			mm.answers[to] = dst
		}
		for q, a := range src {
			if _, ok := dst[q]; !ok {
				a.DeviceKey = to
				dst[q] = a
			}
		}
		delete(mm.answers, from)
	}
	if src := mm.steps[from]; src != nil {
		dst := mm.steps[to]
		if dst == nil {
			dst = map[string]MirrorStep{}
			mm.steps[to] = dst
		}
		for q, s := range src {
			if _, ok := dst[q]; !ok {
				s.DeviceKey = to
				dst[q] = s
			}
		}
		delete(mm.steps, from)
	}
	if src := mm.checks[from]; src != nil {
		dst := mm.checks[to]
		if dst == nil {
			dst = map[string]PlanCheck{}
			mm.checks[to] = dst
		}
		for k, c := range src {
			if _, ok := dst[k]; !ok {
				c.DeviceKey = to
				dst[k] = c
			}
		}
		delete(mm.checks, from)
	}
	if src := mm.weeks[from]; src != nil {
		dst := mm.weeks[to]
		if dst == nil {
			dst = map[string]WeekSummary{}
			mm.weeks[to] = dst
		}
		for k, w := range src {
			if _, ok := dst[k]; !ok {
				w.DeviceKey = to
				dst[k] = w
			}
		}
		delete(mm.weeks, from)
	}
	return nil
}

// The circle.

func (m *memoryStore) Befriend(_ context.Context, a, b, tagA, tagB, today string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.social.accounts[a]; !ok {
		return ErrNoAccount
	}
	if _, ok := m.social.accounts[b]; !ok {
		return ErrNoAccount
	}
	put := func(x, y, tag string) {
		f := m.social.friends[x]
		if f == nil {
			f = map[string]Friend{}
			m.social.friends[x] = f
		}
		if _, ok := f[y]; !ok {
			f[y] = Friend{AccountID: y, Tag: tag, Since: today}
		}
	}
	put(a, b, tagA)
	put(b, a, tagB)
	delete(m.social.asks, pair(a, b))
	delete(m.social.asks, pair(b, a))
	return nil
}

func (m *memoryStore) Unfriend(_ context.Context, a, b string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.social.friends[a], b)
	delete(m.social.friends[b], a)
	m.closer.forgetPair(a, b)
	return nil
}

func (m *memoryStore) SetFriend(_ context.Context, a, b, tag string, muted bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	f, ok := m.social.friends[a][b]
	if !ok {
		return ErrNotFriends
	}
	f.Tag, f.Muted = tag, muted
	m.social.friends[a][b] = f
	return nil
}

func (m *memoryStore) Friends(_ context.Context, id string) ([]Friend, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []Friend
	for b, f := range m.social.friends[id] {
		acc := m.social.accounts[b]
		f.Name, f.Handle, f.SeenOn, f.Connect = acc.Name, acc.Handle, acc.SeenOn, acc.Connect
		out = append(out, f)
	}
	slices.SortFunc(out, func(x, y Friend) int { return strings.Compare(x.Since+x.Name+x.AccountID, y.Since+y.Name+y.AccountID) })
	return out, nil
}

func (m *memoryStore) AreFriends(_ context.Context, a, b string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, ok := m.social.friends[a][b]
	return ok, nil
}

func (m *memoryStore) PutInvite(_ context.Context, inv Invite) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.social.invites[inv.Code] = inv
	return nil
}

func (m *memoryStore) GetInvite(_ context.Context, code string) (Invite, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	inv, ok := m.social.invites[code]
	if !ok {
		return Invite{}, ErrNotFound
	}
	return inv, nil
}

func (m *memoryStore) InviteFor(_ context.Context, id, tag, today string) (Invite, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, inv := range m.social.invites {
		if inv.AccountID == id && inv.Tag == tag && inv.ExpiresOn > today {
			return inv, nil
		}
	}
	return Invite{}, ErrNotFound
}

func (m *memoryStore) PutRoom(_ context.Context, r Room) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	// A code in use is never handed out twice while it lives.
	if old, ok := m.social.rooms[r.Code]; ok && old.Expires.After(r.Expires.Add(-roomLife)) {
		return ErrCodeTaken
	}
	m.social.rooms[r.Code] = r
	m.social.members[r.Code] = map[string]bool{r.AccountID: true}
	return nil
}

func (m *memoryStore) GetRoom(_ context.Context, code string, now time.Time) (Room, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	r, ok := m.social.rooms[code]
	if !ok || !now.Before(r.Expires) {
		return Room{}, ErrNotFound
	}
	return r, nil
}

func (m *memoryStore) OpenRoomOf(_ context.Context, id string, now time.Time) (Room, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, r := range m.social.rooms {
		if r.AccountID == id && now.Before(r.Expires) {
			return r, nil
		}
	}
	return Room{}, ErrNotFound
}

func (m *memoryStore) JoinRoom(_ context.Context, code, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	mem := m.social.members[code]
	if mem == nil {
		return ErrNotFound
	}
	mem[id] = true
	return nil
}

func (m *memoryStore) RoomMembers(_ context.Context, code string) ([]string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return slices.Sorted(maps.Keys(m.social.members[code])), nil
}

func (m *memoryStore) RoomsOf(_ context.Context, id string, now time.Time) ([]Room, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []Room
	for code, mem := range m.social.members {
		if r, ok := m.social.rooms[code]; ok && mem[id] && now.Before(r.Expires) {
			out = append(out, r)
		}
	}
	slices.SortFunc(out, func(x, y Room) int { return strings.Compare(x.Code, y.Code) })
	return out, nil
}

func (m *memoryStore) Ask(_ context.Context, a, b string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.social.asks[pair(a, b)] = true
	return nil
}

func (m *memoryStore) Asked(_ context.Context, a, b string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.social.asks[pair(a, b)], nil
}

func (m *memoryStore) Dismiss(_ context.Context, a, b string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.social.dismiss[pair(a, b)] = true
	delete(m.social.asks, pair(b, a))
	return nil
}

func (m *memoryStore) Suggestions(_ context.Context, id string, now time.Time) ([]Suggestion, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s := &m.social
	mine := s.friends[id]
	skip := func(b string) bool {
		_, friend := mine[b]
		return b == id || friend || s.dismiss[pair(id, b)]
	}
	found := map[string]*Suggestion{}
	get := func(b string) *Suggestion {
		if x, ok := found[b]; ok {
			return x
		}
		acc := s.accounts[b]
		x := &Suggestion{AccountID: b, Name: acc.Name, Handle: acc.Handle}
		found[b] = x
		return x
	}
	for k := range s.asks {
		a, b, _ := strings.Cut(k, "\x00")
		if b == id && !skip(a) {
			get(a).Asked = true
		}
	}
	for code, mem := range s.members {
		r, ok := s.rooms[code]
		if !ok || !now.Before(r.Expires) || !mem[id] {
			continue
		}
		for b := range mem {
			if !skip(b) {
				get(b).Room = code
			}
		}
	}
	mutual := map[string][]string{}
	for f := range mine {
		for b := range s.friends[f] {
			if !skip(b) && s.accounts[b].Suggest {
				mutual[b] = append(mutual[b], s.accounts[f].Name)
			}
		}
	}
	for b, names := range mutual {
		if len(names) >= minMutualFriends {
			sort.Strings(names)
			get(b).Mutual = names
		}
	}
	out := make([]Suggestion, 0, len(found))
	for _, x := range found {
		out = append(out, *x)
	}
	sortSuggestions(out)
	return out, nil
}

func (m *memoryStore) AnswerFriend(_ context.Context, asker, date string, in FriendInput) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	k := pair(asker, date)
	if m.social.prompts[k] {
		return ErrAlreadyAnswered
	}
	m.social.prompts[k] = true
	m.social.promptOn[k] = date
	m.social.inputs = append(m.social.inputs, in)
	return nil
}

func (m *memoryStore) AnsweredFriendOn(_ context.Context, asker, date string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.social.prompts[pair(asker, date)], nil
}

func (m *memoryStore) FriendInputs(_ context.Context, subject, from string) ([]FriendInput, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []FriendInput
	for _, in := range m.social.inputs {
		if in.Subject == subject && in.Monday >= from {
			out = append(out, in)
		}
	}
	return out, nil
}

func (m *memoryStore) PutNod(_ context.Context, n Nod) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, x := range m.social.nods {
		if x.From == n.From && x.To == n.To && x.Date == n.Date {
			return ErrAlreadyNodded
		}
	}
	m.social.nods = append(m.social.nods, n)
	return nil
}

func (m *memoryStore) NodsTo(_ context.Context, to, from string) ([]Nod, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []Nod
	for _, n := range m.social.nods {
		if n.To == to && n.Date >= from {
			out = append(out, n)
		}
	}
	slices.SortFunc(out, func(a, b Nod) int { return strings.Compare(b.Date+a.From, a.Date+b.From) })
	return out, nil
}

func (m *memoryStore) NodsFrom(_ context.Context, from, date string) ([]Nod, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []Nod
	for _, n := range m.social.nods {
		if n.From == from && n.Date == date {
			out = append(out, n)
		}
	}
	return out, nil
}

func (m *memoryStore) PutTogether(_ context.Context, t Together) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.social.together[t.ID] = t
	return nil
}

func (m *memoryStore) GetTogether(_ context.Context, id string) (Together, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	t, ok := m.social.together[id]
	if !ok {
		return Together{}, ErrNotFound
	}
	return t, nil
}

func (m *memoryStore) AnswerTogether(_ context.Context, id, invitee, option string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	t, ok := m.social.together[id]
	if !ok || t.Invitee != invitee {
		return ErrNotFound
	}
	if t.InviteeOption != "" {
		return ErrAlreadyAnswered
	}
	t.InviteeOption = option
	m.social.together[id] = t
	return nil
}

func (m *memoryStore) HideTogether(_ context.Context, id, invitee string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	t, ok := m.social.together[id]
	if !ok || t.Invitee != invitee {
		return ErrNotFound
	}
	t.InviteeHidden = true
	m.social.together[id] = t
	return nil
}

func (m *memoryStore) DeleteTogether(_ context.Context, id, asker string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	t, ok := m.social.together[id]
	if !ok || t.Asker != asker {
		return ErrNotFound
	}
	delete(m.social.together, id)
	return nil
}

func (m *memoryStore) Togethers(_ context.Context, id string) ([]Together, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []Together
	for _, t := range m.social.together {
		if t.Asker == id || t.Invitee == id {
			out = append(out, t)
		}
	}
	slices.SortFunc(out, func(a, b Together) int { return b.Expires.Compare(a.Expires) })
	return out, nil
}

func (m *memoryStore) DeleteSocialBefore(_ context.Context, date string, now time.Time) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s := &m.social
	n := 0
	monday := mondayOf(date)
	before := len(s.inputs)
	s.inputs = slices.DeleteFunc(s.inputs, func(in FriendInput) bool { return in.Monday < monday })
	n += before - len(s.inputs)
	for k, d := range s.promptOn {
		if d < date {
			delete(s.promptOn, k)
			delete(s.prompts, k)
			n++
		}
	}
	before = len(s.nods)
	s.nods = slices.DeleteFunc(s.nods, func(x Nod) bool { return x.Date < date })
	n += before - len(s.nods)
	n += m.closer.reachesBefore(date)
	for id, t := range s.together {
		if !now.Before(t.Expires.Add(togetherShownAfter)) {
			delete(s.together, id)
			n++
		}
	}
	for k, c := range s.codes {
		if !now.Before(c.Expires) {
			delete(s.codes, k)
			n++
		}
	}
	for code, r := range s.rooms {
		if !now.Before(r.Expires) {
			delete(s.rooms, code)
			delete(s.members, code)
			n++
		}
	}
	for code, inv := range s.invites {
		if inv.ExpiresOn < date {
			delete(s.invites, code)
			n++
		}
	}
	return n, nil
}

// sortSuggestions puts asked connections first, then rooms, then the most
// shared friends; ties by name.
func sortSuggestions(out []Suggestion) {
	rank := func(s Suggestion) int {
		switch {
		case s.Asked:
			return 0
		case s.Room != "":
			return 1
		}
		return 2
	}
	slices.SortFunc(out, func(a, b Suggestion) int {
		if c := rank(a) - rank(b); c != 0 {
			return c
		}
		if c := len(b.Mutual) - len(a.Mutual); c != 0 {
			return c
		}
		return strings.Compare(a.Name+a.AccountID, b.Name+b.AccountID)
	})
}
