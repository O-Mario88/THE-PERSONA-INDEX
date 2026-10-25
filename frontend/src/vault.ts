// The encrypted backup and the 12-word recovery phrase (Phase 3 of the review
// of 2026-10-15, "Yours to keep"). Off until the person turns it on.
//
// The phrase is twelve words from the standard BIP39 list, with a checksum
// so a mistyped word is caught here, on the phone. From it the phone makes
// two keys (PBKDF2 as BIP39 does, then HKDF):
//   - the seal key, which seals the backup with AES-GCM and never leaves the
//     phone;
//   - the vault key, which shows the server which backup is this phone's. The
//     server keeps the sealed bytes under the SHA-256 of it (backend/vault.go).
// So the server cannot open a backup or say whose it is. There is no email
// and no account: the phrase is the only way back in.
//
// What a backup carries comes from the registry (registry.ts): everything
// marked "always", and own words ("words") only when the person switches
// that on; kept cards then lose their own words too. The pass is in it, so a
// restored phone carries on the same mirror.
//
// Two phones restored from one phrase share one backup. Every write names
// the version it replaces; when another phone wrote first, this one reads
// that backup, merges it in by the registry's rules, and writes again.

import { generateMnemonic, mnemonicToSeedWebcrypto, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import { mergeEntry } from './notebook'
import type { AnswerRecord, History, SkipRecord } from './profile'
import type { Move } from './moves'
import { entryFor } from './registry'
import { keys, load, loadJSON, onChange, remove, save, saveJSON } from './storage'

const STATE_KEY = 'pi.vault.v1'
const SNAPSHOT_VERSION = 1
// How long after a change the phone waits before backing up, so a sitting's
// several writes go in one backup.
export const BACKUP_DELAY_MS = 20_000

// Reflect 2.0 (Edwin, 2026-10-25: "Reflections always end-to-end"): a
// backup is two sealed copies. The main copy holds everything but the
// person's writing; the journal copy holds only the writing (registry
// backup "journal"), under keys from a separate branch of the phrase. Easy
// sync gives the server the main copy's two keys, never the phrase, so the
// server can open the main copy (the trade sync has always been) and never
// the journal. A phone restored through sync has those keys alone, and asks
// for the 12 words once to bring the writing back.
export type VaultState = {
  phrase?: string // the 12 words; absent on a phone restored through sync until they are typed
  sync?: string // the main copy's keys, as the account holds them (syncSecret)
  version: number // the version on the server this phone last wrote or read; 0 before the first
  journalVersion?: number // the same for the journal copy
  words: boolean // own words in the backup
  savedAt?: number // the last backup that got there, in ms
  dirty?: true // something changed since
}

export type Snapshot = { v: number; made: number; words: boolean; entries: Record<string, string> }

export function vaultState(): VaultState | null {
  const v = loadJSON(STATE_KEY) as VaultState | null
  return v && (typeof v.phrase === 'string' || typeof v.sync === 'string') && typeof v.version === 'number' && typeof v.words === 'boolean' ? v : null
}

function saveState(s: VaultState) {
  saveJSON(STATE_KEY, s)
}

// The phrase.

export function newPhrase(): string {
  return generateMnemonic(wordlist, 128)
}

export function normalisePhrase(input: string): string {
  return input.toLowerCase().normalize('NFKD').split(/[^a-z]+/).filter(Boolean).join(' ')
}

// phraseProblem says what is wrong with a typed phrase, or null when it is a
// sound one: too few or many words, a word not on the list, or words that
// do not belong together (the checksum).
export type PhraseProblem = { kind: 'count'; words: number } | { kind: 'word'; word: string; at: number } | { kind: 'checksum' }

export function phraseProblem(input: string): PhraseProblem | null {
  const words = normalisePhrase(input).split(' ').filter(Boolean)
  if (words.length !== 12) return { kind: 'count', words: words.length }
  const bad = words.findIndex((w) => !wordlist.includes(w))
  if (bad >= 0) return { kind: 'word', word: words[bad], at: bad + 1 }
  return validateMnemonic(words.join(' '), wordlist) ? null : { kind: 'checksum' }
}

// The keys.

type Keys = { vaultKey: string; seal: CryptoKey }
type PhraseKeys = Keys & { sealRaw: string; journal: Keys }
const keyCache = new Map<string, Promise<PhraseKeys>>()
const utf8 = (s: string) => new TextEncoder().encode(s)

export function keysFor(phrase: string): Promise<PhraseKeys> {
  const p = normalisePhrase(phrase)
  let k = keyCache.get(p)
  if (!k) {
    k = deriveKeys(p)
    keyCache.clear() // only ever the one phrase in memory
    keyCache.set(p, k)
  }
  return k
}

async function deriveKeys(phrase: string): Promise<PhraseKeys> {
  const seed = await mnemonicToSeedWebcrypto(phrase)
  const base = await crypto.subtle.importKey('raw', bytes(seed), 'HKDF', false, ['deriveBits', 'deriveKey'])
  const salt = utf8('persona-index vault v1')
  const bits = (info: string) => crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: utf8(info) }, base, 256).then((b) => new Uint8Array(b))
  // The seal key's bits are the same an AES-GCM deriveKey would give, so
  // backups made before Reflect 2.0 still open.
  const [vaultBits, sealBits, journalVault, journalSeal] = await Promise.all([bits('vault key'), bits('seal key'), bits('journal vault key'), bits('journal seal key')])
  return {
    vaultKey: base64url(vaultBits),
    seal: await aesKey(sealBits),
    sealRaw: base64url(sealBits),
    journal: { vaultKey: base64url(journalVault), seal: await aesKey(journalSeal) },
  }
}

