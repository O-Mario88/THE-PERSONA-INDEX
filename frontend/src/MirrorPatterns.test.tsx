import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { evidenceFor } from './insights'
import { MirrorPatterns } from './MirrorPatterns'
import type { AnswerRecord } from './profile'
import { voiceProblems } from './voice'

// The longer Mirrors ask "Does this still feel true?" about each pattern
// Insights has found in the person's own answers. No retires it.

const today = '2026-10-26'

function answered(...dates: string[]) {
  const answers: AnswerRecord[] = dates.map((date) => ({ date, questionId: `q-${date}`, theme: 'colleagues', depth: 2, traits: {}, optionId: 'a', need: 'calm' }))
  localStorage.setItem('pi.history.v1', JSON.stringify({ answers, skips: [] }))
}

beforeEach(() => localStorage.clear())

describe('Patterns in the longer Mirrors', () => {
  it('shows each pattern with the real counts behind it and asks if it still feels true', () => {
    answered('2026-10-10', '2026-10-17', '2026-10-24')
    render(<MirrorPatterns today={today} />)
    const card = screen.getByRole('article', { name: 'Feeling settled' })
    expect(card).toHaveTextContent('A pattern worth exploring')
    expect(card).toHaveTextContent('In 3 of your answers, on 3 days since 10 October, what you chose reached for feeling settled.')
    const ask = within(card).getByRole('group', { name: 'Does this still feel true?' })
    expect(within(ask).getAllByRole('button').map((b) => b.textContent)).toEqual(['Yes', 'Partly', 'No'])
    expect(screen.getByText('Worked out on this phone from your own answers of the last 30 days. Nothing here is sent.')).toBeInTheDocument()
  })

  it('keeps it after Yes or Partly, and the answer can be changed', () => {
    answered('2026-10-10', '2026-10-17', '2026-10-24')
    render(<MirrorPatterns today={today} />)
    fireEvent.click(screen.getByRole('button', { name: 'Partly' }))
    expect(screen.getByText('Kept. You said it’s partly true.')).toBeInTheDocument()
    expect(evidenceFor({ answers: JSON.parse(localStorage.getItem('pi.history.v1')!).answers, skips: [] }, 'calm', today)).toBe('pattern')
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    expect(screen.getByRole('group', { name: 'Does this still feel true?' })).toBeInTheDocument()
  })

  it('retires it after No, here and in Insights', () => {
    answered('2026-10-10', '2026-10-17', '2026-10-24')
    render(<MirrorPatterns today={today} />)
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    expect(screen.getByText('Retired. It won’t be called a pattern again unless new answers build it up.')).toBeInTheDocument()
    expect(evidenceFor({ answers: JSON.parse(localStorage.getItem('pi.history.v1')!).answers, skips: [] }, 'calm', today)).toBe('thought')
  })

  it('keeps the voice rules', () => {
    answered('2026-10-10', '2026-10-17', '2026-10-24')
    render(<MirrorPatterns today={today} />)
    for (const sentence of (document.body.textContent ?? '').split(/(?<=[.!?])\s+/)) expect(voiceProblems(sentence)).toEqual([])
  })
})
