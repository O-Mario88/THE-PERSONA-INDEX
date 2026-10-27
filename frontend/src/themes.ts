// Theme names, icons and areas, shared by the cards, the recap and the mirror.

// area matches the theme's area in backend/content.go.
type ThemeStyle = { name: string; icon: string; area: string }

export const THEMES: Record<string, ThemeStyle> = {
  habits: { name: 'Daily habits', icon: '☀️', area: 'everyday' },
  'sleep-health': { name: 'Sleep and health', icon: '🌙', area: 'everyday' },
  money: { name: 'Money', icon: '💰', area: 'everyday' },
  'work-career': { name: 'Work and career', icon: '💼', area: 'everyday' },
  learning: { name: 'Learning', icon: '📚', area: 'everyday' },
  school: { name: 'School and studying', icon: '🎒', area: 'everyday' },
  home: { name: 'Home', icon: '🧺', area: 'everyday' },
  food: { name: 'Food and eating', icon: '🍲', area: 'everyday' },
  phone: { name: 'Phone and screens', icon: '📱', area: 'everyday' },
  'getting-around': { name: 'Getting around', icon: '🚌', area: 'everyday' },
  body: { name: 'Body and looks', icon: '🪞', area: 'everyday' },
  friendship: { name: 'Friendship', icon: '🤝', area: 'people' },
  family: { name: 'Family', icon: '🏡', area: 'people' },
  relatives: { name: 'Relatives', icon: '🌳', area: 'people' },
  parenting: { name: 'Children and parenting', icon: '🧸', area: 'people' },
  partnership: { name: 'Partnership', icon: '💞', area: 'people' },
  dating: { name: 'Dating', icon: '💌', area: 'people' },
  neighbours: { name: 'Neighbours', icon: '🏘️', area: 'people' },
  colleagues: { name: 'Colleagues', icon: '👥', area: 'people' },
  helping: { name: 'Helping others', icon: '🤲', area: 'people' },
  happiness: { name: 'Happiness', icon: '😊', area: 'inner' },
  'sadness-stress': { name: 'Sadness and stress', icon: '🌧️', area: 'inner' },
  anger: { name: 'Anger', icon: '🔥', area: 'inner' },
  honesty: { name: 'Honesty', icon: '🧭', area: 'inner' },
  faith: { name: 'Faith and meaning', icon: '🕊️', area: 'inner' },
  confidence: { name: 'Confidence', icon: '🌟', area: 'inner' },
  'quality-quantity': { name: 'Quality or quantity', icon: '⚖️', area: 'desire' },
  'wealth-luxury': { name: 'Wealth and luxury', icon: '💎', area: 'desire' },
  'ambition-desire': { name: "Ambition and heart's desire", icon: '🚀', area: 'desire' },
  celebrations: { name: 'Celebrations', icon: '🎉', area: 'desire' },
  plans: { name: 'Plans and dreams', icon: '🗺️', area: 'desire' },
  rest: { name: 'Rest and free time', icon: '🛋️', area: 'desire' },
  intimacy: { name: 'Intimacy', icon: '🌹', area: 'desire' },
}

const FALLBACK: ThemeStyle = { name: 'Today', icon: '✨', area: '' }

export function themeName(slug: string): string {
  return THEMES[slug]?.name ?? slug
}

export function themeStyle(slug: string | undefined): ThemeStyle {
  return (slug && THEMES[slug]) || FALLBACK
}
