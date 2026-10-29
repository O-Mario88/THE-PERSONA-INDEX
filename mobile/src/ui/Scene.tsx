// Small drawings in the sunrise style of the Welcome (the light-mode review,
// 2026-10-29: an empty page should still feel like the app). Hills, mist, a
// sun and the sprout, drawn in code so nothing more downloads, in light and
// dark. EmptyState puts one above a title, a line and one clear action.
import type { ReactNode } from 'react'
import { View } from 'react-native'
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import { brand, useTheme } from '../theme'
import { Button, Card, T } from './kit'

export type SceneKind = 'dawn' | 'lake' | 'night'

const W = 320
const H = 150

export function Scene({ kind, height = 130 }: { kind: SceneKind; height?: number }) {
  const p = useTheme()
  const night = kind === 'night' || p.dark
  const sky = night ? ['#16324a', '#0d2030'] : kind === 'lake' ? ['#eef4f1', '#f8f2e8'] : ['#fdf0df', '#f6efe6']
  const far = night ? '#24465f' : '#c9d8c3'
  const mid = night ? '#1d3a50' : '#9fb79a'
  const near = night ? '#163044' : '#6f8f68'
  const id = `scene-${kind}-${p.dark ? 'd' : 'l'}`
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ height, borderRadius: 16, overflow: 'hidden' }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={sky[0]} />
            <Stop offset="1" stopColor={sky[1]} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={W} height={H} fill={`url(#${id}-sky)`} />
        {night ? (
          <>
            <Circle cx="236" cy="44" r="14" fill="#f3ead8" opacity={0.9} />
            <Circle cx="243" cy="39" r="12" fill={sky[0]} />
            <Circle cx="70" cy="30" r="1.6" fill="#f3ead8" opacity={0.8} />
            <Circle cx="120" cy="52" r="1.2" fill="#f3ead8" opacity={0.7} />
            <Circle cx="182" cy="24" r="1.4" fill="#f3ead8" opacity={0.75} />
            <Circle cx="282" cy="70" r="1.1" fill="#f3ead8" opacity={0.6} />
          </>
        ) : (
          <Circle cx="226" cy={kind === 'lake' ? 62 : 74} r="22" fill={brand.marigold} opacity={0.85} />
        )}
        <Path d={`M0 92 C 50 70, 96 74, 140 86 S 236 70, ${W} 82 L ${W} ${H} L 0 ${H} Z`} fill={far} />
        <Ellipse cx="160" cy="96" rx="190" ry="10" fill="#ffffff" opacity={night ? 0.05 : 0.45} />
        <Path d={`M0 108 C 60 92, 110 98, 160 106 S 260 94, ${W} 104 L ${W} ${H} L 0 ${H} Z`} fill={mid} />
        {kind === 'lake' ? (
          <>
            <Rect x="0" y="118" width={W} height={H - 118} fill={night ? '#12283a' : '#dfe9e6'} />
            <Path d="M40 128 H 110 M150 134 H 236 M70 142 H 128" stroke={night ? '#2b4a60' : '#ffffff'} strokeWidth="2" strokeLinecap="round" opacity={0.8} />
          </>
        ) : (
          <Path d={`M0 124 C 70 110, 130 118, 180 124 S 270 114, ${W} 120 L ${W} ${H} L 0 ${H} Z`} fill={near} />
        )}
        {kind === 'dawn' && (
          <>
            <Path d="M150 124 C 150 112, 151 104, 153 96" stroke="#3f6b3a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
            <Path d="M153 100 C 140 98, 134 88, 136 80 C 148 82, 154 90, 153 100 Z" fill="#3f6b3a" />
            <Path d="M153 98 C 160 86, 172 82, 180 84 C 178 96, 166 102, 153 98 Z" fill={brand.sprout} />
          </>
        )}
      </Svg>
    </View>
  )
}

// An empty or not-yet page: a drawing, what will be here and when, and one
// thing to do now.
export function EmptyState({ scene, title, line, action, onAction, children }: { scene: SceneKind; title: string; line: string; action?: string; onAction?: () => void; children?: ReactNode }) {
  return (
    <Card style={{ gap: 14 }}>
      <Scene kind={scene} />
      <View style={{ gap: 6 }}>
        <T v="h2">{title}</T>
        <T tone="text2">{line}</T>
      </View>
      {action && onAction ? <Button label={action} onPress={onAction} /> : null}
      {children}
    </Card>
  )
}
