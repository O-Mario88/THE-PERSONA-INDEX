// "Download my book" and the data file (the web app's BookDownloads.tsx).
// The shared book.ts makes both on the phone. Here the book becomes a PDF
// and both go to the phone's share sheet, to keep in Files, print or send;
// the web build saves them as the browser does.
import { useState } from 'react'
import { Platform, View } from 'react-native'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import { File, Paths } from 'expo-file-system'
import { downloadBook, downloadData, makeBook, makeData, type Made } from '@shared/book'
import { Button, T } from '../ui/kit'

type Which = 'book' | 'data'
type State = { kind: 'idle' } | { kind: 'busy'; which: Which } | { kind: 'done'; which: Which; made: Made }

const web = Platform.OS === 'web'
const DONE: Record<Which, Record<Made, string>> = {
  book: {
    saved: web
      ? 'Your book is in your downloads. It opens in any browser, and nobody else has a copy unless you share it.'
      : 'Your book is ready as a PDF. Nobody else has a copy unless you share it.',
    'phone-only':
      `Your book is ${web ? 'in your downloads' : 'ready as a PDF'}, with everything on this phone. I couldn't reach the server, so the answers it keeps for your mirror aren't in it this time.`,
    failed: "I couldn't make the file just now. Please try again.",
  },
  data: {
    saved: 'Your data file is ready: everything on this phone and on the server, as data.',
    'phone-only': "Your data file is ready, with everything on this phone. I couldn't reach the server, so its copy isn't in it this time.",
    failed: "I couldn't make the file just now. Please try again.",
  },
}

// A fresh file of this name in the cache, replacing an older one.
function fresh(name: string): File {
  const f = new File(Paths.cache, name)
  if (f.exists) f.delete()
  return f
}

async function saveBook(today: string, mild: boolean): Promise<Made> {
  if (Platform.OS === 'web') return downloadBook(today, mild)
  const b = await makeBook(today, mild)
  const { uri } = await Print.printToFileAsync({ html: b.text })
  const pdf = fresh(b.name.replace(/\.html$/, '.pdf'))
  new File(uri).moveSync(pdf)
  await Sharing.shareAsync(pdf.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Your book' })
  return b.phoneOnly ? 'phone-only' : 'saved'
}

async function saveData(today: string): Promise<Made> {
  if (Platform.OS === 'web') return downloadData(today)
  const d = await makeData(today)
  const f = fresh(d.name)
  f.write(d.text)
  await Sharing.shareAsync(f.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Your data' })
  return d.phoneOnly ? 'phone-only' : 'saved'
}

export function DownloadButtons({ today, mild, data = false }: { today: string; mild: boolean; data?: boolean }) {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const busy = state.kind === 'busy'

  async function run(which: Which) {
    setState({ kind: 'busy', which })
    let made: Made
    try {
      made = await (which === 'book' ? saveBook(today, mild) : saveData(today))
    } catch {
      made = 'failed'
    }
    setState({ kind: 'done', which, made })
  }

  return (
    <View style={{ gap: 8 }}>
      <Button wide kind="soft" icon="download" label={busy && state.which === 'book' ? 'Making your book…' : 'Download my book'} busy={busy && state.which === 'book'} disabled={busy} onPress={() => run('book')} />
      {data && (
        <Button
          kind="text"
          label={busy && state.which === 'data' ? 'Gathering…' : 'Download everything as a data file'}
          disabled={busy}
          onPress={() => run('data')}
        />
      )}
      {state.kind === 'done' && (
        <T v="small" tone={state.made === 'failed' ? 'danger' : 'muted'}>
          {DONE[state.which][state.made]}
        </T>
      )}
    </View>
  )
}
