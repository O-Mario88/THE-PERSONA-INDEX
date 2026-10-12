import { createApp, type QuestionBank } from './app'

// No question source is wired up yet; the real one will come from the database.
const emptyBank: QuestionBank = { getSet: async () => null }

export const app = createApp({ clock: () => new Date(), questionBank: emptyBank })
