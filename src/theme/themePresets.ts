export type AccentPreset = {
  id: string;
  name: string;
  hex: string; // #RRGGBB
};

export const accentPresets: AccentPreset[] = [
  { id: 'midnight', name: 'Midnight', hex: '#121212' },
  { id: 'ocean', name: 'Ocean', hex: '#1D4ED8' },
  { id: 'emerald', name: 'Emerald', hex: '#059669' },
  { id: 'sunset', name: 'Sunset', hex: '#F97316' },
  { id: 'orchid', name: 'Orchid', hex: '#7C3AED' },
  { id: 'rose', name: 'Rose', hex: '#E11D48' },
];

export const getAccentPresetById = (id: string | undefined): AccentPreset => {
  const found = accentPresets.find(p => p.id === id);
  return found ?? accentPresets[0];
};

export const normalizeHex = (value: string): string => {
  let v = (value || '').trim();
  if (!v) return '';
  if (!v.startsWith('#')) v = `#${v}`;
  return v.toUpperCase();
};

export const isValidHexColor = (value: string): boolean => {
  const v = normalizeHex(value);
  return /^#[0-9A-F]{6}$/.test(v);
};

