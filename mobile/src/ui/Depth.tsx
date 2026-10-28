// Essential or Explore deeper, the same on every page (shared depth.ts): a
// choice made on one page holds on the others.
import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { chooseDepth, readsDeeper, type DepthSurface } from '@shared/depth'
import { radius, useTheme } from '../theme'
import { T } from './kit'

export function useDeeper(surface: DepthSurface) {
  const [deeper, setDeeper] = useState(() => readsDeeper(surface))
  return [
    deeper,
    (d: boolean) => {
      chooseDepth(d)
      setDeeper(d)
    },
  ] as const
}

export function DepthSwitch({ deep, onChange, center = true }: { deep: boolean; onChange: (deep: boolean) => void; center?: boolean }) {
  const p = useTheme()
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel="Reading depth"
      style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.pill, backgroundColor: p.surface2, alignSelf: center ? 'center' : 'flex-start' }}
    >
      {(
        [
          [false, 'Essential'],
          [true, 'Explore deeper'],
        ] as const
      ).map(([d, label]) => (
        <Pressable
          key={label}
          accessibilityRole="tab"
          accessibilityState={{ selected: deep === d }}
          onPress={() => onChange(d)}
          hitSlop={4}
          style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: deep === d ? p.surface : 'transparent' }}
        >
          <T v="small" bold tone={deep === d ? 'text' : 'muted'}>
            {label}
          </T>
        </Pressable>
      ))}
    </View>
  )
}
