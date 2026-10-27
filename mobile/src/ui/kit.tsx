// The parts every screen is built from, matching the web app's base.css:
// type, buttons, fields, choices, chips, hairlines and the page itself.
import { useState, type ComponentRef, type ReactNode, type Ref } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { font, gutter, radius, useTheme, WIDE, type Palette } from '../theme'
import { Icon, type IconName } from './Icon'

// ---- type ----

type Variant = 'display' | 'title' | 'h2' | 'h3' | 'body' | 'small' | 'tiny' | 'label' | 'eyebrow' | 'serif'
type Tone = 'text' | 'text2' | 'muted' | 'accent' | 'onNavy' | 'onNavy2' | 'danger' | 'leaf' | 'warm'

const VARIANTS: Record<Variant, TextStyle> = {
  display: { fontFamily: font.heavy, fontSize: 34, lineHeight: 38, letterSpacing: -0.85 },
  title: { fontFamily: font.heavy, fontSize: 28, lineHeight: 32, letterSpacing: -0.7 },
  h2: { fontFamily: font.heavy, fontSize: 20, lineHeight: 25, letterSpacing: -0.3 },
  h3: { fontFamily: font.bold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 24 },
  small: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  tiny: { fontFamily: font.medium, fontSize: 12, lineHeight: 16 },
  label: { fontFamily: font.bold, fontSize: 12, lineHeight: 16, letterSpacing: 2.4, textTransform: 'uppercase' },
  eyebrow: { fontFamily: font.bold, fontSize: 12, lineHeight: 16, letterSpacing: 2.4, textTransform: 'uppercase' },
  serif: { fontFamily: 'Georgia', fontSize: 26, lineHeight: 32 },
}

function toneColor(p: Palette, tone: Tone): string {
  switch (tone) {
    case 'text':
      return p.text
    case 'text2':
      return p.text2
    case 'muted':
      return p.muted
    case 'accent':
      return p.accentInk
    case 'onNavy':
      return p.onNavy
    case 'onNavy2':
      return p.onNavy2
    case 'danger':
      return p.danger
    case 'leaf':
      return p.leaf
    case 'warm':
      return p.amberInk
  }
}

export function T({
  v = 'body',
  tone,
  bold,
  center,
  style,
  children,
  lines,
}: {
  v?: Variant
  tone?: Tone
  bold?: boolean
  center?: boolean
  style?: StyleProp<TextStyle>
  children: ReactNode
  lines?: number
}) {
  const p = useTheme()
  const t = tone ?? (v === 'eyebrow' ? 'accent' : v === 'label' || v === 'tiny' ? 'muted' : 'text')
  return (
    <Text
      numberOfLines={lines}
      accessibilityRole={v === 'display' || v === 'title' || v === 'h2' ? 'header' : undefined}
      style={[VARIANTS[v], { color: toneColor(p, t) }, bold && { fontFamily: font.bold }, center && { textAlign: 'center' }, style]}
    >
      {children}
    </Text>
  )
}

// Bold words inside a line of body text.
export function B({ children }: { children: ReactNode }) {
  return <Text style={{ fontFamily: font.bold }}>{children}</Text>
}

// ---- buttons ----

type Kind = 'primary' | 'soft' | 'ghost' | 'outline' | 'text' | 'danger' | 'light'

