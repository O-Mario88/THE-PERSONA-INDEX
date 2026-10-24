// The few line icons the app draws: the tabs, share, close, lock and the
// like. Inline SVG, so they follow the text colour and weigh nothing.

const paths: Record<string, string> = {
  today:
    'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  mirror: 'M12 3c-3.3 0-6 2.9-6 7.5S8.7 21 12 21s6-6 6-10.5S15.3 3 12 3Z M9 9.5c.4-1.6 1.5-2.7 3-3',
  circle:
    'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M2.5 20c.6-3.5 3.3-6 6.5-6s5.9 2.5 6.5 6 M16 4.3a3.5 3.5 0 0 1 0 6.4 M18 14.4c1.8.9 3.1 2.9 3.5 5.6',
  notebook: 'M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6Z M6 3v18 M9 8h6 M9 12h6 M14 16l1.5 1.5L18 15',
  share: 'M12 15V3 M8 7l4-4 4 4 M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7',
  close: 'M6 6l12 12M18 6 6 18',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3 M5 11h14v10H5Z',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z',
  chevron: 'M9 6l6 6-6 6',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  qr: 'M4 4h6v6H4Z M14 4h6v6h-6Z M4 14h6v6H4Z M14 14h2v2h-2Z M18 18h2v2h-2Z M14 18h2 M18 14h2',
  room: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M2 20c.5-3 3-5 6-5s5.5 2 6 5 M14 15.5c.6-.3 1.3-.5 2-.5 3 0 5.5 2 6 5',
  mute: 'M4 9v6h4l5 4V5L8 9Z M17 9l4 6 M21 9l-4 6',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3 M16 4h3a1 1 0 0 1 1 1v3 M20 16v3a1 1 0 0 1-1 1h-3 M8 20H5a1 1 0 0 1-1-1v-3 M4 12h16',
  chat: 'M4 18.5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8Z',
  sms: 'M4 5h16v11H9l-5 4Z M8 9h8 M8 12h5',
  download: 'M12 4v11 M7 10l5 5 5-5 M5 20h14',
  camera: 'M4 7h3l2-3h6l2 3h3v13H4Z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z M20 20l-4-4',
  play: 'M8 5v14l11-7Z',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M3 12h18 M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9Z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  minus: 'M6 12h12',
  together: 'M8 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M3 19c.5-3 2.5-5 5-5 M14 13l2 2 4-4',
}

export type IconName = keyof typeof paths

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name].split(' M').map((d, i) => (
        <path key={i} d={i === 0 ? d : `M${d}`} fill={name === 'play' ? 'currentColor' : undefined} />
      ))}
    </svg>
  )
}
