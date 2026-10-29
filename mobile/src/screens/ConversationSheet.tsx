// The conversation sheet (Edwin's brief, 2026-10-29: "Bring to a
// Conversation"). A sheet slides up to choose the days and what goes in,
// then shows the page itself: to read from during the conversation, print,
// or share as a PDF. Everything is made here, on the phone (shared
// conversationSheet.ts); nothing is sent anywhere unless the person shares
// the page.
import { useMemo, useState, type ReactNode } from 'react'
import { Modal, Platform, Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Asset } from 'expo-asset'
import { File, Paths } from 'expo-file-system'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import { Geist_400Regular, Geist_700Bold } from '@expo-google-fonts/geist'
import {
  BOX_TITLES,
  DEFAULT_PARTS,
  makeSheet,
  SHEET_EMPTY,
  SHEET_FOOTER,
  sheetDates,
  sheetGate,
  sheetHTML,
  sheetTitles,
  wordsChoices,
  type Sheet,
  type SheetParts,
  type SheetRange,
} from '@shared/conversationSheet'
import { checkIns } from '@shared/growthJourney'
import { cardTextOf } from '@shared/insights'
import { loadMoves } from '@shared/moves'
import { allGoodThings, reflections } from '@shared/notebook'
import { noteFreeTry } from '@shared/patron'
import { loadHistory } from '@shared/profile'
import { dayMonth } from '@shared/reflect'
import { addDays, load } from '@shared/storage'
import { NAME_KEY } from '@shared/welcomeKeys'
import { brand, gutter, radius, useTheme, typeScale } from '../theme'
import { Icon } from '../ui/Icon'
import { Mark } from '../ui/Logo'
import { canOpenPatron, openPatron, PatronNote } from '../ui/Patron'
import { Button, feel, RowGroup, RowLink, Segmented, T } from '../ui/kit'

const web = Platform.OS === 'web'

// The page is paper whatever the app's light or dark: the same cream and
// midnight as the PDF it becomes.
const PAPER = {
  page: '#f6f1e8',
  box: '#fffefa',
  line: '#e4dccd',
  ink: '#0b1c2c',
  ink2: '#33414d',
  muted: '#6f6556',
  head: '#013d5a',
  tag: '#eef3e0',
  tagInk: '#24420f',
} as const

