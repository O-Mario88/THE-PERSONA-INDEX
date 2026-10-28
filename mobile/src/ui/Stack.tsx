// Pages that feel like the phone's own (Edwin, 2026-10-28: "fix it", after
// the review said inner pages switched with no slide and no swipe back).
// An inner page slides in over the page it came from, which stays where it
// was, scroll and all. Back slides it away again: the Back link, a swipe
// from the left edge on iPhone, or the back gesture on Android. In a wide
// window it fades in place instead, and with reduced motion it just appears.
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Animated, BackHandler, Easing, PanResponder, Platform, StyleSheet, useWindowDimensions } from 'react-native'
import { useTheme } from '../theme'
import { calmNow } from './kit'

const native = Platform.OS !== 'web'
const IN_MS = 320
const OUT_MS = 260
// A swipe must start this close to the left edge, as on iPhone.
const EDGE = 28
// How far, or how fast, a swipe has to go to count as Back.
const FAR = 0.33
const FAST = 0.6
const SHIFT = 24

type Props = {
  children: ReactNode
  // The page is on its way out (Back was pressed); it slides away, then onGone.
  leaving: boolean
  onBack: () => void
  onGone: () => void
  wide: boolean
}

export function PushedPage({ children, leaving, onBack, onGone, wide }: Props) {
  const p = useTheme()
  const { width } = useWindowDimensions()
  // 0 is in place, 1 is off to the right (or faded, in a wide window).
  const off = useRef(new Animated.Value(calmNow() ? 0 : 1)).current
  const back = useRef(onBack)
  back.current = onBack
  const gone = useRef(onGone)
  gone.current = onGone

  // The slide starts a frame after the page is drawn: on Android an animation
  // started in the same frame as the view never reaches it, and the page
  // stays off screen. A safety net puts it in place if no animation runs.
  useEffect(() => {
    if (calmNow()) return
    const frame = requestAnimationFrame(() => Animated.timing(off, { toValue: 0, duration: IN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start())
    const settle = setTimeout(() => off.setValue(0), IN_MS + 400)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(settle)
    }
  }, [off])

  useEffect(() => {
    if (!leaving) return
    if (calmNow()) {
      gone.current()
      return
    }
    Animated.timing(off, { toValue: 1, duration: OUT_MS, easing: Easing.out(Easing.quad), useNativeDriver: native }).start(() => gone.current())
  }, [leaving, off])

  // Android's back button and gesture go back a page, as everywhere else on the phone.
  useEffect(() => {
    if (Platform.OS !== 'android' || leaving) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      back.current()
      return true
    })
    return () => sub.remove()
  }, [leaving])

  // iPhone: the page follows a finger from the left edge, and goes back when let go far enough.
  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_e, g) => Platform.OS === 'ios' && !wide && g.x0 < EDGE && g.dx > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderMove: (_e, g) => off.setValue(Math.max(0, Math.min(1, g.dx / width))),
        onPanResponderRelease: (_e, g) => {
          if (g.dx > width * FAR || g.vx > FAST) {
            Animated.timing(off, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: native }).start(() => back.current())
          } else {
            Animated.spring(off, { toValue: 0, bounciness: 0, speed: 20, useNativeDriver: native }).start()
          }
        },
        onPanResponderTerminate: () => Animated.spring(off, { toValue: 0, bounciness: 0, speed: 20, useNativeDriver: native }).start(),
      }),
    [off, width, wide],
  )

  const motion = wide
    ? { opacity: off.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ translateX: off.interpolate({ inputRange: [0, 1], outputRange: [0, SHIFT] }) }] }
    : { transform: [{ translateX: off.interpolate({ inputRange: [0, 1], outputRange: [0, width] }) }] }
  return (
    <Animated.View {...swipe.panHandlers} pointerEvents={leaving ? 'none' : 'auto'} style={[StyleSheet.absoluteFill, styles.page, { backgroundColor: p.bg }, motion]}>
      {children}
    </Animated.View>
  )
}

// A full-screen sitting rises gently into place when it opens.
export function Enter({ children }: { children: ReactNode }) {
  const v = useRef(new Animated.Value(calmNow() ? 1 : 0)).current
  useEffect(() => {
    if (calmNow()) return
    Animated.timing(v, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start()
  }, [v])
  return <Animated.View style={{ flex: 1, opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }] }}>{children}</Animated.View>
}

const styles = StyleSheet.create({
  // The edge of a page sliding over another casts a soft shadow, as on iPhone.
  page: { boxShadow: '-8px 0 24px rgba(0, 0, 0, 0.12)' },
})
