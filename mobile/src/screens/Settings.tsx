// Settings: facts about you (your name, language, age and where you live),
// light or dark and the text size for every page, and the rest folded under "More settings".
// Every on/off choice lives on the You page (Privacy and choices, Edwin
// 2026-10-28).
import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { appearanceOf, textSizeOf, withAppearance, withTextSize, WORDS_DAYS, type Prefs, type TextSize, type WordsDays } from '@shared/prefs'
import { MAX_NAME } from '@shared/welcomeKeys'
import { COUNTRY_SETTING } from '@shared/words'
import { font, lift, radius, useTheme } from '../theme'
import { Back, Button, Card, feel, Field, Page, Radio, RowLink, Segmented, T } from '../ui/kit'
import { Icon } from '../ui/Icon'
import { BackupSettings } from './Backup'
import { CountrySelect } from './Country'
import { LANGS, tr } from '@shared/i18n'
import { Text } from '../ui/textScale'

const withoutLang = ({ lang: _, ...rest }: Prefs): Prefs => rest

const WORDS_NAMES: Record<WordsDays, string> = { 7: 'One week', 35: 'Five weeks', 90: 'Three months' }

// Each size shown as a letter at that size, as reading apps do: four words
// would not fit side by side on a small phone.
const TEXT_SIZE_CHOICES: { value: TextSize; label: string; glyph: number }[] = [
  { value: 'smaller', label: 'Smaller', glyph: 14 },
  { value: 'standard', label: 'Standard', glyph: 17 },
  { value: 'larger', label: 'Larger', glyph: 20 },
  { value: 'largest', label: 'Largest', glyph: 23 },
]

function TextSizePicker({ value, onChange }: { value: TextSize; onChange: (size: TextSize) => void }) {
  const p = useTheme()
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={tr('Text size')} style={{ flexDirection: 'row', padding: 3, gap: 3, borderRadius: radius.sm, backgroundColor: p.surface2 }}>
      {TEXT_SIZE_CHOICES.map((c) => {
        const on = c.value === value
        return (
          <Pressable
            key={c.value}
            accessibilityRole="radio"
            accessibilityLabel={tr(c.label)}
            accessibilityState={{ checked: on }}
            onPress={() => {
              feel('select')
              onChange(c.value)
            }}
            style={[{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 8 }, on && { backgroundColor: p.dark ? p.surface3 : p.surface }, on && lift(p)]}
          >
            {/* The letter keeps its own size: it shows the choice, whatever is chosen now. */}
            <Text maxScale={1} style={{ fontFamily: on ? font.bold : font.semibold, fontSize: c.glyph, lineHeight: 28, color: on ? p.text : p.text2 }}>
              A
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

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

      {/* Light or dark for every page (Edwin, 2026-10-28). */}
      <Card style={{ gap: 10 }}>
        <T v="eyebrow">Appearance</T>
        <T v="small" tone="muted">
          Light or dark, on every page. Automatic is dark in the evening and at night, and whenever your phone is set to dark.
        </T>
        <Segmented
          label="Appearance"
          value={appearanceOf(prefs)}
          onChange={(a) => onChange(withAppearance(prefs, a))}
          options={[
            { value: 'auto', label: 'Automatic' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </Card>

      {/* Text size for every word in the app (Edwin, 2026-10-29). */}
      <Card style={{ gap: 10 }}>
        <T v="eyebrow">Text size</T>
        <T v="small" tone="muted">
          Every word in the app grows or shrinks to match. Your phone’s own text size still adds to it.
        </T>
        <TextSizePicker value={textSizeOf(prefs)} onChange={(s) => onChange(withTextSize(prefs, s))} />
        <T v="small" tone="muted" center>
          {TEXT_SIZE_CHOICES.find((c) => c.value === textSizeOf(prefs))?.label ?? 'Standard'}
        </T>
        <View style={{ gap: 4, padding: 16, borderRadius: radius.md, backgroundColor: p.surface2 }}>
          <T v="h3">Where did you feel most like yourself today?</T>
          <T tone="text2">This is how your questions and readings will look.</T>
        </View>
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
                <Button small kind="secondary" label="Show every section now" onPress={onShowAll} />
              </View>
            )}
            <BackupSettings onRestored={onRestored} />
          </View>
        )}
      </Card>

      <RowLink label="What I keep, and how to delete it" onPress={onOpenKept} />
    </Page>
  )
}
