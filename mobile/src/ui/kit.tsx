// The parts every screen is built from (mobile/DESIGN.md): type, buttons,
// fields, choices, chips, hairlines and the page itself.
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
import { font, gutter, lift, radius, RAIL_AT, RAIL_W, useTheme, WIDE, type Palette } from '../theme'
import { Icon, type IconName } from './Icon'
import { tr } from '@shared/i18n'

// ---- type ----

type Variant = 'display' | 'title' | 'h2' | 'h3' | 'body' | 'small' | 'tiny' | 'label' | 'eyebrow' | 'quote'
type Tone = 'text' | 'text2' | 'muted' | 'accent' | 'onNavy' | 'onNavy2' | 'danger' | 'leaf' | 'warm'

// X-style type (Edwin, 2026-10-27; a step smaller on 2026-10-28 to fit every
// screen): one face, few sizes, Bold headings (never
// extra bold) with tight tracking, compact body lines, and labels in sentence case rather
// than spaced capitals.
const VARIANTS: Record<Variant, TextStyle> = {
  display: { fontFamily: font.bold, fontSize: 27, lineHeight: 32, letterSpacing: -0.6 },
  title: { fontFamily: font.bold, fontSize: 20, lineHeight: 25, letterSpacing: -0.35 },
  h2: { fontFamily: font.bold, fontSize: 18, lineHeight: 22, letterSpacing: -0.2 },
  h3: { fontFamily: font.bold, fontSize: 16, lineHeight: 20, letterSpacing: -0.1 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 20 },
  small: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  tiny: { fontFamily: font.medium, fontSize: 12, lineHeight: 15 },
  label: { fontFamily: font.bold, fontSize: 12, lineHeight: 15 },
  eyebrow: { fontFamily: font.bold, fontSize: 12, lineHeight: 15 },
  // A line set apart: a quote, a thought, a direction. The same face, a
  // little larger and lighter than a heading.
  quote: { fontFamily: font.semibold, fontSize: 19, lineHeight: 25, letterSpacing: -0.2 },
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
      {typeof children === 'string' ? tr(children) : children}
    </Text>
  )
}

// Bold words inside a line of body text.
export function B({ children }: { children: ReactNode }) {
  return <Text style={{ fontFamily: font.bold }}>{children}</Text>
}

// React Native for Web adds `hovered` to a Pressable's state on a computer;
// a phone never sets it.
const hovered = (s: { pressed: boolean }) => !!(s as { hovered?: boolean }).hovered

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
      accessibilityLabel={tr(label)}
      disabled={off}
      onPress={onPress}
      style={(s) => [
        styles.btn,
        {
          backgroundColor: off && kind === 'primary' ? p.surface3 : hovered(s) && !off && (kind === 'outline' || kind === 'light' || kind === 'ghost') ? p.surface2 : l.bg,
          borderColor: l.border ?? 'transparent',
          borderWidth: l.border ? 1 : 0,
          minHeight: small ? 40 : kind === 'text' ? 36 : wide ? 56 : 48,
          paddingHorizontal: kind === 'text' ? 0 : small ? 16 : 24,
          alignSelf: wide ? 'stretch' : 'flex-start',
          borderRadius: small ? radius.pill : radius.md,
          opacity: s.pressed ? 0.85 : hovered(s) && !off && (kind === 'primary' || kind === 'soft') ? 0.92 : 1,
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Icon name={icon} size={18} color={fg} />}
          <Text style={{ fontFamily: kind === 'text' ? font.semibold : font.bold, fontSize: small || kind === 'text' ? 14 : wide ? 17 : 16, color: fg }}>{tr(label)}</Text>
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
      style={(s) => [styles.rowLink, { borderColor: hovered(s) ? p.lineStrong : p.line, backgroundColor: hovered(s) ? p.surface2 : p.surface, opacity: s.pressed ? 0.8 : 1 }]}
    >
      {icon}
      <View style={{ flex: 1 }}>
        <T v="h3">{tr(label)}</T>
        {sub ? <T v="small" tone="muted">{tr(sub)}</T> : null}
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
      style={(s) => {
        const lit = on || (hovered(s) && !disabled)
        return [styles.option, { backgroundColor: lit ? p.accentWash : p.surface, borderColor: lit ? p.accentLine : p.line, opacity: disabled ? 0.6 : 1 }]
      }}
    >
      <View style={[styles.optionRing, { borderColor: chosen ? p.lime : p.lineStrong, backgroundColor: chosen ? p.lime : p.surface }]}>
        {chosen && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: p.onLime }} />}
      </View>
      {icon ? <Text style={{ fontSize: 15, color: p.text }}>{icon}</Text> : null}
      <Text style={{ flex: 1, fontFamily: font.bold, fontSize: 16, lineHeight: 20, color: p.text }}>{tr(label)}</Text>
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
      <Text style={{ flex: 1, fontFamily: font.semibold, fontSize: 15, lineHeight: 20, color: p.text }}>{tr(label)}</Text>
    </Pressable>
  )
}

