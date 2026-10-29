// Midnight & Cream: the one set of design tokens for every platform
// (mobile/DESIGN.md explains each choice). Change a colour here, never in a
// screen.
import { createContext, useContext, type ReactNode } from 'react'
import { Platform, type ViewStyle } from 'react-native'

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
  bg: '#f6f1e8',
  surface: '#ffffff',
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
  onLime: '#013d5a', // navy words on marigold (Edwin, 2026-10-28)
  bg: '#08131b',
  surface: '#132a3b',
  surface2: '#1a3548',
  surface3: '#22425a',
  line: '#1f3a4e',
  lineStrong: '#2e4d63',
  text: '#f6efe3',
  text2: '#d6d2c9',
  muted: '#9eaab3',
  leaf: '#a9c3a1',
  leafSoft: '#7c9a74',
  accentInk: '#8cc4da', // links and labels; marigold stays for buttons, choices and the open tab
  accentWash: '#1b3a4d',
  accentLine: '#2e5266',
  btn: '#f4a258',
  onBtn: '#013d5a',
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

// Geist, bundled (Edwin, 2026-10-28: Figtree felt imposing on a small phone;
// Geist is narrower and calmer, the face the Edify app uses). React Native picks a font file by name, not by weight.
export const font = {
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  bold: 'Geist_700Bold',
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

// The launch, loading and welcome pages (Edwin's design, 2026-10-29) look
// the same in light and dark: the logo on midnight, then a sunrise.
export const brand = {
  night: '#0b1c2c', // behind the logo, and the phone's own splash (app.json)
  onNight: '#ffffff',
  onNight2: '#dce4ea',
  sprout: '#c1e863', // the logo's light leaf: the progress bar and the welcome button
  marigold: '#f4a258', // the button on a midnight Spotlight, in light and dark alike
  onMarigold: '#013d5a', // navy words on orange, never black (Edwin, 2026-10-28)
  onSprout: '#0b1c2c',
  track: '#e9e5dd', // the empty part of the bar, on the sunrise
  ink: '#12283a', // words on the sunrise
  inkSoft: '#4a5866', // the logo's line on the sunrise
  dawn: '#f6f1ea', // the sunrise's own cream, while its picture loads
} as const

// A serif for the welcome's one heading, as in Edwin's design: the phone's
// own, so nothing more is downloaded.
export const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, "Times New Roman", serif' })

// A card's lift: a hairline plus a soft shadow in light, none in dark.
const CARD_SHADOW = '0 1px 2px rgba(18, 40, 58, 0.04), 0 6px 20px rgba(18, 40, 58, 0.05)'
export const lift = (p: Palette): ViewStyle => (p.dark ? {} : { boxShadow: CARD_SHADOW })

const ThemeContext = createContext<Palette>(light)

export function ThemeProvider({ palette, children }: { palette: Palette; children: ReactNode }) {
  return <ThemeContext.Provider value={palette}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
