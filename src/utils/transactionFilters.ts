/**
 * Transaction Filter Utilities
 * 
 * Provides date-based filtering for transactions
 * Security: No sensitive data in logs
 */

import { Transaction } from '../database/schema';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subWeeks, subMonths, subYears } from 'date-fns';

export type FilterPeriod = 'week' | 'month' | 'year' | 'all';

export interface FilteredTransactions {
  transactions: Transaction[];
  income: number;
  expenses: number;
  net: number;
}

/**
 * Filter transactions by period
 */
export const filterTransactionsByPeriod = (
  transactions: Transaction[],
  period: FilterPeriod
): FilteredTransactions => {
  const now = new Date();
  let startDate: Date;
  let endDate: Date = now;

  switch (period) {
    case 'week':
      startDate = startOfWeek(now, { weekStartsOn: 1 }); // Monday
      endDate = endOfWeek(now, { weekStartsOn: 1 });
      break;
    case 'month':
      startDate = startOfMonth(now);
      endDate = endOfMonth(now);
      break;
    case 'year':
      startDate = startOfYear(now);
      endDate = endOfYear(now);
      break;
    case 'all':
    default:
      // No date filtering - return all transactions
      const income = transactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);
      const expenses = transactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);
      return {
        transactions,
        income,
        expenses,
        net: income - expenses,
      };
  }

  const filtered = transactions.filter(t => {
    const date = new Date(t.date);
    const isInRange = date >= startDate && date <= endDate;
    return isInRange;
  });

  const income = filtered
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const expenses = filtered
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  return {
    transactions: filtered,
    income,
    expenses,
    net: income - expenses,
  };
};

/**
 * Get period label for display
 */
export const getPeriodLabel = (period: FilterPeriod): string => {
  switch (period) {
    case 'week':
      return 'This Week';
    case 'month':
      return 'This Month';
    case 'year':
      return 'This Year';
    case 'all':
      return 'All Time';
    default:
      return 'All Time';
  }
};



