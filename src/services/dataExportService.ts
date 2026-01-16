/**
 * Data Export Service
 * 
 * Exports all user data in JSON and CSV formats for backup and portability.
 * Includes accounts, transactions, budgets, subscriptions, debts, chat threads, and settings.
 */

import { Account, Transaction, Budget, Subscription, Debt, ChatThread } from '../database/schema';
import { getAccounts, getTransactions, getBudgets, getSubscriptions, getDebts, getChatThreads } from '../database/db';
import { getSettings } from './settingsService';
import { getUserId, getUserEmail } from './firebase';

export interface ExportData {
  metadata: {
    exportDate: string;
    userId: string;
    userEmail: string | null;
    version: string;
  };
  accounts: Account[];
  transactions: Transaction[];
  budgets: Budget[];
  subscriptions: Subscription[];
  debts: Debt[];
  chatThreads: ChatThread[];
  settings: any;
}

/**
 * Export all user data as JSON
 */
export const exportDataAsJSON = async (): Promise<string> => {
  try {
    const [accounts, transactions, budgets, subscriptions, debts, chatThreads, settings] = await Promise.all([
      getAccounts(),
      getTransactions(),
      getBudgets(),
      getSubscriptions(),
      getDebts(),
      getChatThreads(),
      getSettings(),
    ]);

    const exportData: ExportData = {
      metadata: {
        exportDate: new Date().toISOString(),
        userId: getUserId() || 'unknown',
        userEmail: getUserEmail(),
        version: '1.0.0',
      },
      accounts,
      transactions,
      budgets,
      subscriptions,
      debts,
      chatThreads,
      settings,
    };

    return JSON.stringify(exportData, null, 2);
  } catch (error) {
    console.error('[dataExportService] Error exporting data as JSON:', error);
    throw error;
  }
};

/**
 * Convert array of objects to CSV format
 */
const arrayToCSV = (data: any[], headers: string[]): string => {
  if (data.length === 0) {
    return headers.join(',') + '\n';
  }

  const rows = data.map((item) => {
    return headers.map((header) => {
      const value = item[header];
      // Handle nested objects and arrays
      if (value === null || value === undefined) {
        return '';
      }
      if (typeof value === 'object') {
        return JSON.stringify(value).replace(/"/g, '""');
      }
      // Escape quotes and wrap in quotes if contains comma or newline
      const stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    });
  });

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
};

/**
 * Export all user data as CSV (multiple files combined or separate)
 * Returns a map of data type to CSV string
 */
export const exportDataAsCSV = async (): Promise<Record<string, string>> => {
  try {
    const [accounts, transactions, budgets, subscriptions, debts, chatThreads, settings] = await Promise.all([
      getAccounts(),
      getTransactions(),
      getBudgets(),
      getSubscriptions(),
      getDebts(),
      getChatThreads(),
      getSettings(),
    ]);

    const csvData: Record<string, string> = {};

    // Export accounts
    if (accounts.length > 0) {
      csvData.accounts = arrayToCSV(accounts, [
        'id',
        'name',
        'type',
        'balance',
        'currency',
        'linkedAccountId',
        'cardNumber',
        'cardPin',
        'cardLogo',
        'truelayerConnectionId',
        'truelayerAccountId',
        'isSynced',
        'lastSyncedAt',
        'truelayerAccountType',
        'createdAt',
        'updatedAt',
      ]);
    }

    // Export transactions
    if (transactions.length > 0) {
      csvData.transactions = arrayToCSV(transactions, [
        'id',
        'accountId',
        'amount',
        'type',
        'category',
        'description',
        'date',
        'createdAt',
        'truelayerTransactionId',
        'subscriptionId',
        'debtId',
        'budgetId',
        'descriptionHash',
      ]);
    }

    // Export budgets
    if (budgets.length > 0) {
      csvData.budgets = arrayToCSV(budgets, [
        'id',
        'category',
        'limit',
        'period',
        'currentSpent',
        'createdAt',
        'updatedAt',
      ]);
    }

    // Export subscriptions
    if (subscriptions.length > 0) {
      csvData.subscriptions = arrayToCSV(subscriptions, [
        'id',
        'name',
        'amount',
        'currency',
        'frequency',
        'nextBillingDate',
        'accountId',
        'createdAt',
        'updatedAt',
      ]);
    }

    // Export debts
    if (debts.length > 0) {
      csvData.debts = arrayToCSV(debts, [
        'id',
        'name',
        'description',
        'totalAmount',
        'remainingAmount',
        'interestRate',
        'minimumPayment',
        'dueDate',
        'accountId',
        'budgetCategory',
        'type',
        'status',
        'createdAt',
        'updatedAt',
      ]);
    }

    // Export chat threads (flattened)
    if (chatThreads.length > 0) {
      const flattenedChats = chatThreads.flatMap((thread) =>
        thread.messages.map((message, index) => ({
          threadId: thread.id,
          threadTitle: thread.title,
          messageIndex: index,
          role: message.role,
          content: message.content,
          messageCreatedAt: message.createdAt,
          threadCreatedAt: thread.createdAt,
          threadUpdatedAt: thread.updatedAt,
        }))
      );
      csvData.chatThreads = arrayToCSV(flattenedChats, [
        'threadId',
        'threadTitle',
        'messageIndex',
        'role',
        'content',
        'messageCreatedAt',
        'threadCreatedAt',
        'threadUpdatedAt',
      ]);
    }

    // Export settings (single row)
    csvData.settings = arrayToCSV([settings], Object.keys(settings));

    // Add metadata
    csvData.metadata = arrayToCSV(
      [
        {
          exportDate: new Date().toISOString(),
          userId: getUserId() || 'unknown',
          userEmail: getUserEmail() || '',
          version: '1.0.0',
        },
      ],
      ['exportDate', 'userId', 'userEmail', 'version']
    );

    return csvData;
  } catch (error) {
    console.error('[dataExportService] Error exporting data as CSV:', error);
    throw error;
  }
};

/**
 * Get export statistics
 */
export const getExportStats = async (): Promise<{
  accounts: number;
  transactions: number;
  budgets: number;
  subscriptions: number;
  debts: number;
  chatThreads: number;
}> => {
  try {
    const [accounts, transactions, budgets, subscriptions, debts, chatThreads] = await Promise.all([
      getAccounts(),
      getTransactions(),
      getBudgets(),
      getSubscriptions(),
      getDebts(),
      getChatThreads(),
    ]);

    return {
      accounts: accounts.length,
      transactions: transactions.length,
      budgets: budgets.length,
      subscriptions: subscriptions.length,
      debts: debts.length,
      chatThreads: chatThreads.length,
    };
  } catch (error) {
    console.error('[dataExportService] Error getting export stats:', error);
    throw error;
  }
};




