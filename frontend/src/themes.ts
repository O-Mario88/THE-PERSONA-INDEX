// Theme names, colors and icons, shared by the cards, the recap and My week.

type ThemeStyle = { name: string; icon: string; from: string; to: string }

const THEMES: Record<string, ThemeStyle> = {
  habits: { name: 'Daily habits', icon: '☀️', from: '#f59e0b', to: '#f97316' },
  'sleep-health': { name: 'Sleep and health', icon: '🌙', from: '#6366f1', to: '#06b6d4' },
  money: { name: 'Money', icon: '💰', from: '#10b981', to: '#84cc16' },
  'work-career': { name: 'Work and career', icon: '💼', from: '#3b82f6', to: '#06b6d4' },
  learning: { name: 'Learning', icon: '📚', from: '#8b5cf6', to: '#3b82f6' },
  friendship: { name: 'Friendship', icon: '🤝', from: '#f97316', to: '#eab308' },
  family: { name: 'Family', icon: '🏡', from: '#ef4444', to: '#f59e0b' },
  partnership: { name: 'Partnership', icon: '💞', from: '#ec4899', to: '#f43f5e' },
  dating: { name: 'Dating', icon: '💌', from: '#f43f5e', to: '#a855f7' },
  helping: { name: 'Helping others', icon: '🤲', from: '#14b8a6', to: '#22c55e' },
  happiness: { name: 'Happiness', icon: '😊', from: '#eab308', to: '#f97316' },
  'sadness-stress': { name: 'Sadness and stress', icon: '🌧️', from: '#64748b', to: '#6366f1' },
  anger: { name: 'Anger', icon: '🔥', from: '#ef4444', to: '#f97316' },
  honesty: { name: 'Honesty', icon: '🧭', from: '#0ea5e9', to: '#6366f1' },
  'quality-quantity': { name: 'Quality or quantity', icon: '⚖️', from: '#a855f7', to: '#ec4899' },
  'wealth-luxury': { name: 'Wealth and luxury', icon: '💎', from: '#06b6d4', to: '#8b5cf6' },
  'ambition-desire': { name: "Ambition and heart's desire", icon: '🚀', from: '#f97316', to: '#ec4899' },
  intimacy: { name: 'Intimacy', icon: '🌹', from: '#e11d48', to: '#9333ea' },
}

const FALLBACK: ThemeStyle = { name: 'Today', icon: '✨', from: '#6d5dfc', to: '#ec4899' }

export const THEME_COUNT = Object.keys(THEMES).length

export function themeName(slug: string): string {
  return THEMES[slug]?.name ?? slug
}

export function themeStyle(slug: string | undefined): ThemeStyle {
  return (slug && THEMES[slug]) || FALLBACK
}

// CSS custom properties that color a card for its theme.
export function themeVars(slug: string | undefined): Record<string, string> {
  const t = themeStyle(slug)
  return { '--t-from': t.from, '--t-to': t.to }
}

// Days played among the seven ending on today (inclusive), from dates YYYY-MM-DD.
export function daysPlayedThisWeek(days: string[], today: string): number {
  const end = Date.parse(`${today}T00:00:00Z`)
  const start = end - 6 * 86400_000
  return new Set(days.filter((d) => {
    const t = Date.parse(`${d}T00:00:00Z`)
    return t >= start && t <= end
  })).size
}
