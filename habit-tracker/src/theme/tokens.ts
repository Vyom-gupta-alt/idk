export interface Theme {
  scheme: 'light' | 'dark';
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentText: string;
  accentSoft: string;
  grid: string;
  axis: string;
  success: string;
  danger: string;
  empty: string;
}

export const lightTheme: Theme = {
  scheme: 'light',
  bg: '#f9f9f7',
  surface: '#fcfcfb',
  surfaceAlt: '#f0efec',
  border: 'rgba(11,11,11,0.10)',
  text: '#0b0b0b',
  textSecondary: '#52514e',
  textMuted: '#6f6d68',
  accent: '#2a78d6',
  accentText: '#ffffff',
  accentSoft: '#cde2fb',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  success: '#006300',
  danger: '#d03b3b',
  empty: '#ebeae6',
};

export const darkTheme: Theme = {
  scheme: 'dark',
  bg: '#0d0d0d',
  surface: '#1a1a19',
  surfaceAlt: '#242423',
  border: 'rgba(255,255,255,0.10)',
  text: '#ffffff',
  textSecondary: '#c3c2b7',
  textMuted: '#9b9a93',
  accent: '#3987e5',
  accentText: '#ffffff',
  accentSoft: '#184f95',
  grid: '#2c2c2a',
  axis: '#383835',
  success: '#0ca30c',
  danger: '#e66767',
  empty: '#2c2c2a',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 14, pill: 999 } as const;
/** Minimum touch target (Apple HIG / Material). */
export const TOUCH_TARGET = 44;
