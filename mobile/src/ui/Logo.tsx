// The Persona Index logo (Edwin, 2026-10-28): the sprout, drawn from the same
// paths as mobile/assets/brand/mark.svg, so the app icon and the logo inside
// the app are one mark. The vein is cut out of the light leaf, so it sits on
// any background, the Today wash included. Wordmark: THE / PERSONA INDEX,
// with the line "Understand. Grow. Be more you." when there is room.
import { useId } from 'react'
import { View } from 'react-native'
import Svg, { Defs, LinearGradient, Mask, Path, Rect, Stop } from 'react-native-svg'
import { font, useTheme } from '../theme'
import { T } from './kit'

export function Mark({ size = 28 }: { size?: number }) {
  // Ids unique per mark, so two marks on one page never share a gradient.
  const id = useId().replace(/:/g, '')
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityElementsHidden importantForAccessibility="no">
      <Defs>
        <LinearGradient id={`${id}d`} x1="0.05" y1="0.1" x2="0.9" y2="0.95">
          <Stop offset="0" stopColor="#2A6631" />
          <Stop offset="1" stopColor="#43923F" />
        </LinearGradient>
        <LinearGradient id={`${id}l`} x1="0.95" y1="0" x2="0.1" y2="1">
          <Stop offset="0" stopColor="#D6F462" />
          <Stop offset="0.5" stopColor="#AEDF4C" />
          <Stop offset="1" stopColor="#5BA539" />
        </LinearGradient>
        <LinearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#72B841" />
          <Stop offset="1" stopColor="#3F8B3A" />
        </LinearGradient>
        <Mask id={`${id}v`} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          <Rect width="100" height="100" fill="#ffffff" />
          <Path d="M51.5 71 C55 54 65 36 80 21" fill="none" stroke="#000000" strokeWidth={1.9} strokeLinecap="round" />
        </Mask>
      </Defs>
      <Path d="M48 94 C47 82 47.5 70 50.5 60" fill="none" stroke={`url(#${id}s)`} strokeWidth={3.6} strokeLinecap="round" />
      <Path d="M46.5 63 C28 68 4 52 4 19 C26 18 44 36 46.5 63 Z" fill={`url(#${id}d)`} />
      <Path d="M49.5 76 C79 70 96 42 94 4 C63 12 44 42 49.5 76 Z" fill={`url(#${id}l)`} mask={`url(#${id}v)`} />
    </Svg>
  )
}

// The lockup: the mark beside the name. tone 'onNavy' for the sidebar.
export function Logo({ size = 28, line = false, tone = 'text' }: { size?: number; line?: boolean; tone?: 'text' | 'onNavy' }) {
  const p = useTheme()
  const ink = tone === 'onNavy' ? p.onNavy : p.text
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="The Persona Index" style={{ flexDirection: 'row', alignItems: 'center', gap: Math.round(size * 0.35) }}>
      <Mark size={size} />
      <View style={{ gap: 1 }}>
        <T style={{ fontFamily: font.bold, fontSize: Math.max(9, size * 0.3), lineHeight: Math.max(11, size * 0.36), letterSpacing: 2, color: ink }}>THE</T>
        <T style={{ fontFamily: font.bold, fontSize: Math.max(12, size * 0.46), lineHeight: Math.max(15, size * 0.56), letterSpacing: 2, color: ink }}>PERSONA INDEX</T>
        {line ? (
          <T style={{ fontFamily: font.medium, fontSize: Math.max(8.5, size * 0.2), lineHeight: Math.max(11, size * 0.28), letterSpacing: 1.6, color: tone === 'onNavy' ? p.onNavy2 : p.muted }}>
            UNDERSTAND. GROW. BE MORE YOU.
          </T>
        ) : null}
      </View>
    </View>
  )
}
