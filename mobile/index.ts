// The browser pieces the shared web code expects come first (setup.ts).
import './src/platform/setup'
import './src/platform/browser'
import { registerRootComponent } from 'expo'
import App from './App'

registerRootComponent(App)
