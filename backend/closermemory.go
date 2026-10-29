package main

import (
	"context"
	"maps"
	"slices"
	"strings"
)

// The in-memory Closer Together store (closer.go), sharing the memory
// store's lock.

type memoryCloser struct {
	shares  map[string]Share
	notes   map[string][]ShareNote  // share -> its private replies (sharing.go)
	tags    map[string]CommonTagSet // account -> Common Ground tags
	consent map[string]bool         // a\x00b: a opted in to Common Ground with b
	reaches map[string]ReachOut
}

func newMemoryCloser() memoryCloser {
	return memoryCloser{shares: map[string]Share{}, notes: map[string][]ShareNote{}, tags: map[string]CommonTagSet{}, consent: map[string]bool{}, reaches: map[string]ReachOut{}}
}

func (m *memoryStore) PutShare(_ context.Context, sh Share) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	sh.To = slices.Clone(sh.To)
	m.closer.shares[sh.ID] = sh
	return nil
}

func (m *memoryStore) sharesWhere(keep func(Share) bool) []Share {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []Share
	for _, sh := range m.closer.shares {
		if keep(sh) {
			sh.To = slices.Clone(sh.To)
			out = append(out, sh)
		}
	}
	slices.SortFunc(out, func(a, b Share) int {
		if c := b.Created.Compare(a.Created); c != 0 {
			return c
		}
		return strings.Compare(a.ID, b.ID)
	})
	return out
}

func (m *memoryStore) SharesTo(_ context.Context, to string) ([]Share, error) {
	return m.sharesWhere(func(sh Share) bool { return slices.Contains(sh.To, to) }), nil
}

func (m *memoryStore) SharesFrom(_ context.Context, from string) ([]Share, error) {
	return m.sharesWhere(func(sh Share) bool { return sh.From == from }), nil
}

func (m *memoryStore) DeleteShare(_ context.Context, from, id string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	sh, ok := m.closer.shares[id]
	if !ok || sh.From != from {
		return false, nil
	}
	delete(m.closer.shares, id)
	delete(m.closer.notes, id)
	return true, nil
}

func (m *memoryStore) PutCommonTags(_ context.Context, id string, set CommonTagSet) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.closer.tags[id] = CommonTagSet{Tags: slices.Clone(set.Tags), ChangedOn: set.ChangedOn}
	return nil
}

func (m *memoryStore) CommonTagsOf(_ context.Context, id string) (CommonTagSet, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	set := m.closer.tags[id]
	return CommonTagSet{Tags: slices.Clone(set.Tags), ChangedOn: set.ChangedOn}, nil
}

func (m *memoryStore) SetCommonConsent(_ context.Context, a, b string, on bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if on {
		m.closer.consent[pair(a, b)] = true
	} else {
		delete(m.closer.consent, pair(a, b))
	}
	return nil
}

func (m *memoryStore) CommonConsent(_ context.Context, id string) ([]string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []string
	for k := range m.closer.consent {
		if a, b, _ := strings.Cut(k, "\x00"); a == id {
			out = append(out, b)
		}
	}
	slices.Sort(out)
	return out, nil
}

func (m *memoryStore) CommonWith(ctx context.Context, id string) ([]CommonMatch, error) {
	friends, err := m.Friends(ctx, id)
	if err != nil {
		return nil, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []CommonMatch
	for _, f := range friends {
		if m.closer.consent[pair(id, f.AccountID)] && m.closer.consent[pair(f.AccountID, id)] {
			back := m.social.friends[f.AccountID][id]
			out = append(out, CommonMatch{Friend: f, Tags: slices.Clone(m.closer.tags[f.AccountID].Tags), TheyMuted: back.Muted})
		}
	}
	return out, nil
}

func (m *memoryStore) PutReachOut(_ context.Context, ro ReachOut) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, x := range m.closer.reaches {
		if x.From == ro.From && x.To == ro.To && x.Kind == ro.Kind && x.Date == ro.Date {
			return ErrReachedToday
		}
	}
	m.closer.reaches[ro.ID] = ro
	return nil
}

func (m *memoryStore) ReachOutsTo(_ context.Context, to, from string) ([]ReachOut, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []ReachOut
	for _, ro := range m.closer.reaches {
		if ro.To == to && ro.Date >= from {
			out = append(out, ro)
		}
	}
	slices.SortFunc(out, func(a, b ReachOut) int { return strings.Compare(b.Date+a.ID, a.Date+b.ID) })
	return out, nil
}

func (m *memoryStore) DeleteReachOut(_ context.Context, to, id string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	ro, ok := m.closer.reaches[id]
	if !ok || ro.To != to {
		return false, nil
	}
	delete(m.closer.reaches, id)
	return true, nil
}

// forgetPair drops what a and b shared with each other, when they
// disconnect. The caller holds the lock.
func (c *memoryCloser) forgetPair(a, b string) {
	for id, sh := range c.shares {
		if sh.From != a && sh.From != b {
			continue
		}
		other := a
		if sh.From == a {
			other = b
		}
		sh.To = slices.DeleteFunc(slices.Clone(sh.To), func(x string) bool { return x == other })
		if len(sh.To) == 0 {
			delete(c.shares, id)
		} else {
			c.shares[id] = sh
		}
	}
	delete(c.consent, pair(a, b))
	delete(c.consent, pair(b, a))
	maps.DeleteFunc(c.reaches, func(_ string, ro ReachOut) bool {
		return (ro.From == a && ro.To == b) || (ro.From == b && ro.To == a)
	})
}

// forgetAccount drops everything Closer Together kept for an account. The
// caller holds the lock.
func (c *memoryCloser) forgetAccount(id string) {
	for sid, notes := range c.notes {
		c.notes[sid] = slices.DeleteFunc(notes, func(n ShareNote) bool { return n.With == id || n.From == id })
	}
	for sid, sh := range c.shares {
		if sh.From == id {
			delete(c.shares, sid)
			delete(c.notes, sid)
			continue
		}
		if slices.Contains(sh.To, id) {
			sh.To = slices.DeleteFunc(slices.Clone(sh.To), func(x string) bool { return x == id })
			if len(sh.To) == 0 {
				delete(c.shares, sid)
			} else {
				c.shares[sid] = sh
			}
		}
	}
	delete(c.tags, id)
	maps.DeleteFunc(c.consent, func(k string, _ bool) bool { a, b, _ := strings.Cut(k, "\x00"); return a == id || b == id })
	maps.DeleteFunc(c.reaches, func(_ string, ro ReachOut) bool { return ro.From == id || ro.To == id })
}

// reachesBefore drops reach-outs dated before date and reports how many.
// The caller holds the lock.
func (c *memoryCloser) reachesBefore(date string) int {
	before := len(c.reaches)
	maps.DeleteFunc(c.reaches, func(_ string, ro ReachOut) bool { return ro.Date < date })
	return before - len(c.reaches)
}
