import { Account, Transaction, Budget, Subscription, Debt } from './schema';
import { isFirebaseAvailable } from '../services/firebase';
import * as cloudDb from '../services/cloudDb';

// Cloud-only database implementation
// All data is stored in Firebase Firestore

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
  const accounts = await cloudDb.cloudGetAccounts();
  
  // Enrich TrueLayer accounts with on-demand balances (secure, no cloud persistence)
  const { enrichAccountsWithBalances } = await import('../services/accountBalanceService');
  return await enrichAccountsWithBalances(accounts);
};

export const addAccount = async (account: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  return await cloudDb.cloudAddAccount(account);
};

export const updateAccount = async (id: string, updates: Partial<Account>): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  return await cloudDb.cloudUpdateAccount(id, updates);
};

export const deleteAccount = async (id: string): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  return await cloudDb.cloudDeleteAccount(id);
};

// Transaction operations
// Now uses secure encrypted cache with API fallback (no Firestore persistence)
export const getTransactions = async (accountId?: string): Promise<Transaction[]> => {
  const { getTransactions: getSecureTransactions } = await import('../services/transactionService');
  const transactions = await getSecureTransactions();
  if (accountId) {
    return transactions.filter(t => t.accountId === accountId);
  }
  return transactions;
};

export const addTransaction = async (transaction: Omit<Transaction, 'id' | 'createdAt'>): Promise<string> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  return await cloudDb.cloudAddTransaction(transaction);
};

export const deleteTransaction = async (id: string): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  return await cloudDb.cloudDeleteTransaction(id);
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
  return await cloudDb.processDueSubscriptions();
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

// TrueLayer sync operations
export const syncTrueLayerAccounts = async (connectionId: string): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  return await cloudDb.syncTrueLayerAccounts(connectionId);
};

export const syncTrueLayerTransactions = async (connectionId: string): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available. Please check your connection and Firebase configuration.');
  }
  return await cloudDb.syncTrueLayerTransactions(connectionId);
};

