// The words of the weekly mirror: what each trait reading means, the
// archetype name it gives the week, and the research behind each claim.
// Every number on the mirror comes from the server; this file only turns
// those numbers into plain, human sentences. The research and sources are not
// shown in the app (Edwin, 2026-10-15); they stay here so every claim can be
// traced and kept accurate (mirrorText.test.ts).

import type { Mirror, Period, PeriodMirror, TraitRead } from './api'

export type Source = { title: string; url: string; strength: 'strong' | 'moderate' }

// The research behind the mirror's words, each linked to the paper or a
// summary of it. soto2019 backs "Reading this honestly", and roberts2006,
// hudson2015 and gollwitzer2006 back "Why movement is possible" (Mirror.tsx).
// lally2010 backs the quarter's closing line and roberts2006 the year's
// (PERIOD_CLOSE below). Each leaning's honest part has its own source
// (Side.costSource).
export const SOURCES = {
  roberts2007: {
    title: 'Roberts et al., 2007',
    url: 'https://www.psychologicalscience.org/journals/perspectives/j.1745-6916.2007.00047.x/',
    strength: 'strong',
  },
  graziano2007: {
    title: 'Graziano et al., 2007',
    url: 'https://scholars.iwu.edu/en/publications/agreeableness-empathy-and-helping-a-person-x-situation-perspectiv-2/',
    strength: 'moderate',
  },
  mccrae1987: { title: 'McCrae, 1987', url: 'https://zenodo.org/records/1231472', strength: 'moderate' },
  fleeson2002: {
    title: 'Fleeson, Malanos & Achille, 2002',
    url: 'https://worlddatabaseofhappiness.eur.nl/publications/an-intraindividual-process-approach-to-the-relationship-between-extraversion-and-positive-affect-is-acting-extraverted-as-good-as-being-extraverted-4702',
    strength: 'moderate',
  },
  lahey2009: { title: 'Lahey, 2009', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2792076/', strength: 'strong' },
  hexaco2005: {
    title: 'Lee, Ashton & de Vries, 2005',
    url: 'https://research.vu.nl/en/publications/predicting-workplace-delinquency-and-integrity-with-the-hexaco-an/',
    strength: 'moderate',
  },
  fraley: {
    title: 'Fraley, adult attachment research',
    url: 'https://labs.psychology.illinois.edu/~rcfraley/measures/measures.html',
    strength: 'strong',
  },
  meier2010: {
    title: 'Meier & Sprenger, 2010',
    url: 'https://www.newyorkfed.org/medialibrary/media/banking/MeierSlides_NYU.pdf',
    strength: 'moderate',
  },
  nolen2008: {
    title: 'Nolen-Hoeksema, Wisco & Lyubomirsky, 2008',
    url: 'https://pubmed.ncbi.nlm.nih.gov/26158958/',
    strength: 'strong',
  },
  vanboven2003: {
    title: 'Van Boven & Gilovich, 2003',
    url: 'https://cdn.vanderbilt.edu/vu-wp0/wp-content/uploads/sites/59/2011/05/06143905/to-do-or-to-have.pdf',
    strength: 'moderate',
  },
  soto2019: {
    title: 'Soto, 2019',
    url: 'https://www.psychologicalscience.org/observer/new-replicability-project-bolsters-research-correlating-personality-traits-and-life-outcomes',
    strength: 'strong',
  },
  roberts2006: { title: 'Roberts, Walton & Viechtbauer, 2006', url: 'https://pubmed.ncbi.nlm.nih.gov/16435954/', strength: 'strong' },
  hudson2015: {
    title: 'Hudson & Fraley, 2015',
    url: 'https://bps.org.uk/research-digest/you-can-change-your-personality-will',
    strength: 'moderate',
  },
  lally2010: {
    title: 'Lally et al., 2010',
    url: 'https://www.ucl.ac.uk/news/2009/aug/how-long-does-it-take-form-habit',
    strength: 'moderate',
  },
  gollwitzer2006: {
    title: 'Gollwitzer & Sheeran, 2006',
    url: 'https://kops.uni-konstanz.de/entities/publication/2e749bfb-8533-437c-8203-7e788c910c5f',
    strength: 'strong',
  },
  // Behind "the honest part" of each leaning (Side.cost below).
  boyce2010: { title: 'Boyce, Wood & Brown, 2010', url: 'https://wrap.warwick.ac.uk/5298/', strength: 'moderate' },
  judge2012: {
    title: 'Judge, Livingston & Hurst, 2012',
    url: 'https://bps.org.uk/research-digest/truth-about-nice-guys-mean-girls-and-pay',
    strength: 'strong',
  },
  blain2020: {
    title: 'Blain et al., 2020',
    url: 'https://experts.umn.edu/en/publications/apophenia-as-the-disposition-to-false-positives-a-unifying-framew/',
    strength: 'moderate',
  },
  nettle2005: { title: 'Nettle, 2005', url: 'https://danielnettle.org.uk/wp-content/uploads/2024/06/029.pdf', strength: 'moderate' },
  lichan2012: {
    title: 'Li & Chan, 2012',
    url: 'https://academia.edu/13297419/How_anxious_and_avoidant_attachment_affect_romantic_relationship_quality_differently_A_meta-analytic_review',
    strength: 'strong',
  },
  kivetz2006: {
    title: 'Kivetz & Keinan, 2006',
    url: 'https://ideas.repec.org/a/oup/jconrs/v33y2006i2p273-282.html',
    strength: 'moderate',
  },
  distefano2014: {
    title: 'Di Stefano, Gino, Pisano & Staats, 2014',
    url: 'https://www.hec.edu/en/knowledge/instants/power-reflection-work-insight-hec-professor-giada-di-stefano',
    strength: 'moderate',
  },
  dittmar2014: {
    title: 'Dittmar, Bond, Hurst & Kasser, 2014',
    url: 'https://research.brighton.ac.uk/en/publications/the-relationship-between-materialism-and-personal-well-being-a-me/',
    strength: 'strong',
  },
  nicolao2009: {
    title: 'Nicolao, Irwin & Goodman, 2009',
    url: 'https://news.utexas.edu/2009/02/10/new-happiness-research-demonstrates-when-material-items-are-the-best-option',
    strength: 'moderate',
  },
  vazire2010: {
    title: 'Vazire, 2010',
    url: 'https://source.washu.edu/2010/03/others-may-know-us-better-than-we-know-ourselves-study-finds/',
    strength: 'moderate',
  },
} satisfies Record<string, Source>

export type SourceKey = keyof typeof SOURCES

type Side = {
  adj: string // "Steady", for the archetype's first word
  noun: string // "Finisher", for its second
  quality: string // the tagline's opening: "steady follow-through"
  with: string // the tagline's closing: "a soft spot for a finished list"
  headline: string
  prediction: string
  // The honest part (Edwin, 2026-10-15: "not afraid of telling them the
  // negative things ... in a polite human language"): what this leaning can
  // cost, from costSource. Where the research finds no real cost, it says so
  // rather than invent one, and costSource is the trait's own.
  cost: string
  costSource: SourceKey
}

export type TraitText = {
  name: string
  science: string
  high: Side
  low: Side
  research: string
  source: SourceKey
}

export const TRAITS: Record<string, TraitText> = {
  conscientiousness: {
    name: 'Organised',
    science: 'Conscientiousness',
    high: {
      adj: 'Steady',
      noun: 'Finisher',
      quality: 'steady follow-through',
      with: 'a soft spot for a finished list',
      headline: 'You finish what you start.',
      prediction:
        "When a day gets crowded, you're likely the one who still closes the loop. Just watch that rest doesn't wait until everything is done.",
      cost: "When something you've worked hard for is taken away, like a job, it can hit you harder and for longer. Your worth was never only in what you get done.",
      costSource: 'boyce2010',
    },
    low: {
      adj: 'Easygoing',
      noun: 'Improviser',
      quality: 'an easy, flexible pace',
      with: 'room left for whatever the day brings',
      headline: 'You keep your plans loose.',
      prediction:
        "You adapt fast when plans change. The cost tends to show up in the small jobs that quietly pile up while you're busy with bigger things.",
      cost: 'The small things you mean to do add up. Over years, this leaning goes with poorer health and shakier work, so a few steady habits are worth more than they look.',
      costSource: 'roberts2007',
    },
    research: 'Across many studies, organised people tend to live longer, do better at work and keep steadier relationships.',
    source: 'roberts2007',
  },
  agreeableness: {
    name: 'Warm',
    science: 'Agreeableness',
    high: {
      adj: 'Warm',
      noun: 'Peacemaker',
      quality: 'a warm, peacekeeping streak',
      with: 'a habit of putting others at ease',
      headline: 'You keep the peace.',
      prediction:
        "People probably feel safe bringing their problems to you. Notice the days you give way when you'd rather not; kindness counts for you too.",
      cost: 'Keeping the peace can cost you. People who lean this way tend to earn less, partly because they ask for less. Before a pay talk, decide your number and say it first.',
      costSource: 'judge2012',
    },
    low: {
      adj: 'Candid',
      noun: 'Straight Talker',
      quality: 'a candid, direct voice',
      with: 'a habit of saying what others only think',
      headline: 'You say what you think.',
      prediction:
        'People tend to know exactly where they stand with you. Your directness lands best when the other person feels heard first.',
      cost: 'Directness can cost you closeness. This leaning tends to go with thinner friendships and more stress, even when it pays at work.',
      costSource: 'judge2012',
    },
    research: 'Warmer, more agreeable people are more likely to help others, strangers included, across many situations.',
    source: 'graziano2007',
  },
  openness: {
    name: 'Curious',
    science: 'Openness',
    high: {
      adj: 'Curious',
      noun: 'Explorer',
      quality: 'a restless curiosity',
      with: 'an eye for the unfamiliar',
      headline: 'You reach for the new.',
      prediction:
        "You're quick to spot another way of doing things. Depth comes from staying with one new thing long enough to get good at it.",
      cost: "The mind that finds new connections can also see patterns that aren't there. Test a bright idea before you bet on it.",
      costSource: 'blain2020',
    },
    low: {
      adj: 'Grounded',
      noun: 'Keeper',
      quality: 'a grounded love of what works',
      with: 'a trust in the tried and true',
      headline: 'You trust what works.',
      prediction:
        "You're the steady one when everything around you changes. One small new thing a week keeps that steadiness from turning into a rut.",
      cost: "When the old way stops working, you may be slow to reach for another. Fewer new ideas tend to come when you stay with what's known.",
      costSource: 'mccrae1987',
    },
    research: 'Openness goes with divergent thinking: coming up with more ideas, and more unusual ones.',
    source: 'mccrae1987',
  },
  extraversion: {
    name: 'Outgoing',
    science: 'Extraversion',
    high: {
      adj: 'Lively',
      noun: 'Connector',
      quality: 'a lively, social energy',
      with: 'a pull toward people',
      headline: 'People charge you up.',
      prediction:
        "A good conversation can lift your whole day. Protect a little quiet too; it's where your ideas get a chance to settle.",
      cost: 'The pull toward people and excitement can come with a little more risk of getting hurt. Enjoy the rush, and keep the careful habits.',
      costSource: 'nettle2005',
    },
    low: {
      adj: 'Quiet',
      noun: 'Observer',
      quality: 'a quiet, watchful calm',
      with: 'a taste for small circles',
      headline: 'You recharge on your own.',
      prediction:
        'Your friendships likely run deep rather than wide. A short, low-key yes to company can refresh you more than you expect.',
      cost: "Staying in is easy to choose, even on days when company would have lifted you. Your mood tends to rise in the moments you act outgoing, even when it isn't your habit.",
      costSource: 'fleeson2002',
    },
    research: 'In daily life, people feel more upbeat in the moments they act outgoing, quieter people included.',
    source: 'fleeson2002',
  },
  neuroticism: {
    name: 'Stress reactivity',
    science: 'Neuroticism',
    high: {
      adj: 'Sensitive',
      noun: 'Feeler',
      quality: 'a sensitive, alert heart',
      with: 'feelings that run close to the surface',
      headline: 'Things stay with you.',
      prediction:
        'You often notice trouble early. Giving worries a set time each day, written down, tends to make them smaller.',
      cost: 'Worry costs more than it seems. Over years, a mind that is often on alert wears on the body too, so calming habits are worth building now.',
      costSource: 'lahey2009',
    },
    low: {
      adj: 'Calm',
      noun: 'Anchor',
      quality: 'an unshaken calm',
      with: 'a long fuse',
      headline: 'Setbacks roll off you.',
      prediction:
        "Others likely lean on your calm when things go wrong. Check in on them afterwards; they may still be carrying what you've set down.",
      cost: "Honestly, there is no proven downside to a calm temper. Just don't let calm turn into not noticing when someone else is still shaken.",
      costSource: 'lahey2009',
    },
    research: 'People who feel stress more easily tend to have more health problems over a lifetime, which makes calming habits worth building.',
    source: 'lahey2009',
  },
  honesty_humility: {
    name: 'Fair-minded',
    science: 'Honesty-Humility',
    high: {
      adj: 'Fair',
      noun: 'Truth-Teller',
      quality: 'a quiet sense of fair play',
      with: "a line you won't cross",
      headline: 'You play fair, even unseen.',
      prediction:
        "People are likely to trust you with things that matter. Fairness includes asking for the credit you've earned.",
      cost: 'Modesty can go unrewarded. People who play down what they did tend to be passed over for those who talk themselves up, so say plainly what you did.',
      costSource: 'judge2012',
    },
    low: {
      adj: 'Pragmatic',
      noun: 'Dealmaker',
      quality: 'a pragmatic, flexible streak',
      with: 'an eye for the shortcut',
      headline: 'You treat rules as flexible.',
      prediction:
        "You're resourceful under pressure. Before bending a rule, picture the person who pays for it; the shortcut can look different with a face on it.",
      cost: 'This leaning goes with more rule-bending at work. Even small shortcuts can cost you trust that takes a long time to rebuild.',
      costSource: 'hexaco2005',
    },
    research: 'Fair-mindedness predicts honest, rule-keeping behaviour at work better than the classic five traits do.',
    source: 'hexaco2005',
  },
  attachment_anxiety: {
    name: 'Closeness radar',
    science: 'Attachment anxiety',
    high: {
      adj: 'Attentive',
      noun: 'Noticer',
      quality: 'an attentive heart',
      with: 'a radar tuned for silence',
      headline: 'You notice distance fast.',
      prediction:
        "You likely pick up a change in someone's mood before they say a word. When a silence worries you, one direct question usually beats an hour of guessing.",
      cost: 'The worry can cost you the closeness you want. This leaning goes with more arguments and less satisfaction in relationships, so ask for reassurance directly instead of testing for it.',
      costSource: 'lichan2012',
    },
    low: {
      adj: 'Secure',
      noun: 'Trustkeeper',
      quality: 'an easy, secure trust',
      with: 'a calm read on silence',
      headline: "Silence doesn't rattle you.",
      prediction:
        "You probably make the people close to you feel relaxed. Reaching out first now and then gives them the reassurance you don't need yourself.",
      cost: "Honestly, there is no proven downside to feeling secure. Just remember that someone close to you may need reassurance you'd never think to ask for.",
      costSource: 'fraley',
    },
    research: 'Worry about closeness and keeping distance are two separate leanings, and most adults sit somewhere on both.',
    source: 'fraley',
  },
  attachment_avoidance: {
    name: 'Keeping space',
    science: 'Attachment avoidance',
    high: {
      adj: 'Independent',
      noun: 'Free Spirit',
      quality: 'an independent streak',
      with: 'a door you like to keep ajar',
      headline: 'You keep a little space.',
      prediction:
        'You stand well on your own. Letting someone help with one small thing is a skill worth practising, and it tends to bring people closer.',
      cost: 'The space you keep has a price. This leaning goes with feeling less close, less supported and less satisfied in relationships, even when nothing is wrong.',
      costSource: 'lichan2012',
    },
    low: {
      adj: 'Open-Hearted',
      noun: 'Welcomer',
      quality: 'an open, welcoming heart',
      with: "a door that's always open",
      headline: 'You let people in.',
      prediction:
        'People likely feel at home around you quickly. Keep a little time just for you, so closeness stays a choice rather than a habit.',
      cost: 'Honestly, there is no proven downside to letting people in. Just keep some time that is yours alone.',
      costSource: 'fraley',
    },
    research: 'Worry about closeness and keeping distance are two separate leanings, and most adults sit somewhere on both.',
    source: 'fraley',
  },
  present_bias: {
    name: 'Now over later',
    science: 'Present bias',
    high: {
      adj: 'Spontaneous',
      noun: 'Spark',
      quality: 'a spark for the moment',
      with: "a yes for what's in front of you",
      headline: 'Now tends to win.',
      prediction:
        'You know how to enjoy a moment. A ten-minute pause before a purchase lets the bigger reward catch up.',
      cost: 'Now can be expensive. This leaning goes with carrying more credit card debt, so give a big buy one night to wait.',
      costSource: 'meier2010',
    },
    low: {
      adj: 'Patient',
      noun: 'Builder',
      quality: 'patient, long-game thinking',
      with: 'a willingness to wait for better',
      headline: "You'll wait for better.",
      prediction:
        'Your patience is likely to pay off over years. Plan one small treat with no purpose at all, so the present feels good too.',
      cost: 'Always choosing the sensible thing can turn into regret. Looking back, people tend to regret the pleasures they skipped more than the ones they had.',
      costSource: 'kivetz2006',
    },
    research: 'People who favour now over later tend to carry more credit card debt.',
    source: 'meier2010',
  },
  rumination: {
    name: 'Replaying',
    science: 'Rumination',
    high: {
      adj: 'Reflective',
      noun: 'Thinker',
      quality: 'a reflective, replaying mind',
      with: 'a habit of going over hard moments',
      headline: 'You replay hard moments.',
      prediction:
        'You care about getting things right. When a replay starts, moving your body tends to quiet the loop faster than thinking harder.',
      cost: 'Replaying a problem rarely solves it, and it tends to deepen a low mood. Step away first, then take one small action.',
      costSource: 'nolen2008',
    },
    low: {
      adj: 'Fresh',
      noun: 'Starter',
      quality: 'a knack for fresh starts',
      with: 'an easy way of letting go',
      headline: 'You let things go.',
      prediction:
        'Your days probably feel light. A one-minute look back after big moments turns them into lessons without weighing you down.',
      cost: 'Letting go fast can mean skipping the lesson. A few minutes spent writing down what you learned tends to sharpen what you take from a day.',
      costSource: 'distefano2014',
    },
    research: 'Going over problems without acting on them tends to deepen a low mood; a short distraction or one next step helps break the loop.',
    source: 'nolen2008',
  },
  materialism: {
    name: 'Things or experiences',
    science: 'Materialism',
    high: {
      adj: 'Practical',
      noun: 'Collector',
      quality: 'a love of good things',
      with: 'an eye for quality you can hold',
      headline: 'Owning things matters to you.',
      prediction:
        'You care about comfort and quality. Asking what experience a purchase will give you tends to make the good feeling last longer.',
      cost: 'Putting a lot of weight on owning things tends to go with feeling less satisfied, not more. When a buy feels urgent, ask what you are really hungry for.',
      costSource: 'dittmar2014',
    },
    low: {
      adj: 'Adventurous',
      noun: 'Wanderer',
      quality: 'a hunger for experiences',
      with: 'a preference for doing over having',
      headline: "You'd rather do than own.",
      prediction:
        'Your best memories probably come from places and people, not purchases. Experiences feel better still when the basics are covered.',
      cost: 'Experiences are a bigger gamble. When one goes badly, it tends to sting for longer than a disappointing purchase, so choose them with care.',
      costSource: 'nicolao2009',
    },
    research: 'Spending on experiences tends to bring more lasting happiness than spending on possessions.',
    source: 'vanboven2003',
  },
}

// A read leans one way from these scores; between them it sits in the middle.
export const HIGH = 60
export const LOW = 40

// A trait read of any length: a week's, or a month's, quarter's or year's.
type Read = { trait: string; score: number }

export type Lean<R extends Read = TraitRead> = { read: R; text: TraitText; side: Side; high: boolean }

// leanings lists the traits that clearly lean one way, in the server's order
// (solid reads first, then the clearest).
export function leanings<R extends Read>(traits: R[]): Lean<R>[] {
  return traits.flatMap((read) => {
    const text = TRAITS[read.trait]
    if (!text || (read.score > LOW && read.score < HIGH)) return []
    const high = read.score >= HIGH
    return [{ read, text, side: high ? text.high : text.low, high }]
  })
}

// archetype names the week from its two clearest leanings: the first gives
// the adjective, the second the noun.
export function archetype(traits: Read[]): string | null {
  const l = leanings(traits)
  if (l.length === 0) return null
  return `The ${l[0].side.adj} ${(l[1] ?? l[0]).side.noun}`
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// tagline: one leaning gives "{Q1}, with {w1}."; two "{Q1}, with {w2}.";
// three "{Q1} and {q2}, with {w3}."; four or more "{Q1} and {q2}, with {w3} and {w4}."
export function tagline(traits: Read[]): string | null {
  const s = leanings(traits).map((l) => l.side)
  switch (s.length) {
    case 0:
      return null
    case 1:
      return `${cap(s[0].quality)}, with ${s[0].with}.`
    case 2:
      return `${cap(s[0].quality)}, with ${s[1].with}.`
    case 3:
      return `${cap(s[0].quality)} and ${s[1].quality}, with ${s[2].with}.`
    default:
      return `${cap(s[0].quality)} and ${s[1].quality}, with ${s[2].with} and ${s[3].with}.`
  }
}

export const AREA_NAMES: Record<string, string> = {
  everyday: 'Everyday life',
  people: 'People',
  inner: 'Inner life',
  desire: 'Desire & lifestyle',
}

// summary is the hero's opening paragraph, spoken to the person.
export function summary(m: Mirror): string {
  const { daysActive, answers, daysSoFar } = m.stats
  if (answers === 0) {
    return m.weeksActive > 0
      ? "This week is quiet so far. That's fine; your read below still draws on the last three weeks, and it will sharpen as soon as you answer again."
      : 'Your mirror fills in as you answer. A few days of questions is enough for the first patterns to show.'
  }
  const days = daysActive === 1 ? 'one day' : `${daysActive} days`
  const l = leanings(m.traits)
  const lead =
    daysSoFar >= 6
      ? `You showed up on ${days} this week and gave ${answers} ${answers === 1 ? 'answer' : 'answers'}.`
      : `So far this week you've shown up on ${days} and given ${answers} ${answers === 1 ? 'answer' : 'answers'}.`
  if (l.length === 0) return `${lead} Your answers sit close to the middle on everything so far, which is its own kind of balance.`
  return `${lead} What stood out most: ${l[0].side.headline.charAt(0).toLowerCase()}${l[0].side.headline.slice(1, -1)}. Here is what I noticed, and one thing to try next.`
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

// periodName spells a period's label: "October 2026", "October to December
// 2026" or "2026". With year false it leaves the year off.
export function periodName(period: Period, label: string, year = true): string {
  const [y, rest] = label.split('-')
  const tail = year ? ` ${y}` : ''
  if (period === 'month') return `${MONTHS[Number(rest) - 1]}${tail}`
  if (period === 'quarter') {
    const first = (Number(rest.slice(1)) - 1) * 3
    return `${MONTHS[first]} to ${MONTHS[first + 2]}${tail}`
  }
  return y
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

// periodSummary is the period's opening paragraph, spoken to the person.
export function periodSummary(p: PeriodMirror): string {
  const { answers, daysActive, weeksActive } = p.stats
  const noun = p.period
  if (answers === 0) {
    return `Nothing answered this ${noun} yet. It fills in week by week as you answer, and every week you come back adds to it.`
  }
  const last = p.weeks[p.weeks.length - 1]
  const over = p.weeks.length === p.weeksTotal && last?.daysSoFar >= 6
  const spread = `${plural(daysActive, 'day', 'days')} in ${plural(weeksActive, 'week', 'weeks')}`
  const lead = over
    ? `This ${noun} you showed up on ${spread} and gave ${plural(answers, 'answer', 'answers')}.`
    : `So far this ${noun} you've shown up on ${spread} and given ${plural(answers, 'answer', 'answers')}.`
  const l = leanings(p.traits)
  if (l.length === 0) return `${lead} Your answers sit close to the middle on everything so far, which is its own kind of balance.`
  const h = l[0].side.headline
  return `${lead} What stood out most: ${h.charAt(0).toLowerCase()}${h.slice(1, -1)}.`
}

// The closing line of each longer mirror (sources above).
export const PERIOD_CLOSE: Record<Period, string> = {
  month: 'A month is long enough to see a pattern, and short enough to change one.',
  quarter: 'Many new habits take around two months to feel automatic, so a quarter is where small steps start to show.',
  year: 'Traits do shift over the years. A year is where the slow changes show, the ones you only notice looking back.',
}
