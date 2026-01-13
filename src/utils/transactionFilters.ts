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

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/utils/transactionFilters.ts:31',message:'filterTransactionsByPeriod entry',data:{period,now:now.toISOString(),startDate:startDate.toISOString(),endDate:endDate.toISOString(),totalTransactions:transactions.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion

  const filtered = transactions.filter(t => {
    const date = new Date(t.date);
    const isInRange = date >= startDate && date <= endDate;
    
    // #region agent log
    if (t.type === 'income' && (date.getDate() >= 20 || date.getDate() <= 5)) {
      fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/utils/transactionFilters.ts:65',message:'Income transaction near month boundary',data:{transactionId:t.id,transactionDate:t.date,parsedDate:date.toISOString(),dayOfMonth:date.getDate(),isInRange,period,description:t.description?.substring(0,50),amount:t.amount,type:t.type},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    }
    // #endregion
    
    return isInRange;
  });

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/utils/transactionFilters.ts:75',message:'filterTransactionsByPeriod filtering results',data:{period,filteredCount:filtered.length,totalCount:transactions.length,incomeCount:filtered.filter(t=>t.type==='income').length,expenseCount:filtered.filter(t=>t.type==='expense').length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion

  const income = filtered
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const expenses = filtered
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/utils/transactionFilters.ts:87',message:'filterTransactionsByPeriod exit',data:{period,income,expenses,net:income-expenses,incomeTransactions:filtered.filter(t=>t.type==='income').length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion

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



