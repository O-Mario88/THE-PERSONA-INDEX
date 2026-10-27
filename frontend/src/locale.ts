// The phone's own way of writing times, dates and numbers (Edwin,
// 2026-10-27: the app is international). Set once at start from the device
// (mobile/src/platform/setup.ts); "en-GB" until then, and in tests, so a
// 24-hour "17:00" and "27 October" stay the default. The US then sees
// "5:00 PM" and "October 27" without anything else changing.

let current = 'en-GB'

export function setLocale(tag: string | null | undefined): void {
  if (!tag) return
  try {
    current = Intl.getCanonicalLocales(tag)[0] ?? current
  } catch {
    // an unknown tag keeps the last good one
  }
}

export const locale = (): string => current

// The language part alone: "es" for "es-MX".
export const language = (): string => current.split('-')[0].toLowerCase()

const clockFormats = new Map<string, Intl.DateTimeFormat>()

// clockAt writes minutes after midnight as the phone shows a time of day.
export function clockAt(minutes: number): string {
  let f = clockFormats.get(current)
  if (!f) {
    // A 24-hour clock pads the hour ("07:51"); a 12-hour one does not ("7:51 AM").
    const cycle = new Intl.DateTimeFormat(current, { hour: 'numeric' }).resolvedOptions().hourCycle
    const h24 = cycle === 'h23' || cycle === 'h24'
    f = new Intl.DateTimeFormat(current, { hour: h24 ? '2-digit' : 'numeric', minute: '2-digit', timeZone: 'UTC' })
    clockFormats.set(current, f)
  }
  const m = ((minutes % 1440) + 1440) % 1440
  return f.format(Date.UTC(2000, 0, 1, Math.floor(m / 60), m % 60))
}

// dateOf writes a calendar day (YYYY-MM-DD) in the phone's style.
export function dateOf(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString(current, { timeZone: 'UTC', ...opts })
}

export const numberOf = (n: number): string => n.toLocaleString(current)