const aesKey = (raw: Uint8Array) => crypto.subtle.importKey('raw', bytes(raw), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])

const SYNC_PREFIX = 'sk2.'

// syncSecret is what easy sync keeps for the account: the main copy's two
// keys. Never the phrase, and nothing that opens the journal copy.
export async function syncSecret(phrase: string): Promise<string> {
  const k = await keysFor(phrase)
  return `${SYNC_PREFIX}${k.vaultKey}.${k.sealRaw}`
}

export const isSyncSecret = (s: string) => /^sk2\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(s)

export async function keysFromSync(secret: string): Promise<Keys> {
  const [vaultKey, sealRaw] = secret.slice(SYNC_PREFIX.length).split('.')
  const raw = Uint8Array.from(atob(sealRaw.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
  return { vaultKey, seal: await aesKey(raw) }
}

// mainKeys are the keys for the main copy: from the phrase when this phone
// has it, else from what sync gave it.
async function mainKeys(st: VaultState): Promise<Keys> {
  return st.phrase ? keysFor(st.phrase) : keysFromSync(st.sync!)
}

// Sealing. A sealed backup is one format byte, a 12-byte nonce and the
// AES-GCM ciphertext with its tag; the format byte is bound in as extra data.
const PLAIN = 1
const GZIP = 2

export async function seal(key: CryptoKey, s: Snapshot): Promise<Uint8Array> {
  let body: Uint8Array = utf8(JSON.stringify(s))
  let format = PLAIN
  if (typeof CompressionStream !== 'undefined') {
    body = await squeeze(body, new CompressionStream('gzip'))
    format = GZIP
  }
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(format) }, key, bytes(body)),
  )
  const out = new Uint8Array(1 + iv.length + sealed.length)
  out[0] = format
  out.set(iv, 1)
  out.set(sealed, 1 + iv.length)
  return out
}

export async function unseal(key: CryptoKey, sealed: Uint8Array): Promise<Snapshot> {
  const format = sealed[0]
  if (format !== PLAIN && format !== GZIP) throw new Error('unknown backup format')
  let body: Uint8Array = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes(sealed.slice(1, 13)), additionalData: aad(format) },
      key,
      bytes(sealed.slice(13)),
    ),
  )
  if (format === GZIP) body = await squeeze(body, new DecompressionStream('gzip'))
  const s = JSON.parse(new TextDecoder().decode(body)) as Snapshot
  if (!s || typeof s !== 'object' || typeof s.entries !== 'object' || s.v > SNAPSHOT_VERSION) throw new Error('unreadable backup')
  return s
}

const aad = (format: number) => utf8(`persona-index vault ${format}`)

async function squeeze(b: Uint8Array, t: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const stream = new Response(bytes(b)).body!.pipeThrough(t)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

// bytes copies into a fresh ArrayBuffer, which every WebCrypto takes.
function bytes(b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(b.length))
  out.set(b)
  return out
}

