import { getSettings } from '../services/settingsService';

const currencies: Record<string, { symbol: string; code: string }> = {
  USD: { symbol: '$', code: 'USD' },
  EUR: { symbol: '€', code: 'EUR' },
  GBP: { symbol: '£', code: 'GBP' },
  JPY: { symbol: '¥', code: 'JPY' },
  CAD: { symbol: 'C$', code: 'CAD' },
  AUD: { symbol: 'A$', code: 'AUD' },
  CHF: { symbol: 'CHF', code: 'CHF' },
  CNY: { symbol: '¥', code: 'CNY' },
  SEK: { symbol: 'kr', code: 'SEK' },
  ILS: { symbol: '₪', code: 'ILS' },
  NZD: { symbol: 'NZ$', code: 'NZD' },
  SGD: { symbol: 'S$', code: 'SGD' },
  HKD: { symbol: 'HK$', code: 'HKD' },
  NOK: { symbol: 'kr', code: 'NOK' },
  DKK: { symbol: 'kr', code: 'DKK' },
  PLN: { symbol: 'zł', code: 'PLN' },
  MXN: { symbol: '$', code: 'MXN' },
  BRL: { symbol: 'R$', code: 'BRL' },
  INR: { symbol: '₹', code: 'INR' },
  ZAR: { symbol: 'R', code: 'ZAR' },
  TRY: { symbol: '₺', code: 'TRY' },
  RUB: { symbol: '₽', code: 'RUB' },
};

// Get currency symbol and code from settings
export const getCurrencyInfo = async (): Promise<{ symbol: string; code: string }> => {
  try {
    const settings = await getSettings();
    const currency = currencies[settings.defaultCurrency] || currencies.USD;
    return currency;
  } catch (error) {
    console.error('Error getting currency info:', error);
    return currencies.USD; // Default to USD
  }
};

// Format amount with currency symbol
export const formatCurrency = async (amount: number): Promise<string> => {
  const currency = await getCurrencyInfo();
  return `${currency.symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Format currency with symbol (synchronous version - requires currency to be passed)
export const formatCurrencySync = (amount: number | undefined | null, currencyCode: string = 'USD'): string => {
  const currency = currencies[currencyCode] || currencies.USD;
  // Handle undefined/null amounts - default to 0
  const safeAmount = amount ?? 0;
  return `${currency.symbol}${safeAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Get currency symbol (synchronous version). For unknown codes returns the code itself (e.g. THB, KRW) so all currencies display correctly.
export const getCurrencySymbol = (currencyCode: string = 'USD'): string => {
  const code = (currencyCode || 'USD').trim().toUpperCase();
  if (!code) return currencies.USD.symbol;
  const currency = currencies[code];
  if (currency) return currency.symbol;
  return code;
};














