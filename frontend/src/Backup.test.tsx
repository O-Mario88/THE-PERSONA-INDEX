import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BackupSettings } from './Backup'
import { fakeServer } from './fakeVault'
import { KeptScreen } from './Kept'
import { keepCard, keptCards } from './notebook'
import { save } from './storage'
import { newPhrase, turnOn, vaultState } from './vault'

// The backup as a person meets it: in Settings, turned on with a phrase
// they write down and type two words of back; restored on a new phone; and
// deleted first by "Delete everywhere".

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const kept = {
  kept: { answers: 12, privateAnswers: 0, steps: 2, planChecks: 1, weeklyNotes: 1, votes: 12 },
  keptFor: { answersDays: 35, weeklyNotesDays: 400, votesDays: 7, backupDays: 400 },
}

function deviceRoutes(url: string, init: RequestInit) {
  if (url === '/api/device/data' && init.method === 'DELETE')
    return json(200, { deleted: { answers: 12, steps: 2, planChecks: 1, weeklyNotes: 1, votes: 12 } })
  if (url === '/api/device/data') return json(200, kept)
  return json(404, { error: 'not_found' })
}

let server: ReturnType<typeof fakeServer>

beforeEach(() => {
  localStorage.clear()
  server = fakeServer(deviceRoutes)
  vi.stubGlobal('fetch', server.fetch)
})

afterEach(() => vi.unstubAllGlobals())

const shownWords = () =>
  within(screen.getByRole('list', { name: 'Your 12-word phrase' }))
    .getAllByRole('listitem')
    .map((li) => li.querySelector('.phrase-word')!.textContent)

