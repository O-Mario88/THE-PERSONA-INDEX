import { useEffect, useState } from 'react'
import { accountToken, cachedMe, onAccountChange, type AccountView } from './social'

// useAccount is the signed-in account on this phone, or null. It follows
// sign-in, sign-out and profile changes made anywhere in the app.
export function useAccount(): AccountView | null {
  const read = () => (accountToken() ? cachedMe() : null)
  const [me, setMe] = useState(read)
  useEffect(() => onAccountChange(() => setMe(read())), [])
  return me
}
