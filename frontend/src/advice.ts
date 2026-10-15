// The advice at the end of an edition: what today's answers lean towards,
// the strength in it, what it can honestly cost and one way to grow. Built on
// this phone from the trait weights of the options chosen; nothing is sent
// anywhere.

import { TRAITS } from './mirrorText'
import { TRAIT_WORDS } from './profile'

type Advice = { strength: string; grow: string }

export const TRAIT_ADVICE: Record<string, { higher: Advice; lower: Advice }> = {
  conscientiousness: {
    higher: {
      strength: 'You tend to finish what you start, and people rely on you for it.',
      grow: 'Leave one small thing undone on purpose each day, so your rest stops depending on a cleared list.',
    },
    lower: {
      strength: 'You keep plans loose, which helps you adapt when the day changes.',
      grow: "Give one task a day a fixed moment, like 'right after lunch', so the important things get done without a full schedule.",
    },
  },
  openness: {
    higher: {
      strength: 'You reach for the new, which keeps life fresh and makes you good at spotting other ways of doing things.',
      grow: 'Pick one new interest and stay with it for a month, so curiosity turns into real skill.',
    },
    lower: {
      strength: 'You value what works, and that makes you steady and dependable.',
      grow: 'Try one small unfamiliar thing a week, a new route or a new dish, and notice what it teaches you.',
    },
  },
  extraversion: {
    higher: {
      strength: 'People charge you up, and you likely lift the energy of a room.',
      grow: 'Protect some quiet time each week; it is where your best ideas tend to settle.',
    },
    lower: {
      strength: 'You recharge alone and choose company with care, so your friendships tend to run deep.',
      grow: 'Say yes to one low-key invitation this week; small doses of company can refresh you too.',
    },
  },
  agreeableness: {
    higher: {
      strength: 'You keep the peace, and people feel safe around you.',
      grow: "Practise one honest 'no' this week; kindness lasts longer when it includes you too.",
    },
    lower: {
      strength: 'You say what you think, which makes you a clear and useful voice.',
      grow: 'Ask one question before you give your view; people hear directness better when they feel heard first.',
    },
  },
  neuroticism: {
    higher: {
      strength: 'Things stay on your mind, which often means you care and notice early warning signs.',
      grow: 'Give worries a short, set time each day and write them down; a written worry tends to feel smaller.',
    },
    lower: {
      strength: 'Setbacks roll off you, and others may lean on your calm.',
      grow: 'Check in on people around you after hard moments; they may still be carrying what you have already set down.',
    },
  },
  honesty_humility: {
    higher: {
      strength: 'You hold to fair play even when no one is watching, and that builds deep trust.',
      grow: 'Let yourself ask for credit when you have earned it; fairness includes being fair to yourself.',
    },
    lower: {
      strength: 'You treat rules as flexible, which can make you resourceful under pressure.',
      grow: 'Before bending a rule, picture the person who pays for it; the shortcut often looks different with a face on it.',
    },
  },
  attachment_anxiety: {
    higher: {
      strength: 'You watch closely for signs of distance, which makes you attentive to the people you love.',
      grow: 'When a silence worries you, ask directly instead of guessing; one simple question tends to bring more calm than hours of reading signs.',
    },
    lower: {
      strength: 'You rarely read distance as being about you, and that security makes you easy to be close to.',
      grow: 'Reach out first now and then; others may need the reassurance you do not.',
    },
  },
  attachment_avoidance: {
    higher: {
      strength: 'You keep some space, even with people you are close to, and you stand well on your own.',
      grow: 'Share one small worry with someone you trust this week; letting people help is a skill too.',
    },
    lower: {
      strength: 'You let people in easily, and they feel welcome around you.',
      grow: 'Keep a little time just for yourself each week, so closeness stays a choice rather than a habit.',
    },
  },
  present_bias: {
    higher: {
      strength: 'The reward in front of you tends to win, which makes you good at enjoying the moment.',
      grow: 'Pause ten minutes before buying or saying yes to anything; the bigger reward often wins once you wait.',
    },
    lower: {
      strength: 'You will wait for the better result, and that patience tends to pay off.',
      grow: 'Plan one small treat this week with no purpose at all; the future is easier to save for when the present feels good too.',
    },
  },
  rumination: {
    higher: {
      strength: 'You replay hard moments, which shows how much you care about getting things right.',
      grow: 'When a replay starts, get moving: walk, tidy or call someone. Busy hands tend to quiet a looping mind.',
    },
    lower: {
      strength: 'Once something is over you let it go, which keeps your days light.',
      grow: 'After big moments, take one minute to ask what you would do differently; a short look back turns experience into wisdom.',
    },
  },
  materialism: {
    higher: {
      strength: 'Owning things you want matters to you, and you likely care about quality and comfort.',
      grow: 'Before your next purchase, ask what experience it will give you; the things that last are often tied to good memories.',
    },
    lower: {
      strength: 'You would rather spend on doing than owning, which tends to bring lasting joy.',
      grow: 'Make sure the basics are covered first; experiences feel even better when bills are not on your mind.',
    },
  },
}

export type TodaysAdvice = {
  headline: string
  points: { trait: string; name: string; strength: string; honest: string; grow: string }[]
}

// adviceFor sums the trait weights of today's chosen options and speaks to
// the two clearest leanings. One day is a hint, not a verdict, and says so.
export function adviceFor(chosen: { traits?: Record<string, number> }[]): TodaysAdvice {
  const sums: Record<string, number> = {}
  for (const o of chosen) {
    for (const [t, w] of Object.entries(o.traits ?? {})) sums[t] = (sums[t] ?? 0) + w
  }
  const points = Object.entries(sums)
    .filter(([t, s]) => s !== 0 && TRAIT_ADVICE[t] && TRAIT_WORDS[t] && TRAITS[t])
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]) || a[0].localeCompare(b[0]))
    .slice(0, 2)
    .map(([t, s]) => ({
      trait: t,
      name: TRAIT_WORDS[t].name,
      ...TRAIT_ADVICE[t][s > 0 ? 'higher' : 'lower'],
      honest: TRAITS[t][s > 0 ? 'high' : 'low'].cost,
    }))

  if (points.length === 0) {
    return {
      headline:
        "Your answers today were balanced, with no single pattern standing out. Notice which moments feel easy today and which feel heavy; tomorrow will sharpen the picture.",
      points: [],
    }
  }
  const names = points.map((p) => p.name.toLowerCase()).join(' and ')
  return {
    headline: `Here's what I noticed today: your answers lean on ${names}. You'll get the good and the harder side of each, kindly but honestly. One day is a hint, not a verdict, so let's see whether it holds this week.`,
    points,
  }
}
