import { useState, useRef, useCallback } from 'react';
import { getAccounts, getTransactions, getBudgets, getSubscriptions } from '../database/db';
import { getSettings } from '../services/settingsService';
import { waitForFirebase } from '../services/firebase';
import { enrichAccountsWithBalances } from '../services/accountBalanceService';
import type { Account, Transaction, Budget, Subscription } from '../database/schema';

export type SwipeDirection = 'right-income-left-expense' | 'right-expense-left-income';

export interface UseFinanceOverviewDataOptions {
  enrichBalances: boolean;
}

export interface UseFinanceOverviewDataResult {
  accounts: Account[];
  transactions: Transaction[];
  budgets: Budget[];
  subscriptions: Subscription[];
  currencyCode: string;
  swipeDirection: SwipeDirection;
  loading: boolean;
  refreshing: boolean;
  loadData: (showLoading?: boolean) => Promise<void>;
  onRefresh: () => Promise<void>;
}

export function useFinanceOverviewData(
  options: UseFinanceOverviewDataOptions
): UseFinanceOverviewDataResult {
  const { enrichBalances } = options;
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [currencyCode, setCurrencyCode] = useState<string>('USD');
  const [swipeDirection, setSwipeDirection] = useState<SwipeDirection>('right-income-left-expense');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedRef = useRef(false);

  const loadData = useCallback(
    async (showLoading = false) => {
      try {
        if (showLoading) {
          setLoading(true);
        }
        if (!hasLoadedRef.current) {
          await waitForFirebase();
        }
        const [accs, trans, buds, subs, settings] = await Promise.all([
          getAccounts(),
          getTransactions(),
          getBudgets(),
          getSubscriptions(),
          getSettings(),
        ]);
        const accountsToSet = enrichBalances ? await enrichAccountsWithBalances(accs) : accs;
        setAccounts(accountsToSet);
        setTransactions(trans);
        setBudgets(buds);
        setSubscriptions(subs);
        setCurrencyCode(settings.defaultCurrency);
        setSwipeDirection(settings.swipeDirection);
        hasLoadedRef.current = true;
      } catch (error) {
        console.error('Error loading finance overview data:', error);
      } finally {
        setLoading(false);
      }
    },
    [enrichBalances]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  return {
    accounts,
    transactions,
    budgets,
    subscriptions,
    currencyCode,
    swipeDirection,
    loading,
    refreshing,
    loadData,
    onRefresh,
  };
}
