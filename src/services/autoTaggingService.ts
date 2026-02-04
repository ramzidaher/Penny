/**
 * Auto-Tagging Service - Fully automatic transaction intelligence
 *
 * Classifies transactions (income/expense, category), detects subscriptions
 * and debts, creates/updates budgets. Runs in background with no user input.
 */

import { Transaction, Budget, Subscription, Debt } from '../database/schema';
import { suggestCategorySilent, normalizeMerchantName } from './categoryService';
import { getDefaultCategory } from '../utils/categories';
import type { TransactionType } from '../utils/categories';
import {
  cloudGetBudgets,
  cloudAddBudget,
  cloudUpdateBudget,
  cloudGetSubscriptions,
  cloudAddSubscription,
  cloudUpdateSubscription,
  cloudGetDebts,
  cloudAddDebt,
  cloudUpdateDebt,
  cloudUpdateTransaction,
} from './cloudDb';
import { isFirebaseAvailable } from './firebase';
import { addMonths, addWeeks, addYears, subMonths } from 'date-fns';
import { normalizeTransactionUpdate } from '../utils/transactionEdgeCases';

const BATCH_SIZE = 100;
const MIN_CONFIDENCE = 0.6;
const SUBSCRIPTION_MIN_OCCURRENCES = 2;
const DAYS_MONTHLY_MIN = 25;
const DAYS_MONTHLY_MAX = 35;
const DAYS_WEEKLY_MIN = 5;
const DAYS_WEEKLY_MAX = 9;
const DAYS_YEARLY_MIN = 350;
const DAYS_YEARLY_MAX = 380;
const AMOUNT_TOLERANCE = 0.01;

const DEBT_KEYWORDS = [
  'credit card',
  'amex',
  'american express',
  'visa',
  'mastercard',
  'mc payment',
  'loan payment',
  'klarna',
  'affirm',
  'bnpl',
  'paypal credit',
  'chase',
  'capital one',
  'discover',
  'card payment',
  'minimum payment',
];

const INCOME_HINTS = [
  'salary',
  'paycheck',
  'pay cheque',
  'deposit',
  'refund',
  'payment received',
  'income',
  'transfer in',
];

/**
 * Infer transaction type from description and amount when not set by provider.
 */
function inferType(tx: Transaction): TransactionType {
  const desc = (tx.description || '').toLowerCase();
  for (const hint of INCOME_HINTS) {
    if (desc.includes(hint)) return 'income';
  }
  return tx.type || 'expense';
}

/**
 * Detect recurring merchant+amount groups and infer frequency.
 * Returns key = normalizeMerchantName(desc)|amount for consistent lookup when linking transactions.
 */
