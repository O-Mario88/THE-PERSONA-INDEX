// The backup with 12 words (and Reflect's "bring your writing back"): off until the person turns it on, sealed on this
// phone before it is sent, and only the 12 words open it. There is no email
// and no account behind it (frontend/src/vault.ts). Phones get the crypto it
// needs from platform/subtle.ts, so a backup made in a browser opens here.
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { TextInput } from '../ui/textScale'
import { onChange } from '@shared/storage'
import { newPhrase, normalisePhrase, phraseProblem, restore, restoreWriting, setWords, turnOff, turnOn, vaultState, type PhraseProblem, type VaultState } from '@shared/vault'
import { font, lift, radius, useTheme } from '../theme'
import { Icon } from '../ui/Icon'
import { Button, T, Toggle } from '../ui/kit'
import { locale } from '@shared/locale'

type Mode =
  | { kind: 'idle' }
  | { kind: 'new'; phrase: string; words: boolean; step: 'show' | 'check'; ask: [number, number] }
  | { kind: 'show' }
  | { kind: 'confirm-off' }
  | { kind: 'restore' }

function useVault(): VaultState | null {
  const [st, setSt] = useState(vaultState)
  useEffect(() => onChange((k) => k === 'pi.vault.v1' && setSt(vaultState())), [])
  return st
}

// Two different word positions to check, 1 to 12.
function twoPositions(): [number, number] {
  const a = 1 + Math.floor(Math.random() * 12)
  let b = 1 + Math.floor(Math.random() * 11)
  if (b >= a) b++
  return a < b ? [a, b] : [b, a]
}

function Muted({ children }: { children: React.ReactNode }) {
  return (
    <T v="small" tone="muted">
      {children}
    </T>
  )
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <T v="small" tone="danger" style={{ fontFamily: font.bold }}>
      {children}
    </T>
  )
}

function WordsField({ label, value, onChangeText, lines = 1 }: { label: string; value: string; onChangeText: (t: string) => void; lines?: number }) {
  const p = useTheme()
  return (
    <View style={{ gap: 6 }}>
      <T v="small" bold>
        {label}
      </T>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        multiline={lines > 1}
        textContentType="none"
        importantForAutofill="no"
        style={{
          minHeight: lines > 1 ? 24 * lines + 28 : undefined,
          borderWidth: 1.5,
          borderColor: p.line,
          backgroundColor: p.surface,
          borderRadius: radius.md,
          paddingHorizontal: 16,
          paddingVertical: 14,
          fontFamily: font.regular,
          fontSize: 15,
          color: p.text,
          textAlignVertical: 'top',
        }}
      />
    </View>
  )
}

