import type { Account, Debt } from '../database/schema';

export interface FinancialSummary {
  totalAssets: number;
  totalDebts: number;
  netWorth: number;
  accountCount: number;
}

/**
 * Single source of truth for balance calculations.
 * - Total Assets: sum of account balances, counting each balance once.
 *   For card accounts with linkedAccountId, we do NOT add that account's balance
 *   (the linked account's balance is already counted) to avoid double-counting.
 * - Total Debts: sum of remainingAmount for debts where status === 'active'.
 * - Net Worth: totalAssets - totalDebts.
 */
export function computeFinancialSummary(
  accounts: Account[],
  debts: Debt[]
): FinancialSummary {
  const totalAssets = accounts.reduce((sum, acc) => {
    if (acc.type === 'card' && acc.linkedAccountId) return sum;
    return sum + (acc.balance ?? 0);
  }, 0);

  const totalDebts = debts
    .filter((d) => d.status === 'active')
    .reduce((sum, d) => sum + d.remainingAmount, 0);

  const netWorth = totalAssets - totalDebts;
  const accountCount = accounts.length;

  return { totalAssets, totalDebts, netWorth, accountCount };
}