const RANGES: { value: string; label: string }[] = [
  { value: '7', label: 'Last 7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
]

const PARTS: { key: keyof SheetParts; label: string; sub: string }[] = [
  { key: 'patterns', label: 'What kept coming up', sub: 'The parts of life you answered about most, what you reached for, and both sides of a reading' },
  { key: 'steps', label: 'Steps I tried and how they went', sub: 'Only the ones you said helped, or made things harder' },
  { key: 'good', label: 'Three good things', sub: 'How often you noted them and what they were mostly about, never the words' },
  { key: 'words', label: 'My own words and kept moments', sub: 'Off unless you choose. Then you pick exactly which ones.' },
]

// The entry on My Journey and at the bottom of the Sunday Mirror.
export function PrepareSheet({ today }: { today: string }) {
  const p = useTheme()
  const [open, setOpen] = useState(false)
  return (
    <>
      <RowLink
        label="Prepare a conversation sheet"
        sub="A one-page summary of your recent days to bring to a trusted conversation, counsellor or mentor."
        icon={<Icon name="doc" size={22} color={p.accentInk} />}
        onPress={() => setOpen(true)}
      />
      {open && <ConversationSheet today={today} onClose={() => setOpen(false)} />}
    </>
  )
}

type Shared = 'idle' | 'busy' | 'done' | 'failed'

export function ConversationSheet({ today, onClose }: { today: string; onClose: () => void }) {
  const p = useTheme()
  const insets = useSafeAreaInsets()
  const [range, setRange] = useState<SheetRange>(7)
  const [parts, setParts] = useState<SheetParts>(DEFAULT_PARTS)
  const [picked, setPicked] = useState<string[]>([])
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [shared, setShared] = useState<Shared>('idle')
  // A free longer sheet, once made, can be remade while this stays open.
  const [unlocked, setUnlocked] = useState<SheetRange | null>(null)
  const data = useMemo(() => ({ history: loadHistory(), moves: loadMoves(), checks: checkIns(), good: allGoodThings(), written: reflections() }), [])
  const choices = useMemo(() => wordsChoices(data.written, addDays(today, -(range - 1)), today), [data, range, today])
  const gate = unlocked === range ? 'open' : sheetGate(range, today)

  function make() {
    if (gate === 'patron') return
    if (gate === 'trial') {
      noteFreeTry('sheet')
      setUnlocked(range)
    }
    feel('done')
    const name = load(NAME_KEY) ?? undefined
    setSheet(makeSheet({ today, range, parts, ...data, textOf: cardTextOf, picked: picked.filter((id) => choices.some((c) => c.id === id)), name }))
    setShared('idle')
  }

  async function share(s: Sheet) {
    setShared('busy')
    try {
      setShared((await sharePage(s)) ? 'done' : 'failed')
    } catch {
      setShared('failed')
    }
  }

  const toggle = (k: keyof SheetParts) => setParts((x) => ({ ...x, [k]: !x[k] }))
  const pick = (id: string) => setPicked((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]))

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: gutter,
            paddingTop: Platform.OS === 'ios' ? 20 : Math.max(insets.top, 16) + 4,
            paddingBottom: insets.bottom + 40,
            gap: 16,
            width: '100%',
            maxWidth: 640,
            alignSelf: 'center',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {sheet ? <Button kind="text" label="Change what’s in it" onPress={() => setSheet(null)} /> : null}
            <View style={{ flex: 1 }} />
            <Button kind="text" label="Close" onPress={onClose} />
          </View>

          {sheet ? (
            <>
              <SheetView sheet={sheet} />
              <Button wide icon="share" label={web ? 'Print or save as PDF' : 'Share or print'} busy={shared === 'busy'} onPress={() => share(sheet)} />
              <T v="small" tone={shared === 'failed' ? 'danger' : 'muted'} center>
                {shared === 'failed'
                  ? 'I couldn’t make the file just now. Please try again.'
                  : shared === 'done'
                    ? 'Ready. Nobody else has a copy unless you share it.'
                    : 'Read it from here during the conversation, or share it as a PDF before you meet.'}
              </T>
            </>
          ) : (
            <>
              <View style={{ gap: 6 }}>
                <T v="title">Prepare a conversation sheet</T>
                <T tone="text2">A one-page summary of your recent days to bring to a trusted conversation, counsellor or mentor.</T>
              </View>

              <View style={{ gap: 8 }}>
                <T v="h3">How far back?</T>
                <Segmented label="How far back?" options={RANGES} value={String(range)} onChange={(v) => setRange(Number(v) as SheetRange)} />
                {gate === 'trial' && (
                  <T v="small" tone="muted">
                    Your first longer sheet is free.
                  </T>
                )}
                {gate === 'patron' && (
                  <PatronNote
                    text="Preparing conversation sheets across 14 and 30 days is part of The Persona Index Patron."
                    onOpen={
                      canOpenPatron()
                        ? () => {
                            onClose()
                            openPatron()
                          }
                        : undefined
                    }
                  />
                )}
              </View>

              <View style={{ gap: 8 }}>
                <T v="h3">What to include</T>
                <RowGroup>
                  {PARTS.map((x) => (
                    <Tick key={x.key} label={x.label} sub={x.sub} on={parts[x.key]} onPress={() => toggle(x.key)} />
                  ))}
                </RowGroup>
              </View>

              {parts.words && (
                <View style={{ gap: 8 }}>
                  <T v="h3">Which of your words?</T>
                  {choices.length ? (
                    <RowGroup>
                      {choices.map((r) => (
                        <Tick
                          key={r.id}
                          label={short(r.answer)}
                          sub={`${dayMonth(r.date)} · ${r.source === 'moment' ? 'A moment you kept' : r.free || !r.question.trim() ? 'Written freely' : r.question}`}
                          on={picked.includes(r.id)}
                          onPress={() => pick(r.id)}
                        />
                      ))}
                    </RowGroup>
                  ) : (
                    <T v="small" tone="muted">
                      Nothing written in these days yet.
                    </T>
                  )}
                </View>
              )}

              <Button wide label="Make my sheet" disabled={gate === 'patron'} onPress={make} />
              <T v="small" tone="muted" center>
                Made on this phone. Nothing is sent anywhere unless you share it.
              </T>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  )
}

const short = (s: string) => {
  const t = s.trim().replace(/\s+/g, ' ')
  return t.length > 90 ? `${t.slice(0, 88).trimEnd()}…` : t
}

// A choice to include something: its words, and a box that fills with a
// tick. The fill is always drawn and shown by opacity, so Android keeps its
// round corners.
function Tick({ label, sub, on, onPress }: { label: string; sub?: string; on: boolean; onPress: () => void }) {
  const p = useTheme()
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      onPress={() => {
        feel('select')
        onPress()
      }}
      style={(s) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: s.pressed ? p.surface2 : 'transparent' })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <T v="h3" style={typeScale.body}>
          {label}
        </T>
        {sub ? (
          <T v="small" tone="muted">
            {sub}
          </T>
        ) : null}
      </View>
      <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: on ? p.lime : p.control, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', top: -1.5, left: -1.5, right: -1.5, bottom: -1.5, borderRadius: 7, backgroundColor: p.lime, opacity: on ? 1 : 0 }} />
        {/* Positioned too, so on the web it paints above the fill, as it does on a phone. */}
        {on && (
          <View style={{ position: 'relative' }}>
            <Icon name="check" size={16} color={p.onLime} width={2.6} />
          </View>
        )}
      </View>
    </Pressable>
  )
}

