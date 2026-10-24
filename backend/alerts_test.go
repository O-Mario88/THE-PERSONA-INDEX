package main

import (
	"context"
	"os"
	"regexp"
	"slices"
	"strings"
	"testing"
	"time"
)

type pooledStore struct{ *memoryStore }

func (pooledStore) PoolStats() PoolStats { return PoolStats{Max: 20, Total: 2, Idle: 2} }

// Every metric the alert rules name must be one the server writes, so a
// renamed metric cannot leave an alert that never fires.
func TestAlertRulesNameRealMetrics(t *testing.T) {
	raw, err := os.ReadFile("../deploy/alerts.yml")
	if err != nil {
		t.Fatal(err)
	}
	// A store with a pool, as Postgres has, so the pool's metrics are written.
	s := NewServer(func() time.Time { return fixedNow }, fixtureBank{}, pooledStore{newMemoryStore()}, newDeviceSigner(testSecret))
	postVote(t, s, VoteRequest{QuestionID: todaySet.Questions[0].ID, OptionID: "right-away", VoterID: "voter-a"}, "k1")
	s.runHourly(context.Background())
	s.runJob(context.Background(), job{"tally", s.tallyAll})
	var b strings.Builder
	s.writeMetrics(context.Background(), &b)
	written := map[string]bool{}
	for _, line := range strings.Split(b.String(), "\n") {
		if name, ok := strings.CutPrefix(line, "# TYPE "); ok {
			family := strings.Fields(name)[0]
			written[family] = true
			if strings.HasSuffix(line, " histogram") {
				for _, part := range []string{"_bucket", "_sum", "_count"} {
					written[family+part] = true
				}
			}
		}
	}
	named := regexp.MustCompile(`persona_[a-z_]+`).FindAllString(string(raw), -1)
	if len(named) < 8 {
		t.Fatalf("found only %d metric names in the rules", len(named))
	}
	slices.Sort(named)
	for _, name := range slices.Compact(named) {
		if name == "persona_index" { // the rule group's name
			continue
		}
		if !written[name] {
			t.Errorf("alerts.yml names %s, which the server does not write", name)
		}
	}
	// The routes and jobs the rules pick out by label must exist too.
	for _, want := range []string{`route="POST /api/votes"`, `job="tally"`} {
		if !strings.Contains(string(raw), want) {
			t.Errorf("rules no longer mention %s", want)
		}
	}
	for _, want := range []string{`persona_job_last_success_timestamp_seconds{job="tally"}`, `route="POST /api/votes",code="202"`} {
		if !strings.Contains(b.String(), want) {
			t.Errorf("the server no longer writes %s", want)
		}
	}
}
