import { Icon, type IconName } from './icons'

// A soft coloured disc behind a line icon, as on the reference designs:
// green for growth and calm, blue for people and places, purple for memory
// and the Circle, rose for what is hard, amber for a lift.
export type Tone = 'green' | 'blue' | 'purple' | 'rose' | 'amber'

export function Disc({ icon, tone = 'green', size = 40 }: { icon: IconName; tone?: Tone; size?: number }) {
  return (
    <span className={`disc tone-${tone}`} style={{ width: size, height: size }} aria-hidden="true">
      <Icon name={icon} size={Math.round(size * 0.55)} />
    </span>
  )
}
