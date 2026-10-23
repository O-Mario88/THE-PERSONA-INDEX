package main

import (
	"cmp"
	"context"
	"flag"
	"fmt"
	"io"
	"slices"
	"strings"
)

// `go run . cards` lists the insight cards people often say do not fit them,
// so they can be rewritten (Phase 2 of the review of 2026-10-15: the tap
// under each card "shows which cards are too vague"). It reads only the
// counted taps, which are anonymous totals, from DATABASE_URL; nothing about
// any one phone. A card is one answer option of one question, counted across
// every day the question ran. A private (intimate) card's taps are never
// tied to an option, so those cards are not listed.
//
// The thresholds are a starting point, to tune from real use:
//   - vague: "Partly" is the most common tap.
//   - misses: "Not me" is half the taps or more.
//   - a card needs cardMinRatings taps before it is judged at all.
const cardMinRatings = 20

// CardFlag is one card worth rewriting.
type CardFlag struct {
	QuestionID string // the bank's id, without a date
	OptionID   string
	Prompt     string
	Label      string
	Reveal     string
	Me         int
	Partly     int
	NotMe      int
	Reason     string // vague | misses
}

func (c CardFlag) total() int { return c.Me + c.Partly + c.NotMe }

// cardReport judges every card with enough taps. Taps on a question the bank
// no longer has are left out; there is nothing left to rewrite.
func cardReport(tallies map[string]map[string]int, b contentBank, minRatings int) (flags []CardFlag, judged int) {
	cards := map[[2]string]*CardFlag{}
	for key, byOption := range tallies {
		dated, ok := strings.CutPrefix(key, "rating/")
		if !ok || len(dated) <= len(dateLayout)+1 {
			continue
		}
		q := b.byID[dated[len(dateLayout)+1:]]
		if q == nil {
			continue
		}
		for opt, n := range byOption {
			i := strings.LastIndexByte(opt, '/')
			if i < 0 || opt[:i] == privateOption {
				continue
			}
			o := slices.IndexFunc(q.Options, func(o bankOption) bool { return o.ID == opt[:i] })
			if o < 0 {
				continue
			}
			k := [2]string{q.ID, opt[:i]}
			c := cards[k]
			if c == nil {
				c = &CardFlag{QuestionID: q.ID, OptionID: opt[:i], Prompt: q.Prompt, Label: q.Options[o].Label, Reveal: q.Options[o].Insight.Reveal}
				cards[k] = c
			}
			switch opt[i+1:] {
			case "me":
				c.Me += n
			case "partly":
				c.Partly += n
			case "not":
				c.NotMe += n
			}
		}
	}
	for _, c := range cards {
		if c.total() < minRatings {
			continue
		}
		judged++
		switch {
		case 2*c.NotMe >= c.total():
			c.Reason = "misses"
		case c.Partly > c.Me && c.Partly >= c.NotMe:
			c.Reason = "vague"
		default:
			continue
		}
		flags = append(flags, *c)
	}
	// Worst fit first: the smallest share of "That's me", then the most taps.
	slices.SortFunc(flags, func(x, y CardFlag) int {
		if c := cmp.Compare(x.Me*y.total(), y.Me*x.total()); c != 0 {
			return c
		}
		if c := cmp.Compare(y.total(), x.total()); c != 0 {
			return c
		}
		return strings.Compare(x.QuestionID+"/"+x.OptionID, y.QuestionID+"/"+y.OptionID)
	})
	return flags, judged
}

// runCardsCommand is `go run . cards [-min 20]`, run from backend/ with
// DATABASE_URL set. It prints the cards to rewrite and changes nothing.
func runCardsCommand(ctx context.Context, args []string, store VoteStore, b contentBank, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("cards", flag.ContinueOnError)
	fs.SetOutput(stderr)
	minRatings := fs.Int("min", cardMinRatings, "taps a card needs before it is judged")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	tallies, err := store.RatingTallies(ctx)
	if err != nil {
		fmt.Fprintln(stderr, "cards:", err)
		return 1
	}
	flags, judged := cardReport(tallies, b, max(1, *minRatings))
	if judged == 0 {
		fmt.Fprintf(stdout, "cards: no card has %d taps yet, so none can be judged\n", max(1, *minRatings))
		return 0
	}
	fmt.Fprintf(stdout, "cards: %d of %d cards with %d or more taps to rewrite\n", len(flags), judged, max(1, *minRatings))
	for _, c := range flags {
		fmt.Fprintf(stdout, "\n%s / %s  (%s: %d That's me, %d Partly, %d Not me)\n  Q: %s\n  A: %s\n  Card: %s\n",
			c.QuestionID, c.OptionID, c.Reason, c.Me, c.Partly, c.NotMe, c.Prompt, c.Label, c.Reveal)
	}
	return 0
}
