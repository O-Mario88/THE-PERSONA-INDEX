// Bring to a Conversation (Edwin's brief, 2026-10-29): a brief for a
// conversation with a partner, a manager, a mentor or coach, a counsellor or
// a friend. Choose who it's for, write what you want to discuss, pick any
// moments to bring, then read and edit all five parts before anything is
// printed or shared. Everything is made here, on the phone (shared
// conversationSheet.ts); nothing is sent anywhere unless the person shares it.
// One complete brief is free; after that, briefs are part of Patron.
import { useMemo, useState, type ReactNode } from 'react'
import { Modal, Platform, Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Asset } from 'expo-asset'
import { File, Paths } from 'expo-file-system'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import { Geist_400Regular, Geist_700Bold } from '@expo-google-fonts/geist'
import {
  BRIEF_FOR,
  briefTitle,
  linesOf,
  makeSheet,
  SECTION_TITLES,
  SHEET_EMPTY,
  SHEET_FOOTER,
  sheetDates,
  sheetGate,
  sheetHTML,
  wordsChoices,
  type BriefFor,
  type Sheet,
  type SheetRange,
} from '@shared/conversationSheet'
import { checkIns } from '@shared/growthJourney'
import { cardTextOf } from '@shared/insights'
import { loadMoves } from '@shared/moves'
import { intentions, reflections } from '@shared/notebook'
import { noteFreeTry } from '@shared/patron'
import { loadHistory } from '@shared/profile'
import { dayMonth } from '@shared/reflect'
import { addDays, load } from '@shared/storage'
import { NAME_KEY } from '@shared/welcomeKeys'
import { brand, font, gutter, radius, useTheme, typeScale } from '../theme'
import { Icon } from '../ui/Icon'
import { Mark } from '../ui/Logo'
import { canOpenPatron, openPatron, PatronNote } from '../ui/Patron'
import { Button, Card, feel, Option, RowGroup, RowLink, Segmented, T } from '../ui/kit'
import { addSpoken, SpeakInstead } from '../ui/Speak'
import { TextInput } from '../ui/textScale'

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
} as const