function base64url(b: Uint8Array): string {
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// What a backup carries.

const CARD_PREFIX = 'pi.nb.card.'

export type Copy = 'main' | 'journal'

// snapshot gathers what the registry backs up from this phone into one
// copy: the main copy everything but the writing, the journal copy only it.
export function snapshot(words: boolean, copy: Copy = 'main'): Snapshot {
  const entries: Record<string, string> = {}
  for (const k of keys()) {
    const e = entryFor(k)
    if (!e || e.backup === 'never' || (e.backup === 'words' && !words)) continue
    if ((e.backup === 'journal') !== (copy === 'journal')) continue
    const v = load(k)
    if (v === null) continue
    entries[k] = words || !k.startsWith(CARD_PREFIX) ? v : withoutWords(v)
  }
  return { v: SNAPSHOT_VERSION, made: Date.now(), words, entries }
}

function withoutWords(raw: string): string {
  try {
    const c = JSON.parse(raw)
    if (c && typeof c === 'object' && 'words' in c) {
      delete c.words
      return JSON.stringify(c)
    }
  } catch {
    // not a card: as it is
  }
  return raw
}

// mergeEntries brings two sets of keys together by the registry's rules.
// prefer says whose copy of a plain setting wins: this phone's when merging
// in another phone's backup, the backup's when restoring from it. An answered
// question stays answered either way, and a key the backup never carries is
// never taken from one.
export function mergeEntries(local: Record<string, string>, other: Record<string, string>, prefer: 'local' | 'other') {
  const out: Record<string, string> = { ...local }
  for (const [k, theirs] of Object.entries(other)) {
    const e = entryFor(k)
    if (!e || e.backup === 'never') continue
    const mine = local[k]
    if (mine === undefined) {
      out[k] = theirs
      continue
    }
    switch (e.merge) {
      case 'newest': {
        const m = parse(mine)
        out[k] = mergeEntry(m, parse(theirs)) === m ? mine : theirs
        break
      }
      case 'history':
        out[k] = JSON.stringify(mergeHistory(parse(mine) as History, parse(theirs) as History))
        break
      case 'moves':
        out[k] = JSON.stringify(mergeMoves(parse(mine) as Move[], parse(theirs) as Move[]))
        break
      case 'local':
        out[k] = prefer === 'other' && !k.startsWith('pi.choice.') ? theirs : mine
    }
  }
  return out
}

function parse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// Answers merge question by question: one answered on either phone is
// answered, and a tap under its card on either is kept.
export function mergeHistory(a: History | null, b: History | null): History {
  const ok = (h: History | null): History => (h && Array.isArray(h.answers) && Array.isArray(h.skips) ? h : { answers: [], skips: [] })
  const x = ok(a)
  const y = ok(b)
  const byQ = new Map<string, AnswerRecord>()
  for (const r of [...x.answers, ...y.answers]) {
    const had = byQ.get(r.questionId)
    if (!had) {
      byQ.set(r.questionId, r)
      continue
    }
    // A tap made on either phone joins the answer: the verdict with its
    // closer reading, and the evening's word on the route with its label.
    const next = { ...had }
    if (!had.verdict && r.verdict) Object.assign(next, { verdict: r.verdict, closer: r.closer })
    if (!had.route && r.route) Object.assign(next, { route: r.route, label: r.label })
    byQ.set(r.questionId, next)
  }
  const skips = new Map<string, SkipRecord>()
  for (const s of [...x.skips, ...y.skips]) skips.set(`${s.date}|${s.theme}|${s.questionId ?? ''}`, s)
  const byDate = <T extends { date: string }>(p: T, q: T) => p.date.localeCompare(q.date)
  return { answers: [...byQ.values()].sort(byDate), skips: [...skips.values()].sort(byDate) }
}

// Small steps merge step by step; this phone's word on one it has wins.
export function mergeMoves(a: Move[] | null, b: Move[] | null): Move[] {
  const byQ = new Map<string, Move>()
  for (const m of [...(Array.isArray(b) ? b : []), ...(Array.isArray(a) ? a : [])]) byQ.set(m.questionId || `${m.date}|${m.step}`, m)
  return [...byQ.values()].sort((p, q) => p.date.localeCompare(q.date)).slice(-60)
}

function localEntries(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of keys()) {
    const v = load(k)
    if (v !== null) out[k] = v
  }
  return out
}

function writeEntries(next: Record<string, string>) {
  for (const [k, v] of Object.entries(next)) if (load(k) !== v) save(k, v)
}

// The server.

class VaultError extends Error {
  readonly status: number
  readonly version?: number
  constructor(status: number, version?: number) {
    super(`backup: ${status}`)
    this.status = status
    this.version = version
  }
}

