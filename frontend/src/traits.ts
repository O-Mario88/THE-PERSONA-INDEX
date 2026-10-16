// The one trait vocabulary every screen speaks: the card's thread line, the
// close of each sitting and the mirrors all name a trait and its two sides
// in these words (the review of 2026-10-15: the same trait had three names).
// Each side has three honest lines that rotate so none repeats within a day
// (honestLine), and an edge for the weekly title that names the cost as well
// as the strength. The research behind every line is kept here, out of sight
// (Edwin, 2026-10-15), and traits.test.ts checks each source resolves.

export type Source = { title: string; url: string; strength: 'strong' | 'moderate' }

// The research behind the words, each linked to the paper or a summary of it.
// soto2019 backs "Reading this honestly", and roberts2006, hudson2015 and
// gollwitzer2006 back "Why movement is possible" (Mirror.tsx). lally2010 backs
// the quarter's closing line and roberts2006 the year's (PERIOD_CLOSE in
// mirrorText.ts). Each honest line names its own source.
export const SOURCES = {
  roberts2007: {
    title: 'Roberts et al., 2007',
    url: 'https://www.psychologicalscience.org/journals/perspectives/j.1745-6916.2007.00047.x/',
    strength: 'strong',
  },
  graziano2007: {
    title: 'Graziano et al., 2007',
    url:
      'https://scholars.iwu.edu/en/publications/agreeableness-empathy-and-helping-a-person-x-situation-perspectiv-2/',
    strength: 'moderate',
  },
  mccrae1987: { title: 'McCrae, 1987', url: 'https://zenodo.org/records/1231472', strength: 'moderate' },
  fleeson2002: {
    title: 'Fleeson, Malanos & Achille, 2002',
    url:
      'https://worlddatabaseofhappiness.eur.nl/publications/an-intraindividual-process-approach-to-the-relationship-between-extraversion-and-positive-affect-is-acting-extraverted-as-good-as-being-extraverted-4702',
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
    url:
      'https://www.psychologicalscience.org/observer/new-replicability-project-bolsters-research-correlating-personality-traits-and-life-outcomes',
    strength: 'strong',
  },
  roberts2006: {
    title: 'Roberts, Walton & Viechtbauer, 2006',
    url: 'https://pubmed.ncbi.nlm.nih.gov/16435954/',
    strength: 'strong',
  },
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
  nettle2005: {
    title: 'Nettle, 2005',
    url: 'https://danielnettle.org.uk/wp-content/uploads/2024/06/029.pdf',
    strength: 'moderate',
  },
  lichan2012: {
    title: 'Li & Chan, 2012',
    url:
      'https://academia.edu/13297419/How_anxious_and_avoidant_attachment_affect_romantic_relationship_quality_differently_A_meta-analytic_review',
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
    url:
      'https://research.brighton.ac.uk/en/publications/the-relationship-between-materialism-and-personal-well-being-a-me/',
    strength: 'strong',
  },
  nicolao2009: {
    title: 'Nicolao, Irwin & Goodman, 2009',
    url:
      'https://news.utexas.edu/2009/02/10/new-happiness-research-demonstrates-when-material-items-are-the-best-option',
    strength: 'moderate',
  },
  vazire2010: {
    title: 'Vazire, 2010',
    url: 'https://source.washu.edu/2010/03/others-may-know-us-better-than-we-know-ourselves-study-finds/',
    strength: 'moderate',
  },
  // Behind the honest lines added on 2026-10-16, from the evidence library.
  aron1997: {
    title: 'Aron, Melinat, Aron, Vallone & Bator, 1997',
    url: 'https://journals.sagepub.com/doi/10.1177/0146167297234003',
    strength: 'moderate',
  },
  ayduk2010: {
    title: 'Ayduk & Kross, 2010',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2881638/',
    strength: 'moderate',
  },
  bankrate2021lending: {
    title: 'Bankrate, 2021',
    url: 'https://www.bankrate.com/pdfs/pr/20211213-lending-money-survey.pdf',
    strength: 'moderate',
  },
  baumeister2001: {
    title: 'Baumeister, Bratslavsky, Finkenauer & Vohs, 2001',
    url: 'https://assets.csom.umn.edu/assets/71516.pdf',
    strength: 'strong',
  },
  bohns2016: {
    title: 'Bohns, 2016',
    url: 'https://journals.sagepub.com/doi/10.1177/0963721415628011',
    strength: 'moderate',
  },
  bond2006: {
    title: 'Bond & DePaulo, 2006',
    url: 'https://journals.sagepub.com/doi/10.1207/s15327957pspr1003_2',
    strength: 'strong',
  },
  boothby2018: {
    title: 'Boothby, Cooney, Sandstrom & Clark, 2018',
    url: 'https://repository.essex.ac.uk/23025/1/The%20Liking%20Gap%20in%20Conversations.pdf',
    strength: 'moderate',
  },
  breines2012: {
    title: 'Breines & Chen, 2012',
    url: 'https://journals.sagepub.com/doi/10.1177/0146167212445599',
    strength: 'moderate',
  },
  buehler1994: {
    title: 'Buehler, Griffin & Ross, 1994',
    url: 'https://web.mit.edu/curhan/www/docs/Articles/biases/67_J_Personality_and_Social_Psychology_366,_1994.pdf',
    strength: 'strong',
  },
  chen2026savor: {
    title: 'Chen et al., 2026',
    url: 'https://www.synapsesocial.com/papers/69b258a396eeacc4fcec880f',
    strength: 'strong',
  },
  dunn2008: {
    title: 'Dunn, Aknin & Norton, 2008',
    url: 'https://www.nationalgeographic.com/science/article/money-can-buy-happiness-if-you-spend-it-on-other-people',
    strength: 'moderate',
  },
  falconier2015: {
    title: 'Falconier, Jackson, Hilpert & Bodenmann, 2015',
    url: 'https://folia.unifr.ch/global/documents/287390',
    strength: 'strong',
  },
  fehr2010: {
    title: 'Fehr, Gelfand & Nag, 2010',
    url:
      'https://ggsc.berkeley.edu/images/uploads/Fehr_et_al_2010_The_road_to_forgiveness-_A_meta-analytic_synthesis_of_its_situational_and_dispositional_correlates.pdf',
    strength: 'strong',
  },
  gachter2016: {
    title: 'Gächter & Schulz, 2016',
    url: 'https://www.nature.com/articles/nature17160',
    strength: 'moderate',
  },
  gottman: {
    title: "Gottman Institute (summarising Gottman & Levenson's couples research)",
    url: 'https://www.gottman.com/blog/the-four-horsemen/',
    strength: 'moderate',
  },
  jordan2011: {
    title: 'Jordan, Monin, Dweck, Lovett, John & Gross, 2011',
    url: 'https://journals.sagepub.com/doi/10.1177/0146167210390822',
    strength: 'moderate',
  },
  kardas2021: {
    title: 'Kardas, Kumar & Epley, 2021',
    url: 'https://www.apa.org/news/press/releases/2021/09/deep-conversations-strangers',
    strength: 'moderate',
  },
  kumar2018: {
    title: 'Kumar & Epley, 2018',
    url: 'https://www.psychologicalscience.org/uncategorized/people-underestimate-the-power-of-saying-thanks.html',
    strength: 'moderate',
  },
  levine2015: {
    title: 'Levine & Schweitzer, 2015',
    url: 'https://faculty.wharton.upenn.edu/wp-content/uploads/2014/12/Prosocial-Lies-OBHDP.pdf',
    strength: 'moderate',
  },
  levine2018: {
    title: 'Levine & Cohen, 2018',
    url: 'https://www.chicagobooth.edu/media-relations-and-communications/press-releases/people-can-handle-the-truth',
    strength: 'moderate',
  },
  lewicki2016: {
    title: 'Lewicki, Polin & Lount, 2016',
    url: 'https://news.osu.edu/the-6-elements-of-an-effective-apology-according-to-science/',
    strength: 'moderate',
  },
  liu2022: {
    title: 'Liu, Rim, Min & Min, 2022',
    url: 'https://www.apa.org/news/press/releases/2022/07/friends-enjoy-being-reached',
    strength: 'moderate',
  },
  madrian2001: { title: 'Madrian & Shea, 2001', url: 'https://www.nber.org/papers/w7682', strength: 'strong' },
  methot2015: {
    title: 'Methot, LePine, Podsakoff & Christian, 2015',
    url: 'https://www.psychologicalscience.org/?p=117456',
    strength: 'moderate',
  },
  muise2019: {
    title: 'Muise, Harasymchuk, Day, et al., 2019',
    url:
      'https://www.yorku.ca/research/2019/10/04/broadening-horizons-key-to-romantic-satisfaction-new-research-finds-2/',
    strength: 'moderate',
  },
  nawijn2010: {
    title: 'Nawijn, Marchand, Veenhoven & Vingerhoets, 2010',
    url: 'https://www.sciencedaily.com/releases/2010/02/100218125204.htm',
    strength: 'moderate',
  },
  nelson2008: {
    title: 'Nelson & Meyvis, 2008',
    url: 'https://journals.sagepub.com/doi/10.1509/jmkr.45.6.654',
    strength: 'moderate',
  },
  okeefe2018: {
    title: "O'Keefe, Dweck & Walton, 2018",
    url: 'https://journals.sagepub.com/doi/10.1177/0956797618780643',
    strength: 'moderate',
  },
  porath2013: {
    title: 'Porath & Pearson, 2013',
    url: 'https://www.sciencedaily.com/releases/2013/01/130130184048.htm',
    strength: 'moderate',
  },
  pronin2002: {
    title: 'Pronin, Lin & Ross, 2002',
    url: 'https://journals.sagepub.com/doi/10.1177/0146167202286008',
    strength: 'strong',
  },
  robbins2019: {
    title: 'Robbins & Karan, 2019',
    url: 'https://webarchive.ucr.edu/news.ucr.edu/articles/2019/05/03/uc-riverside-study-busts-myths-about-gossip.html',
    strength: 'moderate',
  },
  sandstrom2014: {
    title: 'Sandstrom & Dunn, 2014',
    url: 'https://repository.essex.ac.uk/15300/',
    strength: 'moderate',
  },
  schrodt2014: {
    title: 'Schrodt, Witt & Shimkowski, 2014',
    url: 'https://www.sciencedaily.com/releases/2014/08/140804122903.htm',
    strength: 'strong',
  },
  singh2023: {
    title: 'Singh, Olds, Curtis, Dumuid, Virgara, Watson et al., 2023',
    url: 'https://bjsm.bmj.com/content/57/18/1203',
    strength: 'strong',
  },
  steel2007: {
    title: 'Steel, 2007',
    url: 'https://sciencedaily.com/releases/2007/01/070110090851.htm',
    strength: 'strong',
  },
  stroebe2017: {
    title: 'Stroebe, Schut & Boerner, 2017',
    url: 'https://journals.sagepub.com/doi/10.1177/0030222817691870',
    strength: 'moderate',
  },
  webb2006: { title: 'Webb & Sheeran, 2006', url: 'https://eprints.whiterose.ac.uk/1580', strength: 'strong' },
  weinstein2010: { title: 'Weinstein & Ryan, 2010', url: 'https://repository.essex.ac.uk/1614/', strength: 'moderate' },
  wendsche2017: {
    title: 'Wendsche & Lohmann-Haislah, 2017',
    url: 'https://www.frontiersin.org/articles/10.3389/fpsyg.2016.02072/full',
    strength: 'strong',
  },
  whillans2017: {
    title: 'Whillans, Dunn, Smeets, Bekkers & Norton, 2017',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5559044/',
    strength: 'moderate',
  },
} satisfies Record<string, Source>

