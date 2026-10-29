// Where a Patron feature begins (Edwin's brief, 2026-10-29): one calm line
// saying what Patron adds, in the app's own voice. Never a countdown, a
// crossed-out price or a fake discount.
import { View } from 'react-native'
import { radius, useTheme } from '../theme'
import { Button, T } from './kit'
import { Mark } from './Logo'

// The Shell sets how the Patron page opens, so any screen can offer it.
let opener: (() => void) | null = null
export function setPatronOpener(fn: (() => void) | null): void {
  opener = fn
}
export const canOpenPatron = (): boolean => opener !== null
export function openPatron(): void {
  opener?.()
}

export function PatronNote({ text, onOpen }: { text: string; onOpen?: () => void }) {
  const p = useTheme()
  const open = onOpen ?? (opener ? openPatron : undefined)
  return (
    <View style={{ gap: 8, padding: 14, borderRadius: radius.md, backgroundColor: p.accentWash, borderWidth: 1, borderColor: p.accentLine }}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Mark size={18} />
        <T v="small" bold tone="accent">
          The Persona Index Patron
        </T>
      </View>
      <T v="small" tone="text2">
        {text}
      </T>
      {open && <Button small kind="soft" label="See Patron" onPress={open} />}
    </View>
  )
}
