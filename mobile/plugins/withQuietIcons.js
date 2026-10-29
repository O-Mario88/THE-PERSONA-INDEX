// The quiet icons on Android (Edwin's brief, 2026-10-29). expo-alternate-app-icons
// makes one launcher alias per icon, and while a quiet icon is on it switches
// MainActivity itself off. So each quiet alias gets:
// - its own name: an icon that says less about the app says less under it too
//   (an iPhone keeps the app's own name under any icon; Apple allows no other);
// - MainActivity's links (the app's own schemes), so a sign-in returning from
//   Google or an invite still opens the app while that icon is on.
const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins')

const LABELS = { MainActivityPebble: 'Notes', MainActivityHorizon: 'Today' }

const isLink = (filter) => (filter.action ?? []).some((a) => a.$['android:name'] === 'android.intent.action.VIEW')

module.exports = function withQuietIcons(config) {
  return withAndroidManifest(config, (c) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults)
    const main = AndroidConfig.Manifest.getMainActivityOrThrow(c.modResults)
    const links = (main['intent-filter'] ?? []).filter(isLink)
    for (const alias of app['activity-alias'] ?? []) {
      const name = String(alias.$['android:name']).replace(/^\./, '')
      if (!LABELS[name]) continue
      alias.$['android:label'] = LABELS[name]
      alias['intent-filter'] = [...(alias['intent-filter'] ?? []).filter((f) => !isLink(f)), ...structuredClone(links)]
    }
    return c
  })
}