export function Button({
  kind = 'primary',
  wide,
  small,
  icon,
  iconAfter,
  disabled,
  busy,
  onPress,
  label,
  style,
}: {
  kind?: Kind
  wide?: boolean
  small?: boolean
  icon?: IconName
  iconAfter?: IconName
  disabled?: boolean
  busy?: boolean
  onPress: () => void
  label: string
  style?: StyleProp<ViewStyle>
}) {
  const p = useTheme()
  const look: Record<Kind, { bg: string; fg: string; border?: string }> = {
    primary: { bg: p.btn, fg: p.onBtn },
    soft: { bg: p.accentWash, fg: p.accentInk },
    ghost: { bg: p.surface2, fg: p.text },
    outline: { bg: 'transparent', fg: p.text, border: p.lineStrong },
    text: { bg: 'transparent', fg: p.accentInk },
    danger: { bg: 'transparent', fg: p.danger, border: p.danger },
    light: { bg: p.surface, fg: p.text, border: p.lineStrong },
  }
  const l = look[kind]
  const off = disabled || busy
  const fg = off && kind === 'primary' ? p.muted : l.fg
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off }}
      accessibilityLabel={label}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: off && kind === 'primary' ? p.surface3 : l.bg,
          borderColor: l.border ?? 'transparent',
          borderWidth: l.border ? 1 : 0,
          minHeight: small ? 40 : kind === 'text' ? 36 : wide ? 56 : 48,
          paddingHorizontal: kind === 'text' ? 0 : small ? 16 : 24,
          alignSelf: wide ? 'stretch' : 'flex-start',
          borderRadius: small ? radius.pill : radius.md,
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Icon name={icon} size={18} color={fg} />}
          <Text style={{ fontFamily: kind === 'text' ? font.semibold : font.bold, fontSize: small || kind === 'text' ? 14 : wide ? 17 : 16, color: fg }}>{label}</Text>
          {iconAfter && <Icon name={iconAfter} size={18} color={fg} />}
        </>
      )}
    </Pressable>
  )
}

// A row that opens something: words, then a chevron.
export function RowLink({ label, sub, onPress, icon }: { label: string; sub?: string; onPress: () => void; icon?: ReactNode }) {
  const p = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.rowLink, { borderColor: p.line, backgroundColor: p.surface, opacity: pressed ? 0.8 : 1 }]}
    >
      {icon}
      <View style={{ flex: 1 }}>
        <T v="h3">{label}</T>
        {sub ? <T v="small" tone="muted">{sub}</T> : null}
      </View>
      <Icon name="chevron" size={20} color={p.muted} />
    </Pressable>
  )
}

// ---- choices ----

// A card per answer, with an empty ring that fills on choice.
export function Option({ label, onPress, disabled, chosen, icon }: { label: string; onPress: () => void; disabled?: boolean; chosen?: boolean; icon?: string }) {
  const p = useTheme()
  const [down, setDown] = useState(false)
  const on = chosen || down
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, selected: !!chosen }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      style={[
        styles.option,
        { backgroundColor: on ? p.accentWash : p.surface, borderColor: on ? p.accentLine : p.line, opacity: disabled ? 0.6 : 1 },
      ]}
    >
      <View style={[styles.optionRing, { borderColor: chosen ? p.lime : p.lineStrong, backgroundColor: chosen ? p.lime : p.surface }]}>
        {chosen && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: p.onLime }} />}
      </View>
      {icon ? <Text style={{ fontSize: 16, color: p.text }}>{icon}</Text> : null}
      <Text style={{ flex: 1, fontFamily: font.bold, fontSize: 17, lineHeight: 22, color: p.text }}>{label}</Text>
    </Pressable>
  )
}

// A radio row, as in Settings.
export function Radio({ label, checked, onPress }: { label: string; checked: boolean; onPress: () => void }) {
  const p = useTheme()
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked }}
      onPress={onPress}
      style={[styles.option, { backgroundColor: checked ? p.accentWash : p.surface, borderColor: checked ? p.accentLine : p.line }]}
    >
      <View style={[styles.optionRing, { borderColor: checked ? p.lime : p.lineStrong }]}>
        {checked && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: p.lime }} />}
      </View>
      <Text style={{ flex: 1, fontFamily: font.semibold, fontSize: 16, lineHeight: 22, color: p.text }}>{label}</Text>
    </Pressable>
  )
}

// A switch with its words: the label, and a quieter note under it.
export function Toggle({ label, note, value, onChange }: { label: string; note?: string; value: boolean; onChange: (on: boolean) => void }) {
  const p = useTheme()
  return (
    <View style={[styles.toggle, { borderColor: p.line }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="h3" style={{ fontSize: 16 }}>
          {label}
        </T>
        {note ? <T v="small" tone="muted">{note}</T> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: p.lime, false: p.surface3 }}
        thumbColor="#ffffff"
        ios_backgroundColor={p.surface3}
      />
    </View>
  )
}

export function Chip({ label, on, onPress, icon }: { label: string; on?: boolean; onPress?: () => void; icon?: string }) {
  const p = useTheme()
  const body = (
    <View style={[styles.chip, { backgroundColor: on ? p.lime : p.surface2 }]}>
      {icon ? <Text style={{ fontSize: 14 }}>{icon}</Text> : null}
      <Text style={{ fontFamily: on ? font.bold : font.semibold, fontSize: 14, color: on ? p.onLime : p.text }}>{label}</Text>
    </View>
  )
  if (!onPress) return body
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!on }} onPress={onPress}>
      {body}
    </Pressable>
  )
}

