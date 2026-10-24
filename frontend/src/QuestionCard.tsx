import { useEffect, useMemo, useState } from 'react'
import { keepStorage } from './pwa/install'
import {
  ApiError,
  castVote,
  CLOSED,
  dropVoteKey,
  earlierAnswer,
  MAX_FIRST_LINE,
  MAX_WORDS,
  OWN_WORDS,
  PRIVATE_OPTION,
  rateCard,
  recalledChoice,
  recalledDraft,
  recalledInstead,
  recalledVerdict,
  recalledWords,
  rememberAnswered,
  rememberChoice,
  rememberInstead,
  rememberRated,
  rememberSkip,
  rememberWords,
  saveDraft,
  SKIPPED,
  UNKNOWN,
  voteKey,
  type Instead,
  type Option,
  type OwnWords,
  type Question,
  type Sitting,
  type Verdict,
} from './api'
import { isEvening } from './day'
import { PulseAsk, PulsePill } from './Pulse'
import { hasPulse } from './pulse'
import { Helpline } from './Helpline'
import { moveFor, startMove } from './moves'
import { focusPlan, keepCard, keptCard, makePlan, noteVerdict, unkeepCard, type Plan } from './notebook'
import { inOrder } from './order'
import { loadPeople, namesLine } from './people'
import { PeopleEditor } from './People'
import { DEFAULT_WORDS_DAYS, helplineHere } from './prefs'
import { isLowMood, loadHistory, recalledAnswer, recordAnswer, recordSkip, recordVerdict, threadLine } from './profile'
import { isNeed, NEED_PHRASES, type Need } from './needs'
import { splitReveal } from './reveal'
import { onOtherTab } from './storage'
import { themeName, themeStyle, themeVars } from './themes'
import {
  CRISIS_LINE,
  focusTouch,
  HEAVY_HEADLINE,
  HEAVY_THANKS,
  LOCAL_NOTE,
  NO_PEOPLE,
  NOT_ME_REPLY,
  peopleAsk,
  SWAP_NOTE,
  VERDICT_REPLIES,
} from './words'

export type Done = 'answered' | 'skipped'

type Props = {
  question: Question
  date: string
  sitting?: Sitting
  wordsDays?: number
  writeFirst?: boolean // open with a short box for one's own words, the options after
  still?: boolean // show the card at once instead of unfolding it in three beats
  index?: number // where the card sits in its sitting, from 0
  of?: number
  pulse?: boolean // the Human Pulse: undefined until asked once, false for never
  onPulse?: (on: boolean) => void
  onDone?: (questionId: string, done: Done) => void
  onNext: () => void
}

// How the card is being answered: by tapping an option, by writing in one's
// own words, or by picking the option closest to those words.
type Mode = 'options' | 'writing' | 'closest'

