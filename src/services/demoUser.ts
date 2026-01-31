import { getUserEmail } from './firebase';

const parseCsv = (value: string | undefined): string[] =>
  (value || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

/**
 * Demo user detection.
 *
 * Configure via EXPO_PUBLIC_DEMO_EMAILS="demo@yourapp.com,apple@review.com"
 */
export const isDemoUser = (): boolean => {
  const email = (getUserEmail() || '').trim().toLowerCase();
  if (!email) return false;

  const configured = parseCsv(process.env.EXPO_PUBLIC_DEMO_EMAILS);
  const defaultDemoEmails = ['demo@pennyfinance.app', 'demo@pennyfinance.com'];
  const demoEmails = configured.length ? configured : defaultDemoEmails;

  return demoEmails.includes(email);
};