// ---- fields ----

export function Field(props: TextInputProps & { label?: string; note?: string }) {
  const p = useTheme()
  const { label, note, style, ...rest } = props
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <T v="small" bold>
          {label}
        </T>
      ) : null}
      {note ? <T v="small" tone="muted">{note}</T> : null}
      <TextInput
        placeholderTextColor={p.muted}
        accessibilityLabel={label}
        {...rest}
        style={[
          styles.field,
          { backgroundColor: p.surface, borderColor: p.line, color: p.text },
          rest.multiline && { minHeight: 112, lineHeight: 24, textAlignVertical: 'top', paddingTop: 12 },
          style,
        ]}
      />
    </View>
  )
}

// ---- layout ----

// The page: the cream background, the gutter, room for the tab bar. Beside
// the wide-screen sidebar it gets the web's roomier margins (shell.css .page).
export function Page({ children, bottom = 32, refresh, scrollRef }: { children: ReactNode; bottom?: number; refresh?: number; scrollRef?: Ref<ComponentRef<typeof ScrollView>> }) {
  const p = useTheme()
  const insets = useSafeAreaInsets()
  const wide = useWindowDimensions().width >= WIDE
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <ScrollView
        key={refresh}
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: wide ? 40 : gutter,
          paddingTop: wide ? 32 : Math.max(insets.top, 20) + 8,
          paddingBottom: wide ? Math.max(bottom, 40) : bottom,
          gap: 20,
          maxWidth: wide ? 760 + 80 : 640,
          width: '100%',
          alignSelf: 'center',
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {children}
      </ScrollView>
      {/* The page colour behind the status bar, so words don't scroll under the clock. */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: p.bg }} />
    </View>
  )
}

export function Hairline({ style }: { style?: StyleProp<ViewStyle> }) {
  const p = useTheme()
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: p.lineStrong }, style]} />
}

// One of the few tinted boxes the redesign keeps.
export function Tinted({ tone = 'accent', children, style }: { tone?: 'accent' | 'amber' | 'rose' | 'blue' | 'purple' | 'plain'; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const p = useTheme()
  const bg = { accent: p.accentWash, amber: p.amberWash, rose: p.roseWash, blue: p.blueWash, purple: p.purpleWash, plain: p.surface }[tone]
  const border = tone === 'accent' ? p.accentLine : p.line
  return <View style={[{ backgroundColor: bg, borderColor: border, borderWidth: 1, borderRadius: radius.lg, padding: 20, gap: 12 }, style]}>{children}</View>
}

// The "Back" link at the top of an inner page.
export function Back({ onPress, label = 'Back' }: { onPress: () => void; label?: string }) {
  const p = useTheme()
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={12} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
      <Icon name="back" size={20} color={p.text} />
      <T v="body" bold>
        {label}
      </T>
    </Pressable>
  )
}

export function PrivacyLine({ onKept, onSettings }: { onKept?: () => void; onSettings?: () => void }) {
  return (
    <View style={{ gap: 10, marginTop: 8 }}>
      <T v="small" tone="muted">
        🔒 Private to you. I never show your answers to anyone, and the words you type stay on this phone.
      </T>
      <View style={{ flexDirection: 'row', gap: 20 }}>
        {onKept && <Button kind="text" small label="What I keep" onPress={onKept} />}
        {onSettings && <Button kind="text" small label="Settings" onPress={onSettings} />}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  rowLink: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: 20, paddingVertical: 18 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 64, borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: 20, paddingVertical: 16 },
  optionRing: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, paddingHorizontal: 16, borderRadius: radius.pill },
  field: { minHeight: 52, borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 12, fontFamily: font.regular, fontSize: 16 },
})
