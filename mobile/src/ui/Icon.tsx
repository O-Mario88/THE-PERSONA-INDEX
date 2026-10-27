// The app's line icons, drawn with react-native-svg from the shared path
// data (frontend/src/iconPaths.ts).
import Svg, { Path } from 'react-native-svg'
import { paths } from '@shared/iconPaths'
import type { IconName as WebIconName } from '@shared/iconPaths'

export type IconName = WebIconName

export function Icon({ name, size = 20, color, width = 1.6 }: { name: IconName; size?: number; color: string; width?: number }) {
  const d = paths[name] ?? ''
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no">
      {d.split(' M').map((part, i) => (
        <Path
          key={i}
          d={i === 0 ? part : `M${part}`}
          stroke={color}
          strokeWidth={width}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={name === 'play' ? color : 'none'}
        />
      ))}
    </Svg>
  )
}
