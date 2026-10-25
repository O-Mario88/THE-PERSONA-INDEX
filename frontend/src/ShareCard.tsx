import { useState } from 'react'
import { Icon } from './ui/icons'

// Share reading (Stage 5, "share cards"): the week's name as a picture, in
// a story (9:16) or a square (1:1). It never carries a question, an option,
// an own word or anything about intimacy: only the name the mirror gave the
// week, its one-line tagline and the app's address. Nothing is sent from
// here; the phone's own share sheet does it, or the image is saved.

export type ShareContent = { eyebrow: string; name: string; line?: string }

type Shape = 'story' | 'square'
const SIZE: Record<Shape, [number, number]> = { story: [1080, 1920], square: [1080, 1080] }
const NAVY = '#0e1b26' // the card is navy with lime, as the app's heroes
const LIME = '#c6f24e'
const SITE = 'personaindex.com'

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const w of text.split(/\s+/)) {
    const next = line ? `${line} ${w}` : w
    if (ctx.measureText(next).width > width && line) {
      lines.push(line)
      line = w
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

// draw paints the card; null when the browser has no canvas.
function draw(c: ShareContent, shape: Shape): HTMLCanvasElement | null {
  const [w, h] = SIZE[shape]
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext?.('2d')
  if (!ctx) return null
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  const pad = 90
  const top = shape === 'story' ? 360 : 110
  ctx.fillStyle = NAVY
  ctx.beginPath()
  ctx.roundRect(pad - 30, top - 80, w - 2 * (pad - 30), h - top - (shape === 'story' ? 280 : 80), 48)
  ctx.fill()
  ctx.fillStyle = LIME
  ctx.font = '700 34px Figtree, system-ui, sans-serif'
  ctx.fillText(c.eyebrow.toUpperCase(), pad + 20, top + 10)
  ctx.fillStyle = '#ffffff'
  ctx.font = '800 104px Figtree, system-ui, sans-serif'
  let y = top + 150
  for (const l of wrap(ctx, c.name, w - 2 * pad - 40)) {
    ctx.fillText(l, pad + 20, y)
    y += 116
  }
  if (c.line) {
    ctx.font = '400 42px Figtree, system-ui, sans-serif'
    ctx.fillStyle = '#c3cdd6'
    y += 20
    for (const l of wrap(ctx, c.line, w - 2 * pad - 40)) {
      ctx.fillText(l, pad + 20, y)
      y += 58
    }
  }
  const foot = shape === 'story' ? h - 380 : h - 150
  ctx.font = '600 34px Figtree, system-ui, sans-serif'
  ctx.fillStyle = '#c3cdd6'
  ctx.fillText('The Persona Index · 3 questions a morning, 3 an evening', pad + 20, foot)
  ctx.fillStyle = LIME
  ctx.fillText(SITE, pad + 20, foot + 52)
  return canvas
}

function blobOf(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((ok) => canvas.toBlob((b) => ok(b), 'image/png'))
}

export function ShareSheet({ content, onClose }: { content: ShareContent; onClose: () => void }) {
  const [shape, setShape] = useState<Shape>('story')
  const [note, setNote] = useState('')
  const file = `persona-index-${shape}.png`

  async function share() {
    const canvas = draw(content, shape)
    const blob = canvas && (await blobOf(canvas))
    const f = blob && new File([blob], file, { type: 'image/png' })
    try {
      if (f && navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], text: `${content.name} · ${SITE}` })
      else if (navigator.share) await navigator.share({ text: `This week I was ${content.name}. ${SITE}` })
      else setNote('Save the image, then share it from your photos.')
    } catch {
      // the share sheet was closed
    }
  }
  async function save() {
    const canvas = draw(content, shape)
    if (!canvas) return setNote('This browser can’t make the image.')
    const blob = await blobOf(canvas)
    if (!blob) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = file
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <section className="sheet share-sheet" role="dialog" aria-labelledby="share-title">
      <div className="row-between">
        <h2 id="share-title" className="label">
          Share reading
        </h2>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div className="chips" role="group" aria-label="Shape">
        <button type="button" className="chip-toggle" aria-pressed={shape === 'story'} onClick={() => setShape('story')}>
          Story 9:16
        </button>
        <button type="button" className="chip-toggle" aria-pressed={shape === 'square'} onClick={() => setShape('square')}>
          Square 1:1
        </button>
      </div>
      <figure className={`share-preview ${shape}`} aria-label="The card">
        <p className="share-eyebrow">{content.eyebrow}</p>
        <p className="share-name">{content.name}</p>
        {content.line && <p className="share-line">{content.line}</p>}
        <p className="share-foot">
          The Persona Index · 3 questions a morning, 3 an evening
          <br />
          <strong>{SITE}</strong>
        </p>
      </figure>
      <p className="muted small">
        <Icon name="lock" size={14} /> Your questions and the options you tapped are never on the card. Only the reading.
      </p>
      <div className="share-actions">
        <button type="button" className="btn outline" onClick={share}>
          <Icon name="camera" size={18} /> Stories
        </button>
        <button type="button" className="btn outline" onClick={share}>
          <Icon name="chat" size={18} /> Status
        </button>
        <button type="button" className="btn outline" onClick={save}>
          <Icon name="download" size={18} /> Save image
        </button>
      </div>
      <button type="button" className="btn wide" onClick={share}>
        More ways to share
      </button>
      {note && <p className="small" role="status">{note}</p>}
    </section>
  )
}
