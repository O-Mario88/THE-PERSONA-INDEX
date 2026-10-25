# Writing guide: questions, insight cards and mirrors

This guide is for anyone writing or rewording what the app says: questions and answer options, insight cards (`reveal`, `otherSide`, `step`), the weekly, monthly, quarterly and yearly mirrors, the close of each sitting, and the reads. It applies to Claude threads, to Edwin, and to any outside tool used to draft copy.

It is drawn from the research Edwin asked for on 2026-10-24, kept in [research/what-people-crave.md](research/what-people-crave.md). That file has about 200 linked sources, and the working notes behind it are in [research/notes/](research/notes/). When a rule here seems to get in the way, go back to the research rather than dropping the rule.

Where a rule can be checked by code, the code checks it, and the server will not start with a card that breaks one. The [last section](#what-the-code-checks) says which rules are checked and where. Everything else is on the writer.

## What the app is for

In Edwin's words (2026-10-24): "The app is NOT meant to give a solution rather, it should help people find solution to their life quests, cravings, and issues, the ultimate goal is Happiness, contentment, peace of mind, No stress and Hope for the future one day at a time."

So the app asks, notices and reflects back, and the person finds the answer. Every line should help someone see their own moment more clearly, or choose their own next move.

- **Questions and reflections, not instructions.** A card says what an answer shows and what it may be reaching for. It does not tell the person what to do with their life. No "you should", "you need to", "the answer is" or "the secret is".
- **Offer, don't prescribe.** A step is "something you could try". The person can take it, put it their own way ("My own idea", kept as their one plan), or leave it.
- **One day at a time.** Each sitting is small and complete. The mirrors look back over a week, a month or a year so the person can see their own way forward.
- **The goal is happiness, contentment, peace of mind, less stress and hope, but the app never scores them or tells people to chase them.** The research shows that chasing happiness head-on backfires. People get there by meeting their real needs (closeness, choice, enough, feeling settled), which is what the questions help them see.

## What the app is

The app is a private companion that helps a person notice who they are and change a little, week by week. It is not a game, a survey, a feed or a chat. It never calls itself a therapist, never compares the person with anyone else and never shows a citation. Every card ends with "For self-reflection, not a diagnosis."

Effects in this field are small. The app promises noticing and small shifts, never a changed life.

## What people are reaching for

Under every answer is one of seven needs. These are the app's names for them:

| Need | What it looks like in an answer |
|---|---|
| Choosing for yourself | Deciding your own evening, a "no" you meant, doing a duty because you chose to |
| Being close to people | Who you turned to, who you missed, whether someone was there |
| Being respected | Being taken seriously, fairness, keeping face |
| Doing well | A job done well, getting better at something |
| Feeling safe, having enough | Money, plans holding, a roof, a routine |
| Feeling settled | Calm, "good enough", being at peace with a choice |
| Being understood | Someone describing you exactly right, flaws included |

Four findings shape how the app talks about them:

- **Choosing for yourself and being close to people** are needs everyone has, whether or not they feel them loudly. Feeling left out was the strongest companion of low mood across four countries.
- **Security** is a real need when it is missing. It is often also a stand-in when choice, competence or closeness is frustrated. The app may *ask* whether something else feels uncertain. It never says so as a fact.
- **Success** is two different things: doing well and being noticed. A card should say which one an answer reached for.
- **Hope** is a skill built from the person's own record of finding a way. It is not a mood to cheer someone into.

Personality decides which need shouts loudest, not whether it matters.

### Tagging an answer option

Every option in the bank carries one `need`, and the gate refuses an option without one. The ids are `freedom` (choosing for yourself), `belonging` (being close to people), `respect` (being respected), `competence` (doing well), `security` (feeling safe, having enough), `calm` (feeling settled) and `understood` (being understood).

Tag by these rules, in order:

1. **Tag what the choice reaches for in that moment:** what the person would get if the choice worked. Read the label first, then the card's reveal, which usually names it.
2. **One need per option.** If two fit, take the one the reveal leans on. If they are still tied, take the one closest to the moment in the question.
3. **Options of one question may share a need.** They differ in route, not always in need. Don't spread tags out for variety.
4. **Avoiding something is tagged by what it protects:** money or safety is `security`, inner peace or rest is `calm`, a relationship is `belonging`, face or image is `respect`.
5. **Pleasing people:** to stay close is `belonging`; to avoid looking bad is `respect`.
6. **Your own way:** saying no, your own pace, not being told, privacy, novelty and treats you picked for yourself are `freedom`.
7. **Success is two needs.** Doing it well, learning or finishing is `competence`. Being seen, praised or looking good is `respect`.
8. **Money:** saving, a safety net or avoiding risk is `security`; spending for comfort or rest is `calm`; spending on people is `belonging`; spending to be seen is `respect`.
9. **Honesty about yourself,** being heard or being seen as you are is `understood`.
10. **A heavy option is tagged by what is missing:** left out or forgotten is `belonging`, controlled is `freedom`, worthless is `respect`, frightened or in debt is `security`, and worn out or hopeless is `calm`.
11. **A light or "I didn't" option** is tagged by what not doing it kept: ease is `calm`, privacy or your own pace is `freedom`.

The card shows the need as one soft line after the reveal ("Sounds like feeling settled mattered most here"). The evening asks whether the morning's route usually gets the person there, and the weekly mirror shows the two needs that came up most and the routes that worked. A need is shown, never scored, and intimacy answers stay out of the mirror's count.

## Questions and answer options

Rules:

- Ask what the person **did in a concrete moment**, not why they are the way they are. Abstract "why" thinking feeds brooding. Concrete moments are also what the app can honestly describe.
- **Every option must be respectable.** Duty and independence, calm and excitement, belief and unbelief are all valid answers. Labels name what you do, never which answer is the good one (no "calmly", "kindly", "a polite excuse").
- **Include honest low options**, such as "nothing went right today". Don't design out the bad days.
- Options run **shallow to deep** (depth 1 to 4), and the deepest must reach 3 or 4.
- **Identity questions** (roots, faith, politics, family roles, body, money, class) need a "doesn't apply" or "I'd rather not say". Never ask which religion, party, ethnicity or nationality someone holds, and never store it.
- **Politics** is about how you live with it, never which side you are on.
- **Never presume** a partner, a nuclear family, a formal job with a boss and a salary, or a home that is a safe place.
- **No hidden defaults.** The same words must fit a nurse in Leeds, a market trader in Lagos, a student in Lahore, a driver in Lima and a mother in Jakarta. Before you keep a word, ask: would it feel foreign to someone with an irregular cash income, a shared home, no car and a Friday rest day? If so, use the neutral word: "when money comes in" (not payday), "someone you work with or for" (not your boss), "a day off" or "this week" (not the weekend or Monday), "on the way" (not the drive), "at home" or "out of reach" (not another room), "washing" (not the shower). Keep the specific word only when it is the question's own subject: a dating question may mention a date, a colleagues question a boss. Never fix a default by adding a country, religion or ethnic group; tailor the setting, never the person. The evidence is in [research/regions/report.md](research/regions/report.md).
- A question about a **hoped-for future** should be followed by one about what gets in the way. Wishing alone predicts less effort.

Situations that work (design suggestions built on the research; none has been tested as a measure):

| What it reveals | Situation | Options |
|---|---|---|
| Choosing for yourself | Who decided how you spent your free evening? | I did / someone else, and I was fine with it / someone else, and I wasn't / no one, it just happened |
| Hope: finding a way | Last time a plan fell through, what did you do next? | Tried another way / asked someone / waited it out / let it go |
| Two kinds of success | You finish a hard task. What feels best? | That I did it well / that someone noticed / that it's off my list / that it helped someone |
| Saying no | A friend invites you to something you don't want to go to. | Yes, and go / yes, then cancel / no, with the real reason / no, with a small excuse |
| Feeling watched | You notice a stain on your sleeve just before meeting people. | Go and change / cover it / mention it with a laugh / carry on |
| Faith in strangers | You left your phone at a café. First thought? | Someone will hand it in / it'll come back, maybe not intact / it's gone / I'd go back but not expect much |

### Questions about where someone lives

A small second bank, [`backend/content/regional.json`](../backend/content/regional.json), holds everyday moments that belong to one part of the world: a relative asking for money you had set aside, your turn in a savings group, guests who stay for hours, a family holiday where the questions about your life begin, a meal shared or eaten alone. A phone whose person gave a country offers one of its region's now and then, among the everyday questions. The regions are `africa` (south of the Sahara), `mena`, `south-asia`, `east-asia` (with Southeast Asia), `latin-america` (with the Caribbean) and `west`; they organise content and never describe a person. The evidence for each region's moments is in [research/regions/](research/regions/report.md).

Everything above applies, and a few rules more:

- The words fit the **whole region**, not one country: no country or city names, no local-language words ("your savings group", never its local name), no named festivals or holy days, no religion or ethnic group named. Faith may be one respectable option among others, never the assumption.
- No politics, conflict or government. Hardship (a power cut, a slow day for money, waiting for papers, an unsafe street) is named plainly and kindly, as part of ordinary life, without blame.
- Ids start with the region key (`africa-relative-asks-money`), never clash with the main bank, and a region needs at least three questions so the phone can rest between them. Never an intimacy question.
- The answer stays on the phone: nothing about these questions is sent, not the vote, the card tap or a step, because even a question's id would say where someone lives.

Check a draft with the server's own gate before adding it: `cd backend && REGIONAL_DRAFT=draft.json go test -run TestRegionalDraft .` (new sources go in `sources.json` first).

## Insight cards

### The shape

A card reads one answer back and says what it suggests. It runs from **situation, to choice, to tendency**:

> When the plan changed, you went along with it. In moments like that, keeping the peace seems to come first for you.

- **Headline:** the first sentence, at most 70 characters, spoken to "you".
- **Reveal:** 120 to 360 characters. It describes the moment and the leaning, never a verdict on the person. Name the route as well as the need ("you meet the wish to be respected by doing things well rather than by being noticed").
- **Hedges:** at most one per card ("probably", "tends to", "may"). Notice more, guess less, and never invent details of someone's life.
- **Strength:** when the evidence is early, say it softly ("can", "often").
- **Positive and negative statements meet the same bar.** Drop a line you are not sure of, because one bad line spoils trust in the rest.
- **Write about how situations feel and what the person tends to do,** not how clever, kind or likeable they are.
- **A good card is one the person could reasonably mark "Not me".** A card that fits everyone is flattery, not insight.

### Instead of, say

| Instead of | Say something like |
|---|---|
| "You're a people-pleaser." | "Three times this week you said yes when you'd rather not. Keeping people happy clearly matters to you." |
| "You have a scarcity mindset." | "Money moments late in the evening mostly went to 'now'. Tiredness tilts anyone towards now, so this may be about timing more than willpower." |
| "Everything will be all right." | "On Tuesday you found another way when the bus didn't come. That's a skill, and skills can be used again." |
| "You're too cynical." | "Being careful makes sense when people have let you down. But caution that's never tested can't be updated." |
| "Most people would have spoken up." | "That's a very human way to handle pressure. It can also mean your contribution goes unseen." |
| "You are anxious." | "When plans changed, you re-planned straight away. Keeping things predictable seems to steady you." |
| "You should open up about who you are." | Nothing. How open to be is the person's own safety judgement. |

### The other side

`otherSide` is one kind sentence on what this answer can cost (40 to 200 characters).

- Ration downsides.
- Anchor each one in something the person's own answer shows they value, and frame it as workable.
- For the hardest truths, a step-back frame helps ("if you watched this week from the outside...").
- Money trouble, unfair treatment, job loss and not fitting in are largely structural. Say plainly that they are hard, never that they are a personal failing.

### The step

`step` is one small thing the person could try, 20 to 160 characters. The card shows it as "Something you could try". It is an offer, not an instruction: the person can take it, write their own ("My own idea"), or leave it.

- One at a time, phrased as **"when this moment comes, I'll do this"**, built from the cue in the question just answered.
- Phrase it as something to try or notice, not an order. "Next time, notice..." and "Tonight, try..." work. "You must..." does not.
- Possible without money, time or privileges the person may lack.
- No streaks or penalties. A step counts only when it is done. Habits take a couple of months, and a missed day undoes nothing.
- When answers suggest a low patch, simple pleasant steps beat reflective ones.
- Never push forgiveness, trust, openness or reconciliation. Hiding can be a rational safety choice, and forgiving is not reconciling.

Steps with good evidence: an if-then plan for today's moment; name a wish, the obstacle and an if-then for the obstacle; one small honest "no", then notice how it landed; after a slip, notice whether anyone mentioned it; one specific thank-you or compliment; one small kindness; a low-stakes favour, then check what happened; before replying to a heated post, picture one real person who sees it differently; message one person; take in one good moment slowly; one touchpoint with a hobby or group, for enjoyment.

## Heavy answers

Mark an option `"heavy": true` when it says the person is hopeless, rejected, controlled, worthless, frightened or alone with something hard. Only a deep answer (depth 3 or 4) outside intimacy can be heavy.

A heavy card gets no insight, no step and no rating. It shows a plain acknowledgement, the people the person keeps on their phone (or a way to add them), a helpline, and a line for anyone who has thoughts of not wanting to be here. After a heavy answer, the close of the sitting leaves out the honest part and the plan offer.

The research behind this:

- Hopelessness is too weak a predictor to sort people safely, so the app points to people every time rather than scoring risk.
- Asking gently does not raise suicidal thoughts.
- The app is a bridge to people, not the help.
- Most suicides happen in low- and middle-income countries, so help is found through findahelpline.com, never one country's number.
- If an answer suggests abuse, coercion or danger, no card or step may suggest trusting more or forgiving.

## Mirrors and the close of a sitting

- **One answer can describe a moment.** A mirror can describe counts and contrasts in the person's own answers. Neither can assign a trait, rank the person or promise an outcome.
- **Show change only against the person's own past** ("First time in three weeks your answer leaned towards saying what you think"). Never against anyone else, and never a score of how happy someone was.
- **Tell the story of moments the person chose, tried, adapted or asked for help in.** Hope rests on their own record.
- **Call a hard week hard,** with one thing the person did. Don't turn it into a growth story.
- **Close themes rather than reopen them.** More self-focus is not more insight. The Sunday "Is that still true?" closes an item once it has changed.
- **Mirrors fall on fresh starts:** Sunday for the week, then the first of the month, quarter and year.
- **Quote the person's own words where there are some.** Their words carry more weight than the app's.
- **The one thing they are working on is counted only when done,** never what was missed.

## What to avoid

| Avoid | Why |
|---|---|
| Trait labels, type names, anything diagnostic | Verdicts make feedback backfire and labels can become self-fulfilling |
| Comparison with other users, averages, ranks | A documented cause of feedback backfiring |
| Vague or flattering insights | People accept them without their being true |
| Scoring happiness, or telling people to chase it | Prizing happiness head-on backfires; the app serves happiness by helping people meet their needs |
| Handing out solutions: "you should", "the answer is", "the secret is" | People act on what they find themselves; the app helps them find it (Edwin, 2026-10-24) |
| Forced cheer: silver linings, "everything happens for a reason" | It hurts people with low self-esteem; accepting feelings protects them |
| Promises: "this will change your life", "40% of happiness" | Every effect is small; the 40% figure is disowned by its authors |
| Abstract "why am I like this?" prompts, especially in the evening | That is the brooding pattern that harms people who are already low |
| Stacked steps, streaks, penalties, all-or-nothing challenges | Accepting without doing predicts change in the wrong direction |
| Western defaults: independence over duty, a partner, a salaried job, a weekend, a car, a room of your own | Most of the world lives and works otherwise ([research/regions/report.md](research/regions/report.md)) |
| Taking sides on religion or politics | Benefits depend on fit and community, not content |
| Becoming another passive feed | Scrolling goes with lower satisfaction |

## Sources

The app never shows a source, but every card's research must be accurate:

- Each question needs at least one card that cites an id in [`backend/content/sources.json`](../backend/content/sources.json), with the strength the library gives it.
- Research claims go in the `research` field, never in the reveal.
- New sources come from the research file above or the shared evidence library, each opened and checked before it is cited.

## What the code checks

| Rule | Checked in |
|---|---|
| No comparison with other people | `backend/voice.go` (bank), `frontend/src/voice.ts` (mirror, day close, reads) |
| At most one hedge; no "chances are"; no invented details | `backend/voice.go`, `frontend/src/voice.ts` |
| No tag questions; UK English; no "ok" | `backend/voice.go`, `frontend/src/voice.ts` |
| No labels for who someone is (people-pleaser, introvert, burnout...) | `backend/content.go` (`bannedPattern`), `frontend/src/voice.ts` |
| No clinical words; never a therapist | `backend/content.go` (`bannedPattern`) |
| No promises the evidence cannot keep, and no "the secret is" | `backend/voice.go` (`promisePattern`), `frontend/src/voice.ts` |
| No forced cheer | `backend/voice.go` (`cheerPattern`), `frontend/src/voice.ts` |
| No prompt asking which religion, party, ethnicity or nationality | `backend/voice.go` (`identityPromptPattern`) |
| No abstract "why am I like this?" prompt | `backend/voice.go` (`broodingPromptPattern`) |
| No survey scales; no loaded labels; no presumed partner | `backend/content.go`, `backend/voice.go` |
| Lengths, headline at most 70 characters, shallow-to-deep order, one cited card per question | `backend/content.go` |
| Heavy only on a deep answer outside intimacy | `backend/content.go` |
| Heavy cards show people and a helpline, never an insight | `frontend/src/QuestionCard.tsx`, tested in `App.test.tsx` |
| Change shown only against your own past | `frontend/src/profile.ts` (`changeAt`), tested in `profile.test.ts` |
| Every answer option names one of the seven needs | `backend/content.go` (gate), ids kept in step with `frontend/src/needs.ts` by `needs_test.go` |
| Need steps follow the voice rules | `backend/voice.go`, `backend/content.go` (length) |
| What a week reached for counts only your own answers, never intimacy, heavy or "Not me" | `frontend/src/reaching.ts`, tested in `reaching.test.ts` |
| Regional questions: a known region, no intimacy, no id shared with the main bank, at least three a region, every main-bank rule | `backend/regional.go` (`validateRegional`), tested in `regional_test.go` |
| A regional answer, tap or step never leaves the phone | `frontend/src/QuestionCard.tsx`, `moves.ts`, tested in `regional.test.ts` and `App.test.tsx` |

Run `cd backend && go test ./...` and `cd frontend && npm test` after any change to the bank or the app's words.
