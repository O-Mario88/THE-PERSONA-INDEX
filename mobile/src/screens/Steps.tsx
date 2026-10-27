// The small steps picked under a card, and how each went. Answers are kept
// on this device and sent with the shared moves.ts.
import { useState } from 'react'
import { View } from 'react-native'
import type { StepStatus } from '@shared/api'
import { isMidday } from '@shared/day'
import { movesOn, setMoveStatus, startedInEvening, type Move } from '@shared/moves'
import { loadJSON, saveJSON } from '@shared/storage'
import { NO_STEP, STEP_REPLIES } from '@shared/words'
import { Option, T } from '../ui/kit'

const laterKey = (date: string) => `pi.midday.${date}`
function middayLater(date: string): string[] {
  const v = loadJSON(laterKey(date))
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

// mode "morning": at the morning close, the midday check if it is midday.
// mode "midday": "Did you try it yet?" with Not yet.
// mode "evening": "How did it go?" with Not today.
export function Steps({ date, mode, label, emptyNote = true }: { date: string; mode: 'morning' | 'midday' | 'evening'; label?: string; emptyNote?: boolean }) {
  const [moves, setMoves] = useState<Move[]>(() => movesOn(date))
  const [later, setLater] = useState<string[]>(() => middayLater(date))
  const [midday] = useState(() => isMidday())
  const title = label ?? (moves.length > 1 ? 'Small steps for today' : 'One small step for today')
  if (moves.length === 0) {
    if (!emptyNote || mode !== 'morning') return null
    return (
      <View style={{ gap: 6 }}>
        <T v="eyebrow">{title}</T>
        <T tone="muted">{NO_STEP}</T>
      </View>
    )
  }
  function answer(m: Move, status: StepStatus) {
    setMoveStatus(m.questionId, status, date).catch(() => {})
    setMoves(moves.map((x) => (x.questionId === m.questionId ? { ...x, status } : x)))
  }
  function notYet(m: Move) {
    const next = [...later, m.questionId]
    saveJSON(laterKey(date), next)
    setLater(next)
  }
  const middayAsk = (m: Move) => (mode === 'midday' || (mode === 'morning' && midday)) && !startedInEvening(m) && !later.includes(m.questionId)
  return (
    <View style={{ gap: 12 }}>
      <T v="eyebrow">{title}</T>
      {moves.map((m) => (
        <View key={m.questionId} style={{ gap: 8 }}>
          <T v="h3">{m.step}</T>
          {m.status !== 'started' ? (
            <T tone="text2">{STEP_REPLIES[m.status]}</T>
          ) : mode === 'evening' ? (
            startedInEvening(m) && m.date === date ? (
              <T tone="muted">Started this evening. Give it a go tomorrow, and I'll ask how it went in your mirror.</T>
            ) : (
              <>
                <T tone="muted">How did it go?</T>
                <Option label="It helped" onPress={() => answer(m, 'helped')} />
                <Option label="No change yet" onPress={() => answer(m, 'no_change')} />
                <Option label="Not today" onPress={() => answer(m, 'not_tried')} />
              </>
            )
          ) : later.includes(m.questionId) ? (
            <T tone="muted">No rush. I'll ask again this evening.</T>
          ) : middayAsk(m) ? (
            <>
              <T tone="muted">Did you try it yet?</T>
              <Option label="Yes, it helped" onPress={() => answer(m, 'helped')} />
              <Option label="Yes, no change yet" onPress={() => answer(m, 'no_change')} />
              <Option label="Not yet" onPress={() => notYet(m)} />
            </>
          ) : null}
        </View>
      ))}
    </View>
  )
}
