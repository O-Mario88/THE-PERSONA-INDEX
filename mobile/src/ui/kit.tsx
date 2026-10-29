// The parts every screen is built from (mobile/DESIGN.md): type, buttons,
// fields, choices, chips, hairlines and the page itself.
import { Children, useEffect, useRef, useState, type ComponentRef, type ReactNode, type Ref } from 'react'
import * as Haptics from 'expo-haptics'
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  useWindowDimensions,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { Text, TextInput } from './textScale'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { brand, font, gutter, lift, radius, RAIL_AT, RAIL_W, useTheme, WIDE, type Palette, typeScale } from '../theme'
import { Icon, type IconName } from './Icon'
import { tr, uiLanguage } from '@shared/i18n'

// ---- type ----

type Variant = 'display' | 'title' | 'h2' | 'h3' | 'body' | 'reading' | 'small' | 'tiny' | 'label' | 'eyebrow' | 'quote'
type Tone = 'text' | 'text2' | 'muted' | 'accent' | 'onNavy' | 'onNavy2' | 'danger' | 'leaf' | 'warm'

// One face (Geist) and one scale (theme typeScale, the light-mode review of
// 2026-10-29): bold headings with tight tracking, semibold for row titles
// and labels, regular for reading, labels in sentence case. Body text is 16
// on 24 and readings 17 on 26, so a page reads easily at arm's length.
const VARIANTS: Record<Variant, TextStyle> = {
  display: { fontFamily: font.bold, ...typeScale.display, letterSpacing: -0.7 },
  title: { fontFamily: font.bold, ...typeScale.title, letterSpacing: -0.4 },
  h2: { fontFamily: font.bold, ...typeScale.heading, letterSpacing: -0.2 },
  h3: { fontFamily: font.semibold, ...typeScale.sub, letterSpacing: -0.1 },
  body: { fontFamily: font.regular, ...typeScale.body },
  reading: { fontFamily: font.regular, ...typeScale.reading },
  small: { fontFamily: font.regular, ...typeScale.small },
  tiny: { fontFamily: font.medium, ...typeScale.caption },
  label: { fontFamily: font.semibold, ...typeScale.caption },
  eyebrow: { fontFamily: font.semibold, ...typeScale.caption },
  // A line set apart: a quote, a thought, a direction. Heading size, a
  // little lighter than a heading.
  quote: { fontFamily: font.semibold, ...typeScale.heading, letterSpacing: -0.2 },
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
  const words = koreanBreaks()
  return (
    <Text
      numberOfLines={lines}
      accessibilityRole={v === 'display' || v === 'title' || v === 'h2' ? 'header' : undefined}
      lineBreakStrategyIOS={words.ios}
      style={[VARIANTS[v], { color: toneColor(p, t) }, bold && { fontFamily: font.bold }, center && { textAlign: 'center' }, words.style, style]}
    >
      {typeof children === 'string' ? tr(children) : children}
    </Text>
  )
}

// Korean wraps between words, never inside one (Edwin, 2026-10-28: Korean
// added). iOS has a Hangul word mode, the web has keep-all; Android wraps
// as it does.
const KEEP_ALL = { wordBreak: 'keep-all' } as TextStyle
export function koreanBreaks(): { ios?: 'hangul-word'; style?: TextStyle } {
  if (uiLanguage() !== 'ko') return {}
  return { ios: 'hangul-word', style: Platform.OS === 'web' ? KEEP_ALL : undefined }
}

// Bold words inside a line of body text.
export function B({ children }: { children: ReactNode }) {
  return <Text style={{ fontFamily: font.bold }}>{children}</Text>
}

// React Native for Web adds `hovered` to a Pressable's state on a computer;
// a phone never sets it.
const hovered = (s: { pressed: boolean }) => !!(s as { hovered?: boolean }).hovered

// ---- buttons ----