export function BackupSettings({ onRestored }: { onRestored: () => void }) {
  const st = useVault()
  const [mode, setMode] = useState<Mode>({ kind: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function off() {
    setBusy(true)
    setError(null)
    try {
      await turnOff()
      setMode({ kind: 'idle' })
    } catch {
      setError("I couldn't reach the server, so your backup is still there. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ gap: 12 }} accessibilityLabel="Your backup">
      <T v="eyebrow">Your backup</T>

      {mode.kind === 'new' && mode.step === 'show' && (
        <>
          <T>
            Write these 12 words down, in order, on paper. They are the only way back to your backup: there is no email and no account, and I can't recover them for you. Anyone
            who has them can open it, so keep them somewhere private.
          </T>
          <Phrase phrase={mode.phrase} />
          <Toggle label="Include your own words" note="Otherwise your own words never leave this phone. In the backup they are sealed like everything else." value={mode.words} onChange={(on) => setMode({ ...mode, words: on })} />
          <Button label="I've written them down" onPress={() => setMode({ ...mode, step: 'check' })} />
          <Button kind="text" small label="Not now" onPress={() => setMode({ kind: 'idle' })} style={{ alignSelf: 'flex-start' }} />
        </>
      )}

      {mode.kind === 'new' && mode.step === 'check' && (
        <CheckPhrase
          phrase={mode.phrase}
          ask={mode.ask}
          busy={busy}
          onBack={() => setMode({ ...mode, step: 'show' })}
          onChecked={async () => {
            setBusy(true)
            try {
              await turnOn(mode.phrase, mode.words)
              setMode({ kind: 'idle' })
            } finally {
              setBusy(false)
            }
          }}
        />
      )}

      {mode.kind === 'restore' && <Restore onCancel={() => setMode({ kind: 'idle' })} onRestored={onRestored} />}

      {mode.kind !== 'new' && mode.kind !== 'restore' && !st && (
        <>
          <Muted>
            Off. Everything stays on this phone, so a lost or new phone starts empty. Turn it on and your notebook, history and settings are sealed on this phone and kept on the
            server, where I can't open them.
          </Muted>
          <Button
            kind="soft"
            label="Back up with a 12-word phrase"
            onPress={() => {
              setError(null)
              setMode({ kind: 'new', phrase: newPhrase(), words: false, step: 'show', ask: twoPositions() })
            }}
          />
          <Button kind="text" small label="I have a phrase: restore" onPress={() => setMode({ kind: 'restore' })} style={{ alignSelf: 'flex-start' }} />
        </>
      )}

      {mode.kind !== 'new' && mode.kind !== 'restore' && st && (
        <>
          <Muted>
            On. Sealed on this phone before it's sent, so I can't open it or tell whose it is. {backupStatus(st)}
          </Muted>
          <Toggle label="Include your own words" value={st.words} onChange={(on) => setWords(on)} />
          {mode.kind === 'show' ? (
            <>
              {st.phrase ? <Phrase phrase={st.phrase} /> : <Muted>This phone was restored through sync, so it doesn’t hold your 12 words. Find them where you wrote them down.</Muted>}
              <Button kind="text" small label="Hide my phrase" onPress={() => setMode({ kind: 'idle' })} style={{ alignSelf: 'flex-start' }} />
            </>
          ) : mode.kind === 'confirm-off' ? (
            <View style={{ gap: 10 }} accessibilityLabel="Turn off backup">
              <T>This deletes your backup from the server, and your phrase will open nothing. Everything stays on this phone.</T>
              <Button kind="danger" label="Yes, turn it off" disabled={busy} busy={busy} onPress={off} />
              <Button kind="text" small label="Keep it on" onPress={() => setMode({ kind: 'idle' })} style={{ alignSelf: 'flex-start' }} />
            </View>
          ) : (
            <>
              <Button kind="soft" label="Show my phrase" onPress={() => setMode({ kind: 'show' })} />
              <Button kind="text" small label="Turn off backup" onPress={() => setMode({ kind: 'confirm-off' })} style={{ alignSelf: 'flex-start' }} />
            </>
          )}
        </>
      )}

      {error && <Alert>{error}</Alert>}
    </View>
  )
}

function backupStatus(st: VaultState): string {
  if (st.dirty && !st.savedAt) return 'Waiting for a connection to make the first backup.'
  if (st.dirty) return 'Some changes are waiting to be backed up.'
  if (!st.savedAt) return 'Backed up.'
  const at = new Date(st.savedAt)
  const time = at.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
  const sameDay = at.toDateString() === new Date().toDateString()
  return sameDay ? `Last backed up today at ${time}.` : `Last backed up on ${at.toLocaleDateString(locale(), { day: 'numeric', month: 'long' })}.`
}

function Phrase({ phrase }: { phrase: string }) {
  const p = useTheme()
  const words = phrase.split(' ')
  return (
    <View accessibilityLabel={`Your 12-word phrase: ${phrase}`} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {words.map((w, i) => (
        <View
          key={i}
          style={{ width: '31%', flexGrow: 1, flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.md, backgroundColor: p.surface2 }}
        >
          <T v="tiny" tone="muted">
            {i + 1}
          </T>
          <T bold>
            {w}
          </T>
        </View>
      ))}
    </View>
  )
}

function CheckPhrase({ phrase, ask, busy, onBack, onChecked }: { phrase: string; ask: [number, number]; busy: boolean; onBack: () => void; onChecked: () => Promise<void> }) {
  const words = phrase.split(' ')
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [wrong, setWrong] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)

  async function submit() {
    const bad = [ask[0], ask[1]].find((n, i) => normalisePhrase([a, b][i]) !== words[n - 1])
    setWrong(bad ?? null)
    if (bad) return
    setFailed(false)
    try {
      await onChecked()
    } catch {
      setFailed(true)
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <T>To be sure your note is right, type two of the words from it.</T>
      <WordsField label={`What is word ${ask[0]}?`} value={a} onChangeText={setA} />
      <WordsField label={`And word ${ask[1]}?`} value={b} onChangeText={setB} />
      {wrong ? <Alert>That isn't word {wrong}. Have another look at your note.</Alert> : null}
      {failed && <Alert>Something went wrong turning the backup on. Please try again.</Alert>}
      <Button label="Turn on backup" disabled={busy} busy={busy} onPress={submit} />
      <Button kind="text" small label="Show the words again" onPress={onBack} style={{ alignSelf: 'flex-start' }} />
    </View>
  )
}

function problemText(p: PhraseProblem): string {
  switch (p.kind) {
    case 'count':
      return p.words === 0 ? 'Type your 12 words, in order.' : `That's ${p.words} ${p.words === 1 ? 'word' : 'words'}. A phrase has 12.`
    case 'word':
      return `Word ${p.at}, “${p.word}”, isn't one of the phrase words. Check its spelling against your note.`
    case 'checksum':
      return "Those words don't fit together as a phrase. Check their order against your note."
  }
}

export function Restore({ onCancel, onRestored }: { onCancel: () => void; onRestored: () => void }) {
  const [text, setText] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function submit() {
    const pr = phraseProblem(text)
    if (pr) {
      setProblem(problemText(pr))
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      const r = await restore(text)
      if (r === 'restored') setDone(true)
      else if (r === 'none') setProblem("There's no backup for this phrase. Check it against your note; if the backup was turned off, there's nothing to restore.")
      else setProblem("That backup couldn't be opened. Nothing on this phone was changed.")
    } catch {
      setProblem("I couldn't reach the server, so nothing was changed. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <View style={{ gap: 12 }} accessibilityLiveRegion="polite">
        <T>Everything from your backup is back on this phone, and it carries on backing up under the same phrase.</T>
        <Button label="Carry on" onPress={onRestored} />
      </View>
    )
  }
  return (
    <View style={{ gap: 12 }}>
      <T>Restoring brings back the answers, notebook and settings in your backup, and joins them with anything already on this phone.</T>
      <WordsField label="Your 12 words" value={text} onChangeText={setText} lines={3} />
      {problem && <Alert>{problem}</Alert>}
      <Button label={busy ? 'Restoring…' : 'Restore'} disabled={busy} busy={busy} onPress={submit} />
      <Button kind="text" small label="Cancel" onPress={onCancel} style={{ alignSelf: 'flex-start' }} />
    </View>
  )
}

// On a phone restored through sync, the writing is still sealed: the 12
// words bring it back, once (ReflectGuide.tsx's BringBack).
export function BringBack({ onBack }: { onBack: () => void }) {
  const p = useTheme()
  const [phrase, setPhrase] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  async function bring() {
    setBusy(true)
    try {
      const r = await restoreWriting(phrase)
      if (r === 'restored') onBack()
      else setNote(r === 'mismatch' ? 'Those aren’t the 12 words for this account’s backup.' : 'No reflections were found under those words.')
    } catch {
      setNote('Check the 12 words: one of them isn’t right.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <View style={[{ gap: 10, padding: 20, borderRadius: radius.lg, borderWidth: 1, borderColor: p.line, backgroundColor: p.surface }, lift(p)]}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Icon name="lock" size={18} color={p.text} />
        <T v="h3" style={{ flex: 1 }}>
          Your reflections are sealed with your 12 words
        </T>
      </View>
      <Muted>Everything else came back with sync. Your writing is end-to-end encrypted, so only your 12 words can open it. You’ll only need to do this once on this device.</Muted>
      <WordsField label="Your 12 words" value={phrase} onChangeText={setPhrase} lines={2} />
      {note ? <Alert>{note}</Alert> : null}
      <Button small label="Bring them back" busy={busy} disabled={busy || phrase.trim().split(/\s+/).length !== 12} onPress={bring} style={{ alignSelf: 'flex-start' }} />
    </View>
  )
}