describe('backup in Settings', () => {
  it('turns on only once two words from the note are typed back, and turns off by deleting it', async () => {
    render(<BackupSettings />)
    expect(screen.getByText(/^Off\./)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back up with a 12-word phrase' }))
    const words = shownWords()
    expect(words).toHaveLength(12)
    expect(screen.getByRole('checkbox', { name: 'Include your own words' })).not.toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: "I've written them down" }))

    const first = screen.getByLabelText(/^What is word \d+\?$/)
    const second = screen.getByLabelText(/^And word \d+\?$/)
    const n1 = Number(/word (\d+)/.exec(first.closest('label')!.textContent!)![1])
    const n2 = Number(/word (\d+)/.exec(second.closest('label')!.textContent!)![1])
    expect(n1).toBeLessThan(n2)

    fireEvent.change(first, { target: { value: words[n1 - 1] === 'zoo' ? 'abandon' : 'zoo' } })
    fireEvent.change(second, { target: { value: words[n2 - 1]! } })
    fireEvent.click(screen.getByRole('button', { name: 'Turn on backup' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(`That isn't word ${n1}.`)
    expect(server.seen).toHaveLength(0)

    fireEvent.change(first, { target: { value: ` ${words[n1 - 1]!.toUpperCase()} ` } })
    fireEvent.click(screen.getByRole('button', { name: 'Turn on backup' }))
    expect(await screen.findByText(/^On\. Sealed on this phone/)).toBeInTheDocument()
    expect(server.seen.filter((r) => r.method === 'PUT')).toHaveLength(1)
    expect(vaultState()).toMatchObject({ phrase: words.join(' '), version: 1, words: false })
    expect(screen.getByRole('status')).toHaveTextContent(/Last backed up today at \d\d:\d\d\./)

    fireEvent.click(screen.getByRole('button', { name: 'Show my phrase' }))
    expect(shownWords()).toEqual(words)
    fireEvent.click(screen.getByRole('button', { name: 'Hide my phrase' }))

    fireEvent.click(screen.getByRole('button', { name: 'Turn off backup' }))
    expect(screen.getByRole('group', { name: 'Turn off backup' })).toHaveTextContent('This deletes your backup from the server')
    fireEvent.click(screen.getByRole('button', { name: 'Yes, turn it off' }))
    expect(await screen.findByText(/^Off\./)).toBeInTheDocument()
    expect(server.seen.at(-1)?.method).toBe('DELETE')
    expect(server.held.size).toBe(0)
    expect(vaultState()).toBeNull()
  })

  it('restores from the phrase on a new phone, and says plainly what is wrong with a phrase', async () => {
    keepCard({ date: '2026-10-20', questionId: '2026-10-20-money-001', theme: 'money', prompt: 'Payday?', answer: 'Save', headline: 'You pay yourself first.' })
    const phrase = newPhrase()
    await turnOn(phrase, false)
    localStorage.clear() // a new phone

    render(<BackupSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'I have a phrase: restore' }))
    const box = screen.getByLabelText('Your 12 words')
    const tryPhrase = async (text: string) => {
      fireEvent.change(box, { target: { value: text } })
      fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    }

    await tryPhrase('abandon')
    expect(screen.getByRole('alert')).toHaveTextContent("That's 1 word. A phrase has 12.")
    const words = phrase.split(' ')
    await tryPhrase([...words.slice(0, 11), 'notaword'].join(' '))
    expect(screen.getByRole('alert')).toHaveTextContent('Word 12, “notaword”, isn\'t one of the phrase words.')
    await tryPhrase(newPhrase())
    expect(await screen.findByText(/There's no backup for this phrase/)).toBeInTheDocument()
    expect(keptCards()).toHaveLength(0)

    await tryPhrase(`  ${phrase.toUpperCase()}\n`)
    expect(await screen.findByText(/Everything from your backup is back on this phone/)).toBeInTheDocument()
    expect(keptCards().map((c) => c.headline)).toEqual(['You pay yourself first.'])
    expect(vaultState()).toMatchObject({ phrase, version: 1 })
  })
})

describe('What I keep, with backup on', () => {
  it('names the backup and deletes it first when deleting everywhere', async () => {
    save('pi.device.v1', 'v1.pass')
    await turnOn(newPhrase(), false)
    render(<KeptScreen today="2026-10-23" mild={false} onBack={() => {}} />)
    const onServer = screen.getByRole('group', { name: 'On the server' })
    expect(onServer).toHaveTextContent("Your backup, sealed on this phone before it was sent. Only your 12 words open it")
    expect(await within(onServer).findByText(/Kept until no phone has opened or changed it for 13 months\./)).toBeInTheDocument()
    expect(onServer).toHaveTextContent('1 plan check: the day, and whether you did it or not yet. Never the plan\'s words.')

    fireEvent.click(screen.getByRole('button', { name: 'Delete everywhere' }))
    expect(screen.getByRole('group', { name: 'Delete everywhere' })).toHaveTextContent('and your backup')
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete it all' }))
    expect(await screen.findByText(/Everything is deleted, here and on the server/)).toHaveTextContent(
      '12 answers, 2 small steps, 1 plan check, 1 weekly note and 12 votes, and your backup.',
    )
    const order = server.fetch.mock.calls
      .filter(([, init]) => init?.method === 'DELETE')
      .map(([url]) => url)
    // Both copies of the backup (the main copy, then the journal copy), then the phone's data.
    expect(order).toEqual(['/api/vault', '/api/vault', '/api/device/data'])
    expect(server.held.size).toBe(0)
    expect(vaultState()).toBeNull()
  })

  it('deletes nothing when the backup could not be deleted', async () => {
    save('pi.device.v1', 'v1.pass')
    await turnOn(newPhrase(), false)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) =>
        url === '/api/vault' && init.method === 'DELETE' ? json(503, { error: 'unavailable' }) : server.fetch(url, init),
      ),
    )
    render(<KeptScreen today="2026-10-23" mild={false} onBack={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete everywhere' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete it all' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("I couldn't reach the server, so nothing was deleted.")
    expect(localStorage.getItem('pi.device.v1')).toBe('v1.pass')
    expect(vaultState()).not.toBeNull()
    expect(server.held.size).toBe(1)
  })

  it('says the backup stays, and the phrase brings it back, when clearing only this phone', async () => {
    save('pi.device.v1', 'v1.pass')
    await turnOn(newPhrase(), false)
    render(<KeptScreen today="2026-10-23" mild={false} onBack={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete from this phone' }))
    expect(screen.getByRole('group', { name: 'Delete from this phone' })).toHaveTextContent('Your 12 words can bring it all back')
    fireEvent.click(screen.getByRole('button', { name: 'Yes, clear this phone' }))
    await waitFor(() => expect(screen.getByText(/Deleted from this phone\./)).toHaveTextContent('your 12 words can bring it back'))
    expect(server.held.size).toBe(1)
  })
})

describe('What I keep, with What Helped reports', () => {
  it('names the reports on the server and counts them when deleting everything', async () => {
    const withReports = (url: string, init: RequestInit) => {
      if (url === '/api/device/data' && init.method === 'DELETE')
        return json(200, { deleted: { answers: 12, steps: 2, weeklyNotes: 1, votes: 12, reports: 2 } })
      if (url === '/api/device/data') return json(200, { ...kept, kept: { ...kept.kept, planChecks: 0, reports: 2 } })
      return json(404, { error: 'not_found' })
    }
    server = fakeServer(withReports)
    vi.stubGlobal('fetch', server.fetch)
    save('pi.device.v1', 'v1.pass')
    render(<KeptScreen today="2026-10-23" mild={false} onBack={() => {}} />)
    const onServer = screen.getByRole('group', { name: 'On the server' })
    await waitFor(() =>
      expect(onServer).toHaveTextContent('2 reports on how a saved step went: the step, how it went and the week, under a key of their own.'),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete everywhere' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete it all' }))
    expect(await screen.findByText(/Everything is deleted, here and on the server/)).toHaveTextContent(
      '12 answers, 2 small steps, 1 weekly note, 2 reports on steps and 12 votes.',
    )
  })
})
