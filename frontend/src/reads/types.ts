// A read (Phase 3 of the review of 2026-10-15): about three minutes on one
// life area or one trait side, in the companion voice. Its sources are kept
// with it for accuracy and never shown (Edwin, 2026-10-15).
export type ReadSource = {
  key: string // a key of backend/content/sources.json when the cards already cite it
  title: string // "Author, year"
  url: string
  strength: 'strong' | 'moderate' | 'early'
  supports: string // which point of the read it backs, in a sentence
}

export type Read = {
  slug: string
  title: string
  kind: 'theme' | 'trait'
  key: string // a life area ("anger"), or a trait side ("rumination.high")
  summary: string // one sentence: the page description and the line that offers it
  paragraphs: string[]
  try: string // one small thing to try, which ends the read
  sources: ReadSource[]
}