const RANGES: { value: string; label: string }[] = [
  { value: '7', label: 'Last 7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
]

const DISCUSS_MAX = 600

// The entry on My Journey and at the bottom of the Sunday Mirror.
export function PrepareSheet({ today }: { today: string }) {
  const p = useTheme()
  const [open, setOpen] = useState(false)
  return (
    <>
      <RowLink
        label="Prepare for a conversation"
        sub="A short brief for your partner, manager, mentor, counsellor or a friend: what you want to discuss, what you tried, and what to ask."
        icon={<Icon name="doc" size={22} color={p.accentInk} />}
        onPress={() => setOpen(true)}
      />
      {open && <ConversationSheet today={today} onClose={() => setOpen(false)} />}
    </>
  )
}

type Shared = 'idle' | 'busy' | 'done' | 'failed'
type Stage = 'who' | 'about' | 'edit' | 'preview'

export function ConversationSheet({ today, onClose }: { today: string; onClose: () => void }) {
  const p = useTheme()
  const insets = useSafeAreaInsets()
  const [stage, setStage] = useState<Stage>('who')
  const [who, setWho] = useState<BriefFor>('counsellor')
  const [discuss, setDiscuss] = useState('')
  const [range, setRange] = useState<SheetRange>(7)
  const [picked, setPicked] = useState<string[]>([])
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [shared, setShared] = useState<Shared>('idle')
  // The free brief, once made, can be edited and remade while this stays open.
  const [unlocked, setUnlocked] = useState(false)
  const data = useMemo(() => ({ history: loadHistory(), moves: loadMoves(), checks: checkIns(), intentions: intentions(), written: reflections() }), [])
  const choices = useMemo(() => wordsChoices(data.written, addDays(today, -(range - 1)), today), [data, range, today])
  const gate = unlocked ? 'open' : sheetGate(today)
  const forOf = BRIEF_FOR.find((f) => f.id === who) ?? BRIEF_FOR[0]

  function make() {
    if (gate === 'patron') return
    if (gate === 'trial') {
      noteFreeTry('sheet')
      setUnlocked(true)
    }
    feel('done')
    const name = load(NAME_KEY) ?? undefined
    setSheet(makeSheet({ today, range, for: who, discuss, ...data, textOf: cardTextOf, picked: picked.filter((id) => choices.some((c) => c.id === id)), name }))
    setShared('idle')
    setStage('edit')
  }

  async function share(s: Sheet) {
    setShared('busy')
    try {
      setShared((await sharePage(s)) ? 'done' : 'failed')
    } catch {
      setShared('failed')
    }
  }

  const pick = (id: string) => setPicked((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]))
  const back = stage === 'about' ? 'who' : stage === 'edit' ? 'about' : stage === 'preview' ? 'edit' : null

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        {/* A new ScrollView for each step, so each one opens at its top. */}
        <ScrollView
          key={stage}
          keyboardShouldPersistTaps="handled"
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
            {back ? <Button kind="text" icon="back" label="Back" onPress={() => setStage(back)} /> : null}
            <View style={{ flex: 1 }} />
            <Button kind="text" label="Close" onPress={onClose} />
          </View>

          {stage === 'who' && (
            <>
              <View style={{ gap: 6 }}>
                <T v="title">Prepare for a conversation</T>
                <T tone="text2">A short brief to bring along: what you want to discuss, what you tried, and what to ask. You read and change every part before anyone sees it. Who is it for?</T>
              </View>
              {BRIEF_FOR.map((f) => (
                <Option
                  key={f.id}
                  label={f.purpose}
                  onPress={() => {
                    setWho(f.id)
                    setStage('about')
                  }}
                />
              ))}
            </>
          )}

          {stage === 'about' && (
            <>
              <View style={{ gap: 6 }}>
                <T v="eyebrow">{forOf.purpose}</T>
                <T v="title">What do you want to discuss?</T>
              </View>
              <TextInput
                value={discuss}
                onChangeText={(t) => setDiscuss(t.slice(0, DISCUSS_MAX))}
                placeholder={forOf.placeholder}
                placeholderTextColor={p.muted}
                multiline
                accessibilityLabel="What do you want to discuss?"
                style={{
                  minHeight: 120,
                  borderWidth: 1.5,
                  borderColor: p.control,
                  backgroundColor: p.surface,
                  borderRadius: radius.md,
                  padding: 14,
                  fontFamily: font.regular,
                  ...typeScale.body,
                  color: p.text,
                  textAlignVertical: 'top',
                }}
              />
              <SpeakInstead onText={(t) => setDiscuss(addSpoken(discuss, t, DISCUSS_MAX))} />
              <View style={{ gap: 8 }}>
                <T v="h3">How far back?</T>
                <Segmented label="How far back?" options={RANGES} value={String(range)} onChange={(v) => setRange(Number(v) as SheetRange)} />
              </View>
              <View style={{ gap: 8 }}>
                <T v="h3">Moments to bring</T>
                <T v="small" tone="muted">
                  Only the ones you tick go in.
                </T>
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
              {gate === 'trial' && (
                <T v="small" tone="muted">
                  Your first brief is free.
                </T>
              )}
              {gate === 'patron' && (
                <PatronNote
                  text="Preparing for your conversations, as often as you need, is part of The Persona Index Patron. Your free brief is used."
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
              <Button wide label="Make my brief" disabled={gate === 'patron' || discuss.trim().length < 3} onPress={make} />
              <T v="small" tone="muted" center>
                Made on this phone. Nothing is sent anywhere unless you share it.
              </T>
            </>
          )}

          {stage === 'edit' && sheet && (
            <>
              <View style={{ gap: 6 }}>
                <T v="title">Read it through, and change anything</T>
                <T tone="text2">Tap Edit on any part. One item a line.</T>
              </View>
              <EditPart n={1} title={SECTION_TITLES[0]} text={sheet.discuss} onChange={(t) => setSheet({ ...sheet, discuss: t })} />
              <Card style={{ gap: 8 }}>
                <PartHead n={2} title={SECTION_TITLES[1]} />
                {sheet.moments.length ? (
                  sheet.moments.map((m) => (
                    <View key={`${m.date}${m.text}`} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <T v="tiny">{`${dayMonth(m.date)}${m.question ? ` · ${m.question}` : ''}`}</T>
                        <T>{m.text}</T>
                      </View>
                      <Button small kind="text" label="Remove" onPress={() => setSheet({ ...sheet, moments: sheet.moments.filter((x) => x !== m) })} />
                    </View>
                  ))
                ) : (
                  <T v="small" tone="muted">
                    {SHEET_EMPTY.moments}
                  </T>
                )}
              </Card>
              <EditPart n={3} title={SECTION_TITLES[2]} lines={sheet.felt} onLines={(felt) => setSheet({ ...sheet, felt })} empty={SHEET_EMPTY.felt} />
              <EditPart n={4} title={SECTION_TITLES[3]} lines={sheet.tried} onLines={(tried) => setSheet({ ...sheet, tried })} empty={SHEET_EMPTY.tried} />
              <EditPart n={5} title={SECTION_TITLES[4]} lines={sheet.bring} onLines={(bring) => setSheet({ ...sheet, bring })} empty={SHEET_EMPTY.bring} numbered />
              <Button wide label="Preview it" onPress={() => setStage('preview')} />
            </>
          )}

          {stage === 'preview' && sheet && (
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
          )}
        </ScrollView>
      </View>
    </Modal>
  )
}

function PartHead({ n, title, right }: { n: number; title: string; right?: ReactNode }) {
  const p = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: p.btn, alignItems: 'center', justifyContent: 'center' }}>
        <T v="tiny" bold style={{ color: p.onBtn }}>
          {String(n)}
        </T>
      </View>
      <T v="h3" style={{ flex: 1 }}>
        {title}
      </T>
      {right}
    </View>
  )
}

