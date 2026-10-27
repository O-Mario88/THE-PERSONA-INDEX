import { afterEach, describe, expect, it } from 'vitest'
import { es } from './es'
import { setLanguage, tr, uiLanguage } from './index'

afterEach(() => setLanguage('auto', 'en'))

describe('the app in more than one language', () => {
  it('follows the phone, and keeps English when the phone speaks a language not offered yet', () => {
    setLanguage('auto', 'es-MX')
    expect(uiLanguage()).toBe('es')
    expect(tr('Start My Journey')).toBe('Empezar mi camino')
    setLanguage('auto', 'ja-JP')
    expect(tr('Start My Journey')).toBe('Start My Journey')
  })

  it('lets the person choose, and never goes blank where a line is not translated yet', () => {
    setLanguage('es', 'en-US')
    expect(tr('Today')).toBe('Hoy')
    expect(tr('A line nobody has translated')).toBe('A line nobody has translated')
    setLanguage('en', 'es-ES')
    expect(tr('Today')).toBe('Today')
  })

  it('has no empty Spanish lines', () => {
    for (const [en, word] of Object.entries(es)) expect(word.trim(), en).not.toBe('')
  })
})
