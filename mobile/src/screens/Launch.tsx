// The launch (Edwin's design, 2026-10-29; the stages and their timing are in
// shared launch.ts). The sprout on midnight starts exactly where the phone's
// own splash left it (app.json, public/index.html) and settles into the full
// logo. Then the loading page over the sunrise, with a bar that fills only as
// far as the work done, then "Preparing a more personal experience for you…"
// while today is put together, and the whole thing fades away to Welcome or
// Today, already drawn underneath. With reduced motion the logo appears in
// place and the pages only fade.
import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Platform, StyleSheet, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { tr } from '@shared/i18n'
import { BAR, LAUNCH_LINE, LAUNCH_MS, nextStage, type LaunchStage } from '@shared/launch'
import { brand, light, ThemeProvider } from '../theme'
import { Dawn } from '../ui/Dawn'
import { calmNow, T } from '../ui/kit'
import { Lockup, Mark, Wordmark } from '../ui/Logo'

// The sprout's size in the phone's own splash (app.json, imageWidth) and on
// the web page before the app has loaded (public/app.css).
const SPLASH_MARK = 140
const SETTLE_MS = 650
// The logo glides up into the loading page's as midnight gives way.
const LIFT_MS = 520
// The loading page's words clear before the sunrise fades into the app.
const CLEAR_MS = 220
const MEASURE_MS = 500
const TICK_MS = 80
// The loading line breaks as in the design: "Preparing a more personal / experience for you…".
const LINE_W = 250
const native = Platform.OS !== 'web'
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

// As big as Edwin's design on a phone, never huge in a wide window.
function sizes(width: number, height: number) {
  const nightMark = clamp(Math.min(width * 0.47, height * 0.22), 120, 190)
  return {
    nightMark,
    nightWords: Math.min(nightMark * 1.53, width - 48),
    dayMark: clamp(Math.min(width * 0.34, height * 0.16), 96, 140),
    dayWords: Math.min(width * 0.69, 300),
  }
}

type Props = {
  // Geist is loaded, so the words can be drawn.
  fontsReady: boolean
  // Geist and what this phone kept are loaded: the app is drawn underneath.
  appReady: boolean
  // Today is in (or the lock screen is up): the app has something to show.
  dayReady: boolean
  // The first frame is drawn, the same as the splash, which can now go.
  onFirstFrame: () => void
  onGone: () => void
}

