import { useCallback, useEffect, useState } from 'react'
import { useColorScheme, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import * as SplashScreen from 'expo-splash-screen'
import {
  useFonts,
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
} from '@expo-google-fonts/geist'
import { hydrate } from './src/platform/setup'
import './src/platform/gzip'
import { light } from './src/theme'
import { Shell } from './src/Shell'
import { WebLockGate } from './src/screens/Browser'
import { Launch } from './src/screens/Launch'
import { AppLockGate } from './src/ui/AppLockGate'

SplashScreen.preventAutoHideAsync().catch(() => {})

// The root. The launch (Launch.tsx, Edwin's design) covers everything from
// the phone's splash until today is ready; meanwhile Geist and what this
// device kept load, and the app is drawn underneath it, so nothing flashes.
export default function App() {
  const [fonts, fontsFailed] = useFonts({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold })
  const [kept, setKept] = useState(false)
  const [epoch, setEpoch] = useState(0)
  const [dayReady, setDayReady] = useState(false)
  const [launched, setLaunched] = useState(false)
  const scheme = useColorScheme()
  useEffect(() => {
    hydrate().then(() => setKept(true))
  }, [])
  // If Geist can't load, the phone's own font does.
  const fontsReady = fonts || !!fontsFailed
  const appReady = fontsReady && kept
  const showable = useCallback(() => setDayReady(true), [])
  // Two frames on, so the launch's own sprout is drawn before the splash lifts.
  const hideSplash = useCallback(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => SplashScreen.hideAsync().catch(() => {})))
  }, [])
  const done = useCallback(() => setLaunched(true), [])
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: light.bg }}>
        {appReady && (
          // Hidden from screen readers while the launch covers it (Android; iOS uses the launch's modal flag).
          <View style={{ flex: 1 }} importantForAccessibility={launched ? 'auto' : 'no-hide-descendants'}>
            <WebLockGate onLocked={showable}>
              {/* The phone apps' privacy curtain; opening the other space draws the app afresh. */}
              <AppLockGate onLocked={showable} onSpace={() => setEpoch((n) => n + 1)}>
                <Shell key={epoch} phoneDark={scheme === 'dark'} onRestart={() => setEpoch((n) => n + 1)} onDayReady={showable} />
              </AppLockGate>
            </WebLockGate>
          </View>
        )}
        {!launched && <Launch fontsReady={fontsReady} appReady={appReady} dayReady={dayReady} onFirstFrame={hideSplash} onGone={done} />}
      </View>
    </SafeAreaProvider>
  )
}
