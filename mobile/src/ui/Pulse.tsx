// The Human Pulse as every page draws it (shared rules in
// frontend/src/humanPulse.ts): one line with the same words everywhere, and
// one fetch a day shared by every page that asks.
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { loadPulse, pulseWords, type PulseCounts } from '@shared/humanPulse'
import type { NotAloneLine } from '@shared/insights'
import { useTheme } from '../theme'
import { Button, T } from './kit'
import { Disc } from './parts'

const loading = new Map<string, Promise<PulseCounts | null>>()

// usePulse is today's counts once the Human Pulse is on, or null.
export function usePulse(date: string | undefined, on: boolean): PulseCounts | null {
  const [counts, setCounts] = useState<PulseCounts | null>(null)
  useEffect(() => {
    if (!on || !date) return
    let live = true
    if (!loading.has(date)) loading.set(date, loadPulse(date))
    loading.get(date)!.then((c) => live && setCounts(c))
    return () => {
      live = false
    }
  }, [date, on])
  return on ? counts : null
}

// PulseLine: "37 of 140 people chose the same answer as you.", with a way to
// see more in Connect. Nothing at all when there is nothing honest to say.
export function PulseLine({ line, stale, onExplore, explore = 'See how others answered' }: { line: NotAloneLine | null; stale?: boolean; onExplore?: () => void; explore?: string }) {
  const p = useTheme()
  const words = line ? pulseWords(line) : null
  if (!words) return null
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <Disc icon="people" tone="blue" size={28} />
        <View style={{ flex: 1, gap: 2, paddingTop: 4 }}>
          <T bold>You’re not alone.</T>
          <T tone="text2">{words}</T>
          {stale ? (
            <T v="tiny" style={{ color: p.muted }}>
              From the last time you were online.
            </T>
          ) : null}
        </View>
      </View>
      {onExplore && <Button small kind="text" label={explore} iconAfter="arrow" onPress={onExplore} style={{ alignSelf: 'flex-start' }} />}
    </View>
  )
}
