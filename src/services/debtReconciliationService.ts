/**
 * Debt Reconciliation Service
 *
 * Matches transactions to debts by merchant name and amount.
 * When a payment matches a debt (e.g. Uber £5.40 → Uber debt), suggests linking.
 * Apply match updates transaction.debtId; cloudDb already updates debt.remainingAmount.
 */

import type { Transaction, Debt } from '../database/schema';
import { normalizeMerchantName } from './categoryService';
import { updateTransaction } from '../database/db';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DISMISSED_STORAGE_KEY = 'debt_reconciliation_dismissed';
const AMOUNT_TOLERANCE = 0.01;

export interface PendingDebtMatch {
  transactionId: string;
  debtId: string;
  transaction: Transaction;
  debt: Debt;
}

function amountCompatible(txAmount: number, debt: Debt): boolean {
  const remaining = debt.remainingAmount ?? 0;
  if (txAmount <= 0 || remaining <= 0) return false;
  if (txAmount > remaining + AMOUNT_TOLERANCE) return false;
  if (debt.minimumPayment != null && debt.minimumPayment > 0) {
    const diff = Math.abs(txAmount - debt.minimumPayment);
    if (diff <= AMOUNT_TOLERANCE) return true;
  }
  return txAmount <= remaining + AMOUNT_TOLERANCE;
}

function nameMatches(merchantNorm: string, debt: Debt): boolean {
  const debtNameNorm = (debt.name || '').trim().toLowerCase();
  if (!debtNameNorm || !merchantNorm) return false;
  return (
    debtNameNorm.includes(merchantNorm) ||
    merchantNorm.includes(debtNameNorm)
  );
}

function dismissedKey(transactionId: string, debtId: string): string {
  return `${transactionId}|${debtId}`;
}

/**
 * Load set of dismissed match keys (transactionId|debtId).
 */
export async function getDismissedIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(DISMISSED_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

/**
 * Persist dismissed match so we don't suggest it again.
 */
export async function dismissMatch(
  transactionId: string,
  debtId?: string
): Promise<void> {
  const set = await getDismissedIds();
  if (debtId) {
    set.add(dismissedKey(transactionId, debtId));
  } else {
    set.add(transactionId);
  }
  await AsyncStorage.setItem(
    DISMISSED_STORAGE_KEY,
    JSON.stringify(Array.from(set))
  );
}

/**
 * Find all pending debt matches: unlinked expense transactions that match an active debt by merchant + amount.
 * Excludes dismissed (transactionId|debtId) and transactionId-only dismissals.
 */
export async function findPendingDebtMatches(
  transactions: Transaction[],
  debts: Debt[]
): Promise<PendingDebtMatch[]> {
  const dismissed = await getDismissedIds();
  const activeDebts = debts.filter((d) => d.status === 'active');
  const candidates = transactions.filter(
    (t) =>
      t.type === 'expense' &&
      !t.debtId &&
      !t.subscriptionId
  );

  const matches: PendingDebtMatch[] = [];
  const usedTxIds = new Set<string>();

  for (const tx of candidates) {
    const merchantNorm = normalizeMerchantName(tx.description || '');
    if (merchantNorm.length < 2) continue;
    if (dismissed.has(tx.id)) continue;

    let best: { debt: Debt; score: number } | null = null;
    for (const debt of activeDebts) {
      if (!nameMatches(merchantNorm, debt)) continue;
      if (!amountCompatible(tx.amount, debt)) continue;
      const key = dismissedKey(tx.id, debt.id);
      if (dismissed.has(key)) continue;

      const score =
        (debt.name || '').toLowerCase() === merchantNorm ? 2 : 1;
      if (!best || score > best.score) {
        best = { debt, score };
      }
    }
    if (best && !usedTxIds.has(tx.id)) {
      usedTxIds.add(tx.id);
      matches.push({
        transactionId: tx.id,
        debtId: best.debt.id,
        transaction: tx,
        debt: best.debt,
      });
    }
  }

  return matches;
}

/**
 * Find matches for a single transaction (e.g. for Transaction Detail screen).
 */
export async function findMatchesForTransaction(
  transaction: Transaction,
  debts: Debt[]
): Promise<PendingDebtMatch[]> {
  const all = await findPendingDebtMatches([transaction], debts);
  return all.filter((m) => m.transactionId === transaction.id);
}

/**
 * Link transaction to debt; cloudDb will update debt.remainingAmount and status.
 */
export async function applyMatch(
  transactionId: string,
  debtId: string
): Promise<void> {
  await updateTransaction(transactionId, { debtId });
}
