// Midnight & Cream: the one set of design tokens for every platform
// (mobile/DESIGN.md explains each choice). Change a colour here, never in a
// screen.
import { createContext, useContext, type ReactNode } from 'react'
import type { ViewStyle } from 'react-native'

export type Palette = {
  dark: boolean
  bg: string
  surface: string
  surface2: string
  surface3: string
  line: string
  lineStrong: string
  text: string
  text2: string
  muted: string
  leaf: string
  leafSoft: string
  lime: string // the filled accent: midnight in light, marigold in dark
  onLime: string
  brandLime: string
  accentInk: string
  accentWash: string
  accentLine: string
  btn: string
  onBtn: string
  blue: string
  blueWash: string
  purple: string
  purpleWash: string
  rose: string
  roseWash: string
  amber: string
  amberInk: string
  amberWash: string
  danger: string
  navy: string
  onNavy: string
  onNavy2: string
  // The wide-screen sidebar.
  side: string
  sideInk: string
  sideOn: string
  sideOnInk: string
}

export const light: Palette = {
  dark: false,
  bg: '#fbf7f0',
  surface: '#fffdf9',
  surface2: '#f4ede1',
  surface3: '#ebe2d3',
  line: '#ece3d4',
  lineStrong: '#ddd1bd',
  text: '#12283a',
  text2: '#3d4f5c',
  muted: '#69737c',
  leaf: '#5f7d58',
  leafSoft: '#b5c7ae',
  lime: '#013d5a',
  onLime: '#ffffff',
  brandLime: '#f4a258',
  accentInk: '#0b4f70',
  accentWash: '#e7f0ed',
  accentLine: '#bdd3ce',
  btn: '#013d5a',
  onBtn: '#ffffff',
  blue: '#3f6f8f',
  blueWash: '#e4edf2',
  purple: '#6d597a',
  purpleWash: '#efe9f1',
  rose: '#c8553a',
  roseWash: '#fbe9e2',
  amber: '#e48a3c',
  amberInk: '#8a4b12',
  amberWash: '#fdf0e1',
  danger: '#b42318',
  navy: '#013d5a',
  onNavy: '#ffffff',
  onNavy2: '#c7d8e2',
  side: '#013d5a',
  sideInk: '#d7e4ec',
  sideOn: '#0d5275',
  sideOnInk: '#ffffff',
}

export const dark: Palette = {
  ...light,
  dark: true,
  lime: '#f4a258',
  onLime: '#1d1206',
  bg: '#0b1a24',
  surface: '#102330',
  surface2: '#16303f',
  surface3: '#1d3a4b',
  line: '#1d3545',
  lineStrong: '#2a4759',
  text: '#f6efe3',
  text2: '#d6d2c9',
  muted: '#9eaab3',
  leaf: '#a9c3a1',
  leafSoft: '#7c9a74',
  accentInk: '#f4a258',
  accentWash: '#183242',
  accentLine: '#2a4a5c',
  btn: '#f4a258',
  onBtn: '#1d1206',
  blue: '#8db1f5',
  blueWash: '#17233a',
  purple: '#b9a4f5',
  purpleWash: '#221c38',
  rose: '#f09a82',
  roseWash: '#33191a',
  amber: '#f4a258',
  amberInk: '#f4a258',
  amberWash: '#2d2410',
  danger: '#ff8a7a',
  navy: '#133246',
  onNavy2: '#c2d2dc',
  side: '#08151d',
  sideInk: '#cdd7de',
  sideOn: '#15303f',
  sideOnInk: '#f4a258',
}

// Figtree, bundled. React Native picks a font file by name, not by weight.
export const font = {
  regular: 'Figtree_400Regular',
  medium: 'Figtree_500Medium',
  semibold: 'Figtree_600SemiBold',
  bold: 'Figtree_700Bold',
  heavy: 'Figtree_800ExtraBold',
}

// A 4px grid, a 24px gutter, and the radii of the web app.
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40 } as const
export const gutter = 24
// From this width a browser or a Mac window gets the sidebar instead of the
// tab bar.
export const WIDE = 900
// From this width Today adds a right-hand column, as Facebook's home does.
export const RAIL_AT = 1340
export const RAIL_W = 300
export const SIDE_W = 248
export const radius = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 } as const

// A card's lift: a hairline plus a soft shadow in light, none in dark.
const CARD_SHADOW = '0 1px 2px rgba(18, 40, 58, 0.04), 0 6px 20px rgba(18, 40, 58, 0.05)'
export const lift = (p: Palette): ViewStyle => (p.dark ? {} : { boxShadow: CARD_SHADOW })

const ThemeContext = createContext<Palette>(light)

export function ThemeProvider({ palette, children }: { palette: Palette; children: ReactNode }) {
  return <ThemeContext.Provider value={palette}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
