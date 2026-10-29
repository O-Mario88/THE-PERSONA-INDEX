# The first release

What the first release is for, who it is for first, what it leaves out, and how we will know whether it works (Edwin, 2026-10-29). The switches that hold things back live in `frontend/src/release.ts`; what is kept, and the promises around it, are in [data-map.md](data-map.md).

## Who it is for first

People who regularly leave important conversations thinking "I didn't explain what I meant." The first group we can reach is people already seeing a coach or a counsellor: they have a conversation coming, a reason to prepare for it, and someone to bring a brief to. The app stays useful outside that setting, for a partner, a manager or a friend.

The buying reason to validate: *the app helps me handle a difficult moment today, and remembers what helps me over time, so I go into my next conversation knowing what to say.*

## What the first release puts first

1. **A focused first use.** "What would you like help making sense of today?", two or three questions, and a small result the person can edit (`frontend/src/makeSense.ts`, `mobile/src/screens/MakeSense.tsx`).
2. **One genuinely useful conversation brief.** Who it is for, what to discuss, the moments chosen, then five parts the person edits before printing or sharing (`frontend/src/conversationSheet.ts`, `mobile/src/screens/ConversationSheet.tsx`).
3. **Follow-up on a chosen action.** The step comes back on Today on its day to ask how it went (`frontend/src/todayFocus.ts`, `StepCheckIn` in `mobile/src/screens/TodayCards.tsx`).
4. **Evidence-based recall of what helped.** Only a step the person said helped, in a similar moment, with the day it happened (`memoryFor` in `makeSense.ts`).
5. **A strong weekly Mirror.** Five questions, then "Choose what to focus on next" (`frontend/src/mirrorWeek.ts`), on the day the person chose (`frontend/src/mirrorDay.ts`).
6. **One paid tier, and prepaid access.** Patron monthly or yearly; prepaid passes on the website, where the stores allow other ways to pay.

## What waits

Held back in the first release, not deleted (`frontend/src/release.ts`):

- Social feeds and the fuller Circle: closer together, common ground, support and celebrate, and walking alongside one person. Connect keeps You're not alone, inviting a friend and the circle list.
- More plans: Duo and the Founding Member place. The server still knows them, so they can return without a migration.
- Cosmetic premium bundles. The privacy curtain (lock, cover, quiet icon, guest PIN) is free, because it protects the people who need it most.
- A large catalogue of programmes.

## Trust is outside the paywall

Locking, deletion, "Download my book" and access to everything the person already has stay free. Cancelling stops new premium outputs and takes nothing away. Patron never changes what is kept or for how long. Details: [data-map.md](data-map.md#patron-never-changes-what-is-kept).

## Ideas, not proof

The supplementary growth document has useful suggestions, but its strongest commercial claims are unsupported by anything we have: "highest-converting", "#1 premium upgrade", "cuts churn in half" and "prints money". What public information shows (checked 2026-10-29):

- Rosebud documents weekly reports ([Rosebud weekly reports](https://help.rosebud.app/ai-analysis/weekly-report)). That supports the feature existing, not its conversion ranking.
- Paired covers both partners with one subscription, and its public FAQ lists $79.99 a year, not the document's $40 to $60 ([Paired FAQ](https://www.paired.com/frequently-asked-questions)). Neither shows that a Duo plan halves churn.

So each idea is a hypothesis, with the signal that would test it:

| Hypothesis | Tested by |
| --- | --- |
| A useful first result makes people come back | Useful first result, then another Mirror |
| The brief is the reason people pay | Brief used, then paying after the first renewal |
| Recall of what helped keeps people paying | Step helped, then paying after the first renewal |
| A weekly Mirror brings people back each week | Another Mirror |
| A plan for two (Duo) lowers churn | Not tested in the first release: Duo waits |

## The five signals

| Signal | Counted when |
| --- | --- |
| A useful first result | The person keeps their first result from "What would you like help making sense of today?" |
| They use their brief | A brief is printed or shared |
| They return for another Mirror | The person opens a weekly Mirror for a second, different week |
| A step helped | A check-in says a step helped, fully or a little |
| Still paying after the first renewal | A plan renews past its first period (from purchase records; needs real payments) |

How they are counted, without anyone's writing: the phone sends only a fixed event name and the day, once per event where that is the rule, and only if the person said yes to "Count how I use the app". No device key, account, words, answers or question travel with it. The server adds one to that day's count and keeps nothing else (`product_counts`, `backend/productcounts.go`). The renewal signal is worked out on the server from purchase records, as a total. None of this is used for marketing, and private writing is never collected for analytics.
