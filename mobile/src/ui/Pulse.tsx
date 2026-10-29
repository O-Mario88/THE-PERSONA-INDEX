// The Human Pulse as every page draws it (shared rules in
// frontend/src/humanPulse.ts): one line with the same words everywhere, and
// one fetch a day shared by every page that asks.
import { useEffect, useState } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import { Text } from './textScale'
import { answerPulse, loadPulse, pulseWords, stepPulse, type PulseCounts } from '@shared/humanPulse'
import { tr, trf } from '@shared/i18n'
import type { NotAloneLine } from '@shared/insights'
import { getOthersHelped, type OthersStep } from '@shared/mirrorStory'
import { loadPrefs, pulseOn } from '@shared/prefs'
import { font, useTheme, typeScale } from '../theme'
import { Icon } from './Icon'
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

// The What helped totals for steps, fetched once and shared by every page.
let othersLoading: Promise<OthersStep[] | null> | null = null
export function useOthersSteps(on: boolean): OthersStep[] | null {
  const [steps, setSteps] = useState<OthersStep[] | null>(null)
  useEffect(() => {
    if (!on) return
    let live = true
    if (!othersLoading) othersLoading = getOthersHelped()
    othersLoading.then((s) => live && setSteps(s))
    return () => {
      live = false
    }
  }, [on])
  return on ? steps : null
}

// usePagePulse gives a page the Human Pulse for any item built from one of
// the person's answers (Edwin, 2026-10-29: every item you can relate to
// others carries it): how many chose the same answer, and what the people
// who tried a step found. Nothing while the Pulse is switched off on You.
export function usePagePulse(today: string | undefined) {
  const on = pulseOn(loadPrefs())
  const counts = usePulse(today, on)
  const steps = useOthersSteps(on)
  const t = (template: string, vars: Record<string, string | number> = {}) => trf(template, vars)
  return {
    answer: (questionId: string, optionId?: string) => answerPulse(counts?.questions ?? null, questionId, optionId, t),
    step: (questionId: string, optionId?: string) => stepPulse(steps, questionId, optionId, t),
  }
}

// PulseNote: the Pulse beside an item, one quiet line with the people icon.
// Nothing at all when there is nothing honest to say.
export function PulseNote({ text, style }: { text: string | null; style?: StyleProp<ViewStyle> }) {
  const p = useTheme()
  if (!text) return null
  return (
    <View accessible accessibilityLabel={`${tr('You’re not alone.')} ${text}`} style={[{ flexDirection: 'row', alignItems: 'center', gap: 6 }, style]}>
      <Icon name="people" size={15} color={p.blue} />
      <Text style={{ flex: 1, fontFamily: font.medium, ...typeScale.caption, color: p.text2 }}>{text}</Text>
    </View>
  )
}

// PulseLine: "37 of 140 people chose the same answer as you.", with a way to
// see more in Connect. Nothing at all when there is nothing honest to say.
export function PulseLine({ line, stale, onExplore, explore = 'Explore shared experiences' }: { line: NotAloneLine | null; stale?: boolean; onExplore?: () => void; explore?: string }) {
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
