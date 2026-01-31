import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { AppSettings } from '../database/settingsSchema';
import { getSettings } from '../services/settingsService';
import { buildThemeColors, ThemeColors } from '../theme/themeColors';
import { getAccentPresetById, isValidHexColor, normalizeHex } from '../theme/themePresets';

type ThemeContextValue = {
  colors: ThemeColors;
  settings: Partial<AppSettings> | null;
  refreshFromCloud: () => Promise<void>;
  setAccentPreset: (presetId: string) => void;
  setAccentCustomHex: (hex: string) => void;
  setAccentMode: (mode: 'preset' | 'custom') => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Partial<AppSettings> | null>(null);

  const refreshFromCloud = async () => {
    try {
      const s = await getSettings();
      setSettings(s);
    } catch {
      // User may be logged out or Firebase may not be ready; keep defaults.
      setSettings(null);
    }
  };

  useEffect(() => {
    refreshFromCloud();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const colors = useMemo(() => buildThemeColors(settings), [settings]);

  const setAccentPreset = (presetId: string) => {
    const preset = getAccentPresetById(presetId);
    setSettings(prev => ({
      ...(prev ?? {}),
      accentMode: 'preset',
      accentPresetId: preset.id,
      accentCustomHex: prev?.accentCustomHex ?? '#121212',
    }));
  };

  const setAccentCustomHex = (hex: string) => {
    const normalized = normalizeHex(hex);
    setSettings(prev => ({
      ...(prev ?? {}),
      accentMode: 'custom',
      accentCustomHex: isValidHexColor(normalized) ? normalized : (prev?.accentCustomHex ?? '#121212'),
      accentPresetId: prev?.accentPresetId ?? 'midnight',
    }));
  };

  const setAccentMode = (mode: 'preset' | 'custom') => {
    setSettings(prev => ({
      ...(prev ?? {}),
      accentMode: mode,
      accentPresetId: prev?.accentPresetId ?? 'midnight',
      accentCustomHex: prev?.accentCustomHex ?? '#121212',
    }));
  };

  const value: ThemeContextValue = {
    colors,
    settings,
    refreshFromCloud,
    setAccentPreset,
    setAccentCustomHex,
    setAccentMode,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fallback that matches existing `colors.ts` defaults.
    return {
      colors: buildThemeColors(null),
      settings: null,
      refreshFromCloud: async () => {},
      setAccentPreset: () => {},
      setAccentCustomHex: () => {},
      setAccentMode: () => {},
    } satisfies ThemeContextValue;
  }
  return ctx;
}

