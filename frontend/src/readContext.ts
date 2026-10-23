import { createContext, useEffect, useState } from 'react'
import type { Read } from './reads/types'

// The reads load after the app has opened (Read.tsx), so they never slow
// the questions down.

type ReadsModule = typeof import('./reads/reads')
let cached: ReadsModule | null = null
let loading: Promise<ReadsModule> | null = null

export function loadReads(): Promise<ReadsModule> {
  if (cached) return Promise.resolve(cached)
  loading ??= import('./reads/reads').then((m) => (cached = m))
  return loading
}

export function useReads(): ReadsModule | null {
  const [mod, setMod] = useState<ReadsModule | null>(cached)
  useEffect(() => {
    if (mod) return
    let live = true
    loadReads().then(
      (m) => live && setMod(m),
      () => {}, // without the reads, nothing is offered
    )
    return () => {
      live = false
    }
  }, [mod])
  return mod
}

// How a read is opened: App provides it; without it, nothing offers a read.
export const OpenRead = createContext<((r: Read) => void) | null>(null)