// One button system (the light-mode review, 2026-10-29): 'primary' (navy),
// 'secondary' (white with a quiet edge), 'text' (a link), 'danger', and
// 'warm', marigold with navy words, for the one main button on a midnight
// card. 'sprout', the logo's light leaf with navy words, is the Welcome's
// one brand moment and is used nowhere else.
type Kind = 'primary' | 'secondary' | 'text' | 'danger' | 'sprout' | 'warm'

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
    secondary: { bg: p.surface, fg: p.text, border: p.lineStrong },
    text: { bg: 'transparent', fg: p.accentInk },
    danger: { bg: 'transparent', fg: p.danger, border: p.danger },
    sprout: { bg: brand.sprout, fg: brand.onSprout },
    warm: { bg: brand.marigold, fg: brand.onMarigold },
  }
  const l = look[kind]
  const off = disabled || busy
  // A filled button that isn't ready yet stays itself, only fainter, so it
  // never passes for a second button.
  const filled = kind === 'primary' || kind === 'sprout' || kind === 'warm'
  const fg = l.fg
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off }}
      accessibilityLabel={tr(label)}
      disabled={off}
      onPress={() => {
        if (filled) feel('tap')
        onPress()
      }}
      hitSlop={small ? 4 : undefined}
      style={(s) => [
        styles.btn,
        {
          backgroundColor: hovered(s) && !off && kind === 'secondary' ? p.surface2 : l.bg,
          borderColor: l.border ?? 'transparent',
          borderWidth: l.border ? 1 : 0,
          // Curved corners, never a pill, and compact (Edwin, 2026-10-28).
          minHeight: small ? 38 : kind === 'text' ? 36 : wide ? 48 : 44,
          paddingHorizontal: kind === 'text' ? 0 : small ? 14 : 20,
          alignSelf: wide ? 'stretch' : 'flex-start',
          borderRadius: radius.sm,
          opacity: off && filled ? 0.4 : off ? 0.5 : s.pressed ? 0.85 : hovered(s) && filled ? 0.92 : 1,
          // A small press-down, the way the big apps answer a tap.
          transform: [{ scale: s.pressed && !off && kind !== 'text' ? 0.97 : 1 }],
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Icon name={icon} size={18} color={fg} />}
          <Text style={{ fontFamily: kind === 'text' ? font.semibold : font.bold, ...(small ? typeScale.small : typeScale.body), color: fg }}>{tr(label)}</Text>
          {iconAfter && <Icon name={iconAfter} size={18} color={fg} />}
        </>
      )}
    </Pressable>
  )
}

// A row that opens something: words, then a chevron. In a RowGroup it is a
// plain row of the group, the way settings lists look on the phone.
export function RowLink({ label, sub, onPress, icon, inGroup }: { label: string; sub?: string; onPress: () => void; icon?: ReactNode; inGroup?: boolean }) {
  const p = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        feel('tap')
        onPress()
      }}
      style={(s) => [
        styles.rowLink,
        inGroup
          ? { borderWidth: 0, borderRadius: 0, backgroundColor: hovered(s) || s.pressed ? p.surface2 : 'transparent' }
          : { borderColor: hovered(s) ? p.lineStrong : p.line, backgroundColor: hovered(s) ? p.surface2 : p.surface, opacity: s.pressed ? 0.8 : 1 },
      ]}
    >
      {icon}
      <View style={{ flex: 1 }}>
        <T v="h3">{tr(label)}</T>
        {sub ? (
          <T v="small" tone="muted">
            {tr(sub)}
          </T>
        ) : null}
      </View>
      <Icon name="chevron" size={20} color={p.muted} />
    </Pressable>
  )
}

// Rows that belong together in one group, with hairlines between them,
// instead of a card for every row (review, 2026-10-28).
export function RowGroup({ children }: { children: ReactNode }) {
  const p = useTheme()
  const rows = Children.toArray(children).filter(Boolean)
  return (
    <View style={[styles.group, { backgroundColor: p.surface, borderColor: p.line, borderWidth: p.dark ? 1 : 0 }, lift(p)]}>
      {rows.map((row, i) => (
        <View key={i}>
          {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: p.lineStrong, marginLeft: 20 }} />}
          {row}
        </View>
      ))}
    </View>
  )
}

