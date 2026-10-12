import { app } from '@/server/instance'

export function POST(req: Request) {
  return app.castVote(req)
}