// One part of the brief: read as it will print, or edited as text, one item a line.
function EditPart({
  n,
  title,
  text,
  onChange,
  lines,
  onLines,
  empty,
  numbered,
}: {
  n: number
  title: string
  text?: string
  onChange?: (t: string) => void
  lines?: string[]
  onLines?: (l: string[]) => void
  empty?: string
  numbered?: boolean
}) {
  const p = useTheme()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => (lines ? lines.join('\n') : (text ?? '')))
  const done = () => {
    if (lines && onLines) onLines(linesOf(draft))
    else onChange?.(draft.trim())
    setEditing(false)
  }
  const shown = lines ?? (text?.trim() ? [text] : [])
  return (
    <Card style={{ gap: 8 }}>
      <PartHead n={n} title={title} right={<Button small kind="text" label={editing ? 'Done' : 'Edit'} onPress={editing ? done : () => setEditing(true)} />} />
      {editing ? (
        <TextInput
          value={draft}
          onChangeText={setDraft}
          multiline
          autoFocus
          accessibilityLabel={title}
          style={{
            minHeight: 96,
            borderWidth: 1.5,
            borderColor: p.control,
            backgroundColor: p.surface,
            borderRadius: radius.md,
            padding: 12,
            fontFamily: font.regular,
            ...typeScale.body,
            color: p.text,
            textAlignVertical: 'top',
          }}
        />
      ) : shown.length ? (
        shown.map((l, i) =>
          lines ? (
            <View key={`${i}${l}`} style={{ flexDirection: 'row', gap: 8 }}>
              <T bold tone="accent">
                {numbered ? `${i + 1}.` : '•'}
              </T>
              <T style={{ flex: 1 }}>{l}</T>
            </View>
          ) : (
            <T key="text" v="reading">
              {l}
            </T>
          ),
        )
      ) : (
        <T v="small" tone="muted">
          {empty ?? SHEET_EMPTY.discuss}
        </T>
      )}
    </Card>
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
  const items = (xs: string[], numbered = false) =>
    xs.map((l, i) => (
      <Bullet key={`${i}${l}`} mark={numbered ? `${i + 1}.` : '•'}>
        {l}
      </Bullet>
    ))
  const boxes: { title: string; body: ReactNode }[] = [
    { title: SECTION_TITLES[0], body: sheet.discuss.trim() ? <Line>{sheet.discuss}</Line> : <Line muted>{SHEET_EMPTY.discuss}</Line> },
    {
      title: SECTION_TITLES[1],
      body: sheet.moments.length ? (
        sheet.moments.map((w) => <Quote key={`${w.date}${w.text}`} label={`${dayMonth(w.date)}${w.question ? ` · ${w.question}` : ''}`} text={w.text} />)
      ) : (
        <Line muted>{SHEET_EMPTY.moments}</Line>
      ),
    },
    { title: SECTION_TITLES[2], body: sheet.felt.length ? items(sheet.felt) : <Line muted>{SHEET_EMPTY.felt}</Line> },
    { title: SECTION_TITLES[3], body: sheet.tried.length ? items(sheet.tried) : <Line muted>{SHEET_EMPTY.tried}</Line> },
    { title: SECTION_TITLES[4], body: sheet.bring.length ? items(sheet.bring, true) : <Line muted>{SHEET_EMPTY.bring}</Line> },
  ]
  return (
    <View style={{ backgroundColor: PAPER.page, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: PAPER.line }}>
      <View style={{ backgroundColor: brand.night, padding: 20, flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <Mark size={36} />
        <View style={{ flex: 1, gap: 2 }}>
          <T v="tiny" bold style={{ color: brand.sprout }}>
            To bring to a conversation
          </T>
          <T v="title" style={{ color: brand.onNight }}>
            {briefTitle(sheet.for)}
          </T>
          <T v="small" style={{ color: brand.onNight2 }}>
            {`${sheetDates(sheet)}${sheet.name ? ` · ${sheet.name}` : ''}`}
          </T>
        </View>
      </View>
      <View style={{ padding: 12, gap: 10 }}>
        {boxes.map((b, i) => (
          <View key={b.title} style={{ backgroundColor: PAPER.box, borderRadius: radius.md, borderWidth: 1, borderColor: PAPER.line, padding: 14, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: brand.night, alignItems: 'center', justifyContent: 'center' }}>
                <T v="tiny" bold style={{ color: brand.sprout }}>
                  {String(i + 1)}
                </T>
              </View>
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
  const pdf = new File(Paths.cache, `conversation-brief-${sheet.to}.pdf`)
  if (pdf.exists) pdf.delete()
  new File(uri).moveSync(pdf)
  await Sharing.shareAsync(pdf.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Your conversation brief' })
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
