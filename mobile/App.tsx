import { useEffect, useState } from 'react'
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

SplashScreen.preventAutoHideAsync().catch(() => {})

// The root: Geist and what this device kept are loaded before the first
// screen, so nothing flashes or jumps.
export default function App() {
  const [fonts] = useFonts({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold })
  const [kept, setKept] = useState(false)
  const [epoch, setEpoch] = useState(0)
  const scheme = useColorScheme()
  useEffect(() => {
    hydrate().then(() => setKept(true))
  }, [])
  useEffect(() => {
    if (fonts && kept) SplashScreen.hideAsync().catch(() => {})
  }, [fonts, kept])
  if (!fonts || !kept) return <View style={{ flex: 1, backgroundColor: light.bg }} />
  return (
    <SafeAreaProvider>
      <WebLockGate>
        <Shell key={epoch} phoneDark={scheme === 'dark'} onRestart={() => setEpoch((n) => n + 1)} />
      </WebLockGate>
    </SafeAreaProvider>
  )
}
