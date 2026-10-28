// Settings: facts about you (your name, language, age and where you live) and
// the rest folded under "More settings". Every on/off choice lives on the You
// page instead (Privacy and choices, Edwin 2026-10-28).
import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { WORDS_DAYS, type Prefs, type WordsDays } from '@shared/prefs'
import { MAX_NAME } from '@shared/welcomeKeys'
import { COUNTRY_SETTING } from '@shared/words'
import { useTheme } from '../theme'
import { Back, Button, Card, Field, Page, Radio, RowLink, T } from '../ui/kit'
import { Icon } from '../ui/Icon'
import { BackupSettings } from './Backup'
import { CountrySelect } from './Country'
import { WebLockSettings } from './Browser'
import { LANGS } from '@shared/i18n'

const withoutLang = ({ lang: _, ...rest }: Prefs): Prefs => rest

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

      <Card style={{ gap: 10 }}>
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
      </Card>

      <Card style={{ gap: 10 }}>
        <T v="eyebrow">Language</T>
        <T v="small" tone="muted">
          The language the app speaks to you in.
        </T>
        <Radio label="Same as my phone" checked={!prefs.lang} onPress={() => onChange(withoutLang(prefs))} />
        {LANGS.map((l) => (
          <Radio key={l.id} label={l.name} checked={prefs.lang === l.id} onPress={() => onChange({ ...prefs, lang: l.id })} />
        ))}
      </Card>

      <Card style={{ gap: 10 }}>
        <T v="eyebrow">Intimacy questions</T>
        <T v="small" tone="muted">
          Frank, never graphic, and always kept private.
        </T>
        <Radio label="I'm 18 or older" checked={prefs.adult === true} onPress={() => onChange({ ...prefs, adult: true })} />
        <Radio label="I'm under 18, or I'd rather not have them" checked={prefs.adult === false} onPress={() => onChange({ ...prefs, adult: false })} />
      </Card>

      <Card style={{ gap: 10 }}>
        <T v="eyebrow">Where you live</T>
        <T v="small" tone="muted">
          {COUNTRY_SETTING}
        </T>
        <CountrySelect value={prefs.country ?? ''} withNone onChange={(country) => onChange({ ...prefs, country })} />
      </Card>

      <Card>
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
            <WebLockSettings />
            <BackupSettings onRestored={onRestored} />
          </View>
        )}

      </Card>

      <RowLink label="What I keep, and how to delete it" onPress={onOpenKept} />
    </Page>
  )
}
