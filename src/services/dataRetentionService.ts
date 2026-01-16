/**
 * Data Retention Service
 * 
 * Implements GDPR-compliant 24-month retention policy for transaction data.
 * 
 * Policy:
 * - Store detailed transactions for 24 months
 * - After 24 months: aggregate into monthly summaries
 * - Delete detailed transaction data
 * - Keep aggregated data indefinitely (anonymized)
 * 
 * This service provides client-side utilities for identifying old transactions.
 * The actual deletion is performed by a Cloud Function (scheduled daily).
 */

import { Transaction } from '../database/schema';
import { cloudGetTransactions } from './cloudDb';

/**
 * Calculate the cutoff date for 24-month retention
 * Transactions older than this date should be aggregated and deleted
 * 
 * @returns ISO date string representing 24 months ago
 */
export const getRetentionCutoffDate = (): string => {
  const now = new Date();
  const cutoffDate = new Date(now);
  cutoffDate.setMonth(cutoffDate.getMonth() - 24);
  return cutoffDate.toISOString();
};

/**
 * Check if a transaction is older than the retention period (24 months)
 * 
 * @param transaction - Transaction to check
 * @returns true if transaction should be deleted/aggregated
 */
export const isTransactionExpired = (transaction: Transaction): boolean => {
  const cutoffDate = getRetentionCutoffDate();
  const transactionDate = new Date(transaction.date);
  const cutoff = new Date(cutoffDate);
  return transactionDate < cutoff;
};

/**
 * Get all transactions that are older than the retention period
 * 
 * @returns Array of expired transactions
 */
export const getExpiredTransactions = async (): Promise<Transaction[]> => {
  try {
    const allTransactions = await cloudGetTransactions();
    const cutoffDate = getRetentionCutoffDate();
    const cutoff = new Date(cutoffDate);
    
    return allTransactions.filter(transaction => {
      const transactionDate = new Date(transaction.date);
      return transactionDate < cutoff;
    });
  } catch (error) {
    console.error('[dataRetentionService] Error fetching expired transactions:', error);
    return [];
  }
};

/**
 * Aggregate transactions into monthly summaries
 * Used before deleting detailed transaction data
 * 
 * @param transactions - Transactions to aggregate
 * @returns Aggregated monthly summary data
 */
export interface MonthlySummary {
  userId: string;
  year: number;
  month: number; // 1-12
  category: string;
  totalAmount: number;
  transactionCount: number;
  type: 'income' | 'expense';
}

export const aggregateTransactions = (
  transactions: Transaction[],
  userId: string
): MonthlySummary[] => {
  const summaries = new Map<string, MonthlySummary>();
  
  for (const transaction of transactions) {
    const date = new Date(transaction.date);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 1-12
    const key = `${year}-${month}-${transaction.category}-${transaction.type}`;
    
    if (!summaries.has(key)) {
      summaries.set(key, {
        userId,
        year,
        month,
        category: transaction.category,
        totalAmount: 0,
        transactionCount: 0,
        type: transaction.type,
      });
    }
    
    const summary = summaries.get(key)!;
    summary.totalAmount += transaction.amount;
    summary.transactionCount += 1;
  }
  
  return Array.from(summaries.values());
};

/**
 * Get retention statistics for the current user
 * 
 * @returns Object with counts of total, expired, and active transactions
 */
export const getRetentionStats = async (): Promise<{
  total: number;
  expired: number;
  active: number;
  cutoffDate: string;
}> => {
  try {
    const allTransactions = await cloudGetTransactions();
    const cutoffDate = getRetentionCutoffDate();
    const cutoff = new Date(cutoffDate);
    
    const expired = allTransactions.filter(t => {
      const transactionDate = new Date(t.date);
      return transactionDate < cutoff;
    });
    
    return {
      total: allTransactions.length,
      expired: expired.length,
      active: allTransactions.length - expired.length,
      cutoffDate,
    };
  } catch (error) {
    console.error('[dataRetentionService] Error getting retention stats:', error);
    return {
      total: 0,
      expired: 0,
      active: 0,
      cutoffDate: getRetentionCutoffDate(),
    };
  }
};





