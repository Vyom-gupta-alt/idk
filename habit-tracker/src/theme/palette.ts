/**
 * Categorical habit colours in a fixed, CVD-validated order. Habits store the
 * light-mode hex; `habitColor` maps it to the matching dark-mode step.
 */
export const HABIT_COLORS = [
  { name: 'Blue', light: '#2a78d6', dark: '#3987e5' },
  { name: 'Orange', light: '#eb6834', dark: '#d95926' },
  { name: 'Aqua', light: '#1baf7a', dark: '#199e70' },
  { name: 'Yellow', light: '#eda100', dark: '#c98500' },
  { name: 'Magenta', light: '#e87ba4', dark: '#d55181' },
  { name: 'Green', light: '#008300', dark: '#008300' },
  { name: 'Violet', light: '#4a3aa7', dark: '#9085e9' },
  { name: 'Red', light: '#e34948', dark: '#e66767' },
] as const;

export function habitColor(hex: string, scheme: 'light' | 'dark'): string {
  if (scheme === 'light') return hex;
  return HABIT_COLORS.find((c) => c.light === hex)?.dark ?? hex;
}

/** Sequential blue ramp (light → dark) for magnitude, e.g. the heatmap. */
export const SEQUENTIAL_BLUE = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];

export const HABIT_ICONS = [
  'book', 'barbell', 'water', 'walk', 'bicycle', 'bed', 'leaf', 'musical-notes',
  'code-slash', 'brush', 'heart', 'nutrition', 'sunny', 'moon', 'medkit', 'language',
  'cash', 'people', 'pencil', 'flower',
] as const;
