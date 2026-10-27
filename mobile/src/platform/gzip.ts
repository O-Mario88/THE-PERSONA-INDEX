// Gzip for sealed backups (frontend/src/vault.ts), from fflate, where the
// engine has no CompressionStream. Imported after setup.ts, since it loads the
// shared vault code.
import { gunzipSync, gzipSync } from 'fflate'
import { gzip } from '@shared/vault'

if (!gzip.available()) {
  gzip.available = () => true
  gzip.zip = async (b: Uint8Array) => gzipSync(b)
  gzip.unzip = async (b: Uint8Array) => gunzipSync(b)
}
