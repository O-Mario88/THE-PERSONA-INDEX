package main

import "sync"

// questionIndex keeps each date's questions by id. Every vote and rating
// looks its question up, and building a date's whole set for each one was the
// largest cost on the vote path in the 4,000 votes/s load test (2026-10-23);
// mirrors look up the questions of the weeks they read. A bank never changes
// while the server runs, so an entry never goes stale.
type questionIndex struct {
	mu    sync.RWMutex
	dates map[string]map[string]Question
}

// maxIndexedDates bounds the index: a few dates take votes at once, and the
// mirrors read a few weeks back.
const maxIndexedDates = 64

// lookup finds question id among date's questions, building that date's
// entry from the bank the first time.
func (x *questionIndex) lookup(bank QuestionBank, date, id string) (Question, bool) {
	x.mu.RLock()
	qs, ok := x.dates[date]
	x.mu.RUnlock()
	if !ok {
		set, found := bank.GetSet(date)
		qs = map[string]Question{}
		if found {
			list := set.Pool
			if len(list) == 0 {
				list = set.Questions
			}
			for _, q := range list {
				if _, dup := qs[q.ID]; !dup { // the first wins, as the list order did
					qs[q.ID] = q
				}
			}
		}
		x.mu.Lock()
		if x.dates == nil || len(x.dates) >= maxIndexedDates {
			x.dates = map[string]map[string]Question{}
		}
		x.dates[date] = qs
		x.mu.Unlock()
	}
	q, ok := qs[id]
	return q, ok
}