// ---- the page on the screen ----

function SheetView({ sheet }: { sheet: Sheet }) {
  const t = sheetTitles(sheet.range)
  const boxes: { key: string; title: string; numbered: boolean; body: ReactNode }[] = []
  if (sheet.energy)
    boxes.push({
      key: 'energy',
      title: BOX_TITLES.energy,
      numbered: true,
      body: (
        <>
          {sheet.energy.areas.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {sheet.energy.areas.map((a) => (
                <View key={a} style={{ backgroundColor: PAPER.tag, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <T v="tiny" bold style={{ color: PAPER.tagInk }}>
                    {a}
                  </T>
                </View>
              ))}
            </View>
          )}
          <Line>{sheet.energy.line}</Line>
        </>
      ),
    })
  if (sheet.sides)
    boxes.push({
      key: 'sides',
      title: t.sides,
      numbered: true,
      body: sheet.sides.length ? sheet.sides.map((x) => <Quote key={x.label} label={x.label} text={`“${x.text}”`} />) : <Line muted>{SHEET_EMPTY.sides}</Line>,
    })
  if (sheet.tried)
    boxes.push({
      key: 'tried',
      title: BOX_TITLES.tried,
      numbered: true,
      body: sheet.tried.length ? sheet.tried.map((l) => <Bullet key={l}>{l}</Bullet>) : <Line muted>{SHEET_EMPTY.tried}</Line>,
    })
  boxes.push({
    key: 'talk',
    title: BOX_TITLES.talk,
    numbered: true,
    body: sheet.talk.map((q, i) => (
      <Bullet key={q} mark={`${i + 1}.`}>
        {q}
      </Bullet>
    )),
  })
  if (sheet.good) boxes.push({ key: 'good', title: BOX_TITLES.good, numbered: false, body: <Line>{sheet.good}</Line> })
  if (sheet.words?.length)
    boxes.push({
      key: 'words',
      title: BOX_TITLES.words,
      numbered: false,
      body: sheet.words.map((w) => <Quote key={`${w.date}${w.text}`} label={`${dayMonth(w.date)}${w.question ? ` · ${w.question}` : ''}`} text={w.text} />),
    })
  const numbered = boxes.filter((b) => b.numbered)

  return (
    <View style={{ backgroundColor: PAPER.page, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: PAPER.line }}>
      <View style={{ backgroundColor: brand.night, padding: 20, flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <Mark size={36} />
        <View style={{ flex: 1, gap: 2 }}>
          <T v="tiny" bold style={{ color: brand.sprout }}>
            To bring to a conversation
          </T>
          <T v="title" style={{ color: brand.onNight }}>
            {t.title}
          </T>
          <T v="small" style={{ color: brand.onNight2 }}>
            {`${sheetDates(sheet)}${sheet.name ? ` · ${sheet.name}` : ''}`}
          </T>
        </View>
      </View>
      <View style={{ padding: 12, gap: 10 }}>
        {boxes.map((b) => (
          <View key={b.key} style={{ backgroundColor: PAPER.box, borderRadius: radius.md, borderWidth: 1, borderColor: PAPER.line, padding: 14, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {b.numbered && (
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: brand.night, alignItems: 'center', justifyContent: 'center' }}>
                  <T v="tiny" bold style={{ color: brand.sprout }}>
                    {String(numbered.indexOf(b) + 1)}
                  </T>
                </View>
              )}
              <T v="h3" style={{ color: PAPER.head, flex: 1 }}>
                {b.title}
              </T>
            </View>
            {b.body}
          </View>
        ))}
      </View>
      <T v="tiny" style={{ color: PAPER.muted, paddingHorizontal: 16, paddingBottom: 16 }}>
        {SHEET_FOOTER}
      </T>
    </View>
  )
}

function Line({ children, muted }: { children: string; muted?: boolean }) {
  return (
    <T v="small" style={{ color: muted ? PAPER.muted : PAPER.ink2 }}>
      {children}
    </T>
  )
}

function Bullet({ children, mark = '•' }: { children: string; mark?: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <T v="small" bold style={{ color: PAPER.head }}>
        {mark}
      </T>
      <T v="small" style={{ color: PAPER.ink2, flex: 1 }}>
        {children}
      </T>
    </View>
  )
}

function Quote({ label, text }: { label: string; text: string }) {
  return (
    <View style={{ gap: 2 }}>
      <T v="tiny" bold style={{ color: PAPER.muted }}>
        {label}
      </T>
      <View style={{ borderLeftWidth: 3, borderLeftColor: brand.marigold, paddingLeft: 9 }}>
        <T v="small" style={{ color: PAPER.ink }}>
          {text}
        </T>
      </View>
    </View>
  )
}

// ---- the PDF ----

// Geist inside the page: the app's own files, read here. Without them the
// page uses the phone's own face.
async function pageFonts(): Promise<{ regular?: string; bold?: string }> {
  try {
    const [regular, bold] = await Asset.loadAsync([Geist_400Regular, Geist_700Bold])
    if (web) return { regular: regular.uri, bold: bold.uri }
    const read = async (a: Asset) => `data:font/ttf;base64,${await new File(a.localUri ?? a.uri).base64()}`
    return { regular: await read(regular), bold: await read(bold) }
  } catch {
    return {}
  }
}

// The phone makes the PDF and hands it to its share sheet (Files, Print,
// a message); the web opens the browser's print, where it can be saved as a PDF.
async function sharePage(sheet: Sheet): Promise<boolean> {
  const html = sheetHTML(sheet, await pageFonts())
  if (web) return printOnWeb(html)
  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 })
  const pdf = new File(Paths.cache, `conversation-sheet-${sheet.to}.pdf`)
  if (pdf.exists) pdf.delete()
  new File(uri).moveSync(pdf)
  await Sharing.shareAsync(pdf.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Your conversation sheet' })
  return true
}

function printOnWeb(html: string): Promise<boolean> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.setAttribute('tabindex', '-1')
    Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' })
    document.body.appendChild(frame)
    const win = frame.contentWindow
    const doc = frame.contentDocument
    if (!win || !doc) {
      frame.remove()
      resolve(false)
      return
    }
    doc.open()
    doc.write(html)
    doc.close()
    const go = () => {
      win.focus()
      win.print()
      setTimeout(() => frame.remove(), 1000)
      resolve(true)
    }
    const fonts = (doc as Document & { fonts?: { ready: Promise<unknown> } }).fonts
    if (fonts?.ready) fonts.ready.then(go, go)
    else setTimeout(go, 300)
  })
}