// One choice out of a few, side by side, as the phone's own segmented control.
export function Segmented<V extends string>({ options, value, onChange, label }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void; label: string }) {
  const p = useTheme()
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={tr(label)} style={[styles.segmented, { backgroundColor: p.surface2 }]}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => {
              feel('select')
              onChange(o.value)
            }}
            style={styles.segment}
          >
            {/* The chosen one sits raised: white in light, a lighter step in dark. Always drawn and shown by
                opacity, so Android keeps its round corners. */}
            <View style={[styles.segmentFill, { backgroundColor: p.dark ? p.surface3 : p.surface, opacity: on ? 1 : 0 }, on && lift(p)]} />
            {/* Segments share one row, so their words grow only a little with the text size. */}
            <Text maxScale={1.1} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ fontFamily: on ? font.bold : font.semibold, ...typeScale.small, color: on ? p.text : p.text2 }}>
              {tr(o.label)}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

// ---- choices ----

// A card per answer, with an empty ring that fills on choice.
export function Option({ label, onPress, disabled, chosen, icon }: { label: string; onPress: () => void; disabled?: boolean; chosen?: boolean; icon?: IconName }) {
  const p = useTheme()
  const [down, setDown] = useState(false)
  const on = chosen || down
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, selected: !!chosen }}
      disabled={disabled}
      onPress={() => {
        feel('select')
        onPress()
      }}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      style={(s) => {
        const lit = on || (hovered(s) && !disabled)
        return [styles.option, { backgroundColor: lit ? p.accentWash : p.surface, borderColor: lit ? p.accentLine : p.line, opacity: disabled ? 0.6 : 1 }]
      }}
    >
      <View style={[styles.optionRing, { borderColor: chosen ? p.lime : p.control, backgroundColor: chosen ? p.lime : p.surface }]}>
        {chosen && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: p.onLime }} />}
      </View>
      {icon ? <Icon name={icon} size={18} color={p.text2} /> : null}
      <Text style={{ flex: 1, fontFamily: font.bold, ...typeScale.sub, color: p.text }}>{tr(label)}</Text>
    </Pressable>
  )
}

// A choice in a settings list: a plain row with a hairline above it and a
// tick on the chosen one, as the phone's own settings do (review,
// 2026-10-28: a box for every choice made Settings heavy).
export function Radio({ label, checked, onPress }: { label: string; checked: boolean; onPress: () => void }) {
  const p = useTheme()
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked }}
      onPress={() => {
        feel('select')
        onPress()
      }}
      style={(s) => [styles.radio, { borderTopColor: p.line, backgroundColor: hovered(s) || s.pressed ? p.surface2 : 'transparent' }]}
    >
      <Text style={{ flex: 1, fontFamily: checked ? font.bold : font.medium, ...typeScale.body, color: p.text }}>{tr(label)}</Text>
      {checked ? <Icon name="check" size={20} color={p.lime} width={2.4} /> : null}
    </Pressable>
  )
}

// A switch with its words: the label, and a quieter note under it. On the
// web an "on" switch's knob would otherwise be the browser library's teal.
const WEB_THUMB = (Platform.OS === 'web' ? { activeThumbColor: '#ffffff' } : {}) as object

