// The small part of WebCrypto the shared backup code (frontend/src/vault.ts
// and @scure/bip39) uses, for phones whose JavaScript engine has none:
// PBKDF2 and HKDF to turn the 12 words into keys, and AES-GCM to seal and
// open the backup. Built on the audited @noble libraries, so a backup made
// in a browser opens on a phone and the other way round. (Gzip is in
// gzip.ts.)
import { gcm } from '@noble/ciphers/aes.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js'
import { sha256, sha512 } from '@noble/hashes/sha2.js'

type Alg = 'PBKDF2' | 'HKDF' | 'AES-GCM'
type Key = { type: 'secret'; extractable: false; algorithm: { name: Alg }; usages: string[]; raw: Uint8Array }
type Named = string | { name: string }

const nameOf = (a: Named) => (typeof a === 'string' ? a : a.name).toUpperCase()
const hashOf = (h: Named) => {
  const n = nameOf(h)
  if (n === 'SHA-256') return sha256
  if (n === 'SHA-512') return sha512
  throw new Error(`unsupported hash ${n}`)
}
const bytesOf = (b: BufferSource | undefined): Uint8Array =>
  b === undefined ? new Uint8Array(0) : b instanceof Uint8Array ? b : ArrayBuffer.isView(b) ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : new Uint8Array(b)
const buffer = (b: Uint8Array): ArrayBuffer => b.slice().buffer as ArrayBuffer

const subtle = {
  async importKey(format: string, data: BufferSource, algorithm: Named, _extractable: boolean, usages: string[]): Promise<Key> {
    if (format !== 'raw') throw new Error('only raw keys')
    const name = nameOf(algorithm) as Alg
    if (name !== 'PBKDF2' && name !== 'HKDF' && name !== 'AES-GCM') throw new Error(`unsupported key ${name}`)
    return { type: 'secret', extractable: false, algorithm: { name }, usages, raw: bytesOf(data).slice() }
  },

  async deriveBits(params: { name: string; hash: Named; salt: BufferSource; info?: BufferSource; iterations?: number }, key: Key, length: number): Promise<ArrayBuffer> {
    const name = nameOf(params.name)
    if (name !== key.algorithm.name) throw new Error('key does not match')
    const dkLen = length / 8
    if (name === 'PBKDF2') return buffer(await pbkdf2Async(hashOf(params.hash), key.raw, bytesOf(params.salt), { c: params.iterations ?? 0, dkLen, asyncTick: 20 }))
    if (name === 'HKDF') return buffer(hkdf(hashOf(params.hash), key.raw, bytesOf(params.salt), bytesOf(params.info), dkLen))
    throw new Error(`unsupported derivation ${name}`)
  },

  async encrypt(params: { name: string; iv: BufferSource; additionalData?: BufferSource }, key: Key, data: BufferSource): Promise<ArrayBuffer> {
    if (nameOf(params.name) !== 'AES-GCM' || key.algorithm.name !== 'AES-GCM') throw new Error('only AES-GCM')
    const aad = params.additionalData === undefined ? undefined : bytesOf(params.additionalData)
    return buffer(gcm(key.raw, bytesOf(params.iv), aad).encrypt(bytesOf(data)))
  },

  async decrypt(params: { name: string; iv: BufferSource; additionalData?: BufferSource }, key: Key, data: BufferSource): Promise<ArrayBuffer> {
    if (nameOf(params.name) !== 'AES-GCM' || key.algorithm.name !== 'AES-GCM') throw new Error('only AES-GCM')
    const aad = params.additionalData === undefined ? undefined : bytesOf(params.additionalData)
    return buffer(gcm(key.raw, bytesOf(params.iv), aad).decrypt(bytesOf(data)))
  },

  async digest(algorithm: Named, data: BufferSource): Promise<ArrayBuffer> {
    return buffer(hashOf(algorithm)(bytesOf(data)))
  },
}

export function installSubtle(c: Record<string, unknown>) {
  if (!c.subtle) c.subtle = subtle
}
