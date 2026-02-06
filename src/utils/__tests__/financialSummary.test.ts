import { computeFinancialSummary } from '../financialSummary';
import type { Account, Debt } from '../../database/schema';

const now = '2025-01-01T00:00:00.000Z';

function account(overrides: Partial<Account> & { balance?: number; type?: Account['type']; linkedAccountId?: string }): Account {
  return {
    id: 'a1',
    name: 'Account',
    type: 'bank',
    currency: 'GBP',
    balance: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function debt(overrides: Partial<Debt>): Debt {
  const base: Debt = {
    id: 'd1',
    name: 'Debt',
    description: '',
    totalAmount: 1000,
    remainingAmount: 500,
    dueDate: now,
    type: 'loan',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  return { ...base, ...overrides };
}

describe('computeFinancialSummary', () => {
  it('returns netWorth === totalAssets - totalDebts', () => {
    const accounts: Account[] = [
      account({ id: '1', balance: 1000 }),
      account({ id: '2', balance: 500 }),
    ];
    const debts: Debt[] = [
      debt({ id: 'd1', remainingAmount: 200, status: 'active' }),
    ];
    const summary = computeFinancialSummary(accounts, debts);
    expect(summary.netWorth).toBe(summary.totalAssets - summary.totalDebts);
    expect(summary.totalAssets).toBe(1500);
    expect(summary.totalDebts).toBe(200);
    expect(summary.netWorth).toBe(1300);
    expect(summary.accountCount).toBe(2);
  });

  it('counts only active debts in totalDebts (excludes paid_off and overdue)', () => {
    const accounts: Account[] = [account({ balance: 1000 })];
    const debts: Debt[] = [
      debt({ id: 'd1', remainingAmount: 100, status: 'active' }),
      debt({ id: 'd2', remainingAmount: 50, status: 'paid_off' }),
      debt({ id: 'd3', remainingAmount: 25, status: 'overdue' }),
    ];
    const summary = computeFinancialSummary(accounts, debts);
    expect(summary.totalDebts).toBe(100);
    expect(summary.netWorth).toBe(1000 - 100);
  });

  it('excludes card with linkedAccountId from totalAssets to avoid double-counting', () => {
    const bank = account({ id: 'bank1', balance: 1000, type: 'bank' });
    const card = account({
      id: 'card1',
      balance: 500,
      type: 'card',
      linkedAccountId: 'bank1',
    });
    const summary = computeFinancialSummary([bank, card], []);
    expect(summary.totalAssets).toBe(1000);
    expect(summary.netWorth).toBe(1000);
    expect(summary.accountCount).toBe(2);
  });

  it('includes card without linkedAccountId in totalAssets', () => {
    const cardOnly = account({
      id: 'card1',
      balance: 300,
      type: 'card',
    });
    const summary = computeFinancialSummary([cardOnly], []);
    expect(summary.totalAssets).toBe(300);
    expect(summary.netWorth).toBe(300);
  });

  it('handles empty accounts and debts', () => {
    const summary = computeFinancialSummary([], []);
    expect(summary.totalAssets).toBe(0);
    expect(summary.totalDebts).toBe(0);
    expect(summary.netWorth).toBe(0);
    expect(summary.accountCount).toBe(0);
  });

  it('treats undefined balance as 0', () => {
    const acc = account({ id: '1' });
    delete (acc as Partial<Account>).balance;
    const summary = computeFinancialSummary([acc], []);
    expect(summary.totalAssets).toBe(0);
  });
});
