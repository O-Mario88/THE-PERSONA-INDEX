import { app } from '@/server/instance'

export const dynamic = 'force-dynamic'

export function GET(req: Request) {
  return app.health(req)
}
