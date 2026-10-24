// Notebook sync for a signed-in account (Stage 5). It rides on the encrypted
// backup (vault.ts): the account keeps the backup's 12 words, sealed with a
// server key, so a phone that signs in can restore without typing them.
// That is a trade the person chooses: with sync on, the server could open
// the phrase. Off, the backup is still there under the words alone.

import { deviceToken } from './api'
import { getAccount, getSync, putSync, deleteSync } from './social'
import { remove } from './storage'
import { newPhrase, restore, turnOn, vaultState } from './vault'

export async function syncOn(): Promise<void> {
  let phrase = vaultState()?.phrase
  if (!phrase) {
    phrase = newPhrase()
    await turnOn(phrase, false)
  }
  await putSync(phrase)
  await getAccount()
}

export async function syncOff(): Promise<void> {
  await deleteSync()
  await getAccount()
}

// pullSync runs after signing in: when the account syncs and this phone has
// no backup of its own, it restores the account's, then takes the account's
// pass back (the backup may carry an older one).
export async function pullSync(sync: boolean): Promise<'restored' | 'none'> {
  if (!sync || vaultState()) return 'none'
  const phrase = await getSync()
  if (!phrase) return 'none'
  const r = await restore(phrase)
  remove('pi.device.v1')
  await deviceToken()
  return r === 'restored' ? 'restored' : 'none'
}
