// The Persona Index Patron (Edwin's brief, 2026-10-29): honest choices in the
// app's own voice, with no countdown, crossed-out price or fake discount. Help
// with a difficult moment stays free every day; Patron is built around three
// outcomes: preparing for a conversation, remembering what helps, and showing
// what is changing. On a phone, plans are bought through the App Store or
// Google Play; prepaid passes with Mobile Money or a card are on the website
// (a phone app may not point to other ways to pay). Until payments are set
// up, a development server takes test purchases, so everything can be tried.
import { useEffect, useState } from 'react'
import { Platform, View } from 'react-native'
import { ApiError } from '@shared/api'
import { clearTestPurchases, PLAN_PRICES, patronLine, patronStatus, refreshPatron, testPurchase, type PatronInfo, type PatronPlan } from '@shared/patron'
import { radius, useTheme } from '../theme'
import { Icon, type IconName } from '../ui/Icon'
import { Back, Button, Card, Page, T, Tinted } from '../ui/kit'
import { Mark } from '../ui/Logo'

const web = Platform.OS === 'web'

// The three outcomes Patron is for (Edwin's brief, 2026-10-29), then the rest.
const OUTCOMES: { icon: IconName; title: string; line: string }[] = [
  { icon: 'doc', title: 'Prepare for a conversation', line: 'A short brief for your partner, manager, mentor, counsellor or a friend, whenever you need one. Your first is free.' },
  { icon: 'bulb', title: 'Remember what helps me', line: 'When something similar happens again, I bring back the step you said helped and the day you tried it. Only ever from what you told me.' },
  {
    icon: 'refresh',
    title: 'Show me what is changing',
    line: 'Echoes that set today’s answer beside the same question three months, six months or a year ago, told honestly: mixed or unchanged included.',
  },
]
const ALSO = ['Speak instead, as often as you like']
// Never behind the paywall (Edwin, 2026-10-29: keep trust outside it).
const ALWAYS_FREE =
  'Always free: help with a difficult moment, your notebook, the weekly Mirror, the lock, the cover, the quiet icon and the guest PIN, Download my book, and deleting everything. If you stop, everything you made stays yours to read and download.'

type Choice = { title: string; sub: string; plans: PatronPlan[] }

export function PatronPage({ onBack }: { onBack: () => void }) {
  const p = useTheme()
  const [status, setStatus] = useState(patronStatus)
  const [info, setInfo] = useState<PatronInfo | null>(null)
  const [busy, setBusy] = useState<PatronPlan | 'clear' | null>(null)
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    refreshPatron().then((i) => {
      if (!live || !i) return
      setInfo(i)
      setStatus(patronStatus())
    })
    return () => {
      live = false
    }
  }, [])

  const choices: Choice[] = [
    { title: 'Patron', sub: 'All of the above, for as long as you like. Stop any time.', plans: ['monthly', 'yearly'] },
    { title: 'Duo', sub: 'Patron for you and the one person you walk alongside, on one plan.', plans: ['duo_monthly', 'duo_yearly'] },
    {
      title: 'Founding Member: keep it forever',
      sub: `Pay once and you’re never billed again.${info ? ` ${info.foundingLeft === 0 ? 'Every place is taken.' : `${info.foundingLeft.toLocaleString()} places left.`}` : ''}`,
      plans: ['founding'],
    },
    ...(web ? [{ title: 'A prepaid pass', sub: 'No recurring charge: pay once, by Mobile Money or a card.', plans: ['pass_90', 'pass_365'] as PatronPlan[] }] : []),
  ]

  async function take(plan: PatronPlan) {
    setBusy(plan)
    setNote(null)
    try {
      setInfo(await testPurchase(plan))
      setStatus(patronStatus())
    } catch (e) {
      setNote(e instanceof ApiError && e.code === 'founding_full' ? 'Every Founding place is taken.' : 'That didn’t go through. Please try again.')
    }
    setBusy(null)
  }

  async function clear() {
    setBusy('clear')
    const i = await clearTestPurchases().catch(() => null)
    if (i) setInfo(i)
    setStatus(patronStatus())
    setBusy(null)
  }

  const line = patronLine(status)
  const test = !!info?.test
  return (
    <Page>
      <Back onPress={onBack} />
      <View style={{ gap: 8 }}>
        <Mark size={40} />
        <T v="display">The Persona Index Patron</T>
        <T tone="text2">Help with a difficult moment is free, every day. Patron is the part that remembers across your weeks, and it keeps the app independent and free of ads.</T>
      </View>

      {line && (
        <Tinted>
          <T bold>{line}</T>
        </Tinted>
      )}

      <Card style={{ gap: 16 }}>
        <T v="h3">What Patron is for</T>
        {OUTCOMES.map((o) => (
          <View key={o.title} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <Icon name={o.icon} size={22} color={p.accentInk} />
            <View style={{ flex: 1, gap: 2 }}>
              <T bold>{o.title}</T>
              <T v="small" tone="text2">
                {o.line}
              </T>
            </View>
          </View>
        ))}
        <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: p.line, paddingTop: 12 }}>
          <T v="small" bold tone="muted">
            Also
          </T>
          {ALSO.map((a) => (
            <View key={a} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <Icon name="check" size={18} color={p.leaf} width={2.2} />
              <T v="small" tone="text2" style={{ flex: 1 }}>
                {a}
              </T>
            </View>
          ))}
        </View>
      </Card>

      <Tinted tone="accent">
        <T v="small">{ALWAYS_FREE}</T>
      </Tinted>

      {choices.map((c) => (
        <View key={c.title} style={{ gap: 10, padding: 18, borderRadius: radius.lg, borderWidth: 1, borderColor: p.line, backgroundColor: p.surface }}>
          <T v="h2">{c.title}</T>
          <T v="small" tone="text2">
            {c.sub}
          </T>
          {c.plans.map((plan) => (
            <View key={plan} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <T bold>{PLAN_PRICES[plan]}</T>
              {test && (
                <Button
                  small
                  kind="secondary"
                  label={status.plan === plan ? 'Yours' : 'Choose'}
                  busy={busy === plan}
                  disabled={status.plan === plan || (plan === 'founding' && info?.foundingLeft === 0)}
                  onPress={() => take(plan)}
                />
              )}
            </View>
          ))}
        </View>
      ))}

      {note && (
        <T v="small" tone="danger">
          {note}
        </T>
      )}
      <T v="small" tone="muted">
        {test
          ? 'This is a test server: purchases here are pretend and free, so you can try everything.'
          : web
            ? 'Payments by card and Mobile Money open here soon.'
            : `Payments open here soon, through ${Platform.OS === 'ios' ? 'the App Store' : 'Google Play'}.`}
      </T>
      {test && status.plan && <Button kind="text" label="Clear test purchases" busy={busy === 'clear'} onPress={clear} />}
    </Page>
  )
}