// A switch with its words: the label, and a quieter note under it.
export function Toggle({ label, note, value, onChange }: { label: string; note?: string; value: boolean; onChange: (on: boolean) => void }) {
  const p = useTheme()
  return (
    <View style={[styles.toggle, { borderColor: p.line }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="h3" style={{ fontSize: 15 }}>
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
      <Text style={{ fontFamily: on ? font.bold : font.semibold, fontSize: 14, color: on ? p.onLime : p.text }}>{tr(label)}</Text>
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
        placeholder={typeof rest.placeholder === 'string' ? tr(rest.placeholder) : rest.placeholder}
        style={[
          styles.field,
          { backgroundColor: p.surface, borderColor: p.line, color: p.text },
          rest.multiline && { minHeight: 112, lineHeight: 22, textAlignVertical: 'top', paddingTop: 12 },
          style,
        ]}
      />
    </View>
  )
}

// ---- layout ----

// The column of a page beside the sidebar: Facebook's feed width.
export const FEED = 680

// The page: the cream background, the gutter, room for the tab bar. Beside
// the wide-screen sidebar it gets roomier margins and the feed's width, plus
// wideMax for a page that draws its own right-hand column. A page can hand
// its side cards over as `aside`: from RAIL_AT they stand in a right-hand
// column, as on Facebook's home; narrower, they follow the page.
export function Page({
  children,
  aside,
  bottom = 32,
  refresh,
  scrollRef,
  wideMax,
}: {
  children: ReactNode
  aside?: ReactNode
  bottom?: number
  refresh?: number
  scrollRef?: Ref<ComponentRef<typeof ScrollView>>
  wideMax?: number
}) {
  const p = useTheme()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const wide = width >= WIDE
  const rail = !!aside && width >= RAIL_AT
  const extra = rail ? RAIL_W + 24 : (wideMax ?? 0)
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
          maxWidth: (wide ? FEED : 640) + (wide ? 80 : 0) + extra,
          width: '100%',
          alignSelf: 'center',
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {rail ? (
          <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
            <View style={{ flex: 1, gap: 20 }}>{children}</View>
            <View style={{ width: RAIL_W, gap: 20 }}>{aside}</View>
          </View>
        ) : (
          <>
            {children}
            {aside}
          </>
        )}
      </ScrollView>
      {/* The page colour behind the status bar, so words don't scroll under the clock. */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: p.bg }} />
    </View>
  )
}

// A Facebook-style card: one section of a page, white on the cream page with
// a hairline and the soft lift. Pages are a column of these.
export function Card({ children, style, pad = 20 }: { children: ReactNode; style?: StyleProp<ViewStyle>; pad?: number }) {
  const p = useTheme()
  return <View style={[{ backgroundColor: p.surface, borderColor: p.line, borderWidth: 1, borderRadius: radius.lg, padding: pad, gap: 12 }, lift(p), style]}>{children}</View>
}

export function Hairline({ style }: { style?: StyleProp<ViewStyle> }) {
  const p = useTheme()
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: p.lineStrong }, style]} />
}

// A highlighted box. Since 2026-10-28 (Edwin: "it should look more like
// today cards") every page uses Today's card: cream-white with a hairline and
// the soft lift, never a coloured fill. The tone stays in the signature so
// callers read as before; colour now lives only in the small icon discs.
export function Tinted({ children, style }: { tone?: 'accent' | 'amber' | 'rose' | 'blue' | 'purple' | 'plain'; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <Card style={style}>{children}</Card>
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
  field: { minHeight: 52, borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 12, fontFamily: font.regular, fontSize: 15 },
})
