import { Account, Transaction, Budget, Subscription, Debt, ChatThread, UserMemory } from './schema';
import { isFirebaseAvailable } from '../services/firebase';
import * as cloudDb from '../services/cloudDb';

// Cloud-only database implementation
// All data is stored in Firebase Firestore

const CACHE_TTL_MS = 45 * 1000; // 45 seconds

let accountsCache: { data: Account[]; ts: number } | null = null;
let accountsInFlight: Promise<Account[]> | null = null;
let transactionsCache: { data: Transaction[]; ts: number } | null = null;
let transactionsInFlight: Promise<Transaction[]> | null = null;

function invalidateAccountsCache(): void {
  accountsCache = null;
}
function invalidateTransactionsCache(): void {
  transactionsCache = null;
}

/** Clear all in-memory caches and in-flight requests. Call after login so new device gets fresh data. */
export const invalidateCaches = (): void => {
  accountsCache = null;
  accountsInFlight = null;
  transactionsCache = null;
  transactionsInFlight = null;
};

export const initDatabase = async (): Promise<void> => {
  // Verify Firebase is available
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not initialized. Please check your Firebase configuration in .env file.');
  }
  // No local database initialization needed - everything is in the cloud
};

// Account operations
export const getAccounts = async (): Promise<Account[]> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  const now = Date.now();
  if (accountsCache && now - accountsCache.ts < CACHE_TTL_MS) {
    return accountsCache.data;
  }
  if (accountsInFlight) {
    return accountsInFlight;
  }
  accountsInFlight = cloudDb.cloudGetAccounts();
  try {
    const accounts = await accountsInFlight;
    accountsCache = { data: accounts, ts: Date.now() };
    return accounts;
  } finally {
    accountsInFlight = null;
  }
};

export const addAccount = async (account: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  invalidateAccountsCache();
  return await cloudDb.cloudAddAccount(account);
};

export const updateAccount = async (id: string, updates: Partial<Account>): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  invalidateAccountsCache();
  return await cloudDb.cloudUpdateAccount(id, updates);
};

export const deleteAccount = async (id: string): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  invalidateAccountsCache();
  return await cloudDb.cloudDeleteAccount(id);
};

// Transaction operations
export const getTransactions = async (accountId?: string): Promise<Transaction[]> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  const now = Date.now();
  if (transactionsCache && now - transactionsCache.ts < CACHE_TTL_MS) {
    const transactions = transactionsCache.data;
    return accountId ? transactions.filter((t) => t.accountId === accountId) : transactions;
  }
  if (transactionsInFlight) {
    const transactions = await transactionsInFlight;
    return accountId ? transactions.filter((t) => t.accountId === accountId) : transactions;
  }
  transactionsInFlight = cloudDb.cloudGetTransactions();
  try {
    const transactions = await transactionsInFlight;
    transactionsCache = { data: transactions, ts: Date.now() };
    return accountId ? transactions.filter((t) => t.accountId === accountId) : transactions;
  } finally {
    transactionsInFlight = null;
  }
};

export const getTransactionsPage = async (options: {
  limit: number;
  startAfter?: string;
  accountId?: string;
}): Promise<{ transactions: Transaction[]; nextCursor?: string }> => {
  return await cloudDb.cloudGetTransactionsPage(options);
};

export const addTransaction = async (transaction: Omit<Transaction, 'id' | 'createdAt'>): Promise<string> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  invalidateTransactionsCache();
  return await cloudDb.cloudAddTransaction(transaction);
};

export const updateTransaction = async (id: string, updates: Partial<Transaction>): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  invalidateTransactionsCache();
  return await cloudDb.cloudUpdateTransaction(id, updates);
};

export const deleteTransaction = async (id: string): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  invalidateTransactionsCache();
  return await cloudDb.cloudDeleteTransaction(id);
};

export const untagTransaction = async (id: string, untagType: 'subscription' | 'debt' | 'budget' | 'all'): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  invalidateTransactionsCache();
  return await cloudDb.cloudUntagTransaction(id, untagType);
};

// Budget operations
export const getBudgets = async (): Promise<Budget[]> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  return await cloudDb.cloudGetBudgets();
};

export const addBudget = async (budget: Omit<Budget, 'id' | 'currentSpent' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  return await cloudDb.cloudAddBudget({ ...budget, currentSpent: 0 });
};

export const updateBudget = async (id: string, updates: Partial<Budget>): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  return await cloudDb.cloudUpdateBudget(id, updates);
};

export const deleteBudget = async (id: string): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  return await cloudDb.cloudDeleteBudget(id);
};

/**
 * Recalculate all budgets' currentSpent from transactions (repair for drift).
 */
export const recalculateBudgetsFromTransactions = async (): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  return await cloudDb.cloudRecalculateBudgetCurrentSpent();
};

// Subscription operations
export const getSubscriptions = async (): Promise<Subscription[]> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  return await cloudDb.cloudGetSubscriptions();
};

export const addSubscription = async (subscription: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  return await cloudDb.cloudAddSubscription(subscription);
};

export const updateSubscription = async (id: string, updates: Partial<Subscription>): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  return await cloudDb.cloudUpdateSubscription(id, updates);
};

export const deleteSubscription = async (id: string): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  return await cloudDb.cloudDeleteSubscription(id);
};

export const markSubscriptionAsPaid = async (id: string): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  return await cloudDb.markSubscriptionAsPaid(id);
};

export const processDueSubscriptions = async (): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  await cloudDb.processDueSubscriptions();
};

// Debt operations
export const getDebts = async (): Promise<Debt[]> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  return await cloudDb.cloudGetDebts();
};

export const addDebt = async (debt: Omit<Debt, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  return await cloudDb.cloudAddDebt(debt);
};

export const updateDebt = async (id: string, updates: Partial<Debt>): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  return await cloudDb.cloudUpdateDebt(id, updates);
};

export const deleteDebt = async (id: string): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  return await cloudDb.cloudDeleteDebt(id);
};

// TrueLayer sync operations removed (manual-only mode).

// Chat Thread operations
export const getChatThreads = async (): Promise<ChatThread[]> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  return await cloudDb.cloudGetChatThreads();
};

export const getChatThread = async (id: string): Promise<ChatThread | null> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  return await cloudDb.cloudGetChatThread(id);
};

export const addChatThread = async (thread: Omit<ChatThread, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  return await cloudDb.cloudAddChatThread(thread);
};

export const updateChatThread = async (id: string, updates: Partial<ChatThread>): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  return await cloudDb.cloudUpdateChatThread(id, updates);
};

export const deleteChatThread = async (id: string): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  return await cloudDb.cloudDeleteChatThread(id);
};

// Memory operations
export const getMemories = async (): Promise<UserMemory[]> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  return await cloudDb.cloudGetMemories();
};

export const addMemory = async (memory: Omit<UserMemory, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  return await cloudDb.cloudAddMemory(memory);
};

export const updateMemory = async (id: string, updates: Partial<UserMemory>): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  return await cloudDb.cloudUpdateMemory(id, updates);
};

export const deleteMemory = async (id: string): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  return await cloudDb.cloudDeleteMemory(id);
};

export const deleteAllMemories = async (): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  return await cloudDb.cloudDeleteAllMemories();
};

// Data export operations
// Export helpers are in dataExportService; import from '../services/dataExportService' to avoid require cycle.

