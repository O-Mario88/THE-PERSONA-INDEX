package main

import (
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
)

// countingBank counts how often a date's set is built.
type countingBank struct {
	inner QuestionBank
	built atomic.Int64
}

func (b *countingBank) GetSet(date string) (DailySet, bool) {
	b.built.Add(1)
	return b.inner.GetSet(date)
}

func TestQuestionIndexBuildsEachDateOnce(t *testing.T) {
	bank := &countingBank{inner: fixtureBank{}}
	var x questionIndex
	set, _ := fixtureBank{}.GetSet(todaySet.Date)
	var wg sync.WaitGroup
	for i := range 200 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			q := set.Questions[i%len(set.Questions)]
			if got, ok := x.lookup(bank, todaySet.Date, q.ID); !ok || got.ID != q.ID {
				t.Errorf("lookup(%s) = %v, %v", q.ID, got.ID, ok)
			}
		}()
	}
	wg.Wait()
	// Goroutines racing on the first lookup may each build it; after that, none do.
	before := bank.built.Load()
	for _, q := range set.Questions {
		x.lookup(bank, todaySet.Date, q.ID)
	}
	if bank.built.Load() != before || before > 200 {
		t.Errorf("built %d times, then %d more", before, bank.built.Load()-before)
	}
	// A question of another date is not found under this one.
	if _, ok := x.lookup(bank, "2001-01-01", set.Questions[0].ID); ok {
		t.Error("found a question under a date whose set does not hold it")
	}
	// The index stays bounded however many dates are asked for.
	for d := range 3 * maxIndexedDates {
		x.lookup(bank, fmt.Sprintf("2001-02-%02d", d%28+1)+fmt.Sprint(d), "x")
	}
	if n := len(x.dates); n > maxIndexedDates {
		t.Errorf("index holds %d dates", n)
	}
}