// One question on its own screen. Tap an answer, or put it in your own
// words, and the same screen turns into what it says about you: the
// insight, one small step to try and a way to say whether it landed. Never
// what anyone else answered, and no score.
export function QuestionCard({
  question,
  date,
  sitting,
  wordsDays = DEFAULT_WORDS_DAYS,
  writeFirst = false,
  still = false,
  index,
  of,
  pulse,
  onPulse,
  onDone,
  onNext,
}: Props) {
  const [choice, setChoice] = useState<string | null>(() => recalledChoice(question.id))
  const [words, setWords] = useState<OwnWords | null>(() => recalledWords(question.id))
  const [draft, setDraft] = useState(() => (recalledChoice(question.id) ? '' : recalledDraft(question.id)))
  // A write-first card opens on a box for one line (Edwin, 2026-10-24); the
  // options follow as "which is closest?", or straight away on "Just tap instead".
  const [first, setFirst] = useState(() => writeFirst && !recalledChoice(question.id) && draft.length <= MAX_FIRST_LINE)
  const [mode, setMode] = useState<Mode>(() => (draft || first ? 'writing' : 'options'))
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Set when the server already had an earlier answer from this phone.
  const [kept, setKept] = useState(false)
  const theme = themeStyle(question.theme)
  const intimate = question.care === 'intimate'
  // Shuffled once per phone and question, never shallow to deep (order.ts).
  const options = useMemo(() => inOrder(question), [question])

  // Report a finished card, including one restored from storage.
  useEffect(() => {
    if (choice) onDone?.(question.id, choice === SKIPPED ? 'skipped' : 'answered')
  }, [choice, question.id, onDone])

  // Another tab on this phone may answer the same question: follow it, so
  // the person is never asked twice.
  useEffect(() => {
    const sync = () => {
      setChoice(recalledChoice(question.id))
      const w = recalledWords(question.id)
      setWords((was) => (JSON.stringify(was) === JSON.stringify(w) ? was : w))
    }
    // Once now as well, for anything another tab wrote between the first
    // render and this listener starting.
    sync()
    return onOtherTab(sync)
  }, [question.id])

  function editDraft(text: string) {
    setDraft(text)
    saveDraft(question.id, text)
  }

  // keep saves someone's own words on this phone, with the option that came
  // closest, if one did. Nothing here is sent.
  function keep(text: string, closest?: string) {
    const w: OwnWords = { questionId: question.id, date, prompt: question.prompt, words: text }
    if (question.theme) w.theme = question.theme
    if (intimate) w.private = true
    if (closest) w.closest = closest
    rememberWords(w, wordsDays)
    saveDraft(question.id, '')
    setWords(w)
  }

  function accepted(o: Option, typed?: string) {
    rememberChoice(question.id, o.id)
    recordAnswer(question, o.id, date)
    if (typed) keep(typed, o.label)
    setChoice(o.id)
  }

  // vote sends the tapped option; for an intimacy question only that it was
  // answered. typed carries the person's own words when they picked it as
  // the closest; the words stay here.
  async function vote(o: Option, typed?: string) {
    // A regional question is answered on this phone only: nothing is sent.
    if (question.local) {
      accepted(o, typed)
      return
    }
    setSending(true)
    setError(null)
    const sent = intimate ? PRIVATE_OPTION : o.id
    const send = () => castVote(question.id, sent, voteKey(question.id, sent), sitting)
    try {
      try {
        await send()
      } catch (e) {
        // A key from an older version of the app may belong to another
        // answer: take a new one and send once more.
        if (!(e instanceof ApiError && e.code === 'idempotency_key_reused')) throw e
        dropVoteKey(question.id)
        await send()
      }
      accepted(o, typed)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'duplicate_vote') {
        // This phone's answer is already counted. When it was an earlier
        // try that seemed to fail, that answer is the one kept.
        const earlier = intimate ? null : question.options.find((x) => x.id === earlierAnswer(question.id))
        if (earlier) {
          accepted(earlier)
          setKept(true)
        } else {
          if (typed) keep(typed)
          rememberAnswered(question.id)
          setChoice(recalledChoice(question.id))
        }
      } else {
        setError('Your answer did not go through. Please try again.')
      }
    } finally {
      setSending(false)
    }
  }

  // noneClose keeps the words with no option: no vote, no card.
  function noneClose() {
    keep(draft.trim())
    rememberChoice(question.id, OWN_WORDS)
    setChoice(OWN_WORDS)
  }

  function skip() {
    rememberSkip(question.id)
    recordSkip(question, date)
    setChoice(SKIPPED)
    onDone?.(question.id, 'skipped')
    onNext()
  }

  const headingId = `q-${question.id}`
  const closestId = `c-${question.id}`
  const wordsId = `w-${question.id}`
  const chosen = question.options.find((o) => o.id === choice)
  const answered = !!choice && choice !== SKIPPED
  const typed = draft.trim()
  const max = first ? MAX_FIRST_LINE : MAX_WORDS

  return (
    <section
      className={answered ? 'screen question answered' : 'screen question'}
      style={themeVars(question.theme)}
      aria-labelledby={headingId}
    >
      <span className="theme-chip">
        <span aria-hidden="true">{theme.icon}</span> {question.theme ? themeName(question.theme) : 'Today'}
      </span>
      <h2 id={headingId} className="prompt">
        {question.prompt}
      </h2>
      {question.local && <p className="muted local-note">{LOCAL_NOTE}</p>}

      {!choice && mode === 'options' && (
        <div className="options" role="group" aria-labelledby={headingId}>
          {options.map((o) => (
            <button key={o.id} type="button" className="option" disabled={sending} onClick={() => vote(o)}>
              {o.label}
            </button>
          ))}
          <button type="button" className="option own-button" disabled={sending} onClick={() => setMode('writing')}>
            <span aria-hidden="true">✎</span> In my own words
          </button>
          <button type="button" className="text-button skip" aria-label="Skip this one" disabled={sending} onClick={skip}>
            Skip
          </button>
        </div>
      )}

      {!choice && mode === 'writing' && (
        <form
          className="own"
          onSubmit={(e) => {
            e.preventDefault()
            if (typed) setMode('closest')
          }}
        >
          <label htmlFor={wordsId} className="eyebrow">
            {first ? 'Say it in one line' : 'In your own words'}
          </label>
          <textarea
            id={wordsId}
            className="own-box"
            value={draft}
            maxLength={max}
            rows={first ? 2 : 4}
            autoFocus={!first}
            placeholder="Say it the way it really is for you."
            onChange={(e) => editDraft(e.target.value)}
          />
          <p className="own-meta">
            <span>
              <span aria-hidden="true">🔒 </span>Kept on this phone. The app never sends it.
            </span>
            <span>{max - draft.length} left</span>
          </p>
          <div className="own-buttons">
            <button type="submit" className="pill-button" disabled={!typed}>
              Keep my words
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setFirst(false)
                setMode('options')
              }}
            >
              {first ? 'Just tap instead' : 'Back to the options'}
            </button>
          </div>
        </form>
      )}

      {!choice && mode === 'closest' && (
        <div className="own">
          <blockquote className="own-quote">“{typed}”</blockquote>
          <p id={closestId} className="own-ask">
            Which of these comes closest? Your insight comes from that one.
          </p>
          <div className="options" role="group" aria-labelledby={closestId}>
            {options.map((o) => (
              <button key={o.id} type="button" className="option" disabled={sending} onClick={() => vote(o, typed)}>
                {o.label}
              </button>
            ))}
            <div className="own-buttons">
              {/* After a failed vote the server may still have counted it, so
                  the only way on is to try that answer again. */}
              {!error && (
                <button type="button" className="text-button" disabled={sending} onClick={noneClose}>
                  None of these
                </button>
              )}
              <button type="button" className="text-button" disabled={sending} onClick={() => setMode('writing')}>
                Change my words
              </button>
            </div>
          </div>
        </div>
      )}

      {choice === SKIPPED && (
        <>
          <p className="muted">You skipped this one. That's fine.</p>
          <button type="button" className="next" onClick={onNext}>
            Next
          </button>
        </>
      )}

      {choice === UNKNOWN && (
        <>
          {words && <YourWords words={words} />}
          <p className="muted">You already answered this one on this phone.</p>
          <button type="button" className="next" onClick={onNext}>
            Next
          </button>
        </>
      )}

      {choice === CLOSED && (
        <>
          <p className="muted">
            You answered this one before you deleted everything. It stays closed today, so it isn't counted twice.
          </p>
          <button type="button" className="next" onClick={onNext}>
            Next
          </button>
        </>
      )}

      {choice === OWN_WORDS && (
        <div className="answer">
          {words ? <YourWords words={words} /> : <p className="muted">You answered this one in your own words.</p>}
          <p className="own-none">
            None of the options matched what you meant, so there is no card for this one. I'd rather say nothing than
            guess about you. Your words are kept in your mirror, on this phone only.
          </p>
          <button type="button" className="next" onClick={onNext}>
            Next
          </button>
        </div>
      )}

      {chosen && kept && (
        <p className="muted" role="status">
          Your first answer had already reached me, so that's the one I kept.
        </p>
      )}
      {chosen && (
        <Answer
          question={question}
          option={chosen}
          words={words}
          date={date}
          wordsDays={wordsDays}
          still={still}
          card={index !== undefined && of ? `Card ${index + 1} of ${of}` : undefined}
          pulse={pulse}
          onPulse={onPulse}
          onNext={onNext}
        />
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

// What someone wrote, quoted back to them, and the option they said came closest.
function YourWords({ words }: { words: OwnWords }) {
  return (
    <figure className="you-wrote">
      <figcaption className="eyebrow">In your words</figcaption>
      <blockquote className="own-quote">“{words.words}”</blockquote>
      {words.closest && (
        <p className="muted">
          Closest to: <span className="own-closest">{words.closest}</span>
        </p>
      )}
    </figure>
  )
}

// The card, in seven parts (the review of 2026-10-15): the answer or the
// person's own words; the headline; what it looks like in a day; the other
// side, what this answer can cost; the thread to earlier answers, when there
// is a true one; one small step; and whether it is them. A heavy answer gets
// none of that: a plain word, the person's own people and a helpline.
function Answer({
  question,
  option,
  words,
  date,
  wordsDays,
  still,
  card,
  pulse,
  onPulse,
  onNext,
}: {
  question: Question
  option: Option
  words: OwnWords | null
  date: string
  wordsDays: number
  still: boolean
  card?: string
  pulse?: boolean
  onPulse?: (on: boolean) => void
  onNext: () => void
}) {
  const insight = option.heavy ? undefined : option.insight
  // Worked out once, from the history this answer was just added to, and
  // put away if the person says the card is not them.
  const [thread] = useState(() => threadLine(loadHistory(), question, option.id, date))
  // The one thing the person is working on, when this answer touches it.
  const [focus] = useState(() => {
    const f = focusPlan()
    return f && (option.traits?.[f.trait] ?? 0) !== 0 ? f : null
  })
  const [notMe, setNotMe] = useState(() => recalledVerdict(question.id) === 'not_me')
  const counted = hasPulse(question) && !option.heavy
  return (
    <div className={still ? 'answer' : 'answer unfold'}>
      {card && <p className="card-count label">{card}</p>}
      {words ? (
        <YourWords words={words} />
      ) : (
        !insight && (
          <p className="you-chose">
            <span className="eyebrow">You chose</span>
            <span className="chosen">{option.label}</span>
          </p>
        )
      )}
      {option.heavy && <HeavyCard />}
      {insight && (
        <InsightPanel
          area={question.theme ? themeName(question.theme) : 'Today'}
          chose={words ? undefined : option.label}
          reveal={insight.reveal}
          otherSide={insight.otherSide}
          reach={notMe || !isNeed(option.need) ? null : option.need}
          thread={notMe ? null : thread}
          focus={notMe ? null : focus}
        />
      )}
      {counted && pulse === true && <PulsePill question={question} optionId={option.id} />}
      {counted && pulse === undefined && onPulse && <PulseAsk onAnswer={onPulse} />}
      {insight && <KeepThis question={question} option={option} words={words} date={date} />}
      {insight && isLowMood(question.theme, option.depth) && <Helpline />}
      {insight?.step && (
        <TryThis question={question} option={option} step={insight.step} needStep={insight.needStep} date={date} />
      )}
      {insight && (
        <Rate
          question={question}
          option={option}
          date={date}
          wordsDays={wordsDays}
          onVerdict={(v) => setNotMe(v === 'not_me')}
        />
      )}
      <button type="button" className="next" onClick={onNext}>
        Next
      </button>
    </div>
  )
}

// The card of a heavy answer (the proposal of 2026-10-24, "Heavy answers
// point to people"): no reading, no step, no rating. A plain word, the
// people the person keeps on this phone (or a way to add them) and where to
// find a helpline, every time.
function HeavyCard() {
  const [people, setPeople] = useState(loadPeople)
  const [adding, setAdding] = useState(false)
  const names = people?.names ?? []
  return (
    <div className="insight heavy" role="note" aria-label="That sounds really hard">
      <p className="insight-headline">{HEAVY_HEADLINE}</p>
      <p className="insight-body">{HEAVY_THANKS}</p>
      {names.length > 0 && <p className="insight-body">{peopleAsk(namesLine(names))}</p>}
      {people?.helps && <p className="insight-body">What helps, in your words: “{people.helps}”</p>}
      {names.length > 0 && <ReachOut names={names} />}
      {names.length === 0 && !adding && (
        <>
          <p className="insight-body">{NO_PEOPLE}</p>
          <button type="button" className="chip" onClick={() => setAdding(true)}>
            Add your people
          </button>
        </>
      )}
      {adding && (
        <PeopleEditor
          onSaved={() => {
            setPeople(loadPeople())
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
        />
      )}
      <Helpline />
      <p className="helpline">
        {CRISIS_LINE}{' '}
        <a href={helplineHere()} target="_blank" rel="noreferrer">
          Talk to someone now
        </a>
      </p>
      <p className="insight-note">For self-reflection, not a diagnosis.</p>
    </div>
  )
}

// ReachOut drafts a short message to one of the person's people and hands it
// to WhatsApp or the phone's messages, where they can change anything before
// sending. The app sends nothing and never sees the conversation.
function ReachOut({ names }: { names: string[] }) {
  const [to, setTo] = useState(names[0])
  const [text, setText] = useState(() => draftFor(names[0]))
  const [edited, setEdited] = useState(false)
  function pick(n: string) {
    setTo(n)
    if (!edited) setText(draftFor(n))
  }
  const body = encodeURIComponent(text)
  return (
    <div className="reach-out" role="group" aria-label="Reach out">
      <p className="insight-body strong">Could one of your people hear from you tonight?</p>
      <div className="chips" role="group" aria-label="Who">
        {names.map((n) => (
          <button key={n} type="button" className="chip-toggle" aria-pressed={to === n} onClick={() => pick(n)}>
            {n}
          </button>
        ))}
      </div>
      <label className="small muted" htmlFor="reach-text">
        Opens in your messages · edit anything before sending
      </label>
      <textarea
        id="reach-text"
        className="field reach-text"
        rows={2}
        value={text}
        maxLength={280}
        onChange={(e) => {
          setText(e.target.value)
          setEdited(true)
        }}
      />
      <div className="row-gap">
        <a className="btn small light" href={`https://wa.me/?text=${body}`} target="_blank" rel="noreferrer">
          WhatsApp
        </a>
        <a className="btn small outline" href={`sms:?&body=${body}`}>
          SMS
        </a>
      </div>
      <p className="insight-note">The app never sends anything for you and never sees the conversation.</p>
    </div>
  )
}

const draftFor = (name: string) => `Hey ${name}, had a heavy day. Free for a 5-minute call later?`

function InsightPanel({
  area,
  chose,
  reveal,
  otherSide,
  reach,
  thread,
  focus,
}: {
  area: string
  chose?: string // the option tapped, said small in the card's corner
  reveal: string
  otherSide?: string
  reach: Need | null // what the answer reached for: one soft line (needs.ts)
  thread: string | null
  focus: Plan | null
}) {
  const { headline, body } = splitReveal(reveal)
  return (
    <div className="insight" role="note" aria-label="What your answer may say">
      <p className="insight-top">
        <span className="insight-area">{area}</span>
        {chose && (
          <span className="insight-chose">
            <span className="sr-only">You chose: </span>
            {chose}
          </span>
        )}
      </p>
      <p className="insight-headline beat-1">{headline}</p>
      {body && <p className="insight-body beat-2">{body}</p>}
      {reach && (
        <p className="insight-reach beat-3">
          <span className="eyebrow">What it reached for</span> {NEED_PHRASES[reach]}
        </p>
      )}
      {otherSide && (
        <p className="insight-other beat-3">
          <span className="eyebrow">The other side</span> {otherSide}
        </p>
      )}
      {thread && (
        <p className="insight-thread">
          <span aria-hidden="true">↺ </span>
          {thread}
        </p>
      )}
      {focus && (
        <p className="insight-thread insight-focus">
          <span aria-hidden="true">→ </span>
          {focusTouch(focus.when, focus.will)}
        </p>
      )}
      <p className="insight-note">For self-reflection, not a diagnosis.</p>
    </div>
  )
}

// "Keep this" puts the card in My notebook, on this phone only: the day, the
// question, the answer or the person's own words, the card and, once given,
// whether it is them. Kept until they remove it.
function KeepThis({ question, option, words, date }: { question: Question; option: Option; words: OwnWords | null; date: string }) {
  const [kept, setKept] = useState(() => !!keptCard(question.id))
  function keep() {
    const insight = option.insight!
    const { headline, body } = splitReveal(insight.reveal)
    const verdict = recalledVerdict(question.id)
    keepCard({
      date,
      questionId: question.id,
      theme: question.theme ?? '',
      ...(question.care === 'intimate' ? { private: true as const } : {}),
      prompt: question.prompt,
      answer: words?.closest ?? option.label,
      ...(words ? { words: words.words } : {}),
      headline,
      ...(body ? { body } : {}),
      ...(insight.otherSide ? { otherSide: insight.otherSide } : {}),
      ...(insight.step ? { step: insight.step } : {}),
      ...(verdict && verdict !== 'rated' ? { verdict } : {}),
    })
    keepStorage()
    setKept(true)
  }
  function undo() {
    unkeepCard(question.id)
    setKept(false)
  }
  return (
    <div className="keep" role="group" aria-label="Keep this card">
      {kept ? (
        <>
          <p className="keep-done">
            <span aria-hidden="true">✓ </span>Kept in your notebook, on this phone only.
          </p>
          <button type="button" className="text-button" onClick={undo}>
            Undo
          </button>
        </>
      ) : (
        <button type="button" className="chip keep-button" onClick={keep}>
          <span aria-hidden="true">＋ </span>Keep this
        </button>
      )}
    </div>
  )
}

// One thing the person could try, offered, never prescribed (Edwin,
// 2026-10-24: the app helps people find their own answers rather than
// handing them out). "I'll try it" keeps it as one of today's small steps:
// the evening asks how a morning step went, and the mirror keeps them all.
// "My own idea" lets the person put it their own way, as their one plan,
// kept on this phone.
function TryThis({
  question,
  option,
  step,
  needStep,
  date,
}: {
  question: Question
  option: Option
  step: string
  needStep?: string // the second step, serving what the answer reached for
  date: string
}) {
  const [state, setState] = useState<'open' | 'started' | 'later' | 'own' | 'planned'>(() =>
    moveFor(question.id) ? 'started' : 'open',
  )
  const [evening] = useState(() => isEvening())
  // Two steps to pick from when the card has a second one (Stage 2 of the
  // proposal of 2026-10-24: the person chooses), the card's own first.
  const choices = needStep && needStep !== step ? [step, needStep] : [step]
  const [pick, setPick] = useState(0)
  const started = state === 'started' ? (moveFor(question.id)?.step ?? choices[pick]) : null
  function start() {
    setState('started')
    startMove(date, question.id, option.id, choices[pick], Date.now(), pick === 1, !!question.local).catch(() => {
      // kept on the phone, and sent again when the app next opens
    })
  }
  return (
    <div className="try" role="group" aria-label="Something to try">
      {started ? (
        <p>
          <strong>Something you'll try:</strong> {started}
        </p>
      ) : choices.length === 1 ? (
        <p>
          <strong>Something you could try:</strong> {step}
        </p>
      ) : (
        <fieldset className="try-choices">
          <legend>
            <strong>Something you could try:</strong> pick one.
          </legend>
          {choices.map((c, i) => (
            <label key={i} className="try-choice">
              <input type="radio" name={`try-${question.id}`} checked={pick === i} onChange={() => setPick(i)} />
              <span>{c}</span>
            </label>
          ))}
        </fieldset>
      )}
      {state === 'open' && (
        <div className="try-buttons">
          <button type="button" className="pill-button" onClick={start}>
            I'll try it
          </button>
          <button type="button" className="text-button" onClick={() => setState('own')}>
            My own idea
          </button>
          <button type="button" className="text-button" onClick={() => setState('later')}>
            Not now
          </button>
        </div>
      )}
      {state === 'own' && (
        <OwnIdea option={option} date={date} onMade={() => setState('planned')} onCancel={() => setState('open')} />
      )}
      {state === 'planned' && (
        <p className="muted">Your own plan, kept in your notebook. Next time you sit down, I'll ask how it went.</p>
      )}
      {state === 'started' && (
        <p className="muted">
          {evening
            ? "Added to your small steps. Give it a go tomorrow, and I'll ask how it went in your mirror."
            : "Added to today's small steps. I'll ask how it went this evening."}
        </p>
      )}
    </div>
  )
}

// OwnIdea: the person's own way of acting on the card, "When ___, I will
// ___", kept as the one thing they are working on (notebook.ts). Only
// whether they did it is ever sent.
function OwnIdea({ option, date, onMade, onCancel }: { option: Option; date: string; onMade: () => void; onCancel: () => void }) {
  const [when, setWhen] = useState('')
  const [will, setWill] = useState('')
  const [focus] = useState(focusPlan)
  const [trait, w] = Object.entries(option.traits ?? {}).find(([, v]) => v !== 0) ?? ['', 1]
  const ready = when.trim() && will.trim()
  return (
    <form
      className="plan-offer"
      aria-label="My own idea"
      onSubmit={(e) => {
        e.preventDefault()
        if (!ready) return
        makePlan({ made: date, trait, high: w > 0, when: when.trim(), will: will.trim() })
        onMade()
      }}
    >
      <p className="eyebrow">Your own way, tied to a moment</p>
      {focus && <p className="muted">{SWAP_NOTE}</p>}
      <label className="plan-field">
        <span>When</span>
        <input className="own-line" value={when} maxLength={MAX_PLAN} onChange={(e) => setWhen(e.target.value)} />
      </label>
      <label className="plan-field">
        <span>I will</span>
        <input className="own-line" value={will} maxLength={MAX_PLAN} onChange={(e) => setWill(e.target.value)} />
      </label>
      <p className="own-meta">
        <span>
          <span aria-hidden="true">🔒 </span>Your plan stays on this phone. I only ever send whether you did it.
        </span>
      </p>
      <div className="own-buttons">
        <button type="submit" className="pill-button" disabled={!ready}>
          Keep my plan
        </button>
        <button type="button" className="text-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

const MAX_PLAN = 80

// Rate asks whether the card is them: "That's me", "Partly" or "Not me"
// (chosen 2026-10-16, in place of "I learned something"). The tap is kept
// with the answer on this phone and in the mirror, and counted, never with
// words, so vague cards show up. "Not me" asks what is closer: the reading of
// another answer, or a line of the person's own that stays on this phone.
function Rate({
  question,
  option,
  date,
  wordsDays,
  onVerdict,
}: {
  question: Question
  option: Option
  date: string
  wordsDays: number
  onVerdict: (v: Verdict) => void
}) {
  const [verdict, setVerdict] = useState(() => recalledVerdict(question.id))
  function tap(v: Verdict) {
    setVerdict(v)
    onVerdict(v)
    rememberRated(question.id, v)
    recordVerdict(question.id, v)
    noteVerdict(question.id, v)
    // A regional question's tap stays on this phone with its answer.
    if (question.local) return
    const sent = question.care === 'intimate' ? PRIVATE_OPTION : option.id
    rateCard(question.id, sent, v).catch(() => {
      // a lost tap is not worth bothering anyone about
    })
  }
  if (verdict === 'not_me') return <Closer question={question} option={option} date={date} wordsDays={wordsDays} />
  if (verdict) return <p className="muted rate-thanks">{VERDICT_REPLIES[verdict]}</p>
  return (
    <div className="rate" role="group" aria-labelledby={`rate-${question.id}`}>
      <p id={`rate-${question.id}`} className="rate-ask">
        Does this sound like you?
      </p>
      <div className="rate-buttons">
        <button type="button" className="chip" onClick={() => tap('me')}>
          That's me
        </button>
        <button type="button" className="chip" onClick={() => tap('partly')}>
          Partly
        </button>
        <button type="button" className="chip" onClick={() => tap('not_me')}>
          Not me
        </button>
      </div>
    </div>
  )
}

// Closer follows "Not me": which reading is closer, or a line of one's own.
function Closer({ question, option, date, wordsDays }: { question: Question; option: Option; date: string; wordsDays: number }) {
  const others = useMemo(
    () => inOrder(question).filter((o) => o.id !== option.id && o.insight),
    [question, option.id],
  )
  const [closer, setCloser] = useState(() => recalledAnswer(question.id)?.closer?.optionId ?? null)
  const [instead, setInstead] = useState<Instead | null>(() => recalledInstead(question.id))
  const [line, setLine] = useState('')
  const [done, setDone] = useState(closer === NEITHER)
  const picked = others.find((o) => o.id === closer)

  function pick(o: Option) {
    recordVerdict(question.id, 'not_me', { optionId: o.id, traits: o.traits ?? {} })
    setCloser(o.id)
  }
  // "Neither" is kept too, so the card does not ask again.
  function neither() {
    recordVerdict(question.id, 'not_me', { optionId: NEITHER, traits: {} })
    setDone(true)
  }
  function keepLine() {
    const w: Instead = { questionId: question.id, date, words: line.trim() }
    rememberInstead(w, wordsDays)
    setInstead(w)
  }

  return (
    <div className="closer" role="group" aria-label="Not me">
      <p className="muted">{NOT_ME_REPLY}</p>
      {picked && <p className="closer-picked">Closer to you: “{splitReveal(picked.insight!.reveal).headline}”</p>}
      {instead && (
        <figure className="you-wrote">
          <figcaption className="eyebrow">In your words</figcaption>
          <blockquote className="own-quote">“{instead.words}”</blockquote>
        </figure>
      )}
      {!picked && !instead && !done && (
        <>
          <p className="rate-ask" id={`closer-${question.id}`}>
            What's closer to you?
          </p>
          <div className="closer-options" role="group" aria-labelledby={`closer-${question.id}`}>
            {others.map((o) => (
              <button key={o.id} type="button" className="option closer-option" onClick={() => pick(o)}>
                {splitReveal(o.insight!.reveal).headline}
              </button>
            ))}
          </div>
          <form
            className="own"
            onSubmit={(e) => {
              e.preventDefault()
              if (line.trim()) keepLine()
            }}
          >
            <label htmlFor={`instead-${question.id}`} className="eyebrow">
              Or in a line of your own
            </label>
            <input
              id={`instead-${question.id}`}
              className="own-line"
              value={line}
              maxLength={MAX_INSTEAD}
              onChange={(e) => setLine(e.target.value)}
            />
            <p className="own-meta">
              <span>
                <span aria-hidden="true">🔒 </span>Kept on this phone. The app never sends it.
              </span>
            </p>
            <div className="own-buttons">
              <button type="submit" className="pill-button" disabled={!line.trim()}>
                Keep my line
              </button>
              <button type="button" className="text-button" onClick={neither}>
                Neither
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  )
}

const MAX_INSTEAD = 140
// The closer reading kept when none of the others was closer.
const NEITHER = ''
