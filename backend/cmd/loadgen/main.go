// Command loadgen drives the vote API the way a crowd of phones would and
// checks the result: every vote acknowledged with 202 must be in the tallies.
//
//	go run ./cmd/loadgen -url http://localhost:8080 -rate 1000 -duration 60s
//
// With -ratings and -mirrors it sends the rest of a real sitting as well: the
// "That's me / Partly / Not me" tap after an answer, and a read of the weekly
// mirror after a phone's third answer. Both go through the same database as
// the votes, so they show whether the vote path holds up beside them.
//
// The server must run with TRUST_CF_CONNECTING_IP=1 so the simulated phones,
// which each send their own CF-Connecting-IP, are not all treated as one
// network address by the device-issue limit. Point it only at a server you run.
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"math/rand/v2"
	"net/http"
	"os"
	"slices"
	"sync"
	"sync/atomic"
	"time"
)

type question struct {
	ID      string `json:"id"`
	Care    string `json:"care"`
	Options []struct {
		ID string `json:"id"`
	} `json:"options"`
}

func main() {
	base := flag.String("url", "http://localhost:8080", "API base URL")
	rate := flag.Int("rate", 500, "votes per second")
	duration := flag.Duration("duration", 30*time.Second, "how long to send votes")
	workers := flag.Int("workers", 256, "concurrent connections")
	settle := flag.Duration("settle", 10*time.Second, "how long to wait for the tally to catch up")
	ratings := flag.Float64("ratings", 0, "share of answers followed by a That's me / Partly / Not me tap (0 to 1)")
	mirrors := flag.Float64("mirrors", 0, "share of phones that read their weekly mirror after their third answer (0 to 1)")
	flag.Parse()
	if *ratings < 0 || *ratings > 1 || *mirrors < 0 || *mirrors > 1 {
		log.Fatal("-ratings and -mirrors are shares between 0 and 1")
	}

	client := &http.Client{Timeout: 10 * time.Second, Transport: &http.Transport{MaxIdleConnsPerHost: *workers}}

	var set struct {
		Date      string     `json:"date"`
		Questions []question `json:"questions"`
		Pool      []question `json:"pool"`
	}
	if err := getJSON(client, *base+"/api/questions/today", &set); err != nil {
		log.Fatal(err)
	}
	qs := set.Pool
	if len(qs) == 0 {
		qs = set.Questions
	}
	// An intimate question's results are never served, so its votes could
	// not be checked against the tally.
	qs = slices.DeleteFunc(qs, func(q question) bool { return q.Care == "intimate" })
	if len(qs) < 3 {
		log.Fatal("need at least 3 questions today")
	}

	// Each simulated phone casts 3 votes, one per question, like a real session.
	total := *rate * int(duration.Seconds())
	phones := (total + 2) / 3
	type job struct {
		token string
		q     question
		n     int
	}
	jobs := make(chan job, *workers*4)

	var accepted, failed, dup atomic.Int64
	var mu sync.Mutex
	var latencies []time.Duration
	// The extra requests of a sitting, each kind with its own count and times.
	var rated, mirrored extra
	verdicts := []string{"me", "partly", "not_me"}
	perQuestion := map[string]*atomic.Int64{}
	for _, q := range qs {
		perQuestion[q.ID] = &atomic.Int64{}
	}

	var wg sync.WaitGroup
	for range *workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			var local []time.Duration
			for j := range jobs {
				opt := j.q.Options[rand.IntN(len(j.q.Options))].ID
				body, _ := json.Marshal(map[string]string{"questionId": j.q.ID, "optionId": opt, "voterId": j.token})
				req, _ := http.NewRequest(http.MethodPost, *base+"/api/votes", bytes.NewReader(body))
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("Idempotency-Key", fmt.Sprintf("lg-%d", j.n))
				start := time.Now()
				res, err := client.Do(req)
				el := time.Since(start)
				if err != nil {
					failed.Add(1)
					continue
				}
				res.Body.Close()
				local = append(local, el)
				switch res.StatusCode {
				case http.StatusAccepted:
					accepted.Add(1)
					perQuestion[j.q.ID].Add(1)
				case http.StatusConflict:
					dup.Add(1)
					continue
				default:
					failed.Add(1)
					continue
				}
				if rand.Float64() < *ratings {
					body, _ := json.Marshal(map[string]string{"questionId": j.q.ID, "optionId": opt, "verdict": verdicts[rand.IntN(3)], "voterId": j.token})
					req, _ := http.NewRequest(http.MethodPost, *base+"/api/ratings", bytes.NewReader(body))
					req.Header.Set("Content-Type", "application/json")
					req.Header.Set("Idempotency-Key", fmt.Sprintf("lr-%d", j.n))
					rated.do(client, req, http.StatusAccepted)
				}
				if j.n%3 == 2 && rand.Float64() < *mirrors {
					req, _ := http.NewRequest(http.MethodGet, *base+"/api/mirror?date="+set.Date, nil)
					req.Header.Set("Authorization", "Device "+j.token)
					mirrored.do(client, req, http.StatusOK)
				}
			}
			mu.Lock()
			latencies = append(latencies, local...)
			mu.Unlock()
		}()
	}

	before := map[string]int64{}
	for _, q := range qs {
		before[q.ID] = tally(client, *base, q.ID)
	}

	log.Printf("minting %d device tokens", phones)
	tokens := make([]string, phones)
	var mint sync.WaitGroup
	sem := make(chan struct{}, *workers)
	for i := range tokens {
		mint.Add(1)
		sem <- struct{}{}
		go func() {
			defer mint.Done()
			defer func() { <-sem }()
			req, _ := http.NewRequest(http.MethodPost, *base+"/api/device", nil)
			req.Header.Set("CF-Connecting-IP", fmt.Sprintf("10.%d.%d.%d", i>>16&255, i>>8&255, i&255))
			res, err := client.Do(req)
			if err != nil {
				log.Fatal(err)
			}
			defer res.Body.Close()
			var d struct{ Token string }
			if err := json.NewDecoder(res.Body).Decode(&d); err != nil || d.Token == "" {
				log.Fatalf("device issue failed: status %d", res.StatusCode)
			}
			tokens[i] = d.Token
		}()
	}
	mint.Wait()

	log.Printf("sending %d votes at %d/s over %s", total, *rate, *duration)
	// Pace in 10 ms slices: a ticker per vote cannot keep up above ~1,000/s.
	started := time.Now()
	for n := range total {
		if due := started.Add(time.Duration(n) * time.Second / time.Duration(*rate)); time.Until(due) > 0 {
			time.Sleep(time.Until(due))
		}
		phone := n / 3
		jobs <- job{token: tokens[phone], q: qs[(phone+n%3)%len(qs)], n: n}
	}
	close(jobs)
	wg.Wait()
	sendTime := time.Since(started)

	time.Sleep(*settle)
	lost := int64(0)
	for _, q := range qs {
		want := before[q.ID] + perQuestion[q.ID].Load()
		got := tally(client, *base, q.ID)
		if got < want {
			lost += want - got
		}
		if got > want {
			log.Printf("question %s: %d counted, %d accepted (another client voting?)", q.ID, got, want)
		}
	}

	slices.Sort(latencies)
	pct := func(p float64) time.Duration {
		if len(latencies) == 0 {
			return 0
		}
		return latencies[min(len(latencies)-1, int(float64(len(latencies))*p))]
	}
	fmt.Printf("sent %d votes in %s (%.0f/s achieved)\n", total, sendTime.Round(time.Millisecond), float64(total)/sendTime.Seconds())
	fmt.Printf("accepted %d · duplicates %d · failed %d\n", accepted.Load(), dup.Load(), failed.Load())
	fmt.Printf("latency p50 %s · p95 %s · p99 %s · max %s\n", pct(.50), pct(.95), pct(.99), pct(1))
	fmt.Printf("acknowledged but not counted after %s: %d\n", *settle, lost)
	if *ratings > 0 {
		rated.print("ratings")
	}
	if *mirrors > 0 {
		mirrored.print("mirror reads")
	}
	if failed.Load() > 0 || lost > 0 || pct(.95) > 300*time.Millisecond || rated.failed.Load() > 0 || mirrored.failed.Load() > 0 {
		fmt.Println("GATE FAILED (needs 0 failed, 0 lost, p95 <= 300ms)")
		os.Exit(1)
	}
	fmt.Println("GATE PASSED")
}