export function Launch({ fontsReady, appReady, dayReady, onFirstFrame, onGone }: Props) {
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const s = sizes(width, height)
  const [stage, setStage] = useState<LaunchStage>('launch')
  const [wordsH, setWordsH] = useState(0)
  // The launch's own height: the splash centres in the whole screen, which
  // on some phones is taller than the window size reports.
  const [boxH, setBoxH] = useState(height)
  const stageRef = useRef<LaunchStage>('launch')
  // When the current stage began. The launch counts from when the logo starts to settle.
  const since = useRef(Number.POSITIVE_INFINITY)
  const ready = useRef({ app: appReady, day: dayReady })
  ready.current = { app: appReady, day: dayReady }
  const framed = useRef(false)
  // The latest callback, so the stage motion below runs once per stage.
  const gone = useRef(onGone)
  gone.current = onGone

  const settle = useRef(new Animated.Value(0)).current
  const night = useRef(new Animated.Value(1)).current
  const whole = useRef(new Animated.Value(1)).current
  const bar = useRef(new Animated.Value(0)).current
  const line = useRef(new Animated.Value(1)).current
  const lift = useRef(new Animated.Value(0)).current
  // The loading page's words: they appear as the gliding logo arrives, and clear at the end.
  const content = useRef(new Animated.Value(0)).current

  // Never wait on a measurement: if the words haven't reported their size
  // soon after Geist loads, the logo settles anyway.
  useEffect(() => {
    if (!fontsReady) return
    const t = setTimeout(() => setWordsH((h) => h || 1), MEASURE_MS)
    return () => clearTimeout(t)
  }, [fontsReady])

  // The logo settles once its words can be drawn and measured.
  useEffect(() => {
    if (!fontsReady || wordsH === 0 || since.current !== Number.POSITIVE_INFINITY) return
    since.current = Date.now()
    if (calmNow()) settle.setValue(1)
    else Animated.timing(settle, { toValue: 1, duration: SETTLE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start()
  }, [fontsReady, wordsH, settle])

  // One clock moves the stages along (shared launch.ts decides when).
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now()
      const next = nextStage(stageRef.current, since.current, now, ready.current)
      if (next === stageRef.current) return
      stageRef.current = next
      since.current = now
      setStage(next)
    }, TICK_MS)
    return () => clearInterval(id)
  }, [])

  // Each stage's own motion: midnight gives way to the sunrise, the bar
  // heads for where the work has got to, and at the end everything fades.
  useEffect(() => {
    const fade = { duration: LAUNCH_MS.fade, easing: Easing.out(Easing.quad), useNativeDriver: native }
    if (stage === 'loading') {
      if (calmNow()) lift.setValue(1)
      else Animated.timing(lift, { toValue: 1, duration: LIFT_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: native }).start()
      Animated.timing(night, { toValue: 0, ...fade, duration: LAUNCH_MS.fade + 100, delay: 120 }).start()
      Animated.timing(content, { toValue: 1, duration: 300, delay: calmNow() ? 0 : LIFT_MS - 200, useNativeDriver: native }).start()
      Animated.timing(bar, { toValue: BAR.loading, duration: LAUNCH_MS.wait, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start()
    } else if (stage === 'personal') {
      line.setValue(0)
      Animated.timing(line, { toValue: 1, duration: 260, useNativeDriver: native }).start()
      Animated.timing(bar, { toValue: BAR.personal, duration: LAUNCH_MS.personal - 200, easing: Easing.inOut(Easing.quad), useNativeDriver: false }).start()
    } else if (stage === 'gone') {
      Animated.sequence([
        Animated.timing(content, { toValue: 0, duration: CLEAR_MS, useNativeDriver: native }),
        Animated.timing(whole, { toValue: 0, ...fade }),
      ]).start(() => gone.current())
    }
  }, [stage, night, bar, line, whole, lift, content])

  const gap = Math.round(s.nightMark * 0.03)
  const rise = -(gap + wordsH) / 2
  const wordsBox = s.nightWords * 1.3
  const columnTop = Math.max(insets.top + 24, boxH * 0.19)
  // Where the midnight sprout's centre goes to meet the loading page's.
  const toDay = columnTop + s.dayMark / 2 - (boxH / 2 + rise)
  // The personal line stays as everything fades at the end.
  const lineText = stage === 'personal' || stage === 'gone' ? LAUNCH_LINE.personal : LAUNCH_LINE.loading

  return (
    <Animated.View
      pointerEvents={stage === 'gone' ? 'none' : 'auto'}
      accessibilityViewIsModal={stage !== 'gone'}
      style={[StyleSheet.absoluteFill, { opacity: whole }]}
      onLayout={(e) => {
        setBoxH(e.nativeEvent.layout.height)
        if (framed.current) return
        framed.current = true
        onFirstFrame()
      }}
    >
      {/* Light clock and icons on midnight, dark ones on the sunrise. Re-mounted
          as things change, so it stays on top of the app's own underneath. */}
      <StatusBar key={`${stage}-${appReady}`} style={stage === 'launch' ? 'light' : 'dark'} />

      {/* The loading page, under midnight from the start so its picture is ready. */}
      <ThemeProvider palette={light}>
        <Dawn />
        {fontsReady && (
          <Animated.View style={[styles.column, { top: columnTop, opacity: content }]}>
            <Lockup mark={s.dayMark} words={s.dayWords} />
            <View
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={tr(lineText)}
              style={[styles.track, { width: s.dayWords, marginTop: Math.round(s.dayMark * 0.26) }]}
            >
              <Animated.View style={[styles.fill, { width: bar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
            </View>
            <Animated.View style={{ opacity: line, maxWidth: Math.min(s.dayWords, LINE_W), marginTop: 16 }}>
              <T center style={styles.line}>
                {lineText}
              </T>
            </Animated.View>
          </Animated.View>
        )}
      </ThemeProvider>

      {/* Midnight: the sprout where the splash left it, settling into the logo. */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.night, { opacity: night }]}>
        <Animated.View
          style={{
            width: s.nightMark,
            height: s.nightMark,
            transform: [
              { translateY: Animated.add(settle.interpolate({ inputRange: [0, 1], outputRange: [0, rise] }), lift.interpolate({ inputRange: [0, 1], outputRange: [0, toDay] })) },
              { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, s.dayMark / s.nightMark] }) },
            ],
          }}
        >
          <Animated.View style={{ transform: [{ scale: settle.interpolate({ inputRange: [0, 1], outputRange: [SPLASH_MARK / s.nightMark, 1] }) }] }}>
            <Mark size={s.nightMark} />
          </Animated.View>
          {fontsReady && (
            <Animated.View
              onLayout={(e) => setWordsH(e.nativeEvent.layout.height)}
              style={[
                styles.words,
                { top: s.nightMark + gap, left: (s.nightMark - wordsBox) / 2, width: wordsBox },
                { opacity: settle.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0, 0, 1] }) },
              ]}
            >
              <Wordmark width={s.nightWords} ink={brand.onNight} lineInk={brand.onNight2} />
            </Animated.View>
          )}
        </Animated.View>
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  night: { backgroundColor: brand.night, alignItems: 'center', justifyContent: 'center' },
  words: { position: 'absolute', alignItems: 'center' },
  column: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  track: { height: 12, borderRadius: 6, backgroundColor: brand.track, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 6, backgroundColor: brand.sprout },
  line: { fontSize: 16, lineHeight: 23, color: brand.ink },
})
