import { useEffect, useState } from 'react'
import { useColorScheme, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import * as SplashScreen from 'expo-splash-screen'
import {
  useFonts,
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Figtree_800ExtraBold,
} from '@expo-google-fonts/figtree'
import { hydrate } from './src/platform/setup'
import './src/platform/gzip'
import { light } from './src/theme'
import { Shell } from './src/Shell'

SplashScreen.preventAutoHideAsync().catch(() => {})

// The root: Figtree and what this device kept are loaded before the first
// screen, so nothing flashes or jumps.
export default function App() {
  const [fonts] = useFonts({ Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold, Figtree_800ExtraBold })
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
      <Shell key={epoch} phoneDark={scheme === 'dark'} onRestart={() => setEpoch((n) => n + 1)} />
    </SafeAreaProvider>
  )
}
