import type { AppSettings } from '../database/settingsSchema';
import { getAccentPresetById, isValidHexColor, normalizeHex } from './themePresets';

export type ThemeColors = {
  background: string;
  surface: string;
  primary: string;
  secondary: string;
  text: string;
  textSecondary: string;
  textLight: string;
  border: string;
  error: string;
  success: string;
  accent: string;
  warning: string;
  successGreen: string;
  dark: Omit<ThemeColors, 'dark'>;
};

const lightBase = {
  background: '#faf9f6',
  surface: '#f5f4f1',
  secondary: '#6B6B6B',
  text: '#121212',
  textSecondary: '#6B6B6B',
  textLight: '#9B9B9B',
  border: '#D8D8D8',
  warning: '#B91C1C',
  successGreen: '#15803D',
};

const darkBase = {
  background: '#121212',
  surface: '#1a1a1a',
  secondary: '#808080',
  text: '#faf9f6',
  textSecondary: '#B0B0B0',
  textLight: '#808080',
  border: '#2A2A2A',
  warning: '#F87171',
  successGreen: '#4ADE80',
};

const resolveAccentHex = (settings: Partial<AppSettings> | null | undefined): string => {
  const accentMode = settings?.accentMode ?? 'preset';
  if (accentMode === 'custom') {
    const hex = normalizeHex(settings?.accentCustomHex ?? '');
    if (isValidHexColor(hex)) return hex;
    return '#121212';
  }
  return getAccentPresetById(settings?.accentPresetId).hex;
};

export const buildThemeColors = (settings: Partial<AppSettings> | null | undefined): ThemeColors => {
  const accent = resolveAccentHex(settings);

  const light = {
    ...lightBase,
    primary: accent,
    error: accent,
    success: accent,
    accent,
  };

  const dark = {
    ...darkBase,
    primary: accent,
    error: accent,
    success: accent,
    accent,
  };

  return { ...light, dark } as ThemeColors;
};

