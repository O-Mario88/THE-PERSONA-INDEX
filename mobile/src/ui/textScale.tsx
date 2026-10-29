// Text size (Edwin, 2026-10-29: "add the function to adjust the font size
// from the settings"). The person's choice in Settings (shared prefs.ts,
// textScaleOf) scales every word in the app, on top of the phone's own text
// size. T and these stand-ins for React Native's Text and TextInput read it,
// so a screen never has to think about it. The logo and the launch keep their
// fixed sizes: they are a picture, not words to read.
import { createContext, useContext, type ReactNode } from 'react'
import { StyleSheet, Text as RNText, TextInput as RNTextInput, type StyleProp, type TextInputProps, type TextProps, type TextStyle } from 'react-native'

const Scale = createContext(1)

export function TextScaleProvider({ scale, children }: { scale: number; children: ReactNode }) {
  return <Scale.Provider value={scale}>{children}</Scale.Provider>
}

export const useTextScale = (): number => useContext(Scale)

// The style with its size and line height scaled; everything else as it was.
// Words with no size of their own keep inheriting their parent's.
export function scaleText(style: StyleProp<TextStyle>, scale: number): StyleProp<TextStyle> {
  if (scale === 1) return style
  const { fontSize, lineHeight } = StyleSheet.flatten(style) ?? {}
  if (!fontSize && !lineHeight) return style
  return [style, { ...(fontSize ? { fontSize: fontSize * scale } : {}), ...(lineHeight ? { lineHeight: lineHeight * scale } : {}) }]
}

// maxScale caps the growth where space is fixed, such as the tab bar. The
// phone's own text size is followed up to 200% (the light-mode review,
// 2026-10-29); headings ask for less, so a page still fits.
const PHONE_MAX = 2
export function Text({ style, maxScale, maxFontSizeMultiplier, ...rest }: TextProps & { maxScale?: number }) {
  const scale = Math.min(useTextScale(), maxScale ?? Number.POSITIVE_INFINITY)
  return <RNText {...rest} maxFontSizeMultiplier={maxFontSizeMultiplier ?? PHONE_MAX} style={scaleText(style, scale)} />
}

// A ref, when given, travels in the props to the field itself.
export function TextInput({ style, maxFontSizeMultiplier, ...rest }: TextInputProps) {
  const scale = useTextScale()
  return <RNTextInput {...rest} maxFontSizeMultiplier={maxFontSizeMultiplier ?? PHONE_MAX} style={scaleText(style, scale)} />
}