async function call(method: 'GET' | 'PUT' | 'DELETE', vaultKey: string, init: { body?: Uint8Array; headers?: Record<string, string> } = {}) {
  const res = await fetch('/api/vault', {
    method,
    headers: { Authorization: `Vault ${vaultKey}`, ...(init.body ? { 'Content-Type': 'application/octet-stream' } : {}), ...init.headers },
    body: init.body ? bytes(init.body) : undefined,
  })
  if (!res.ok) {
    let version: number | undefined
    try {
      const b = await res.json()
      if (typeof b?.version === 'number') version = b.version
    } catch {
      // no body
    }
    throw new VaultError(res.status, version)
  }
  return res
}

const versionOf = (res: Response) => Number((res.headers.get('ETag') ?? '').replace(/"/g, '')) || 0

async function read(k: Keys): Promise<{ version: number; snapshot: Snapshot } | null> {
  try {
    const res = await call('GET', k.vaultKey)
    return { version: versionOf(res), snapshot: await unseal(k.seal, new Uint8Array(await res.arrayBuffer())) }
  } catch (e) {
    if (e instanceof VaultError && e.status === 404) return null
    throw e
  }
}

// Backing up.

export type BackupResult = 'saved' | 'off' | 'gone' | 'later'

let running: Promise<BackupResult> | null = null
let generation = 0 // counts changes, so a change during a backup is not lost

export function backUp(): Promise<BackupResult> {
  running ??= backUpOnce().finally(() => {
    running = null
  })
  return running
}

async function backUpOnce(): Promise<BackupResult> {
  let st = vaultState()
  if (!st) return 'off'
  if (!st.dirty) return 'saved' // nothing new since the last backup
  try {
    const seen = generation
    const main = await writeCopy(await mainKeys(st), 'main', st.version, st.words)
    if (main === 'gone') {
      // Deleted on another phone: this one stops backing up.
      remove(STATE_KEY)
      return 'gone'
    }
    st = { ...(vaultState() ?? st), version: main }
    // The journal copy, only with the phrase, and only once there is
    // writing to keep (or a copy already).
    if (st.phrase && ((st.journalVersion ?? 0) > 0 || Object.keys(snapshot(st.words, 'journal').entries).length > 0)) {
      const journal = await writeCopy((await keysFor(st.phrase)).journal, 'journal', st.journalVersion ?? 0, st.words)
      st = { ...st, journalVersion: journal === 'gone' ? 0 : journal }
    }
    st = { ...st, savedAt: Date.now() }
    if (seen === generation) delete st.dirty
    saveState(st)
    if (st.dirty) schedule()
    return 'saved'
  } catch {
    // offline, busy or refused: try again later
  }
  const now = vaultState()
  if (now) saveState({ ...now, dirty: true })
  return 'later'
}

// writeCopy seals one copy and puts it, taking in another phone's copy when
// that one wrote first. It gives the new version, or 'gone' when the copy
// was deleted elsewhere.
async function writeCopy(k: Keys, copy: Copy, version: number, words: boolean): Promise<number | 'gone'> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const sealed = await seal(k.seal, snapshot(words, copy))
    try {
      const res = await call('PUT', k.vaultKey, {
        body: sealed,
        headers: version === 0 ? { 'If-None-Match': '*' } : { 'If-Match': `"${version}"` },
      })
      return versionOf(res)
    } catch (e) {
      if (!(e instanceof VaultError)) throw e
      if (e.status === 404) return 'gone'
      if (e.status !== 412) throw e
      const theirs = await read(k)
      if (theirs) writeEntries(mergeEntries(localEntries(), theirs.snapshot.entries, 'local'))
      version = theirs?.version ?? 0
    }
  }
  throw new Error('backup: kept meeting another phone')
}

let timer: ReturnType<typeof setTimeout> | null = null

function schedule(delay = BACKUP_DELAY_MS) {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void backUp()
  }, delay)
}

// startBackups watches for changes worth backing up, while backup is on, and
// backs up a little after them; and at once if a backup was left waiting.
// It returns the function that stops it.
export function startBackups(): () => void {
  const stop = onChange((key) => {
    const st = vaultState()
    const e = entryFor(key)
    if (!st || !e || e.backup === 'never' || (e.backup === 'words' && !st.words) || (e.backup === 'journal' && !st.phrase)) return
    generation++
    if (!st.dirty) saveState({ ...st, dirty: true })
    schedule()
  })
  const online = () => vaultState()?.dirty && schedule(0)
  if (typeof window !== 'undefined') window.addEventListener('online', online)
  if (vaultState()?.dirty) schedule(0)
  return () => {
    stop()
    if (typeof window !== 'undefined') window.removeEventListener('online', online)
    if (timer) clearTimeout(timer)
    timer = null
  }
}

