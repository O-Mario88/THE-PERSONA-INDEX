// The app in more than one language (Edwin, 2026-10-27: "the app has to be
// international"). English is written in the code as it always was; each
// other language is a map from that English to its own words (es.ts), looked
// up as the words are drawn (mobile/src/ui/kit.tsx). A line with no entry yet
// shows in English, so nothing ever goes blank. Spanish comes first: after
// English, it is the language of the largest group likely to use the app
// (Latin America, the US and Spain).

import { es } from './es'
import { fr } from './fr'
import { pt } from './pt'

export type Lang = 'en' | 'es' | 'pt' | 'fr'
export const LANGS: { id: Lang; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'es', name: 'Español' },
  { id: 'pt', name: 'Português' },
  { id: 'fr', name: 'Français' },
]

const MAPS: Record<Exclude<Lang, 'en'>, Record<string, string>> = { es, pt, fr }

let chosen: Lang | 'auto' = 'auto'
let device = 'en'

// setLanguage takes the person's choice ("auto" follows the phone) and the
// phone's own language.
export function setLanguage(choice: Lang | 'auto' | undefined, deviceLang?: string): void {
  chosen = choice ?? 'auto'
  if (deviceLang) device = deviceLang.split('-')[0].toLowerCase()
}

export function uiLanguage(): Lang {
  if (chosen !== 'auto') return chosen
  return LANGS.some((l) => l.id === device) ? (device as Lang) : 'en'
}

// tr gives the words in the app's language, or the English when there is no
// entry yet.
export function tr(english: string): string {
  const lang = uiLanguage()
  if (lang === 'en') return english
  return MAPS[lang][english] ?? english
}

// trf fills a line built from parts: the template is looked up whole, then
// each {name} is filled in, so word order can differ by language.
export function trf(template: string, vars: Record<string, string | number>): string {
  return tr(template).replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`))
}