function detectRecurringGroups(
  transactions: Transaction[]
): Array<{ key: string; merchant: string; amount: number; frequency: 'weekly' | 'monthly' | 'yearly'; dates: string[]; accountId: string }> {
  const byKey = new Map<string, { desc: string; amount: number; date: string; accountId: string }[]>();
  for (const tx of transactions) {
    if (tx.type === 'income') continue;
    const norm = normalizeMerchantName(tx.description || '');
    if (!norm || norm.length < 2) continue;
    const amt = Math.round(tx.amount * 100) / 100;
    const key = `${norm}|${amt.toFixed(2)}`;
    const list = byKey.get(key) || [];
    list.push({
      desc: tx.description || '',
      amount: tx.amount,
      date: tx.date,
      accountId: tx.accountId,
    });
    byKey.set(key, list);
  }

  const result: Array<{ key: string; merchant: string; amount: number; frequency: 'weekly' | 'monthly' | 'yearly'; dates: string[]; accountId: string }> = [];
  for (const [key, list] of byKey) {
    if (list.length < SUBSCRIPTION_MIN_OCCURRENCES) continue;
    list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const dates = list.map((d) => d.date);
    const gaps: number[] = [];
    for (let i = 1; i < list.length; i++) {
      const days = (new Date(list[i].date).getTime() - new Date(list[i - 1].date).getTime()) / (24 * 60 * 60 * 1000);
      gaps.push(days);
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    let frequency: 'weekly' | 'monthly' | 'yearly' = 'monthly';
    if (avgGap >= DAYS_WEEKLY_MIN && avgGap <= DAYS_WEEKLY_MAX) frequency = 'weekly';
    else if (avgGap >= DAYS_MONTHLY_MIN && avgGap <= DAYS_MONTHLY_MAX) frequency = 'monthly';
    else if (avgGap >= DAYS_YEARLY_MIN && avgGap <= DAYS_YEARLY_MAX) frequency = 'yearly';
    else continue;

    const merchant = (list[0].desc && list[0].desc.split(/[,\s-]/)[0]?.trim()) || 'Subscription';
    result.push({
      key,
      merchant,
      amount: list[0].amount,
      frequency,
      dates,
      accountId: list[0].accountId,
    });
  }
  return result;
}

/**
 * Check if description matches debt keywords.
 */
function matchesDebtKeywords(description: string): boolean {
  const lower = (description || '').toLowerCase();
  return DEBT_KEYWORDS.some((k) => lower.includes(k));
}

/**
 * Infer debt type from description.
 */
function inferDebtType(description: string): Debt['type'] {
  const lower = (description || '').toLowerCase();
  if (lower.includes('klarna') || lower.includes('affirm') || lower.includes('bnpl')) return 'buy_now_pay_later';
  if (lower.includes('loan')) return 'loan';
  return 'credit_card';
}

/**
 * Run full auto-tagging pipeline: classify, create subscriptions/debts/budgets, persist.
 * Call in background (non-blocking). Idempotent and safe to run on every sync.
 */
export async function runAutoTagging(transactions: Transaction[]): Promise<void> {
  if (!isFirebaseAvailable() || transactions.length === 0) return;

  try {
    const [budgets, subscriptions, debts] = await Promise.all([
      cloudGetBudgets(),
      cloudGetSubscriptions(),
      cloudGetDebts(),
    ]);

    const budgetByCategory = new Map<string, Budget>();
    for (const b of budgets) {
      const key = `${b.category}_${b.period}`;
      if (!budgetByCategory.has(key)) budgetByCategory.set(key, b);
    }

    const subscriptionByName = new Map<string, Subscription>();
    for (const s of subscriptions) {
      const key = normalizeMerchantName(s.name) + '|' + s.amount.toFixed(2);
      subscriptionByName.set(key, s);
    }

    const debtByName = new Map<string, Debt>();
    for (const d of debts) {
      const key = normalizeMerchantName(d.name);
      debtByName.set(key, d);
    }

    const expenseTxs = transactions.filter((t) => t.type === 'expense');
    const threeMonthsAgo = subMonths(new Date(), 3).toISOString();

    // 1) Detect recurring groups and create/link subscriptions
    const recurringGroups = detectRecurringGroups(expenseTxs);
    for (const g of recurringGroups) {
      const key = g.key;
      let sub = subscriptionByName.get(key);
      if (!sub) {
        const lastDate = g.dates[g.dates.length - 1];
        let nextBilling: Date;
        if (g.frequency === 'weekly') nextBilling = addWeeks(new Date(lastDate), 1);
        else if (g.frequency === 'monthly') nextBilling = addMonths(new Date(lastDate), 1);
        else nextBilling = addYears(new Date(lastDate), 1);
        const id = await cloudAddSubscription({
          name: g.merchant,
          amount: g.amount,
          currency: 'USD',
          frequency: g.frequency,
          nextBillingDate: nextBilling.toISOString(),
          accountId: g.accountId,
        });
        sub = {
          id,
          name: g.merchant,
          amount: g.amount,
          currency: 'USD',
          frequency: g.frequency,
          nextBillingDate: nextBilling.toISOString(),
          accountId: g.accountId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        subscriptionByName.set(key, sub);
      }
    }

    // 2) Create debts for debt-keyword transactions that don't match existing debt
    for (const tx of expenseTxs) {
      if (!matchesDebtKeywords(tx.description || '')) continue;
      const merchant = (tx.description || '').split(/[,\s-]/)[0]?.trim() || 'Debt';
      const key = normalizeMerchantName(merchant);
      if (debtByName.has(key)) continue;
      const dueDate = addMonths(new Date(), 1).toISOString().slice(0, 10);
      const id = await cloudAddDebt({
        name: merchant,
        description: tx.description || '',
        totalAmount: 0,
        remainingAmount: 0,
        dueDate,
        type: inferDebtType(tx.description || ''),
        status: 'active',
      });
      debtByName.set(key, {
        id,
        name: merchant,
        description: tx.description || '',
        totalAmount: 0,
        remainingAmount: 0,
        dueDate,
        type: inferDebtType(tx.description || ''),
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    // 3) Ensure monthly budget per expense category (from last 3 months spending)
    const spendingByCategory = new Map<string, number>();
    for (const tx of expenseTxs) {
      if (tx.date < threeMonthsAgo) continue;
      const c = tx.category || 'Other';
      spendingByCategory.set(c, (spendingByCategory.get(c) || 0) + tx.amount);
    }
    for (const [category, total] of spendingByCategory) {
      const key = `${category}_monthly`;
      if (budgetByCategory.has(key)) continue;
      const avgMonthly = total / 3;
      const limit = Math.round(avgMonthly * 1.2 * 100) / 100 || 100;
      const id = await cloudAddBudget({
        category,
        limit,
        period: 'monthly',
        currentSpent: 0,
      });
      budgetByCategory.set(key, {
        id,
        category,
        limit,
        period: 'monthly',
        currentSpent: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    // 4) Tag each transaction: type, category, subscriptionId, debtId, budgetId
    const updates: Array<{ id: string; updates: Partial<Transaction> }> = [];
    for (const tx of transactions) {
      const type = inferType(tx);
      const currentCategory = tx.category || getDefaultCategory(type);
      const suggestion = await suggestCategorySilent(tx.description || '', type, tx.amount, {
        minConfidence: MIN_CONFIDENCE,
        currentCategory,
      });

      let subscriptionId: string | undefined;
      let debtId: string | undefined;
      let budgetId: string | undefined;
      let category = suggestion.category;

      if (type === 'expense') {
        const norm = normalizeMerchantName(tx.description || '');
        if (norm.length >= 2) {
          const amountKey = (Math.round(tx.amount * 100) / 100).toFixed(2);
          const subKey = norm + '|' + amountKey;
          const sub = subscriptionByName.get(subKey);
          if (sub) {
            subscriptionId = sub.id;
            category = 'Subscription';
          }
        }

        if (matchesDebtKeywords(tx.description || '')) {
          const merchant = (tx.description || '').split(/[,\s-]/)[0]?.trim() || 'Debt';
          const d = debtByName.get(normalizeMerchantName(merchant));
          if (d) {
            debtId = d.id;
            category = 'Debt';
          }
        }

        const budgetKey = `${category}_monthly`;
        const budget = budgetByCategory.get(budgetKey);
        if (budget) budgetId = budget.id;
      }

      const payload = normalizeTransactionUpdate({
        type,
        category,
        subscriptionId,
        debtId,
        budgetId,
      });
      if (
        payload.type !== tx.type ||
        payload.category !== tx.category ||
        payload.subscriptionId !== tx.subscriptionId ||
        payload.debtId !== tx.debtId ||
        payload.budgetId !== tx.budgetId
      ) {
        updates.push({ id: tx.id, updates: payload });
      }
    }

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(({ id, updates: u }) => cloudUpdateTransaction(id, u)));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[autoTaggingService] Error:', msg);
  }
}

/**
 * Trigger auto-tagging in background (fire-and-forget). Use after sync.
 */
export function triggerAutoTaggingInBackground(transactions: Transaction[]): void {
  if (transactions.length === 0) return;
  runAutoTagging(transactions).catch(() => {});
}
