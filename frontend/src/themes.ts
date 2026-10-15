// Theme names, colors, icons and areas, shared by the cards, the recap and the mirror.

// area matches the theme's area in backend/content.go.
type ThemeStyle = { name: string; icon: string; from: string; to: string; area: string }

export const THEMES: Record<string, ThemeStyle> = {
  habits: { name: 'Daily habits', icon: '☀️', from: '#f59e0b', to: '#f97316', area: 'everyday' },
  'sleep-health': { name: 'Sleep and health', icon: '🌙', from: '#6366f1', to: '#06b6d4', area: 'everyday' },
  money: { name: 'Money', icon: '💰', from: '#10b981', to: '#84cc16', area: 'everyday' },
  'work-career': { name: 'Work and career', icon: '💼', from: '#3b82f6', to: '#06b6d4', area: 'everyday' },
  learning: { name: 'Learning', icon: '📚', from: '#8b5cf6', to: '#3b82f6', area: 'everyday' },
  school: { name: 'School and studying', icon: '🎒', from: '#0ea5e9', to: '#8b5cf6', area: 'everyday' },
  home: { name: 'Home', icon: '🧺', from: '#f59e0b', to: '#10b981', area: 'everyday' },
  food: { name: 'Food and eating', icon: '🍲', from: '#f97316', to: '#ef4444', area: 'everyday' },
  phone: { name: 'Phone and screens', icon: '📱', from: '#6366f1', to: '#0ea5e9', area: 'everyday' },
  'getting-around': { name: 'Getting around', icon: '🚌', from: '#14b8a6', to: '#3b82f6', area: 'everyday' },
  body: { name: 'Body and looks', icon: '🪞', from: '#ec4899', to: '#f59e0b', area: 'everyday' },
  friendship: { name: 'Friendship', icon: '🤝', from: '#f97316', to: '#eab308', area: 'people' },
  family: { name: 'Family', icon: '🏡', from: '#ef4444', to: '#f59e0b', area: 'people' },
  relatives: { name: 'Relatives', icon: '🌳', from: '#84cc16', to: '#f59e0b', area: 'people' },
  parenting: { name: 'Children and parenting', icon: '🧸', from: '#f59e0b', to: '#ec4899', area: 'people' },
  partnership: { name: 'Partnership', icon: '💞', from: '#ec4899', to: '#f43f5e', area: 'people' },
  dating: { name: 'Dating', icon: '💌', from: '#f43f5e', to: '#a855f7', area: 'people' },
  neighbours: { name: 'Neighbours', icon: '🏘️', from: '#22c55e', to: '#0ea5e9', area: 'people' },
  colleagues: { name: 'Colleagues', icon: '👥', from: '#3b82f6', to: '#14b8a6', area: 'people' },
  helping: { name: 'Helping others', icon: '🤲', from: '#14b8a6', to: '#22c55e', area: 'people' },
  happiness: { name: 'Happiness', icon: '😊', from: '#eab308', to: '#f97316', area: 'inner' },
  'sadness-stress': { name: 'Sadness and stress', icon: '🌧️', from: '#64748b', to: '#6366f1', area: 'inner' },
  anger: { name: 'Anger', icon: '🔥', from: '#ef4444', to: '#f97316', area: 'inner' },
  honesty: { name: 'Honesty', icon: '🧭', from: '#0ea5e9', to: '#6366f1', area: 'inner' },
  faith: { name: 'Faith and meaning', icon: '🕊️', from: '#a78bfa', to: '#0ea5e9', area: 'inner' },
  confidence: { name: 'Confidence', icon: '🌟', from: '#eab308', to: '#a855f7', area: 'inner' },
  'quality-quantity': { name: 'Quality or quantity', icon: '⚖️', from: '#a855f7', to: '#ec4899', area: 'desire' },
  'wealth-luxury': { name: 'Wealth and luxury', icon: '💎', from: '#06b6d4', to: '#8b5cf6', area: 'desire' },
  'ambition-desire': { name: "Ambition and heart's desire", icon: '🚀', from: '#f97316', to: '#ec4899', area: 'desire' },
  celebrations: { name: 'Celebrations', icon: '🎉', from: '#ec4899', to: '#eab308', area: 'desire' },
  plans: { name: 'Plans and dreams', icon: '🗺️', from: '#06b6d4', to: '#22c55e', area: 'desire' },
  rest: { name: 'Rest and free time', icon: '🛋️', from: '#8b5cf6', to: '#14b8a6', area: 'desire' },
  intimacy: { name: 'Intimacy', icon: '🌹', from: '#e11d48', to: '#9333ea', area: 'desire' },
}

const FALLBACK: ThemeStyle = { name: 'Today', icon: '✨', from: '#6d5dfc', to: '#ec4899', area: '' }

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
