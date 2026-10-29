// The quiet icons' names on Android (Edwin's brief, 2026-10-29): an icon that
// says less about the app says less under it too. expo-alternate-app-icons
// makes one launcher alias per icon; this gives each its own label. An iPhone
// keeps the app's own name under any icon (Apple allows no other).
const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins')

const LABELS = { MainActivityPebble: 'Notes', MainActivityHorizon: 'Today' }

module.exports = function withQuietLabels(config) {
  return withAndroidManifest(config, (c) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults)
    for (const alias of app['activity-alias'] ?? []) {
      const name = String(alias.$['android:name']).replace(/^\./, '')
      if (LABELS[name]) alias.$['android:label'] = LABELS[name]
    }
    return c
  })
}
