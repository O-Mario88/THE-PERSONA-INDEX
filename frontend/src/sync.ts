// Notebook sync for a signed-in account (Stage 5). It rides on the encrypted
// backup (vault.ts): the account keeps the keys to the backup's main copy,
// sealed with a server key, so a phone that signs in can restore without
// typing the 12 words. That is a trade the person chooses: with sync on, the
// server could open the main copy. Never the journal copy, the person's
// writing in Reflect (Edwin, 2026-10-25: "Reflections always end-to-end"):
// its keys come from the 12 words, which the account never holds.

import { deviceToken } from './api'
import { getAccount, getSync, putSync, deleteSync } from './social'
import { remove } from './storage'
import { isSyncSecret, newPhrase, restore, restoreFromSync, syncSecret, turnOn, vaultState } from './vault'

export async function syncOn(): Promise<void> {
  let phrase = vaultState()?.phrase
  if (!phrase) {
    phrase = newPhrase()
    await turnOn(phrase, false)
  }
  await putSync(await syncSecret(phrase))
  await getAccount()
}

export async function syncOff(): Promise<void> {
  await deleteSync()
  await getAccount()
}

// pullSync runs after signing in: when the account syncs and this phone has
// no backup of its own, it restores the account's (all but the writing),
// then takes the account's pass back (the backup may carry an older one).
// An account that still holds the 12 words, from before the October 2026 Reflect, is
// restored with them and then given the keys instead.
export async function pullSync(sync: boolean): Promise<'restored' | 'none'> {
  if (!sync || vaultState()) {
    await upgradeSync(sync)
    return 'none'
  }
  const secret = await getSync()
  if (!secret) return 'none'
  const legacy = !isSyncSecret(secret)
  const r = legacy ? await restore(secret) : await restoreFromSync(secret)
  if (legacy && r === 'restored') await putSync(await syncSecret(secret))
  remove('pi.device.v1')
  await deviceToken()
  return r === 'restored' ? 'restored' : 'none'
}

// upgradeSync replaces the 12 words an account kept before the October 2026 Reflect with
// the main copy's keys, once, from a phone that has the words.
export async function upgradeSync(sync: boolean): Promise<void> {
  const st = vaultState()
  if (!sync || !st?.phrase) return
  const secret = await getSync()
  if (secret && !isSyncSecret(secret)) await putSync(await syncSecret(st.phrase))
}
