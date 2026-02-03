/**
 * Transaction edge-case handling: duplicate tagging, income/expense rules,
 * category validation, and tag mutual exclusivity.
 */

import type { Transaction } from '../database/schema';
import {
  canCategoryBeType,
  isValidCategory,
  getDefaultCategory,
  type TransactionType,
} from './categories';

/** Income transactions must not have subscription, debt, or budget tags */
export const INCOME_MUST_NOT_HAVE_TAGS = true;

/** Subscription and debt tags are mutually exclusive (one transaction = one tag type) */
export const SUBSCRIPTION_AND_DEBT_MUTUALLY_EXCLUSIVE = true;

/**
 * Validates that a category is allowed for the given transaction type.
 */
export function validateCategoryForType(
  category: string,
  type: TransactionType
): { valid: boolean; error?: string } {
  if (!category || typeof category !== 'string') {
    return { valid: false, error: 'Category is required' };
  }
  const trimmed = category.trim();
  if (!isValidCategory(trimmed)) {
    return { valid: false, error: 'Invalid category' };
  }
  if (!canCategoryBeType(trimmed, type)) {
    return {
      valid: false,
      error: type === 'income'
        ? 'This category is for expenses only. Choose an income category.'
        : 'This category is for income only. Choose an expense category.',
    };
  }
  return { valid: true };
}

/**
 * Normalizes update payload for edge cases:
 * - Income: force subscriptionId, debtId, budgetId to null
 * - Setting subscriptionId: clear debtId (mutually exclusive)
 * - Setting debtId: clear subscriptionId (mutually exclusive)
 */
export function normalizeTransactionUpdate(
  updates: Partial<Transaction>,
  existing?: Transaction | null
): Partial<Transaction> {
  const out = { ...updates };

  if (out.type === 'income') {
    out.subscriptionId = undefined;
    out.debtId = undefined;
    out.budgetId = undefined;
  }

  if (SUBSCRIPTION_AND_DEBT_MUTUALLY_EXCLUSIVE) {
    if (out.subscriptionId !== undefined && out.subscriptionId !== null) {
      out.debtId = undefined;
    }
    if (out.debtId !== undefined && out.debtId !== null) {
      out.subscriptionId = undefined;
    }
  }

  return out;
}

/**
 * Normalizes a new transaction (e.g. from Add Transaction) for edge cases:
 * - Income must not have subscriptionId, debtId, budgetId
 * - Category must be valid for type; if not, replace with default
 */
export function normalizeNewTransaction(
  transaction: Omit<Transaction, 'id' | 'createdAt'>
): Omit<Transaction, 'id' | 'createdAt'> {
  const out = { ...transaction };

  if (out.type === 'income') {
    out.subscriptionId = undefined;
    out.debtId = undefined;
    out.budgetId = undefined;
  }

  const categoryCheck = validateCategoryForType(out.category, out.type);
  if (!categoryCheck.valid) {
    out.category = getDefaultCategory(out.type);
  }

  return out;
}

/**
 * Full validation for an update (category + type + tags).
 */
export function validateTransactionUpdate(
  updates: Partial<Transaction>,
  existing?: Transaction | null
): { valid: boolean; error?: string } {
  const type = updates.type ?? existing?.type;
  if (type !== 'income' && type !== 'expense') {
    return { valid: false, error: 'Invalid transaction type' };
  }

  if (updates.category !== undefined) {
    const categoryResult = validateCategoryForType(updates.category.trim(), type!);
    if (!categoryResult.valid) return categoryResult;
  }

  if (type === 'income' && (updates.subscriptionId != null || updates.debtId != null || updates.budgetId != null)) {
    return {
      valid: false,
      error: 'Income transactions cannot be linked to subscriptions, debts, or budgets.',
    };
  }

  return { valid: true };
}

/**
 * Full validation for a new transaction.
 */
export function validateNewTransaction(
  transaction: Omit<Transaction, 'id' | 'createdAt'>
): { valid: boolean; error?: string } {
  if (transaction.type !== 'income' && transaction.type !== 'expense') {
    return { valid: false, error: 'Invalid transaction type' };
  }

  const categoryResult = validateCategoryForType(transaction.category, transaction.type);
  if (!categoryResult.valid) return categoryResult;

  if (transaction.type === 'income' && (transaction.subscriptionId != null || transaction.debtId != null || transaction.budgetId != null)) {
    return {
      valid: false,
      error: 'Income transactions cannot be linked to subscriptions, debts, or budgets.',
    };
  }

  return { valid: true };
}

/**
 * Optional: detect a possible duplicate manual transaction (same account, amount, date, description).
 * Returns the duplicate if found within the same day; otherwise null.
 */
export function findPossibleDuplicateManual(
  existing: Transaction[],
  candidate: { accountId: string; amount: number; date: string; description?: string }
): Transaction | null {
  const candidateDate = new Date(candidate.date);
  const candidateDayStart = new Date(candidateDate.getFullYear(), candidateDate.getMonth(), candidateDate.getDate()).getTime();
  const candidateDayEnd = candidateDayStart + 24 * 60 * 60 * 1000;

  const desc = (candidate.description || '').trim().toLowerCase();

  for (const t of existing) {
    if (t.accountId !== candidate.accountId) continue;
    if (Math.abs(t.amount - candidate.amount) > 0.005) continue;

    const tTime = new Date(t.date).getTime();
    if (tTime < candidateDayStart || tTime >= candidateDayEnd) continue;

    const tDesc = (t.description || '').trim().toLowerCase();
    if (desc && tDesc && tDesc !== desc) continue;

    return t;
  }
  return null;
}
