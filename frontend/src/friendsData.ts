import { useEffect, useState } from 'react'
import type { Question } from './api'
import { friendToday, getNods, getTogethers, type FriendToday, type NodsView, type TogetherView } from './social'
import { useAccount } from './useAccount'

// The circle's data for the day (Friends.tsx shows it): today's friend
// question, the nods that arrived and Answer Together. Each loads only for a
// signed-in person.

const none: TogetherView[] = []

export function useFriendToday(date: string): [FriendToday | null, () => void] {
  const me = useAccount()
  const [ft, setFt] = useState<FriendToday | null>(null)
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!me) return
    let live = true
    friendToday(date).then(
      (x) => live && setFt(x),
      () => live && setFt(null),
    )
    return () => {
      live = false
    }
  }, [me, date, n])
  return [me ? ft : null, () => setN((x) => x + 1)]
}

export function useNods(date: string): NodsView | null {
  const me = useAccount()
  const on = !!me?.connect
  const [v, setV] = useState<NodsView | null>(null)
  useEffect(() => {
    if (!on) return
    let live = true
    getNods(date).then(
      (x) => live && setV(x),
      () => {},
    )
    return () => {
      live = false
    }
  }, [on, date])
  return on ? v : null
}

export function useTogethers(): [TogetherView[], () => void] {
  const me = useAccount()
  const [v, setV] = useState<TogetherView[]>([])
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!me) return
    let live = true
    getTogethers().then(
      (x) => live && setV(x),
      () => {},
    )
    return () => {
      live = false
    }
  }, [me, n])
  return [me ? v : none, () => setN((x) => x + 1)]
}

// A question can be shared when it is everyday or personal and no answer to
// it is heavy (the server refuses the rest too).
export function shareable(q: Question): boolean {
  return q.care !== 'intimate' && !q.local && !q.options.some((o) => o.heavy)
}

