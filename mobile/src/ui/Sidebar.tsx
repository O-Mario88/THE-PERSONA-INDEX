// The wide-screen sidebar: a browser or a Mac window at least WIDE across
// gets this in place of the tab bar. Midnight, the brand at the top, the
// tabs as rows, and Profile and Settings at the foot.
import { Pressable, Text, View } from 'react-native'
import { font, radius, SIDE_W, useTheme } from '../theme'
import { Icon, type IconName } from './Icon'
import { Logo } from './Logo'
import { tr } from '@shared/i18n'

export type SideItem = { key: string; name: string; icon: IconName; on: boolean; onPress: () => void }

function Row({ item }: { item: SideItem }) {
  const p = useTheme()
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={item.name}
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
      <Text style={{ fontFamily: item.on ? font.bold : font.semibold, fontSize: 15, color: item.on ? p.sideOnInk : p.sideInk }}>{tr(item.name)}</Text>
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
