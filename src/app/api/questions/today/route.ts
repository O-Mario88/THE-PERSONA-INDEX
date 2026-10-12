import { app } from '@/server/instance'

export function GET(req: Request) {
  return app.todayQuestions(req)
}
