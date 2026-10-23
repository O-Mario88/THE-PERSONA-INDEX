import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/ibm-plex-sans'
import './index.css'
import App from './App.tsx'
import { watchInstall } from './pwa/install'
import { LockGate } from './pwa/Lock'

// The browser's install offer can come before the app has drawn anything.
watchInstall()

// Opening without a connection: the service worker the build writes (sw.js).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // the app works without it, only not offline
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LockGate>
      <App />
    </LockGate>
  </StrictMode>,
)
