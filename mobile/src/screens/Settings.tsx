// Settings (the web app's Settings.tsx): three everyday choices, your name,
// intimacy questions and where you live, and the rest folded under "More
// settings", so it never feels like paperwork.
import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { countryOf, WORDS_DAYS, type Prefs, type WordsDays } from '@shared/prefs'
import { regionOf } from '@shared/regions'
import { MAX_NAME } from '@shared/Welcome'
import { COUNTRY_SETTING, REGIONAL_SWITCH } from '@shared/words'
import { useTheme } from '../theme'
import { Back, Button, Field, Hairline, Page, Radio, RowLink, T, Toggle } from '../ui/kit'
import { Icon } from '../ui/Icon'
import { BackupSettings } from './Backup'
import { CountrySelect } from './Country'

const WORDS_NAMES: Record<WordsDays, string> = { 7: 'One week', 35: 'Five weeks', 90: 'Three months' }

export function Settings({
  prefs,
  onChange,
  onBack,
  name,
  onName,
  onShowAll,
  onOpenKept,
  onRestored,
}: {
  prefs: Prefs
  onChange: (p: Prefs) => void
  onBack: () => void
  name: string
  onName: (n: string) => void
  onShowAll?: () => void
  onOpenKept: () => void
  onRestored: () => void
}) {
  const p = useTheme()
  const [draft, setDraft] = useState(name)
  const [more, setMore] = useState(false)
  return (
    <Page>
      <Back onPress={onBack} />
      <View style={{ gap: 6 }}>
        <T v="display">Settings</T>
        <T tone="text2">Everything here is optional. Change it whenever you like.</T>
      </View>

      <Hairline />
      <View style={{ gap: 10 }}>
        <T v="eyebrow">Your name</T>
        <Field
          note="For the greeting. It stays on this phone."
          placeholder="Your first name"
          accessibilityLabel="Your name"
          value={draft}
          maxLength={MAX_NAME}
          textContentType="givenName"
          onChangeText={setDraft}
          onBlur={() => onName(draft.trim())}
          onSubmitEditing={() => onName(draft.trim())}
        />
      </View>

      <Hairline />
      <View style={{ gap: 10 }}>
        <T v="eyebrow">Intimacy questions</T>
        <T v="small" tone="muted">
          Frank, never graphic, and always kept private.
        </T>
        <Radio label="I'm 18 or older" checked={prefs.adult === true} onPress={() => onChange({ ...prefs, adult: true })} />
        <Radio label="I'm under 18, or I'd rather not have them" checked={prefs.adult === false} onPress={() => onChange({ ...prefs, adult: false })} />
        {prefs.adult === true && <Toggle label="Keep it mild (no intimacy questions)" value={prefs.mild} onChange={(on) => onChange({ ...prefs, mild: on })} />}
      </View>

      <Hairline />
      <View style={{ gap: 10 }}>
        <T v="eyebrow">Where you live</T>
        <T v="small" tone="muted">
          {COUNTRY_SETTING}
        </T>
        <CountrySelect value={prefs.country ?? ''} withNone onChange={(country) => onChange({ ...prefs, country })} />
        {regionOf(countryOf(prefs)) && (
          <Toggle
            label={REGIONAL_SWITCH}
            value={prefs.regional !== false}
            onChange={(on) => {
              const { regional: _, ...rest } = prefs
              onChange(on ? rest : { ...rest, regional: false })
            }}
          />
        )}
      </View>

      <Hairline />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: more }}
        onPress={() => setMore(!more)}
        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}
      >
        <T v="h3">More settings</T>
        <View style={{ transform: [{ rotate: more ? '90deg' : '0deg' }] }}>
          <Icon name="chevron" size={20} color={p.text} />
        </View>
      </Pressable>
      {more && (
        <View style={{ gap: 20 }}>
          <View style={{ gap: 10 }}>
            <T v="eyebrow">Your own words</T>
            <T v="small" tone="muted">
              How long the words you type stay on this phone.
            </T>
            {WORDS_DAYS.map((d) => (
              <Radio key={d} label={WORDS_NAMES[d]} checked={prefs.wordsDays === d} onPress={() => onChange({ ...prefs, wordsDays: d })} />
            ))}
          </View>
          {onShowAll && (
            <View style={{ gap: 10 }}>
              <T v="eyebrow">Your first week</T>
              <T v="small" tone="muted">
                For your first week the app keeps to Today, Reflect and Insights. Connect and your Mirrors arrive as they fill in.
              </T>
              <Button small kind="soft" label="Show every section now" onPress={onShowAll} />
            </View>
          )}
          <BackupSettings onRestored={onRestored} />
        </View>
      )}

      <RowLink label="What I keep, and how to delete it" onPress={onOpenKept} />
    </Page>
  )
}
