import { MD3LightTheme } from 'react-native-paper';

// Black-and-white palette. Pure black on near-white background, white surface.
// Greens/reds reserved for cash-in/cash-out semantic accents only.
export const palette = {
  black: '#000000',
  ink: '#0F172A',
  text: '#111111',
  textMuted: '#52525B',
  textSubtle: '#71717A',
  background: '#FAFAFA',
  surface: '#FFFFFF',
  border: '#E4E4E7',
  borderStrong: '#D4D4D8',
  cashIn: '#15803D',
  cashOut: '#B91C1C',
  info: '#1E40AF',
  warn: '#B45309',
  white: '#FFFFFF',
};

export const theme = {
  ...MD3LightTheme,
  roundness: 8,
  colors: {
    ...MD3LightTheme.colors,
    primary: palette.black,
    onPrimary: palette.white,
    secondary: palette.ink,
    onSecondary: palette.white,
    background: palette.background,
    onBackground: palette.text,
    surface: palette.surface,
    onSurface: palette.text,
    surfaceVariant: '#F4F4F5',
    onSurfaceVariant: palette.textMuted,
    outline: palette.border,
    outlineVariant: palette.borderStrong,
    error: palette.cashOut,
    onError: palette.white,
  },
};

export const headerOptions = {
  headerStyle: { backgroundColor: palette.black },
  headerTintColor: palette.white,
  headerTitleStyle: { fontWeight: '700' as const },
};

export type Palette = typeof palette;
