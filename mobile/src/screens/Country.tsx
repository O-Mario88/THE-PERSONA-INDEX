// Where someone lives (the web app's CountryViews.tsx): a picker with a
// search, filled in from the device's time zone, with "Prefer not to say".
import { useMemo, useState } from 'react'
import { FlatList, Modal, Pressable, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { countriesByName, countryName, guessCountry } from '@shared/country'
import { NO_COUNTRY } from '@shared/prefs'
import { COUNTRY_ASK, COUNTRY_KEEP, COUNTRY_NONE, COUNTRY_WHY } from '@shared/words'
import { font, gutter, radius, useTheme } from '../theme'
import { Button, Option, T, Tinted } from '../ui/kit'
import { Icon } from '../ui/Icon'

export function CountrySelect({ value, onChange, withNone }: { value: string; onChange: (c: string) => void; withNone?: boolean }) {
  const p = useTheme()
  const insets = useSafeAreaInsets()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const all = useMemo(() => countriesByName(), [])
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    const found = s ? all.filter((c) => c.name.toLowerCase().includes(s)) : all
    return withNone && !s ? [{ code: NO_COUNTRY, name: COUNTRY_NONE }, ...found] : found
  }, [all, q, withNone])
  const label = !value ? 'Choose a country' : value === NO_COUNTRY ? COUNTRY_NONE : countryName(value)
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Country: ${label}`}
        onPress={() => setOpen(true)}
        style={{ borderWidth: 1, borderColor: p.line, backgroundColor: p.surface, borderRadius: radius.lg, paddingHorizontal: 20, paddingVertical: 14, gap: 2 }}
      >
        <T v="small" tone="muted">
          Country
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T v="h3">{label}</T>
          <Icon name="chevron" size={18} color={p.text} />
        </View>
      </Pressable>
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: p.bg, paddingTop: Math.max(insets.top, 16), paddingHorizontal: gutter, gap: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 }}>
            <T v="h2">Where you live</T>
            <Button kind="text" label="Done" onPress={() => setOpen(false)} />
          </View>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search"
            placeholderTextColor={p.muted}
            autoCorrect={false}
            style={{ borderWidth: 1, borderColor: p.line, backgroundColor: p.surface2, borderRadius: radius.md, padding: 14, fontFamily: font.medium, fontSize: 16, color: p.text }}
          />
          <FlatList
            data={list}
            keyExtractor={(c) => c.code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: item.code === value }}
                onPress={() => {
                  onChange(item.code)
                  setOpen(false)
                }}
                style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: p.line, flexDirection: 'row', justifyContent: 'space-between' }}
              >
                <T bold={item.code === value}>{item.name}</T>
                {item.code === value && <Icon name="check" size={18} color={p.lime} />}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </>
  )
}

// Asked once, after a sitting.
export function CountryAsk({ onAnswer }: { onAnswer: (country: string) => void }) {
  const [pick, setPick] = useState(() => guessCountry() ?? '')
  return (
    <Tinted tone="plain">
      <T v="h2">{COUNTRY_ASK}</T>
      <T tone="muted">{COUNTRY_WHY}</T>
      <CountrySelect value={pick} onChange={setPick} />
      <Option label={COUNTRY_KEEP} disabled={!pick} onPress={() => onAnswer(pick)} />
      <Option label={COUNTRY_NONE} onPress={() => onAnswer(NO_COUNTRY)} />
    </Tinted>
  )
}
