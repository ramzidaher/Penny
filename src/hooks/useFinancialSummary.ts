import { useState, useRef, useCallback } from 'react';
import { getAccounts, getDebts } from '../database/db';
import { getSettings } from '../services/settingsService';
import { waitForFirebase } from '../services/firebase';
import { enrichAccountsWithBalances } from '../services/accountBalanceService';
import { computeFinancialSummary, type FinancialSummary } from '../utils/financialSummary';
import { convertAmountsToCurrency } from '../services/currencyConversionService';
import type { Account, Debt } from '../database/schema';

const __DEV__ = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

/** Last summary computed (for dev-only cross-screen mismatch detection). */
let lastSummaryRef: { netWorth: number; totalAssets: number; totalDebts: number } | null = null;

export interface UseFinancialSummaryOptions {
  /** When true, enrich accounts with balances from cache/API before computing. */
  enrichBalances?: boolean;
}

export interface UseFinancialSummaryResult extends FinancialSummary {
  /** Display values in default currency (converted when accounts use mixed currencies). */
  displayTotalAssets: number;
  displayTotalDebts: number;
  displayNetWorth: number;
  currencyCode: string;
  loading: boolean;
  error: Error | null;
  loadData: (showLoading?: boolean) => Promise<void>;
  onRefresh: () => Promise<void>;
}

export function useFinancialSummary(
  options: UseFinancialSummaryOptions = {}
): UseFinancialSummaryResult {
  const { enrichBalances = true } = options;
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [currencyCode, setCurrencyCode] = useState<string>('USD');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [displayTotalAssets, setDisplayTotalAssets] = useState<number>(0);
  const [displayTotalDebts, setDisplayTotalDebts] = useState<number>(0);
  const [displayNetWorth, setDisplayNetWorth] = useState<number>(0);
  const hasLoadedRef = useRef(false);

  const loadData = useCallback(
    async (showLoading = false) => {
      try {
        if (showLoading) setLoading(true);
        setError(null);
        if (!hasLoadedRef.current) await waitForFirebase();
        const [accs, debtsData, settings] = await Promise.all([
          getAccounts(),
          getDebts(),
          getSettings(),
        ]);
        const accountsToSet = enrichBalances ? await enrichAccountsWithBalances(accs) : accs;
        setAccounts(accountsToSet);
        setDebts(debtsData);
        const code = settings.defaultCurrency || 'USD';
        setCurrencyCode(code);

        const summary = computeFinancialSummary(accountsToSet, debtsData);

        if (__DEV__) {
          const expectedNetWorth = summary.totalAssets - summary.totalDebts;
          if (Math.abs(summary.netWorth - expectedNetWorth) > 1e-6) {
            console.error(
              '[useFinancialSummary] Formula mismatch: netWorth !== totalAssets - totalDebts',
              { netWorth: summary.netWorth, totalAssets: summary.totalAssets, totalDebts: summary.totalDebts }
            );
          }
          const mismatch =
            lastSummaryRef &&
            (lastSummaryRef.netWorth !== summary.netWorth ||
              lastSummaryRef.totalAssets !== summary.totalAssets ||
              lastSummaryRef.totalDebts !== summary.totalDebts);
          const currentIsEmpty =
            summary.netWorth === 0 && summary.totalAssets === 0 && summary.totalDebts === 0;
          const previousIsEmpty =
            lastSummaryRef &&
            lastSummaryRef.netWorth === 0 &&
            lastSummaryRef.totalAssets === 0 &&
            lastSummaryRef.totalDebts === 0;
          if (mismatch && !currentIsEmpty && !previousIsEmpty) {
            console.error('[useFinancialSummary] Balance mismatch across screens', {
              previous: lastSummaryRef,
              current: { netWorth: summary.netWorth, totalAssets: summary.totalAssets, totalDebts: summary.totalDebts },
            });
          }
          lastSummaryRef = { netWorth: summary.netWorth, totalAssets: summary.totalAssets, totalDebts: summary.totalDebts };
        }

        const needsConversion = accountsToSet.some(
          (a) => (a.currency || code) !== code
        );
        if (!needsConversion || accountsToSet.length === 0) {
          setDisplayTotalAssets(summary.totalAssets);
          setDisplayTotalDebts(summary.totalDebts);
          setDisplayNetWorth(summary.netWorth);
        } else {
          const accountAmounts = accountsToSet
            .filter((a) => !(a.type === 'card' && a.linkedAccountId))
            .map((a) => ({ amount: a.balance ?? 0, currency: a.currency || code }));
          const convertedAssets = await convertAmountsToCurrency(accountAmounts, code);
          const displayDebts = summary.totalDebts;
          setDisplayTotalAssets(convertedAssets);
          setDisplayTotalDebts(displayDebts);
          setDisplayNetWorth(convertedAssets - displayDebts);
        }
        hasLoadedRef.current = true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        console.error('Error loading financial summary:', err);
      } finally {
        setLoading(false);
      }
    },
    [enrichBalances]
  );

  const summary = computeFinancialSummary(accounts, debts);

  const onRefresh = useCallback(async () => {
    await loadData();
  }, [loadData]);

  return {
    ...summary,
    displayTotalAssets,
    displayTotalDebts,
    displayNetWorth,
    currencyCode,
    loading,
    error,
    loadData,
    onRefresh,
  };
}
