import { threadsBetween } from './journal'

// Threads in the longer Mirrors (Reflect): only when the person turned that
// on in Reflect. Which threads they kept going in this span, from this phone.

export function MirrorThreads({ from, to, span }: { from: string; to: string; span: string }) {
  const threads = threadsBetween(from, to)
  return (
    <>
      <ul className="m-words">
        {threads.map(({ root, count }) => (
          <li key={root.id} className="m-card m-word">
            <blockquote className="m-word-text">“{root.answer.length > 90 ? `${root.answer.slice(0, 90)}…` : root.answer}”</blockquote>
            <p className="m-step-meta">{count === 1 ? `Once this ${span}` : `${count} times this ${span}`}</p>
          </li>
        ))}
      </ul>
      <p className="m-note">From your threads in Reflect, because you chose to let them in. Only on this phone.</p>
    </>
  )
}
