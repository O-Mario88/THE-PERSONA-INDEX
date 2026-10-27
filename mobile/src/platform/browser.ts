// What only the website needs, run once at start when this app is the
// website (React Native for Web): the offline worker the web build writes
// (scripts/build-web.mjs, /sw.js), and catching the browser's install offer,
// which can come before the app has drawn anything (shared pwa/install.ts).
import { Platform } from 'react-native'
import { watchInstall } from '@shared/pwa/install'

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  watchInstall()
  if (!__DEV__ && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // the app works without it, only not offline
      })
    })
  }
}