// Turning it on, off and restoring.

// turnOn starts backing up under a phrase the person has written down. It
// resolves once the first backup is made, or is waiting to be.
export async function turnOn(phrase: string, words: boolean): Promise<BackupResult> {
  if (phraseProblem(phrase)) throw new Error('not a recovery phrase')
  saveState({ phrase: normalisePhrase(phrase), version: 0, words, dirty: true })
  return backUp()
}

export function setWords(words: boolean) {
  const st = vaultState()
  if (!st || st.words === words) return
  saveState({ ...st, words, dirty: true })
  schedule(0)
}

// turnOff deletes the backup from the server, then stops backing up. The
// phrase is forgotten too: a new one is made if backup is turned on again.
export async function turnOff(): Promise<void> {
  const st = vaultState()
  if (!st) return
  await call('DELETE', (await mainKeys(st)).vaultKey)
  if (st.phrase) await call('DELETE', (await keysFor(st.phrase)).journal.vaultKey)
  remove(STATE_KEY)
}

// deleteBackup is the backup's part of "Delete everywhere". It throws when
// the server cannot be reached, so nothing is said to be deleted that is not.
export const deleteBackup = turnOff

export type RestoreResult = 'restored' | 'none' | 'damaged'

async function readOrDamaged(k: Keys): Promise<Awaited<ReturnType<typeof read>> | 'damaged'> {
  try {
    return await read(k)
  } catch (e) {
    if (e instanceof VaultError) throw e
    if (e instanceof TypeError) throw e // offline
    return 'damaged'
  }
}

// takeIn merges a copy into this phone, as a restore does.
function takeIn(entries: Record<string, string>) {
  const before = load('pi.device.v1')
  writeEntries(mergeEntries(localEntries(), entries, 'other'))
  if (load('pi.device.v1') !== before) {
    // Waiting sends belonged to the other pass; the answers they carry are
    // already closed on this phone, so none can count twice.
    for (const p of ['pi.pending.', 'pi.unrated.']) for (const key of keys(p)) remove(key)
  }
}

// restore brings back what a backup holds onto this phone: its pass, its
// settings and notebook, its writing, everything the backup carries, merged
// with anything already here so no answer counts twice. From then on this
// phone backs up under the same phrase.
export async function restore(phrase: string): Promise<RestoreResult> {
  if (phraseProblem(phrase)) throw new Error('not a recovery phrase')
  const k = await keysFor(phrase)
  const found = await readOrDamaged(k)
  if (found === 'damaged') return 'damaged'
  if (!found) return 'none'
  takeIn(found.snapshot.entries)
  const journal = await readOrDamaged(k.journal)
  if (journal && journal !== 'damaged') takeIn(journal.snapshot.entries)
  const sync = vaultState()?.sync
  saveState({
    phrase: normalisePhrase(phrase),
    ...(sync ? { sync } : {}),
    version: found.version,
    journalVersion: journal && journal !== 'damaged' ? journal.version : 0,
    words: found.snapshot.words,
    savedAt: Date.now(),
  })
  return 'restored'
}

// restoreFromSync is a signed-in phone restoring with the keys easy sync
// keeps: everything but the writing, which waits for the 12 words.
export async function restoreFromSync(secret: string): Promise<RestoreResult> {
  const found = await readOrDamaged(await keysFromSync(secret))
  if (found === 'damaged') return 'damaged'
  if (!found) return 'none'
  takeIn(found.snapshot.entries)
  saveState({ sync: secret, version: found.version, words: found.snapshot.words, savedAt: Date.now() })
  return 'restored'
}

// writingWaits reports a phone restored through sync whose reflections are
// still sealed: Reflect asks for the 12 words, once.
export function writingWaits(): boolean {
  const st = vaultState()
  return !!st && !st.phrase && !!st.sync
}

// restoreWriting takes the 12 words on such a phone: they must be the ones
// behind this account's backup. Then the writing comes back, and this phone
// backs up both copies from now on.
export async function restoreWriting(phrase: string): Promise<RestoreResult | 'mismatch'> {
  if (phraseProblem(phrase)) throw new Error('not a recovery phrase')
  const st = vaultState()
  if (st?.sync && (await syncSecret(phrase)) !== st.sync) return 'mismatch'
  return restore(phrase)
}
