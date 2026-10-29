// The wide-screen sidebar: a browser or a Mac window at least WIDE across
// gets this in place of the tab bar. Midnight, the brand at the top, the
// tabs as rows, and Profile and Settings at the foot.
import { Pressable, View } from 'react-native'
import { Text } from './textScale'
import { font, radius, SIDE_W, useTheme, typeScale } from '../theme'
import { Icon, type IconName } from './Icon'
import { Logo } from './Logo'
import { tr } from '@shared/i18n'

export type SideItem = { key: string; name: string; icon: IconName; on: boolean; onPress: () => void; dot?: boolean }

function Row({ item }: { item: SideItem }) {
  const p = useTheme()
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={item.dot ? `${item.name}, something new` : item.name}
      accessibilityState={{ selected: item.on }}
      onPress={item.onPress}
      style={(state) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 48,
        paddingHorizontal: 16,
        borderRadius: radius.md,
        // `hovered` is React Native for Web's; phones never set it.
        backgroundColor: item.on || (state as { hovered?: boolean }).hovered ? p.sideOn : 'transparent',
      })}
    >
      <Icon name={item.icon} size={22} color={item.on ? p.brandLime : p.sideInk} width={item.on ? 2.2 : 1.8} />
      <Text style={{ fontFamily: item.on ? font.bold : font.semibold, ...typeScale.body, color: item.on ? p.sideOnInk : p.sideInk }}>{tr(item.name)}</Text>
      {item.dot && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.brandLime, marginLeft: 'auto' }} />}
    </Pressable>
  )
}

export function Sidebar({ top, foot }: { top: SideItem[]; foot: SideItem[] }) {
  const p = useTheme()
  return (
    <View accessibilityRole="tablist" style={{ width: SIDE_W, backgroundColor: p.side, paddingVertical: 24, paddingHorizontal: 16, gap: 4 }}>
      <View style={{ marginHorizontal: 8, marginBottom: 32 }}>
        <Logo size={34} tone="onNavy" />
      </View>
      {top.map((item) => (
        <Row key={item.key} item={item} />
      ))}
      <View style={{ flex: 1 }} />
      {foot.map((item) => (
        <Row key={item.key} item={item} />
      ))}
    </View>
  )
}
