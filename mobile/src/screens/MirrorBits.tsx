// Small pieces the Mirrors share: patterns, threads, the circle's line and
// the quiet text helpers.
import { useEffect, useState, type ReactNode } from 'react'
import { View } from 'react-native'
import type { Period } from '@shared/api'
import { connectionBetween, connectionLine } from '@shared/connection'
import { threadsBetween } from '@shared/journal'
import { circleLine } from '@shared/circleLine'
import { NEED_NAMES, NEED_PHRASES, type Need } from '@shared/needs'
import { checkPattern, patternCheckOf, patternsFor, type Pattern, type PatternCheck } from '@shared/patterns'
import { loadHistory } from '@shared/profile'
import { dayMonth } from '@shared/reflect'
import { accountToken, outsideMirror, type OutsideMirror } from '@shared/social'
import { font, lift, radius, useTheme } from '../theme'
import { Button, Chip, T } from '../ui/kit'

type Span = 'week' | Period

export function Eyebrow({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return (
    <T v="eyebrow" tone={accent ? 'accent' : 'muted'}>
      {children}
    </T>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <T v="small" tone="muted">
      {children}
    </T>
  )
}

// A quiet box for side notes, the "m-card" of the web page.
export function Box({ children, eyebrow }: { children: ReactNode; eyebrow?: string }) {
  const p = useTheme()
  return (
    <View style={[{ backgroundColor: p.surface, borderColor: p.line, borderWidth: 1, borderRadius: radius.lg, padding: 16, gap: 8 }, lift(p)]}>
      {eyebrow ? <Eyebrow accent>{eyebrow}</Eyebrow> : null}
      {children}
    </View>
  )
}

export function Chips({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
}

export function Quote({ children, big }: { children: ReactNode; big?: boolean }) {
  return <T style={{ fontFamily: font.semibold, fontSize: big ? 22 : 19, lineHeight: big ? 29 : 26 }}>{children}</T>
}


// ---- patterns, threads and connection (MirrorPatterns, MirrorThreads, MirrorConnection) ----

const PATTERN_REPLIES: Record<PatternCheck, string> = {
  yes: 'Kept. You said it still feels true.',
  partly: 'Kept. You said it’s partly true.',
  no: 'Retired. It won’t be called a pattern again unless new answers build it up.',
}
const PATTERN_LABELS: Record<Pattern['evidence'], string> = { pattern: 'A pattern worth exploring', noticing: 'Something you’ve been noticing' }

export function MirrorPatterns({ today }: { today: string }) {
  const [patterns] = useState(() => patternsFor(loadHistory(), today))
  return (
    <>
      {patterns.map((x) => (
        <PatternCard key={x.need} pattern={x} today={today} />
      ))}
      <Note>Worked out on this phone from your own answers of the last 30 days. Nothing here is sent.</Note>
    </>
  )
}

export function PatternCard({ pattern: x, today }: { pattern: Pattern; today: string }) {
  const [said, setSaid] = useState<PatternCheck | null>(() => patternCheckOf(x.need)?.check ?? null)
  const [asking, setAsking] = useState(said === null)
  function tap(check: PatternCheck) {
    checkPattern(x.need as Need, check, today)
    setSaid(check)
    setAsking(false)
  }
  return (
    <Box eyebrow={PATTERN_LABELS[x.evidence]}>
      <T v="h3">{NEED_NAMES[x.need]}</T>
      <T>
        In {x.answers} of your answers, on {x.days} days since {dayMonth(x.since)}, what you chose reached for {NEED_PHRASES[x.need]}.
      </T>
      {asking ? (
        <>
          <Note>Does this still feel true?</Note>
          <Chips>
            {(['yes', 'partly', 'no'] as const).map((c) => (
              <Chip key={c} label={c === 'yes' ? 'Yes' : c === 'partly' ? 'Partly' : 'No'} onPress={() => tap(c)} />
            ))}
          </Chips>
        </>
      ) : (
        said && (
          <View style={{ gap: 4 }}>
            <Note>{PATTERN_REPLIES[said]}</Note>
            {said !== 'no' && <Button kind="text" small label="Change" onPress={() => setAsking(true)} style={{ alignSelf: 'flex-start' }} />}
          </View>
        )
      )}
    </Box>
  )
}

export function MirrorThreads({ from, to, span }: { from: string; to: string; span: string }) {
  const threads = threadsBetween(from, to)
  return (
    <>
      {threads.map(({ root, count }) => (
        <View key={root.id} style={{ gap: 4 }}>
          <Quote>“{root.answer.length > 90 ? `${root.answer.slice(0, 90)}…` : root.answer}”</Quote>
          <Note>{count === 1 ? `Once this ${span}` : `${count} times this ${span}`}</Note>
        </View>
      ))}
      <Note>From your threads in Reflect, because you chose to let them in. Only on this phone.</Note>
    </>
  )
}

export function monthsBetween(from: string, to: string): { key: string; from: string; to: string }[] {
  const out: { key: string; from: string; to: string }[] = []
  const d = new Date(`${from.slice(0, 7)}-01T00:00:00Z`)
  while (d.toISOString().slice(0, 10) <= to) {
    const start = d.toISOString().slice(0, 10)
    const next = new Date(d)
    next.setUTCMonth(next.getUTCMonth() + 1)
    const end = new Date(next.getTime() - 86_400_000).toISOString().slice(0, 10)
    out.push({ key: start.slice(0, 7), from: start < from ? from : start, to: end > to ? to : end })
    d.setUTCMonth(d.getUTCMonth() + 1)
  }
  return out
}
const monthName = (key: string) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })

export function showConnection(from: string, to: string): boolean {
  return !!accountToken() || connectionBetween(from, to).days > 0
}

export function InConnection({ from, to, span }: { from: string; to: string; span: Span }) {
  const p = useTheme()
  const counts = connectionBetween(from, to)
  const months = span === 'quarter' || span === 'year' ? monthsBetween(from, to) : []
  return (
    <>
      <T tone="text2">{connectionLine(counts, span)}</T>
      {months.map((mo) => {
        const c = connectionBetween(mo.from, mo.to)
        const total = c.nod + c.share + c.support + c.celebrate
        return (
          <View key={mo.key} accessible accessibilityLabel={`${monthName(mo.key)}: ${total === 1 ? 'one move' : `${total} moves`}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <T v="small" tone="muted" style={{ width: 40 }}>
              {monthName(mo.key)}
            </T>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {Array.from({ length: Math.min(total, 8) }, (_, i) => (
                <View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.accentInk }} />
              ))}
            </View>
          </View>
        )
      })}
      <Note>Only what you did, kept on this phone. Never who, and never sent.</Note>
    </>
  )
}


// One perspective from the circle, once five friends have answered, and only
// where it meets the person's own answers (circleLine in the shared code).
export function CircleLine({ own }: { own: { trait: string; score: number }[] }) {
  const [o, setO] = useState<OutsideMirror | null>(null)
  useEffect(() => {
    if (!accountToken()) return
    let live = true
    outsideMirror().then(
      (x) => live && setO(x),
      () => {},
    )
    return () => {
      live = false
    }
  }, [])
  const line = circleLine(o, own)
  return line ? <T tone="text2">{line}</T> : null
}
