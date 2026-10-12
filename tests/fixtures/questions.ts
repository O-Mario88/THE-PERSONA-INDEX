import type { QuestionBank } from '@/server/app'
import type { DailySet } from '@/server/contracts'

export const TODAY = '2026-10-12'
export const FIXED_NOW = new Date(`${TODAY}T10:00:00Z`)

export const todaySet: DailySet = {
  date: TODAY,
  questions: [
    {
      id: 'q-dishes',
      prompt: 'When do you wash the dishes?',
      options: [
        { id: 'right-away', label: 'Right after eating' },
        { id: 'end-of-day', label: 'At the end of the day' },
        { id: 'when-full', label: 'When the sink is full' },
      ],
    },
    {
      id: 'q-bill',
      prompt: 'Dinner with friends: how do you split the bill?',
      options: [
        { id: 'even', label: 'Split it evenly' },
        { id: 'itemised', label: 'Everyone pays for what they ordered' },
      ],
    },
    {
      id: 'q-alarm',
      prompt: 'How many alarms do you set in the morning?',
      options: [
        { id: 'one', label: 'One' },
        { id: 'two-three', label: 'Two or three' },
        { id: 'four-plus', label: 'Four or more' },
      ],
    },
  ],
}

export const fixtureBank: QuestionBank = {
  async getSet(date) {
    return date === TODAY ? todaySet : null
  },
}
