// The Persona Index Patron (Edwin's brief, 2026-10-29): honest choices in the
// app's own voice, with no countdown, crossed-out price or fake discount. The
// app stays free every day; Patron keeps it independent and ad-free and opens
// the longer view. On a phone, plans are bought through the App Store or
// Google Play; prepaid passes with Mobile Money or a card are on the website
// (a phone app may not point to other ways to pay). Until payments are set
// up, a development server takes test purchases, so everything can be tried.
import { useEffect, useState } from 'react'
import { Platform, View } from 'react-native'
import { ApiError } from '@shared/api'
import { clearTestPurchases, PLAN_PRICES, patronLine, patronStatus, refreshPatron, testPurchase, type PatronInfo, type PatronPlan } from '@shared/patron'
import { radius, useTheme } from '../theme'
import { Icon } from '../ui/Icon'
import { Back, Button, Card, Page, T, Tinted } from '../ui/kit'
import { Mark } from '../ui/Logo'

const web = Platform.OS === 'web'

const ADDS = [
  'Conversation sheets across 14 and 30 days',
  'Speak instead, as often as you like',
  'Echoes across 3 months, 6 months and a year',
  'Walking alongside one person, on Sundays',
  'A quiet app icon and a guest PIN',
]

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
    { title: 'Patron', sub: 'Everything above, for as long as you like. Stop any time.', plans: ['monthly', 'yearly'] },
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
        <T tone="text2">The app stays free to use every day. Patron keeps it independent and free of ads, and opens the longer view of your own story.</T>
      </View>

      {line && (
        <Tinted>
          <T bold>{line}</T>
        </Tinted>
      )}

      <Card style={{ gap: 10 }}>
        <T v="h3">What Patron adds</T>
        {ADDS.map((a) => (
          <View key={a} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <Icon name="check" size={18} color={p.leaf} width={2.2} />
            <T tone="text2" style={{ flex: 1 }}>
              {a}
            </T>
          </View>
        ))}
      </Card>

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
                  kind={status.plan === plan ? 'outline' : 'soft'}
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
