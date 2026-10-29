// One short read: the topic, the words, something
// to try, and two more on the same area.
import { useEffect } from 'react'
import { Linking, View } from 'react-native'
import { Text } from '../ui/textScale'
import { HELPLINE_LINE } from '@shared/helplineText'
import { helplineHere } from '@shared/prefs'
import { appOnly, heavy, minutes, related, topicOf } from '@shared/reads/reads'
import type { Read } from '@shared/reads/types'
import { load, save } from '@shared/storage'
import { Back, Button, Page, T, Tinted } from '../ui/kit'

const OPENED = 'pi.read.'

export function ReadScreen({ read, date, intimacy, onBack, onOpen }: { read: Read; date: string; intimacy: boolean; onBack: () => void; onOpen: (r: Read) => void }) {
  useEffect(() => {
    if (load(OPENED + read.slug) === null) save(OPENED + read.slug, date)
  }, [read.slug, date])
  const more = related(read, 2).filter((r) => intimacy || !appOnly(r))
  return (
    <Page refresh={read.slug.length}>
      <Back onPress={onBack} />
      <T v="eyebrow">
        {topicOf(read)} · {minutes(read)} min read
      </T>
      <T v="title">{read.title}</T>
      <T tone="text2" style={{ fontSize: 16, lineHeight: 24 }}>
        {read.summary}
      </T>
      {read.paragraphs.map((para, i) => (
        <T key={i}>{para}</T>
      ))}
      <Tinted>
        <T v="eyebrow">Something to try</T>
        <T>{read.try}</T>
      </Tinted>
      {heavy(read) && (
        <T v="small" tone="muted">
          {HELPLINE_LINE}{' '}
          <Text style={{ textDecorationLine: 'underline' }} onPress={() => Linking.openURL(helplineHere())}>
            Find a helpline
          </Text>
        </T>
      )}
      {more.length > 0 && (
        <View style={{ gap: 8 }}>
          <T v="eyebrow">More to read</T>
          {more.map((r) => (
            <Button key={r.slug} kind="text" label={r.title} onPress={() => onOpen(r)} />
          ))}
        </View>
      )}
      <T v="tiny">Something to think about, never a diagnosis.</T>
    </Page>
  )
}