// extra counts one kind of request sent beside the votes.
type extra struct {
	ok, failed atomic.Int64
	mu         sync.Mutex
	latencies  []time.Duration
}

func (e *extra) do(c *http.Client, req *http.Request, want int) {
	start := time.Now()
	res, err := c.Do(req)
	el := time.Since(start)
	if err != nil {
		e.failed.Add(1)
		return
	}
	io.Copy(io.Discard, res.Body)
	res.Body.Close()
	if res.StatusCode != want {
		e.failed.Add(1)
		return
	}
	e.ok.Add(1)
	e.mu.Lock()
	e.latencies = append(e.latencies, el)
	e.mu.Unlock()
}

func (e *extra) print(name string) {
	slices.Sort(e.latencies)
	p := func(q float64) time.Duration {
		if len(e.latencies) == 0 {
			return 0
		}
		return e.latencies[min(len(e.latencies)-1, int(float64(len(e.latencies))*q))]
	}
	fmt.Printf("%s: %d sent · failed %d · p50 %s · p95 %s · p99 %s\n", name, e.ok.Load()+e.failed.Load(), e.failed.Load(), p(.50), p(.95), p(.99))
}

func getJSON(c *http.Client, url string, v any) error {
	res, err := c.Get(url)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("%s: status %d", url, res.StatusCode)
	}
	return json.NewDecoder(res.Body).Decode(v)
}

func tally(c *http.Client, base, id string) int64 {
	var r struct {
		TotalVotes int64 `json:"totalVotes"`
	}
	if err := getJSON(c, base+"/api/questions/"+id+"/results", &r); err != nil {
		log.Fatal(err)
	}
	return r.TotalVotes
}
