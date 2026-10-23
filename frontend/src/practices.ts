// The short practices (the review of 2026-10-15, "A practice for the hard
// part"): one to five minutes, offered after the evening close for the day's
// honest part. Each rests on trials that showed it helps; the sources are kept
// here for accuracy and never shown (Edwin, 2026-10-15). A "When ___, I will
// ___" plan is the fourth practice, made from the honest part itself
// (Plan in Keep.tsx), and three good things close the day (GoodThings).

import type { Source } from './traits'

export type PracticeId = 'worry-time' | 'savour' | 'best-self'

export type Practice = {
  id: PracticeId
  name: string
  offer: string // the line that offers it
  minutes: number
  steps: string[]
  end: string
  sources: Source[]
}

export const PRACTICES: Record<PracticeId, Practice> = {
  'worry-time': {
    id: 'worry-time',
    name: 'A set time for worry',
    offer: 'Two minutes now: give your worries a set time, so they stop taking the whole day.',
    minutes: 2,
    steps: [
      'Note what is on your mind in a few words, on paper or in your phone. Just enough to find it again.',
      'Choose half an hour for worrying, at the same time and in the same place each day. Not in bed, and not just before sleep.',
      'Until then, when a worry comes back, add it to the list and tell it: later, at worry time. Then bring your attention back to what is in front of you.',
      'At worry time, go through the list and look for one thing you could do about each. When the half hour is up, stop, even mid-thought.',
    ],
    end: 'That is your worry time set. Give it a week or two: for many people, a worry with its own time takes up less of the rest of the day.',
    // Borkovec 1983: a daily 30-minute worry period, same time and place, used
    // to problem-solve, cut daily worry over four weeks. Dippel 2024 (seven
    // trials, 999 people): the effect is real but small, with no long-term
    // follow-up, so the end line promises no more than that.
    sources: [
      { title: 'Borkovec, Wilkinson, Folensbee & Lerman, 1983', url: 'https://pure.psu.edu/en/publications/stimulus-control-applications-to-the-treatment-of-worry/', strength: 'moderate' },
      { title: 'Dippel, Brosschot & Verkuil, 2024', url: 'https://scholarlypublications.universiteitleiden.nl/access/item%3A4105123/download', strength: 'strong' },
    ],
  },
  savour: {
    id: 'savour',
    name: 'Savour one good moment',
    offer: 'Two minutes now: bring back one good moment from today and stay with it.',
    minutes: 2,
    steps: [
      'Pick one good moment from today, however small: a taste, a laugh, a minute of quiet.',
      'Go back to it. Where were you, and what could you see, hear and feel?',
      'Stay with the feeling for a little while. Let it be as big as it really was, without rushing on to the next thing.',
      'Before you finish, think of someone you could tell about it tomorrow. Sharing a good moment makes it last.',
    ],
    end: 'Done. Moments you stop for stay with you longer, and they are easier to find again on a hard day.',
    sources: [
      { title: 'Chen et al., 2026', url: 'https://www.synapsesocial.com/papers/69b258a396eeacc4fcec880f', strength: 'strong' },
      // Telling someone about a good thing adds to it (capitalising).
      { title: 'Gable et al., 2004', url: 'https://www.sas.rochester.edu/psy/people/faculty/reis_harry/assets/pdf/GableReisImpettAsher_2004.pdf', strength: 'moderate' },
    ],
  },
  'best-self': {
    id: 'best-self',
    name: 'Your best possible self',
    offer: 'Five minutes now: picture the year ahead going as well as it reasonably could.',
    minutes: 5,
    steps: [
      'Picture yourself a year from now. Things have gone as well as they reasonably could, because you worked at them.',
      'Make it an ordinary day in that year. Where do you wake up, what do you spend the day on, and who is around you?',
      'Notice what you made happen to get there: the habit you kept, the thing you finally started, the talk you had.',
      'If it helps, write a few lines about it, on paper. Then pick one small thing from it you could begin this week.',
    ],
    end: 'Done. A clear picture of where you are heading makes the next small step easier to see.',
    sources: [
      // King: 20 minutes on four days raised well-being three weeks on (one
      // study of 81 students). Meevissen: five minutes a day for two weeks
      // raised optimism (about 50 students). Both small, so the end line is modest.
      { title: 'King, 2001', url: 'https://stafforini.com/works/king-2001-health-benefits-writing/', strength: 'moderate' },
      { title: 'Meevissen, Peters & Alberts, 2011', url: 'https://cris.maastrichtuniversity.nl/en/publications/become-more-optimistic-by-imagining-a-best-possible-self-effects-/', strength: 'moderate' },
    ],
  },
}

// The practice that fits each honest part. Sides with none take the plan.
const FOR_SIDE: Record<string, PracticeId> = {
  'conscientiousness.high': 'savour',
  'conscientiousness.low': 'best-self',
  'openness.low': 'best-self',
  'extraversion.high': 'savour',
  'neuroticism.high': 'worry-time',
  'attachment_anxiety.high': 'worry-time',
  'attachment_avoidance.low': 'savour',
  'present_bias.high': 'best-self',
  'present_bias.low': 'savour',
  'rumination.high': 'worry-time',
  'materialism.high': 'savour',
}

export function practiceFor(trait: string, high: boolean): Practice | null {
  const id = FOR_SIDE[`${trait}.${high ? 'high' : 'low'}`]
  return id ? PRACTICES[id] : null
}

// Three good things before bed: writing down what went well, and why, each
// night for a week lifted happiness for months in one online trial (411
// finished; self-selected). Gratitude exercises in general show small effects
// (Diniz et al., 2023), so nothing on screen promises more than a nicer close
// to the day.
export const GOOD_THINGS_SOURCE: Source = {
  title: 'Seligman, Steen, Park & Peterson, 2005',
  url: 'https://psykologtidsskriftet.no/asset/article/2005/09/Positive-Psychology-Progress-Empirical-Validation-of-Interventions/Positive-Psychology-Progress-Empirical-Validation-of-Interventions.pdf',
  strength: 'moderate',
}

// "When ___, I will ___": across 94 studies, plans tied to a moment had a
// medium-to-large effect on doing what was meant. Telling others about a plan
// can sap the effort (Gollwitzer et al., 2009), one more reason the plan's
// words never leave the phone.
export const PLAN_SOURCE: Source = {
  title: 'Gollwitzer & Sheeran, 2006',
  url: 'https://kops.uni-konstanz.de/entities/publication/2e749bfb-8533-437c-8203-7e788c910c5f',
  strength: 'strong',
}

// One line a week in your own words: writing about what you went through
// helps you make sense of it (a review of expressive writing trials).
export const SENTENCE_SOURCE: Source = {
  title: 'Pennebaker, 1997',
  url: 'https://sanlab.psych.ucla.edu/wp-content/uploads/sites/31/2016/03/Pennebaker_Psychscience_1997.pdf',
  strength: 'moderate',
}
