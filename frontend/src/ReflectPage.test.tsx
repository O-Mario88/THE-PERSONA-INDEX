import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { keepIntention, keepReflection, intentions, reflections, type Reflection } from './notebook'
import { ReflectGuide } from './ReflectGuide'

// The Reflect page as a person meets it: writing first, earlier words
// brought back, something to try and a gentle check-in, threads, and on-
// device dictation only where the browser can do it.

const r = (id: string, date: string, answer: string, extra: Partial<Reflection> = {}) =>
  keepReflection({ id, date, period: 'day', area: 'family', group: 'learnt', source: 'answers', about: '', question: 'Where did you feel most like yourself today?', answer, ...extra })

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('fetch', async () => new Response('{}', { status: 404 }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('the Reflect page', () => {
  it('brings back last week’s words, and a follow-up joins their thread', async () => {
    r('old', '2026-10-17', 'I want to listen more carefully when family members speak.')
    render(<ReflectGuide today="2026-10-25" questions={[]} />)
    const memory = screen.getByRole('region', { name: 'Reflection memory' })
    expect(memory).toHaveTextContent('Last week you wrote: “I want to listen more carefully when family members speak.”')
    fireEvent.click(within(memory).getByRole('button', { name: /Write a follow-up/ }))
    const write = screen.getByRole('region', { name: 'Have you noticed anything changing since?' })
    expect(write).toHaveTextContent('From your reflection memory')
    fireEvent.change(within(write).getByRole('textbox'), { target: { value: 'I let my brother finish twice this week.' } })
    fireEvent.click(within(write).getByRole('button', { name: /Save reflection/ }))
    await screen.findByRole('status')
    const saved = reflections().find((x) => x.answer.startsWith('I let my brother'))!
    expect(saved).toMatchObject({ followsUp: 'old', thread: 'old' })
  })

  it('keeps something to try, and checks in gently a week later', async () => {
    const { unmount } = render(<ReflectGuide today="2026-10-18" questions={[]} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Where did you feel most like yourself today?' }), { target: { value: 'At the market with my sister.' } })
    fireEvent.click(screen.getByRole('button', { name: /Save reflection/ }))
    fireEvent.change(await screen.findByLabelText('Something I’d like to try (optional)'), { target: { value: 'Ask for help earlier' } })
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(intentions()[0]).toMatchObject({ text: 'Ask for help earlier', checkOn: '2026-10-25' })
    unmount()

    render(<ReflectGuide today="2026-10-25" questions={[]} />)
    const write = screen.getByRole('region', { name: 'Did asking for help earlier make any difference?' })
    expect(write).toHaveTextContent('From something you wanted to try, on 18 October')
    const how = within(write).getByRole('group', { name: 'How did it go?' })
    expect(within(how).getAllByRole('button').map((b) => b.textContent)).toEqual(['It helped', 'A little', 'Not yet', 'Let it go'])
    fireEvent.click(within(how).getByRole('button', { name: 'A little' }))
    fireEvent.click(within(write).getByRole('button', { name: /Save reflection/ }))
    await waitFor(() => expect(intentions()[0]).toMatchObject({ check: 'some', checkedOn: '2026-10-25' }))
    expect(document.body).not.toHaveTextContent(/fail|streak|score/i)
  })

  it('opens a reflection as a thread, oldest first, with a new question at the end', async () => {
    r('a', '2026-07-20', 'I want to be more present with my family.')
    r('b', '2026-09-20', 'Phones away at dinner helped.', { thread: 'a' })
    render(<ReflectGuide today="2026-10-25" questions={[]} />)
    const journey = screen.getByRole('region', { name: 'From your journey' })
    expect(journey).toHaveTextContent('Three months ago, you wrote:')
    fireEvent.click(within(journey).getByRole('button', { name: /Explore this thread/ }))
    const thread = screen.getByRole('region', { name: 'Your thread' })
    expect(within(thread).getByRole('list', { name: 'Entries, oldest first' })).toHaveTextContent(/present with my family.*Phones away at dinner/)
    const write = within(thread).getByRole('region', { name: 'Looking at all of this, what feels different now?' })
    fireEvent.change(within(write).getByRole('textbox'), { target: { value: 'Dinner feels longer, in a good way.' } })
    fireEvent.click(within(write).getByRole('button', { name: /Save reflection/ }))
    await waitFor(() => expect(reflections().find((x) => x.answer.startsWith('Dinner'))?.thread).toBe('a'))
  })

  it('shows Speak only where the browser can recognise speech on the device', async () => {
    render(<ReflectGuide today="2026-10-25" questions={[]} />)
    expect(screen.queryByRole('button', { name: /Speak/ })).not.toBeInTheDocument()
  })

  it('offers Speak when on-device recognition is ready', async () => {
    class FakeRecognition {
      static available = vi.fn(async (o: { processLocally: boolean }) => (o.processLocally ? 'available' : 'unavailable'))
      start() {}
      stop() {}
    }
    vi.stubGlobal('SpeechRecognition', FakeRecognition)
    render(<ReflectGuide today="2026-10-25" questions={[]} />)
    expect(await screen.findByRole('button', { name: /Speak/ })).toBeInTheDocument()
    expect(FakeRecognition.available).toHaveBeenCalledWith(expect.objectContaining({ processLocally: true }))
  })

  it('keeps both Reflect choices off until the person turns them on', () => {
    render(<ReflectGuide today="2026-10-25" questions={[]} />)
    expect(screen.getByRole('switch', { name: /Use my reflections in What you’ve noticed/ })).not.toBeChecked()
    expect(screen.getByRole('switch', { name: /Let my threads add to the longer Mirrors/ })).not.toBeChecked()
  })

  it('keeps a half-written reflection when the page is left and opened again', () => {
    const { unmount } = render(<ReflectGuide today="2026-10-25" questions={[]} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Where did you feel most like yourself today?' }), { target: { value: 'Half a thought' } })
    unmount()
    render(<ReflectGuide today="2026-10-25" questions={[]} />)
    expect(screen.getByRole('textbox', { name: 'Where did you feel most like yourself today?' })).toHaveValue('Half a thought')
  })
})


describe('your reflections, in You', () => {
  it('deletes every reflection, intention and draft only after asking', async () => {
    const { YourReflections } = await import('./YourReflections')
    const { saveDraft } = await import('./journal')
    r('a', '2026-10-20', 'First.')
    keepIntention({ id: 'i1', date: '2026-10-20', text: 'Rest more', from: 'a' })
    saveDraft('day', 'half')
    render(<YourReflections />)
    expect(screen.getByRole('region', { name: 'Your reflections' })).toHaveTextContent('2 pieces of writing')
    fireEvent.click(screen.getByRole('button', { name: 'Delete my reflections' }))
    expect(reflections()).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete them' }))
    expect(reflections()).toHaveLength(0)
    expect(intentions()).toHaveLength(0)
    expect(localStorage.getItem('pi.reflect.draft.day')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('deleted')
  })
})

describe('threads in the longer Mirrors', () => {
  it('appear only once the person lets them in', async () => {
    const { threadsBetween } = await import('./journal')
    const { setReflectSettings } = await import('./journal')
    r('a', '2026-10-01', 'I want to be more present with my family.')
    r('b', '2026-10-20', 'Phones away at dinner helped.', { thread: 'a' })
    expect(threadsBetween('2026-10-01', '2026-10-31')).toEqual([])
    setReflectSettings({ threadsInMirror: true })
    expect(threadsBetween('2026-10-01', '2026-10-31')).toEqual([{ root: expect.objectContaining({ id: 'a' }), count: 2 }])
  })
})
