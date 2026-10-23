// A stand-in for the server's vault routes in tests, behaving as
// backend/vault.go does: it keeps sealed bytes under the SHA-256 of the
// vault key, version by version. Any other request goes to other, when
// given.

import { expect, vi } from 'vitest'

type Held = { version: number; sealed: Uint8Array }

export function fakeServer(other?: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const held = new Map<string, Held>()
  const seen: { method: string; body?: Uint8Array; auth: string }[] = []
  const hash = async (k: string) => {
    const raw = Uint8Array.from(atob(k.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', raw))].map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
  const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
    if (url !== '/api/vault' && other) return other(url, init ?? {})
    expect(url).toBe('/api/vault')
    const h = new Headers(init.headers)
    const auth = (h.get('Authorization') ?? '').replace(/^Vault /, '')
    const body = init.body ? new Uint8Array(init.body as ArrayBuffer) : undefined
    seen.push({ method: init.method ?? 'GET', body, auth })
    const id = await hash(auth)
    const cur = held.get(id)
    switch (init.method) {
      case 'GET':
        if (!cur) return json(404, { error: 'no_backup' })
        return new Response(cur.sealed.slice(), { status: 200, headers: { ETag: `"${cur.version}"` } })
      case 'PUT': {
        const match = h.get('If-Match')
        const replaces = match ? Number(match.replace(/"/g, '')) : h.get('If-None-Match') === '*' ? 0 : -1
        if (replaces < 0) return json(428, { error: 'precondition_required' })
        if (!cur && replaces > 0) return json(404, { error: 'no_backup' })
        if (cur && cur.version !== replaces) return json(412, { error: 'version_conflict', version: cur.version }, { ETag: `"${cur.version}"` })
        held.set(id, { version: replaces + 1, sealed: body! })
        return json(200, { version: replaces + 1 }, { ETag: `"${replaces + 1}"` })
      }
      case 'DELETE':
        return json(200, { deleted: held.delete(id) })
    }
    return json(405, { error: 'method' })
  })
  return { held, seen, fetch }
}

