package main

import "time"

// rotatingBank is a stand-in editorial bank until questions live in the
// database: it cycles through a fixed list of sets, one per UTC day. Question
// ids carry the date so a set that comes round again starts with fresh votes.
type rotatingBank struct {
	sets [][]Question
}

func (b rotatingBank) GetSet(date string) (DailySet, bool) {
	day, err := time.Parse("2006-01-02", date)
	if err != nil || len(b.sets) == 0 {
		return DailySet{}, false
	}
	idx := int(day.Unix()/86400) % len(b.sets)
	qs := make([]Question, len(b.sets[idx]))
	for i, q := range b.sets[idx] {
		q.ID = date + "-" + q.ID
		qs[i] = q
	}
	return DailySet{Date: date, Questions: qs}, true
}

func opts(pairs ...string) []Option {
	o := make([]Option, 0, len(pairs)/2)
	for i := 0; i+1 < len(pairs); i += 2 {
		o = append(o, Option{ID: pairs[i], Label: pairs[i+1]})
	}
	return o
}

var editorialSets = [][]Question{
	{
		{ID: "dishes", Prompt: "When do you wash the dishes?", Options: opts("right-away", "Right after eating", "end-of-day", "At the end of the day", "when-full", "When the sink is full")},
		{ID: "bill", Prompt: "Dinner with friends: how do you split the bill?", Options: opts("even", "Split it evenly", "itemised", "Everyone pays for what they ordered")},
		{ID: "alarms", Prompt: "How many alarms do you set in the morning?", Options: opts("one", "One", "two-three", "Two or three", "four-plus", "Four or more")},
	},
	{
		{ID: "late-reply", Prompt: "How long before you reply to a message from a friend?", Options: opts("minutes", "Within minutes", "same-day", "Same day", "days", "A few days or more")},
		{ID: "savings", Prompt: "When money comes in, what goes first?", Options: opts("save", "Savings", "bills", "Bills", "treat", "Something for me")},
		{ID: "shoes", Prompt: "Shoes in the house?", Options: opts("off", "Always off", "depends", "Depends on the house", "on", "Usually on")},
	},
	{
		{ID: "lateness", Prompt: "Meeting a friend at 7. When do you arrive?", Options: opts("early", "Before 7", "on-time", "Right at 7", "late", "A bit after 7")},
		{ID: "lending", Prompt: "A friend asks to borrow money. You:", Options: opts("lend", "Lend it", "gift", "Give it as a gift", "decline", "Politely decline")},
		{ID: "sleep", Prompt: "On a free day, when do you wake up?", Options: opts("early", "Same time as always", "late-morning", "Late morning", "afternoon", "Afternoon")},
	},
}
