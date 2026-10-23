import { useState } from 'react'
import { downloadBook, downloadData, type Made } from './book'

// The buttons that save a copy: the book in My notebook, and the book and
// the data file in What I keep (book.ts makes both).

type Which = 'book' | 'data'
type State = { kind: 'idle' } | { kind: 'busy'; which: Which } | { kind: 'done'; which: Which; made: Made }

const DONE: Record<Which, Record<Made, string>> = {
  book: {
    saved: 'Your book is in your downloads. It opens in any browser, and nobody else has a copy unless you share it.',
    'phone-only':
      "Your book is in your downloads, with everything on this phone. I couldn't reach the server, so the answers it keeps for your mirror aren't in it this time.",
    failed: "This browser didn't let me save the file. Please try again.",
  },
  data: {
    saved: 'Your data file is in your downloads: everything on this phone and on the server, as data.',
    'phone-only':
      "Your data file is in your downloads, with everything on this phone. I couldn't reach the server, so its copy isn't in it this time.",
    failed: "This browser didn't let me save the file. Please try again.",
  },
}

export function DownloadButtons({ today, mild, data = false }: { today: string; mild: boolean; data?: boolean }) {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const busy = state.kind === 'busy'

  async function run(which: Which) {
    setState({ kind: 'busy', which })
    const made = await (which === 'book' ? downloadBook(today, mild) : downloadData(today))
    setState({ kind: 'done', which, made })
  }

  return (
    <div className="book-actions">
      <div className="confirm">
        <button type="button" className="option" onClick={() => run('book')} disabled={busy}>
          {busy && state.which === 'book' ? 'Making your book…' : 'Download my book'}
        </button>
        {data && (
          <button type="button" className="text-button" onClick={() => run('data')} disabled={busy}>
            {busy && state.which === 'data' ? 'Gathering…' : 'Download everything as a data file'}
          </button>
        )}
      </div>
      {state.kind === 'done' && (
        <p role={state.made === 'failed' ? 'alert' : 'status'} className="muted">
          {DONE[state.which][state.made]}
        </p>
      )}
    </div>
  )
}