export type SourceKey = keyof typeof SOURCES

export type Line = { text: string; source: SourceKey }

export type TraitSide = {
  lean: string // what an answer leans towards: "Today your answers leaned towards {lean}"
  adj: string // "steady", for the weekly title's first word
  noun: string // "finisher", for its second
  quality: string // the tagline's opening: "steady follow-through"
  with: string // the tagline's closing: "a soft spot for a finished list"
  headline: string
  prediction: string
  strength: string // the good in it, for the close of a sitting
  grow: string // one way to grow, for the rest of the day
  // The honest part (Edwin, 2026-10-15: "not afraid of telling them the
  // negative things ... in a polite human language"): three lines on what
  // this leaning can cost, each from its own source.
  honest: [Line, Line, Line]
  edge: string // the cost in a clause: "This week, you were {adj} {noun}, and {edge}."
}

export type Trait = {
  name: string
  science: string // the research name, never shown
  research: string
  source: SourceKey
  high: TraitSide
  low: TraitSide
}

export const TRAITS: Record<string, Trait> = {
  conscientiousness: {
    name: 'Getting things done',
    science: 'Conscientiousness',
    research:
      'Across many studies, organised people tend to live longer, do better at work and keep steadier relationships.',
    source: 'roberts2007',
    high: {
      lean: 'getting things done',
      adj: 'steady',
      noun: 'finisher',
      quality: 'steady follow-through',
      with: 'a soft spot for a finished list',
      headline: 'You finish what you start.',
      prediction:
        "When a day gets crowded, you're likely the one who still closes the loop. Just watch that rest doesn't wait until everything is done.",
      strength: 'You tend to finish what you start, and people rely on you for it.',
      grow: 'Leave one small thing undone on purpose each day, so your rest stops depending on a cleared list.',
      honest: [
        {
          text:
            "When something you've worked hard for is taken away, like a job, the loss can hit you hard and linger. Your worth was never only in what you get done.",
          source: 'boyce2010',
        },
        {
          text:
            'A list that never quite ends can follow you home. Switching off in your free time goes hand in hand with better sleep and more energy, so give each day a clear finishing point.',
          source: 'wendsche2017',
        },
        {
          text:
            "When you fall short of your own standard, you can be hard on yourself. Meeting a slip with the kindness you'd show a friend tends to make you keener to put it right, not less.",
          source: 'breines2012',
        },
      ],
      edge: 'you may let rest wait too long',
    },
    low: {
      lean: 'keeping plans loose',
      adj: 'easygoing',
      noun: 'improviser',
      quality: 'an easy, flexible pace',
      with: 'room left for whatever the day brings',
      headline: 'You keep your plans loose.',
      prediction:
        "You adapt fast when plans change. The cost tends to show up in the small jobs that quietly pile up while you're busy with bigger things.",
      strength: 'You keep plans loose, which helps you adapt when the day changes.',
      grow:
        "Give one task a day a fixed moment, like 'right after lunch', so the important things get done without a full schedule.",
      honest: [
        {
          text:
            'Over the years, a loose approach can show in your health and your work. A few steady habits, like a set time for the dull jobs, are worth more than they look.',
          source: 'roberts2007',
        },
        {
          text:
            'The jobs you find dull or unpleasant are the ones most likely to slide. Pick the smallest piece of one and do it straight away, before your day moves on.',
          source: 'steel2007',
        },
        {
          text:
            "Meaning to do something and doing it can drift apart, even when you care. Tie a task to a set moment, like straight after lunch, so it doesn't rest on good intentions.",
          source: 'webb2006',
        },
      ],
      edge: 'small jobs can pile up',
    },
  },
  agreeableness: {
    name: 'Keeping the peace',
    science: 'Agreeableness',
    research:
      'Warmer, more agreeable people are more likely to help others, strangers included, across many situations.',
    source: 'graziano2007',
    high: {
      lean: 'keeping the peace',
      adj: 'warm',
      noun: 'peacemaker',
      quality: 'a warm, peacekeeping streak',
      with: 'a habit of putting others at ease',
      headline: 'You keep the peace.',
      prediction:
        "People probably feel safe bringing their problems to you. Notice the days you give way when you'd rather not; kindness counts for you too.",
      strength: 'You keep the peace, and people feel safe around you.',
      grow: "Practise one honest 'no' this week; kindness lasts longer when it includes you too.",
      honest: [
        {
          text:
            'Keeping the peace can cost you at work: this leaning tends to go with earning less. Before a pay talk, decide what you are worth and practise saying it plainly.',
          source: 'judge2012',
        },
        {
          text:
            "Because no can feel so awkward, you might say yes to things you'd rather not. Help you choose to give does you both good; help you feel pushed into does far less.",
          source: 'weinstein2010',
        },
        {
          text:
            "You can hold back a hard truth to spare someone's feelings. Said kindly, the truth lands better than you expect and often brings you closer, so start with a small one.",
          source: 'levine2018',
        },
      ],
      edge: 'you may say yes when you mean no',
    },
    low: {
      lean: 'saying what you think',
      adj: 'candid',
      noun: 'straight talker',
      quality: 'a candid, direct voice',
      with: 'a habit of saying what you mean',
      headline: 'You say what you think.',
      prediction:
        'People tend to know exactly where they stand with you. Your directness lands best when the other person feels heard first.',
      strength: 'You say what you think, which makes you a clear and useful voice.',
      grow: 'Ask one question before you give your view; people hear directness better when they feel heard first.',
      honest: [
        {
          text:
            "Over the years, a sharp edge can wear on your closest relationships. Say the warm things as plainly as the critical ones, so your honesty doesn't cost you closeness.",
          source: 'roberts2007',
        },
        {
          text:
            "Being direct is not the problem; a mocking or scornful edge is. When you're frustrated, say what you feel and need, and leave out the sarcasm and the eye-roll.",
          source: 'gottman',
        },
        {
          text:
            'In a rushed moment, your plain words can come across as curt, and the person on the receiving end tends to pull back and keep turning it over. A warm word first helps.',
          source: 'porath2013',
        },
      ],
      edge: 'bluntness can cost you closeness',
    },
  },
  openness: {
    name: 'Openness to new things',
    science: 'Openness',
    research: 'Openness goes with divergent thinking: coming up with more ideas, and more unusual ones.',
    source: 'mccrae1987',
    high: {
      lean: 'trying new things',
      adj: 'curious',
      noun: 'explorer',
      quality: 'a restless curiosity',
      with: 'an eye for the unfamiliar',
      headline: 'You reach for the new.',
      prediction:
        "You're quick to spot another way of doing things. Depth comes from staying with one new thing long enough to get good at it.",
      strength:
        'You reach for the new, which keeps life fresh and makes you good at spotting other ways of doing things.',
      grow: 'Pick one new interest and stay with it for a month, so curiosity turns into real skill.',
      honest: [
        {
          text:
            "The mind that finds new connections can also see patterns that aren't there. Test a bright idea against the plain facts before you bet on it.",
          source: 'blain2020',
        },
        {
          text:
            'A new interest can lose its shine as soon as it gets hard. Treat that dip as part of building it, not a sign you chose the wrong one.',
          source: 'okeefe2018',
        },
        {
          text:
            'Jumping between new things can mean few of them become second nature. A new habit takes months to settle, so give one a full season before you swap it for another.',
          source: 'lally2010',
        },
      ],
      edge: 'you may move on before things settle',
    },
    low: {
      lean: 'sticking with what works',
      adj: 'grounded',
      noun: 'keeper',
      quality: 'a grounded love of what works',
      with: 'a trust in the tried and true',
      headline: 'You trust what works.',
      prediction:
        "You're the steady one when everything around you changes. One small new thing a week keeps that steadiness from turning into a rut.",
      strength: 'You value what works, and that makes you steady and dependable.',
      grow: 'Try one small unfamiliar thing a week, a new route or a new dish, and notice what it teaches you.',
      honest: [
        {
          text:
            'When the usual way stops working, a fresh idea can be slow to come. Before you decide, list a few unlikely options next to the safe one and give each a fair look.',
          source: 'mccrae1987',
        },
        {
          text:
            "It's easy to decide a new interest just isn't you before you've given it a chance. Interests grow with time and effort, so give something unfamiliar a few goes.",
          source: 'okeefe2018',
        },
        {
          text:
            'Sticking with the familiar can let a close relationship settle into routine. If you have a partner, doing something new together, like a day trip or an unfamiliar dish, adds spark.',
          source: 'muise2019',
        },
      ],
      edge: 'new ideas may be slow to come',
    },
  },
  extraversion: {
    name: 'Energy from people',
    science: 'Extraversion',
    research: 'In daily life, people feel more upbeat in the moments they act outgoing, quieter people included.',
    source: 'fleeson2002',
    high: {
      lean: 'time with people',
      adj: 'lively',
      noun: 'connector',
      quality: 'a lively, social energy',
      with: 'a pull towards people',
      headline: 'People charge you up.',
      prediction:
        "A good conversation can lift your whole day. Protect a little quiet too; it's where your ideas get a chance to settle.",
      strength: 'People charge you up, and you likely lift the energy of a room.',
      grow: 'Protect some quiet time each week; it is where your best ideas tend to settle.',
      honest: [
        {
          text:
            'Your pull towards excitement can bring a risk of getting hurt along with the fun. Enjoy the rush, and keep the careful habits that let you enjoy the next one.',
          source: 'nettle2005',
        },
        {
          text:
            'When the fun is flowing, stopping feels wrong, yet a short pause tends to make good things more enjoyable when you return. Leave a little space between plans.',
          source: 'nelson2008',
        },
        {
          text:
            "Lots of chat can drift into talk about people who aren't there. Most of it is harmless; when it turns unkind, steer it back to something you'd say to their face.",
          source: 'robbins2019',
        },
      ],
      edge: 'the rush may carry a little risk',
    },
    low: {
      lean: 'time on your own',
      adj: 'quiet',
      noun: 'observer',
      quality: 'a quiet, watchful calm',
      with: 'a taste for small circles',
      headline: 'You recharge on your own.',
      prediction:
        'Your friendships likely run deep rather than wide. A short, low-key yes to company can refresh you more than you expect.',
      strength: 'You recharge alone and choose company with care, so your friendships tend to run deep.',
      grow: 'Say yes to one low-key invitation this week; small doses of company can refresh you too.',
      honest: [
        {
          text:
            "Staying in is easy to choose, even on days when company would have lifted you. Your mood tends to rise in the moments you act outgoing, even when it isn't your habit.",
          source: 'fleeson2002',
        },
        {
          text:
            'You may skip a chat with someone new, expecting it to be awkward. Those conversations usually go better than expected, deeper ones especially, so ask a real question next time.',
          source: 'kardas2021',
        },
        {
          text:
            'Keeping to a small circle can mean missing the lift of light, everyday chats. A few friendly words with a neighbour or someone at the till can brighten your day.',
          source: 'sandstrom2014',
        },
      ],
      edge: 'you may skip company that would lift you',
    },
  },
  neuroticism: {
    name: 'Worry and tension',
    science: 'Neuroticism',
    research:
      'People who feel stress more easily tend to have more health problems over a lifetime, which makes calming habits worth building.',
    source: 'lahey2009',
    high: {
      lean: 'worry',
      adj: 'sensitive',
      noun: 'feeler',
      quality: 'a sensitive, alert heart',
      with: 'feelings that run close to the surface',
      headline: 'Things stay with you.',
      prediction:
        'You often notice trouble early. Giving worries a set time each day, written down, tends to make them smaller.',
      strength: 'Things stay on your mind, which often means you care and notice early warning signs.',
      grow: 'Give worries a short, set time each day and write them down; a written worry tends to feel smaller.',
      honest: [
        {
          text:
            'Worry can cost you more than it seems. Over the years, a mind that is often on alert wears on the body too, so calming habits are worth building now.',
          source: 'lahey2009',
        },
        {
          text:
            'Worry tends to keep you in your head. Moving your body, whether a brisk walk, yoga or lifting weights, eases tension and low mood, so treat it as part of your calm.',
          source: 'singh2023',
        },
        {
          text:
            'A single sharp comment can outweigh a whole day of kind ones. Note your good moments too, even briefly, so they get a fair hearing next to the hard ones.',
          source: 'baumeister2001',
        },
      ],
      edge: 'a sharp word may stay with you',
    },
    low: {
      lean: 'staying calm',
      adj: 'calm',
      noun: 'anchor',
      quality: 'an unshaken calm',
      with: 'a long fuse',
      headline: 'Setbacks roll off you.',
      prediction:
        "When things go wrong, your calm gives others something to lean on. Check in on them afterwards; they may still be carrying what you've set down.",
      strength: 'Setbacks roll off you, and others may lean on your calm.',
      grow:
        'Check in on people around you after hard moments; they may still be carrying what you have already set down.',
      honest: [
        {
          text:
            'A setback that rolls off you can still be weighing on someone close, and low feelings are easy to hide. Check in again the next day, even if they seemed fine.',
          source: 'jordan2011',
        },
        {
          text:
            "When someone close is stressed, a quick 'it'll be fine' can feel to them like brushing it off. Listening first and tackling the problem together is what brings you closer.",
          source: 'falconier2015',
        },
        {
          text:
            'When a loss hits someone close, your steadiness helps, but their grief may not follow your pace. There is no right order or timetable, so let them take theirs.',
          source: 'stroebe2017',
        },
      ],
      edge: 'you may miss when someone is still shaken',
    },
  },
  honesty_humility: {
    name: 'Fairness',
    science: 'Honesty-Humility',
    research: 'Fair-mindedness predicts honest, rule-keeping behaviour at work better than the classic five traits do.',
    source: 'hexaco2005',
    high: {
      lean: 'playing fair',
      adj: 'fair',
      noun: 'truth-teller',
      quality: 'a quiet sense of fair play',
      with: "a line you won't cross",
      headline: 'You play fair, even unseen.',
      prediction:
        "People are likely to trust you with things that matter. Fairness includes asking for the credit you've earned.",
      strength: 'You hold to fair play even when no one is watching, and that builds deep trust.',
      grow: 'Let yourself ask for credit when you have earned it; fairness includes being fair to yourself.',
      honest: [
        {
          text:
            'Because you play straight, you may expect the same in return, and a smooth story can slip past. Check the facts before you trust a deal that matters.',
          source: 'bond2006',
        },
        {
          text:
            'A strong sense of fairness can make your own judgement feel beyond question. Blind spots are hardest to see from the inside, so ask someone you trust to check your thinking.',
          source: 'pronin2002',
        },
        {
          text:
            "When someone bends a rule you'd never bend, it can stay with you. Letting go comes more easily once you see their side, or once they own what they did and say sorry.",
          source: 'fehr2010',
        },
      ],
      edge: 'a smooth story may slip past you',
    },
    low: {
      lean: 'bending the rules',
      adj: 'pragmatic',
      noun: 'dealmaker',
      quality: 'a pragmatic, flexible streak',
      with: 'an eye for the shortcut',
      headline: 'You treat rules as flexible.',
      prediction:
        "You're resourceful under pressure. Before bending a rule, picture the person who pays for it; the shortcut can look different with a face on it.",
      strength: 'You treat rules as flexible, which can make you resourceful under pressure.',
      grow:
        'Before bending a rule, picture the person who pays for it; the shortcut often looks different with a face on it.',
      honest: [
        {
          text:
            "This leaning goes with bending rules at work, and small shortcuts can add up. Before you take one, ask whether you'd be at ease if it came to light.",
          source: 'hexaco2005',
        },
        {
          text:
            'A fib that serves you can cost you trust once it comes out, even a small one. Keep your word straight on the things people count on you for.',
          source: 'levine2015',
        },
        {
          text:
            'The shortcuts around you can make your own feel normal. Notice the places and company where cutting corners feels easy, and decide your line before you get there.',
          source: 'gachter2016',
        },
      ],
      edge: 'a shortcut can cost you trust',
    },
  },
  attachment_anxiety: {
    name: 'Reading closeness',
    science: 'Attachment anxiety',
    research:
      'Worry about closeness and keeping distance are two separate leanings, and most adults sit somewhere on both.',
    source: 'fraley',
    high: {
      lean: 'watching for distance',
      adj: 'attentive',
      noun: 'noticer',
      quality: 'an attentive heart',
      with: 'a radar tuned for silence',
      headline: 'You notice distance fast.',
      prediction:
        "You likely pick up a change in someone's mood before they say a word. When a silence worries you, one direct question usually beats an hour of guessing.",
      strength: 'You watch closely for signs of distance, which makes you attentive to the people you love.',
      grow:
        'When a silence worries you, ask directly instead of guessing; one simple question tends to bring more calm than hours of reading signs.',
      honest: [
        {
          text:
            'The worry can cost you the closeness you want: this leaning goes with more arguments and less contentment in relationships. Ask for reassurance directly instead of testing for it.',
          source: 'lichan2012',
        },
        {
          text:
            'When you sense distance, pressing for an answer can make someone pull back further, and the push and pull feeds itself. Say what you need once, then give it some room.',
          source: 'schrodt2014',
        },
        {
          text:
            'After time with someone, you may come away sure they liked you less than they did. Before reading a quiet reply as a bad sign, remember that hunch often undersells you.',
          source: 'boothby2018',
        },
      ],
      edge: 'you may read too much into silence',
    },
    low: {
      lean: 'trusting the quiet',
      adj: 'secure',
      noun: 'trustkeeper',
      quality: 'an easy, secure trust',
      with: 'a calm read on silence',
      headline: "Silence doesn't rattle you.",
      prediction:
        "You probably make the people close to you feel relaxed. Reaching out first now and then gives them the reassurance you don't need yourself.",
      strength: 'You rarely read distance as being about you, and that security makes you easy to be close to.',
      grow: 'Reach out first now and then; others may need the reassurance you do not.',
      honest: [
        {
          text:
            "Because silence doesn't worry you, you may not think to reach out. A quick message out of the blue means more to someone close than it seems from your side.",
          source: 'liu2022',
        },
        {
          text:
            "When things feel steady, thanks can go unsaid. Thanking someone close for what they've done, even in a short note, tends to delight them more than you'd expect.",
          source: 'kumar2018',
        },
        {
          text:
            "Your easy trust is a gift, but someone close to you may need reassurance you'd never think to ask for. Saying the obvious, like 'we're fine', can settle them.",
          source: 'fraley',
        },
      ],
      edge: 'reassurance may go unsaid',
    },
  },
  attachment_avoidance: {
    name: 'Keeping space',
    science: 'Attachment avoidance',
    research:
      'Worry about closeness and keeping distance are two separate leanings, and most adults sit somewhere on both.',
    source: 'fraley',
    high: {
      lean: 'keeping your space',
      adj: 'independent',
      noun: 'free spirit',
      quality: 'an independent streak',
      with: 'a door you like to keep ajar',
      headline: 'You keep a little space.',
      prediction:
        'You stand well on your own. Letting someone help with one small thing is a skill worth practising, and it tends to bring people closer.',
      strength: 'You keep some space, even with people you are close to, and you stand well on your own.',
      grow: 'Share one small worry with someone you trust this week; letting people help is a skill too.',
      honest: [
        {
          text:
            'The space you keep can cost you closeness: this leaning goes with feeling less supported and less content, even when nothing is wrong. Let someone in on one small worry.',
          source: 'lichan2012',
        },
        {
          text:
            "Keeping things light can hold people at arm's length. Closeness grows when you take turns sharing something a little more personal, so go one layer deeper.",
          source: 'aron1997',
        },
        {
          text:
            "You may hold off asking for help so as not to be a burden. Asking gets a yes far more often than you'd guess, so try it with something small.",
          source: 'bohns2016',
        },
      ],
      edge: 'you may hold back from asking for help',
    },
    low: {
      lean: 'letting people in',
      adj: 'open-hearted',
      noun: 'welcomer',
      quality: 'an open, welcoming heart',
      with: "a door that's always open",
      headline: 'You let people in.',
      prediction:
        'People likely feel at home around you quickly. Keep a little time just for you, so closeness stays a choice rather than a habit.',
      strength: 'You let people in easily, and they feel welcome around you.',
      grow: 'Keep a little time just for yourself each week, so closeness stays a choice rather than a habit.',
      honest: [
        {
          text:
            'Being close friends with many of your colleagues can wear you out, even while it helps your work. Notice when a friendship starts to feel like a duty, and keep some time just for you.',
          source: 'methot2015',
        },
        {
          text:
            'An open door can include your wallet. Lending money to friends or family can strain the very bond it was meant to help, so lend only what you could afford to give.',
          source: 'bankrate2021lending',
        },
        {
          text:
            "When closeness turns into always being on call, helping can start to feel like pressure. Your help does the most good when you choose it freely, so 'not today' is fine.",
          source: 'weinstein2010',
        },
      ],
      edge: 'closeness may leave little room for you',
    },
  },
  present_bias: {
    name: 'Now versus later',
    science: 'Present bias',
    research: 'People who favour now over later tend to carry more credit card debt.',
    source: 'meier2010',
    high: {
      lean: 'now over later',
      adj: 'spontaneous',
      noun: 'spark',
      quality: 'a spark for the moment',
      with: "a yes for what's in front of you",
      headline: 'Now tends to win.',
      prediction:
        'You know how to enjoy a moment. A ten-minute pause before a purchase lets the bigger reward catch up.',
      strength: 'The reward in front of you tends to win, which makes you good at enjoying the moment.',
      grow: 'Pause ten minutes before buying or saying yes to anything; the bigger reward often wins once you wait.',
      honest: [
        {
          text:
            'Now can be expensive. This leaning goes with carrying more credit card debt, so give a big buy a night to wait before you decide.',
          source: 'meier2010',
        },
        {
          text:
            'Saving that needs a fresh decision each month tends to lose out to today. Set it to happen automatically on payday, and let the default do the work for you.',
          source: 'madrian2001',
        },
        {
          text:
            'The dull job with a far-off payoff is the one that slips when now wins. Pair it with something you enjoy, like a favourite podcast, so it pays you back today.',
          source: 'steel2007',
        },
      ],
      edge: 'now may cost you later',
    },
    low: {
      lean: 'waiting for better',
      adj: 'patient',
      noun: 'builder',
      quality: 'patient, long-game thinking',
      with: 'a willingness to wait for better',
      headline: "You'll wait for better.",
      prediction:
        'Your patience is likely to pay off over years. Plan one small treat with no purpose at all, so the present feels good too.',
      strength: 'You will wait for the better result, and that patience tends to pay off.',
      grow:
        'Plan one small treat this week with no purpose at all; the future is easier to save for when the present feels good too.',
      honest: [
        {
          text:
            'Always choosing the sensible thing can turn into regret. Looking back, the pleasures you skipped tend to weigh on you more than the ones you had, so say yes to a treat.',
          source: 'kivetz2006',
        },
        {
          text:
            'Your mind can race ahead to the next goal while the good moment you earned slips by. Pausing to really notice it, even briefly, lets it count.',
          source: 'chen2026savor',
        },
        {
          text:
            'Saving every penny can mean doing every chore yourself. Paying now and then to free up some time tends to lift your mood more than buying another thing would.',
          source: 'whillans2017',
        },
      ],
      edge: "today's pleasures may wait too long",
    },
  },
  rumination: {
    name: 'Replaying',
    science: 'Rumination',
    research:
      'Going over problems without acting on them tends to deepen a low mood; a short distraction or one next step helps break the loop.',
    source: 'nolen2008',
    high: {
      lean: 'replaying hard moments',
      adj: 'reflective',
      noun: 'thinker',
      quality: 'a reflective, replaying mind',
      with: 'a habit of going over hard moments',
      headline: 'You replay hard moments.',
      prediction:
        'You care about getting things right. When a replay starts, moving your body tends to quiet the loop faster than thinking harder.',
      strength: 'You replay hard moments, which shows how much you care about getting things right.',
      grow: 'When a replay starts, get moving: walk, tidy or call someone. Busy hands tend to quiet a looping mind.',
      honest: [
        {
          text:
            'When you replay a problem, it rarely gets solved, and the replay tends to deepen a low mood. Step away first, then take one small action.',
          source: 'nolen2008',
        },
        {
          text:
            'When a hard moment replays, you relive it from the inside. Picturing it from a distance, like a fly on the wall, takes some heat out and shows you the bigger picture.',
          source: 'ayduk2010',
        },
        {
          text:
            'Going over the same worry again and again with friends can wear on them, however much they care. Share it, then ask them to help you find a next step.',
          source: 'nolen2008',
        },
      ],
      edge: 'you may replay hard moments too long',
    },
    low: {
      lean: 'letting things go',
      adj: 'fresh',
      noun: 'starter',
      quality: 'a knack for fresh starts',
      with: 'an easy way of letting go',
      headline: 'You let things go.',
      prediction:
        'Your days probably feel light. A one-minute look back after big moments turns them into lessons without weighing you down.',
      strength: 'Once something is over you let it go, which keeps your days light.',
      grow:
        'After big moments, take one minute to ask what you would do differently; a short look back turns experience into wisdom.',
      honest: [
        {
          text:
            'Letting go fast can mean skipping the lesson. A few minutes spent writing down what you learned tends to sharpen what you take from a day.',
          source: 'distefano2014',
        },
        {
          text:
            'Letting something go is not the same as settling it. If someone was hurt and you played a part, saying so plainly and offering to put it right matters most.',
          source: 'lewicki2016',
        },
        {
          text:
            'Leaving the past behind can mean forgetting how long things really took last time. Before you promise a date, recall the last similar job and plan for that.',
          source: 'buehler1994',
        },
      ],
      edge: 'the lesson may slip by',
    },
  },
  materialism: {
    name: 'Things or experiences',
    science: 'Materialism',
    research: 'Spending on experiences tends to bring more lasting happiness than spending on possessions.',
    source: 'vanboven2003',
    high: {
      lean: 'owning things',
      adj: 'practical',
      noun: 'collector',
      quality: 'a love of good things',
      with: 'an eye for quality you can hold',
      headline: 'Owning things matters to you.',
      prediction:
        'You care about comfort and quality. Asking what experience a purchase will give you tends to make the good feeling last longer.',
      strength: 'Owning things you want matters to you, and you likely care about quality and comfort.',
      grow:
        'Before your next purchase, ask what experience it will give you; the things that last are often tied to good memories.',
      honest: [
        {
          text:
            'Putting a lot of weight on owning things tends to go with feeling less satisfied, not more. When a buy feels urgent, ask what you are really hungry for.',
          source: 'dittmar2014',
        },
        {
          text:
            'A new thing gives you a lift, but shared plans and experiences tend to bring more lasting happiness. Next time, put some of that money towards doing something.',
          source: 'vanboven2003',
        },
        {
          text:
            "Spending on yourself can give less of a lift than you'd expect. A small treat for someone else, even a coffee, can leave you happier by the evening.",
          source: 'dunn2008',
        },
      ],
      edge: 'a new thing may not satisfy for long',
    },
    low: {
      lean: 'doing over owning',
      adj: 'adventurous',
      noun: 'wanderer',
      quality: 'a hunger for experiences',
      with: 'a preference for doing over having',
      headline: "You'd rather do than own.",
      prediction:
        'Your best memories probably come from places and people, not purchases. Experiences feel better still when the basics are covered.',
      strength: 'You would rather spend on doing than owning, which tends to bring lasting joy.',
      grow: 'Make sure the basics are covered first; experiences feel even better when bills are not on your mind.',
      honest: [
        {
          text:
            'Experiences are the bigger gamble. When one of yours goes badly, it tends to sting for longer than a disappointing purchase, so choose them with care.',
          source: 'nicolao2009',
        },
        {
          text:
            "Much of a trip's joy comes before you go, and the glow fades soon after you're home. Plan smaller things to look forward to, not just the one big trip.",
          source: 'nawijn2010',
        },
        {
          text:
            'Experiences give you the most when the basics are covered; when money is tight, their extra lift mostly fades. Sort the bills and a small cushion first, then plan the adventure.',
          source: 'vanboven2003',
        },
      ],
      edge: 'a let-down may sting for a while',
    },
  },
}

// The three places an honest line can show in one day. Each takes a
// different line of the three, and the lines move on a step each day.
export type Slot = 'morning' | 'evening' | 'mirror'
const SLOTS: Slot[] = ['morning', 'evening', 'mirror']

// honestLine picks the honest line for a slot on a date (YYYY-MM-DD), so the
// morning close, the evening close and the mirror never repeat one within a day.
export function honestLine(side: TraitSide, date: string, slot: Slot): Line {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400_000)
  return side.honest[(((day + SLOTS.indexOf(slot)) % 3) + 3) % 3]
}

// sideOf is a trait's side from a signed weight or a lean: high above zero.
export const sideOf = (t: Trait, high: boolean): TraitSide => (high ? t.high : t.low)

// an puts "a" or "an" before a word.
export const an = (word: string) => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`)
