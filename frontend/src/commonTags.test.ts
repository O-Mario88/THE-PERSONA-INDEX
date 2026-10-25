import { describe, expect, it } from 'vitest'
import { suggestCommonTags } from './commonTags'
import type { AnswerRecord } from './profile'

// Common Ground suggestions (coordinator, from Edwin's spec, 2026-10-25):
// worked out on the phone from the person's own answers; the person reviews
// them before anything is sent.

const a = (theme: string, extra: Partial<AnswerRecord> = {}): AnswerRecord =>
  ({ date: '2026-10-20', questionId: `${theme}-${Math.random()}`, theme, depth: 1, traits: {}, ...extra }) as AnswerRecord

describe('suggesting Common Ground tags', () => {
  it('suggests the tags behind the themes answered most, three answers or more each', () => {
    const answers = [a('family'), a('relatives'), a('parenting'), a('rest'), a('happiness'), a('anger'), a('money'), a('money')]
    expect(suggestCommonTags(answers)).toEqual(['family', 'peace-calm'])
  })

  it('leaves out intimate themes and cards the person said were not them', () => {
    const answers = [a('intimacy'), a('intimacy'), a('intimacy'), a('honesty', { verdict: 'not_me' }), a('honesty', { verdict: 'not_me' }), a('honesty', { verdict: 'not_me' })]
    expect(suggestCommonTags(answers)).toEqual([])
  })

  it('suggests at most four', () => {
    const many = ['family', 'rest', 'work-career', 'confidence', 'friendship', 'helping'].flatMap((t) => [a(t), a(t), a(t)])
    expect(suggestCommonTags(many)).toHaveLength(4)
  })
})
