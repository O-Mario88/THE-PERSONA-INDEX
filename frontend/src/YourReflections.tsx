import { useState } from 'react'
import { clearReflect } from './journal'
import { intentions, reflections, removeIntention, removeReflection } from './notebook'

// Your reflections, in You (Reflect): download them as a file, or delete
// them all from this phone. Deleting reaches the backup too, the next time
// it saves; the 12 words cannot bring deleted writing back.

export function YourReflections() {
  const [confirming, setConfirming] = useState(false)
  const [note, setNote] = useState('')
  const count = reflections().length + intentions().length
  if (count === 0 && !note) return null

  function download() {
    const data = { made: new Date().toISOString(), reflections: reflections(), intentions: intentions() }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'my-reflections.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function remove() {
    for (const r of reflections()) removeReflection(r.id)
    for (const i of intentions()) removeIntention(i.id)
    clearReflect()
    setConfirming(false)
    setNote('Your reflections are deleted from this phone, and from your backup when it next saves.')
  }

  return (
    <section className="card kept-card" aria-labelledby="your-reflections-title">
      <h3 id="your-reflections-title" className="label">
        Your reflections
      </h3>
      {note ? (
        <p role="status">{note}</p>
      ) : (
        <>
          <p className="muted small">
            {count === 1 ? 'One piece of writing' : `${count} pieces of writing`}, kept on this phone and end-to-end encrypted in your backup.
          </p>
          <button type="button" className="btn wide outline" onClick={download}>
            Download my reflections
          </button>
          {confirming ? (
            <div className="notice" role="group" aria-label="Delete your reflections">
              <p>This deletes every reflection and everything you wanted to try. It cannot be undone.</p>
              <div className="confirm">
                <button type="button" className="option danger" onClick={remove}>
                  Yes, delete them
                </button>
                <button type="button" className="text-button" onClick={() => setConfirming(false)}>
                  Keep them
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="text-button" onClick={() => setConfirming(true)}>
              Delete my reflections
            </button>
          )}
        </>
      )}
    </section>
  )
}
