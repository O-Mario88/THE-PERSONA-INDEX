import { afterEach, describe, expect, it } from 'vitest'
import { de } from './de'
import { es } from './es'
import { fr } from './fr'
import { ja } from './ja'
import { ko } from './ko'
import { pt } from './pt'
import { ru } from './ru'
import { LANGS, setLanguage, tr, uiLanguage } from './index'

afterEach(() => setLanguage('auto', 'en'))

describe('the app in more than one language', () => {
  it('follows the phone, and keeps English when the phone speaks a language not offered yet', () => {
    setLanguage('auto', 'es-MX')
    expect(uiLanguage()).toBe('es')
    expect(tr('Begin My Journey')).toBe('Empezar mi camino')
    setLanguage('auto', 'sw-KE')
    expect(tr('Begin My Journey')).toBe('Begin My Journey')
  })

  it('lets the person choose, and never goes blank where a line is not translated yet', () => {
    setLanguage('es', 'en-US')
    expect(tr('Today')).toBe('Hoy')
    expect(tr('A line nobody has translated')).toBe('A line nobody has translated')
    setLanguage('en', 'es-ES')
    expect(tr('Today')).toBe('Today')
  })

  it('has no empty lines, and keeps every {placeholder} in a template', () => {
    for (const map of [es, pt, fr, de, ru, ja, ko])
      for (const [en, word] of Object.entries(map)) {
        expect(word.trim(), en).not.toBe('')
        for (const ph of en.match(/\{\w+\}/g) ?? []) expect(word, en).toContain(ph)
      }
  })

  it('speaks German, Russian, Japanese and Korean too (Edwin, 2026-10-28), following the phone', () => {
    const today = { de: 'Heute', ru: 'Сегодня', ja: '今日', ko: '오늘' }
    for (const [lang, word] of Object.entries(today)) {
      setLanguage('auto', `${lang}-XX`)
      expect(uiLanguage()).toBe(lang)
      expect(tr('Today')).toBe(word)
    }
    expect(LANGS.map((l) => l.name)).toEqual(expect.arrayContaining(['Deutsch', 'Русский', '日本語', '한국어']))
  })

  it('translates every line the other languages do, so a German or Korean screen never falls back halfway', () => {
    for (const map of [de, ru, ja, ko]) for (const en of Object.keys(es)) expect(map[en], en).toBeTruthy()
  })

  it('speaks Portuguese and French too', () => {
    setLanguage('auto', 'pt-BR')
    expect(tr('Today')).toBe('Hoje')
    setLanguage('auto', 'fr-SN')
    expect(tr('Today')).toBe("Aujourd'hui")
  })
})
