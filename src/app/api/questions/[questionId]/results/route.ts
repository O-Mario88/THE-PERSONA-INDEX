import { app } from '@/server/instance'

export async function GET(req: Request, ctx: { params: Promise<{ questionId: string }> }) {
  const { questionId } = await ctx.params
  return app.results(req, questionId)
}
