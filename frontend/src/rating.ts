// The tap under a card: "That's me", "Partly" or "Not me". Kept with the
// answer on this phone (history, the kept card) and sent as a count, never
// with words. A regional question's tap stays here; an intimacy question's
// goes without the option. Used under the day's card and in Insights.

import { PRIVATE_OPTION, rateCard, rememberRated, type Question, type Verdict } from './api'
import { noteVerdict } from './notebook'
import { recordVerdict } from './profile'

export function rateAnswer(q: Pick<Question, 'id' | 'care' | 'local'>, optionId: string, v: Verdict) {
  rememberRated(q.id, v)
  recordVerdict(q.id, v)
  noteVerdict(q.id, v)
  if (q.local) return
  rateCard(q.id, q.care === 'intimate' ? PRIVATE_OPTION : optionId, v).catch(() => {
    // a lost tap is not worth bothering anyone about
  })
}