export function Toggle({ label, note, value, onChange }: { label: string; note?: string; value: boolean; onChange: (on: boolean) => void }) {
  const p = useTheme()
  return (
    <View style={[styles.toggle, { borderColor: p.line }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="h3" style={typeScale.body}>
          {label}
        </T>
        {note ? (
          <T v="small" tone="muted">
            {note}
          </T>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={(on) => {
          feel('select')
          onChange(on)
        }}
        trackColor={{ true: p.lime, false: p.control }}
        thumbColor="#ffffff"
        ios_backgroundColor={p.control}
        {...WEB_THUMB}
      />
    </View>
  )
}

// A chip you can tap is white with an edge, navy once chosen; one that only
// names something (a theme, a group) is a quiet tag with no edge, so the two
// never look alike.
export function Chip({ label, on, onPress, icon }: { label: string; on?: boolean; onPress?: () => void; icon?: IconName }) {
  const p = useTheme()
  const tappable = !!onPress
  const body = (
    <View style={[styles.chip, { backgroundColor: on ? p.lime : tappable ? p.surface : p.surface2, borderWidth: 1, borderColor: on ? p.lime : tappable ? p.lineStrong : 'transparent' }]}>
      {icon ? <Icon name={icon} size={16} color={on ? p.onLime : p.text2} /> : null}
      <Text style={{ fontFamily: on ? font.bold : font.semibold, ...typeScale.small, color: on ? p.onLime : p.text }}>{tr(label)}</Text>
    </View>
  )
  if (!onPress) return body
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!on }}
      onPress={() => {
        feel('select')
        onPress()
      }}
    >
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
      {note ? (
        <T v="small" tone="muted">
          {note}
        </T>
      ) : null}
      <TextInput
        placeholderTextColor={p.muted}
        accessibilityLabel={label}
        {...rest}
        placeholder={typeof rest.placeholder === 'string' ? tr(rest.placeholder) : rest.placeholder}
        style={[
          styles.field,
          { backgroundColor: p.surface, borderColor: p.control, color: p.text },
          rest.multiline && { minHeight: 112, lineHeight: typeScale.body.lineHeight, textAlignVertical: 'top', paddingTop: 12 },
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
// Cards ease in when they first appear (a short fade and lift), unless the
// phone asks for reduced motion (Edwin, 2026-10-28: motion like the big apps).
let calm = false
AccessibilityInfo.isReduceMotionEnabled?.().then(
  (on) => (calm = on),
  () => {},
)
// And when it changes while the app is open.
AccessibilityInfo.addEventListener?.('reduceMotionChanged', (on) => (calm = on))
// Whether the phone asks for reduced motion, for the launch (Launch.tsx).
export const calmNow = () => calm

// A small tap of feedback under the finger on a phone, as the big apps give:
// 'select' for picking among choices, 'tap' for opening something, 'done'
// for finishing. Nothing on the web.
export function feel(kind: 'select' | 'tap' | 'done') {
  if (Platform.OS === 'web') return
  const go =
    kind === 'select' ? Haptics.selectionAsync() : kind === 'tap' ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  go.catch(() => {})
}
const EASE_MS = 220

function useEaseIn() {
  const v = useRef(new Animated.Value(calm ? 1 : 0)).current
  useEffect(() => {
    if (calm) return
    Animated.timing(v, { toValue: 1, duration: EASE_MS, useNativeDriver: Platform.OS !== 'web' }).start()
    // A card must never stay hidden, even if an animation can't run.
    const done = setTimeout(() => v.setValue(1), EASE_MS + 200)
    return () => clearTimeout(done)
  }, [v])
  return { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }
}

// In light mode a card is white on the cream page with only its soft lift, no
// outline; in dark mode a hairline marks its edge, where a shadow can't
// (review, 2026-10-28).
export function Card({ children, style, pad = 20 }: { children: ReactNode; style?: StyleProp<ViewStyle>; pad?: number }) {
  const p = useTheme()
  const ease = useEaseIn()
  return (
    <Animated.View style={[{ backgroundColor: p.surface, borderColor: p.line, borderWidth: p.dark ? 1 : 0, borderRadius: radius.lg, padding: pad, gap: 12 }, lift(p), style, ease]}>
      {children}
    </Animated.View>
  )
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

// A privacy note with the lock icon, the same everywhere (no emoji).
export function Private({ children }: { children: string }) {
  const p = useTheme()
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
      <View style={{ paddingTop: 2 }}>
        <Icon name="lock" size={14} color={p.muted} />
      </View>
      <T v="small" tone="muted" style={{ flex: 1 }}>
        {children}
      </T>
    </View>
  )
}

export function PrivacyLine({ onKept, onSettings }: { onKept?: () => void; onSettings?: () => void }) {
  return (
    <View style={{ gap: 10, marginTop: 8 }}>
      <Private>Private to you. I never show your answers to anyone, and the words you type stay on this phone.</Private>
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
  group: { borderRadius: radius.lg, overflow: 'hidden' },
  segmented: { flexDirection: 'row', padding: 3, borderRadius: radius.sm, gap: 3 },
  segment: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8, paddingHorizontal: 8 },
  segmentFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 8 },
  radio: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 12, paddingHorizontal: 4, borderTopWidth: StyleSheet.hairlineWidth },
  option: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 64, borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: 20, paddingVertical: 16 },
  optionRing: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36, paddingHorizontal: 14, borderRadius: radius.sm },
  field: { minHeight: 52, borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 12, fontFamily: font.regular, ...typeScale.body },
})
