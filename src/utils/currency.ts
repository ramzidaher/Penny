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
export const formatCurrencySync = (amount: number, currencyCode: string = 'USD'): string => {
  const currency = currencies[currencyCode] || currencies.USD;
  return `${currency.symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Get currency symbol (synchronous version)
export const getCurrencySymbol = (currencyCode: string = 'USD'): string => {
  const currency = currencies[currencyCode] || currencies.USD;
  return currency.symbol;
};








