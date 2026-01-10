import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  where,
  Timestamp,
  writeBatch
} from 'firebase/firestore';
import { getFirestoreDb, getUserId, isFirebaseAvailable } from './firebase';
import { Account, Transaction, Budget, Subscription, Debt } from '../database/schema';
import { addMonths, addWeeks, addYears, isBefore, isToday, startOfDay } from 'date-fns';
import {
  getAccounts as getTrueLayerAccounts,
  getAccountBalance,
  getAccountTransactions,
  getAccountPendingTransactions,
  getCardTransactions,
} from './truelayerService';
import { TrueLayerAccount, TrueLayerTransaction } from '../types/truelayer';

// Helper to convert Firestore timestamp to ISO string
const timestampToISO = (timestamp: any): string => {
  if (timestamp?.toDate) {
    return timestamp.toDate().toISOString();
  }
  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }
  return timestamp || new Date().toISOString();
};

// Helper to convert ISO string to Firestore timestamp
const isoToTimestamp = (iso: string): Timestamp => {
  return Timestamp.fromDate(new Date(iso));
};

// Account operations
export const cloudGetAccounts = async (): Promise<Account[]> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available');
  }
  
  const db = getFirestoreDb();
  if (!db) {
    throw new Error('Firestore database not initialized');
  }
  
  try {
    const userId = getUserId();
    const accountsRef = collection(db, `users/${userId}/accounts`);
    const snapshot = await getDocs(query(accountsRef, orderBy('createdAt', 'desc')));
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: timestampToISO(doc.data().createdAt),
      updatedAt: timestampToISO(doc.data().updatedAt),
    })) as Account[];
  } catch (error) {
    console.error('Error fetching accounts from cloud:', error);
    throw error;
  }
};

export const cloudAddAccount = async (account: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase not available');
  }
  
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not initialized');
  
  try {
    const userId = getUserId();
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const now = new Date().toISOString();
    const accountRef = doc(db, `users/${userId}/accounts`, id);
    
    // Filter out undefined and empty string values for optional fields
    const accountData: any = {
      name: account.name,
      type: account.type,
      balance: account.balance,
      currency: account.currency,
      createdAt: isoToTimestamp(now),
      updatedAt: isoToTimestamp(now),
    };
    
    // Only include card fields if they are defined and not empty
    if (account.linkedAccountId) accountData.linkedAccountId = account.linkedAccountId;
    if (account.cardNumber) accountData.cardNumber = account.cardNumber;
    if (account.cardPin) accountData.cardPin = account.cardPin;
    if (account.cardLogo) accountData.cardLogo = account.cardLogo;
    
    // Include TrueLayer-specific fields if present
    if (account.truelayerConnectionId) accountData.truelayerConnectionId = account.truelayerConnectionId;
    if (account.truelayerAccountId) accountData.truelayerAccountId = account.truelayerAccountId;
    if (account.isSynced !== undefined) accountData.isSynced = account.isSynced;
    if (account.lastSyncedAt) accountData.lastSyncedAt = account.lastSyncedAt;
    if (account.truelayerAccountType) accountData.truelayerAccountType = account.truelayerAccountType;
    
    await setDoc(accountRef, accountData);
    
    return id;
  } catch (error) {
    console.error('Error adding account to cloud:', error);
    throw error;
  }
};

export const cloudUpdateAccount = async (id: string, updates: Partial<Account>): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase not available');
  }
  
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not initialized');
  
  try {
    const userId = getUserId();
    const accountRef = doc(db, `users/${userId}/accounts`, id);
    const updateData: any = {
      ...updates,
      updatedAt: isoToTimestamp(new Date().toISOString()),
    };
    
    // Convert date strings to timestamps
    if (updateData.createdAt) {
      updateData.createdAt = isoToTimestamp(updateData.createdAt);
    }
    
    await setDoc(accountRef, updateData, { merge: true });
  } catch (error) {
    console.error('Error updating account in cloud:', error);
    throw error;
  }
};

export const cloudDeleteAccount = async (id: string): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase not available');
  }
  
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not initialized');
  
  try {
    const userId = getUserId();
    const accountRef = doc(db, `users/${userId}/accounts`, id);
    await deleteDoc(accountRef);
  } catch (error) {
    console.error('Error deleting account from cloud:', error);
    throw error;
  }
};

// Transaction operations
export const cloudGetTransactions = async (): Promise<Transaction[]> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available');
  }
  
  const db = getFirestoreDb();
  if (!db) {
    throw new Error('Firestore database not initialized');
  }
  
  try {
    const userId = getUserId();
    if (!userId) {
      throw new Error('User not authenticated');
    }
    
    const transactionsRef = collection(db, `users/${userId}/transactions`);
    
    let snapshot;
    try {
      snapshot = await getDocs(query(transactionsRef, orderBy('createdAt', 'desc')));
      console.log(`[cloudGetTransactions] Fetched ${snapshot.docs.length} transactions with ordered query`);
    } catch (queryError: unknown) {
      const errorMessage = queryError instanceof Error ? queryError.message : 'Unknown query error';
      console.warn('Error with ordered query, trying without order:', errorMessage);
      snapshot = await getDocs(transactionsRef);
      console.log(`[cloudGetTransactions] Fetched ${snapshot.docs.length} transactions without order`);
    }
    
    const transactions = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        date: timestampToISO(data.date),
        createdAt: timestampToISO(data.createdAt),
      };
    }) as Transaction[];
    
    console.log(`[cloudGetTransactions] Returning ${transactions.length} mapped transactions`);
    return transactions;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching transactions from cloud:', errorMessage);
    throw error;
  }
};

export const cloudAddTransaction = async (transaction: Omit<Transaction, 'id' | 'createdAt'>): Promise<string> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase not available');
  }
  
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not initialized');
  
  try {
    const userId = getUserId();
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const now = new Date().toISOString();
    const transactionRef = doc(db, `users/${userId}/transactions`, id);
    
    const transactionDoc = {
      ...transaction,
      date: isoToTimestamp(transaction.date),
      createdAt: isoToTimestamp(now),
    };
    
    console.log(`[cloudAddTransaction] Adding transaction: type=${transaction.type}`);
    await setDoc(transactionRef, transactionDoc);
    console.log(`[cloudAddTransaction] Successfully added transaction`);
    
    // Update account balance only for manual accounts (not TrueLayer synced)
    // TrueLayer account balances are fetched on-demand from API
    const accountRef = doc(db, `users/${userId}/accounts`, transaction.accountId);
    const accountSnap = await getDoc(accountRef);
    if (accountSnap.exists()) {
      const accountData = accountSnap.data() as Account;
      
      // Only update balance for manual accounts (not synced from TrueLayer)
      if (!accountData.isSynced) {
        const balanceChange = transaction.type === 'income' ? transaction.amount : -transaction.amount;
        
        // If this is a card with a linked account, update the linked account balance
        if (accountData.type === 'card' && accountData.linkedAccountId) {
          const linkedAccountRef = doc(db, `users/${userId}/accounts`, accountData.linkedAccountId);
          const linkedAccountSnap = await getDoc(linkedAccountRef);
          if (linkedAccountSnap.exists()) {
            const linkedAccountData = linkedAccountSnap.data() as Account;
            // Only update if linked account is also manual
            if (!linkedAccountData.isSynced) {
              await setDoc(linkedAccountRef, {
                balance: (linkedAccountData.balance || 0) + balanceChange,
                updatedAt: isoToTimestamp(now),
              }, { merge: true });
            }
          }
        } else {
          // Update the account itself (for bank, cash, investment, or card without linked account)
          await setDoc(accountRef, {
            balance: (accountData.balance || 0) + balanceChange,
            updatedAt: isoToTimestamp(now),
          }, { merge: true });
        }
      }
    }
    
    // Update budget if it's an expense
    if (transaction.type === 'expense') {
      const budgetsRef = collection(db, `users/${userId}/budgets`);
      const budgetsSnapshot = await getDocs(query(budgetsRef, where('category', '==', transaction.category)));
      if (!budgetsSnapshot.empty) {
        const budgetDoc = budgetsSnapshot.docs[0];
        const budgetData = budgetDoc.data();
        await setDoc(budgetDoc.ref, {
          currentSpent: (budgetData.currentSpent || 0) + transaction.amount,
          updatedAt: isoToTimestamp(now),
        }, { merge: true });
      }
    }
    
    return id;
  } catch (error) {
    console.error('Error adding transaction to cloud:', error);
    throw error;
  }
};

export const cloudDeleteTransaction = async (id: string): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase not available');
  }
  
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not initialized');
  
  try {
    const userId = getUserId();
    const transactionRef = doc(db, `users/${userId}/transactions`, id);
    const transactionSnap = await getDoc(transactionRef);
    
    if (transactionSnap.exists()) {
      const transaction = transactionSnap.data() as Transaction;
      
      // Revert account balance only for manual accounts (not TrueLayer synced)
      // TrueLayer account balances are fetched on-demand from API
      const accountRef = doc(db, `users/${userId}/accounts`, transaction.accountId);
      const accountSnap = await getDoc(accountRef);
      if (accountSnap.exists()) {
        const accountData = accountSnap.data() as Account;
        
        // Only revert balance for manual accounts (not synced from TrueLayer)
        if (!accountData.isSynced) {
          const balanceChange = transaction.type === 'income' ? -transaction.amount : transaction.amount;
          const now = new Date().toISOString();
          
          // If this is a card with a linked account, revert the linked account balance
          if (accountData.type === 'card' && accountData.linkedAccountId) {
            const linkedAccountRef = doc(db, `users/${userId}/accounts`, accountData.linkedAccountId);
            const linkedAccountSnap = await getDoc(linkedAccountRef);
            if (linkedAccountSnap.exists()) {
              const linkedAccountData = linkedAccountSnap.data() as Account;
              // Only revert if linked account is also manual
              if (!linkedAccountData.isSynced) {
                await setDoc(linkedAccountRef, {
                  balance: (linkedAccountData.balance || 0) + balanceChange,
                  updatedAt: isoToTimestamp(now),
                }, { merge: true });
              }
            }
          } else {
            // Revert the account itself (for bank, cash, investment, or card without linked account)
            await setDoc(accountRef, {
              balance: (accountData.balance || 0) + balanceChange,
              updatedAt: isoToTimestamp(now),
            }, { merge: true });
          }
        }
      }
      
      // Revert budget if it was an expense
      if (transaction.type === 'expense') {
        const budgetsRef = collection(db, `users/${userId}/budgets`);
        const budgetsSnapshot = await getDocs(query(budgetsRef, where('category', '==', transaction.category)));
        if (!budgetsSnapshot.empty) {
          const budgetDoc = budgetsSnapshot.docs[0];
          const budgetData = budgetDoc.data();
          await setDoc(budgetDoc.ref, {
            currentSpent: Math.max(0, (budgetData.currentSpent || 0) - transaction.amount),
            updatedAt: isoToTimestamp(new Date().toISOString()),
          }, { merge: true });
        }
      }
      
      await deleteDoc(transactionRef);
    }
  } catch (error) {
    console.error('Error deleting transaction from cloud:', error);
    throw error;
  }
};

// Budget operations
export const cloudGetBudgets = async (): Promise<Budget[]> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available');
  }
  
  const db = getFirestoreDb();
  if (!db) {
    throw new Error('Firestore database not initialized');
  }
  
  try {
    const userId = getUserId();
    const budgetsRef = collection(db, `users/${userId}/budgets`);
    const snapshot = await getDocs(query(budgetsRef, orderBy('createdAt', 'desc')));
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: timestampToISO(doc.data().createdAt),
      updatedAt: timestampToISO(doc.data().updatedAt),
    })) as Budget[];
  } catch (error) {
    console.error('Error fetching budgets from cloud:', error);
    throw error;
  }
};

export const cloudAddBudget = async (budget: Omit<Budget, 'id' | 'createdAt' | 'updatedAt'> | Omit<Budget, 'id' | 'currentSpent' | 'createdAt' | 'updatedAt'> & { currentSpent?: number }): Promise<string> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase not available');
  }
  
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not initialized');
  
  try {
    const userId = getUserId();
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const now = new Date().toISOString();
    const budgetRef = doc(db, `users/${userId}/budgets`, id);
    
    await setDoc(budgetRef, {
      ...budget,
      currentSpent: budget.currentSpent || 0,
      createdAt: isoToTimestamp(now),
      updatedAt: isoToTimestamp(now),
    });
    
    return id;
  } catch (error) {
    console.error('Error adding budget to cloud:', error);
    throw error;
  }
};

export const cloudUpdateBudget = async (id: string, updates: Partial<Budget>): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase not available');
  }
  
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not initialized');
  
  try {
    const userId = getUserId();
    const budgetRef = doc(db, `users/${userId}/budgets`, id);
    const updateData: any = {
      ...updates,
      updatedAt: isoToTimestamp(new Date().toISOString()),
    };
    
    if (updateData.createdAt) {
      updateData.createdAt = isoToTimestamp(updateData.createdAt);
    }
    
    await setDoc(budgetRef, updateData, { merge: true });
  } catch (error) {
    console.error('Error updating budget in cloud:', error);
    throw error;
  }
};

export const cloudDeleteBudget = async (id: string): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase not available');
  }
  
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not initialized');
  
  try {
    const userId = getUserId();
    const budgetRef = doc(db, `users/${userId}/budgets`, id);
    await deleteDoc(budgetRef);
  } catch (error) {
    console.error('Error deleting budget from cloud:', error);
    throw error;
  }
};

// Subscription operations
export const cloudGetSubscriptions = async (): Promise<Subscription[]> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available');
  }
  
  const db = getFirestoreDb();
  if (!db) {
    throw new Error('Firestore database not initialized');
  }
  
  try {
    const userId = getUserId();
    const subscriptionsRef = collection(db, `users/${userId}/subscriptions`);
    const snapshot = await getDocs(query(subscriptionsRef, orderBy('createdAt', 'desc')));
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      nextBillingDate: timestampToISO(doc.data().nextBillingDate),
      createdAt: timestampToISO(doc.data().createdAt),
      updatedAt: timestampToISO(doc.data().updatedAt),
    })) as Subscription[];
  } catch (error) {
    console.error('Error fetching subscriptions from cloud:', error);
    throw error;
  }
};

// Helper function to create a transaction from a subscription
const createSubscriptionTransaction = async (
  db: any,
  userId: string,
  subscription: Subscription,
  billingDate: Date
): Promise<void> => {
  // Check if transaction already exists for this subscription on this date
  // Use description and category to find potential duplicates
  const transactionsRef = collection(db, `users/${userId}/transactions`);
  const billingDateStart = startOfDay(billingDate);
  
  // Query by description (subscription name) and category
  const existingTransactions = await getDocs(
    query(
      transactionsRef,
      where('description', '==', subscription.name),
      where('category', '==', 'Subscription')
    )
  );
  
  // Check if any existing transaction is on the same date and same account
  const sameDateTransaction = existingTransactions.docs.find(doc => {
    const txData = doc.data();
    const txDate = timestampToISO(txData.date);
    const txDateStart = startOfDay(new Date(txDate));
    const sameDate = txDateStart.getTime() === billingDateStart.getTime();
    const sameAccount = txData.accountId === subscription.accountId;
    return sameDate && sameAccount;
  });
  
  if (sameDateTransaction) {
    // Transaction already exists for this subscription on this date
    console.log(`Transaction already exists for subscription on this date`);
    return;
  }
  
  // Create transaction for the subscription payment
  const transactionId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
  const now = new Date().toISOString();
  const transactionRef = doc(db, `users/${userId}/transactions`, transactionId);
  
  await setDoc(transactionRef, {
    accountId: subscription.accountId,
    amount: subscription.amount,
    type: 'expense',
    category: 'Subscription',
    description: subscription.name, // Use subscription name directly for better logo extraction
    date: isoToTimestamp(billingDate.toISOString()),
    createdAt: isoToTimestamp(now),
  });
  
  // Update account balance only for manual accounts (not TrueLayer synced)
  // TrueLayer account balances are fetched on-demand from API
  const accountRef = doc(db, `users/${userId}/accounts`, subscription.accountId);
  const accountSnap = await getDoc(accountRef);
  if (accountSnap.exists()) {
    const accountData = accountSnap.data() as Account;
    
    // Only update balance for manual accounts (not synced from TrueLayer)
    if (!accountData.isSynced) {
      // If this is a card with a linked account, update the linked account balance
      if (accountData.type === 'card' && accountData.linkedAccountId) {
        const linkedAccountRef = doc(db, `users/${userId}/accounts`, accountData.linkedAccountId);
        const linkedAccountSnap = await getDoc(linkedAccountRef);
        if (linkedAccountSnap.exists()) {
          const linkedAccountData = linkedAccountSnap.data() as Account;
          // Only update if linked account is also manual
          if (!linkedAccountData.isSynced) {
            await setDoc(linkedAccountRef, {
              balance: (linkedAccountData.balance || 0) - subscription.amount,
              updatedAt: isoToTimestamp(now),
            }, { merge: true });
          }
        }
      } else {
        // Update the account itself
        await setDoc(accountRef, {
          balance: (accountData.balance || 0) - subscription.amount,
          updatedAt: isoToTimestamp(now),
        }, { merge: true });
      }
    }
  }
  
  // Update budget if it exists (check for Subscription category)
  const budgetsRef = collection(db, `users/${userId}/budgets`);
  const budgetsSnapshot = await getDocs(query(budgetsRef, where('category', '==', 'Subscription')));
  if (!budgetsSnapshot.empty) {
    const budgetDoc = budgetsSnapshot.docs[0];
    const budgetData = budgetDoc.data();
    await setDoc(budgetDoc.ref, {
      currentSpent: (budgetData.currentSpent || 0) + subscription.amount,
      updatedAt: isoToTimestamp(now),
    }, { merge: true });
  }
};

export const cloudAddSubscription = async (subscription: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase not available');
  }
  
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not initialized');
  
  try {
    const userId = getUserId();
    if (!userId) throw new Error('User not authenticated');
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const now = new Date().toISOString();
    const subscriptionRef = doc(db, `users/${userId}/subscriptions`, id);
    
    const billingDate = new Date(subscription.nextBillingDate);
    const today = startOfDay(new Date());
    const billingDateStart = startOfDay(billingDate);
    
    // Create subscription
    const subscriptionData: Subscription = {
      id,
      ...subscription,
      createdAt: now,
      updatedAt: now,
    };
    
    await setDoc(subscriptionRef, {
      ...subscription,
      nextBillingDate: isoToTimestamp(subscription.nextBillingDate),
      createdAt: isoToTimestamp(now),
      updatedAt: isoToTimestamp(now),
    });
    
    // If billing date is today or in the past, create a transaction immediately
    if (isBefore(billingDateStart, today) || isToday(billingDateStart)) {
      await createSubscriptionTransaction(db, userId, subscriptionData, billingDate);
    }
    
    return id;
  } catch (error) {
    console.error('Error adding subscription to cloud:', error);
    throw error;
  }
};

export const cloudUpdateSubscription = async (id: string, updates: Partial<Subscription>): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase not available');
  }
  
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not initialized');
  
  try {
    const userId = getUserId();
    const subscriptionRef = doc(db, `users/${userId}/subscriptions`, id);
    const updateData: any = {
      ...updates,
      updatedAt: isoToTimestamp(new Date().toISOString()),
    };
    
    if (updateData.nextBillingDate) {
      updateData.nextBillingDate = isoToTimestamp(updateData.nextBillingDate);
    }
    if (updateData.createdAt) {
      updateData.createdAt = isoToTimestamp(updateData.createdAt);
    }
    
    await setDoc(subscriptionRef, updateData, { merge: true });
  } catch (error) {
    console.error('Error updating subscription in cloud:', error);
    throw error;
  }
};

// Process due subscriptions and create transactions for them
export const processDueSubscriptions = async (): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase not available');
  }
  
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not initialized');
  
  try {
    const userId = getUserId();
    if (!userId) throw new Error('User not authenticated');
    const subscriptionsRef = collection(db, `users/${userId}/subscriptions`);
    const subscriptionsSnapshot = await getDocs(subscriptionsRef);
    
    const today = startOfDay(new Date());
    const processedSubscriptions: Subscription[] = [];
    
    for (const subDoc of subscriptionsSnapshot.docs) {
      const subscription = {
        id: subDoc.id,
        ...subDoc.data(),
        nextBillingDate: timestampToISO(subDoc.data().nextBillingDate),
        createdAt: timestampToISO(subDoc.data().createdAt),
        updatedAt: timestampToISO(subDoc.data().updatedAt),
      } as Subscription;
      
      const billingDate = startOfDay(new Date(subscription.nextBillingDate));
      
      // If subscription is due today or in the past, create transaction
      if (isBefore(billingDate, today) || isToday(billingDate)) {
        await createSubscriptionTransaction(db, userId, subscription, billingDate);
        
        // Update next billing date based on frequency
        let nextBilling: Date;
        if (subscription.frequency === 'weekly') {
          nextBilling = addWeeks(billingDate, 1);
        } else if (subscription.frequency === 'monthly') {
          nextBilling = addMonths(billingDate, 1);
        } else {
          nextBilling = addYears(billingDate, 1);
        }
        
        // Update subscription with new billing date
        await setDoc(subDoc.ref, {
          nextBillingDate: isoToTimestamp(nextBilling.toISOString()),
          updatedAt: isoToTimestamp(new Date().toISOString()),
        }, { merge: true });
        
        processedSubscriptions.push(subscription);
      }
    }
    
    if (processedSubscriptions.length > 0) {
      console.log(`Processed ${processedSubscriptions.length} due subscription(s)`);
    }
  } catch (error) {
    console.error('Error processing due subscriptions:', error);
    throw error;
  }
};

// Mark a subscription as paid (create transaction and update next billing date)
export const markSubscriptionAsPaid = async (subscriptionId: string): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase not available');
  }
  
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not initialized');
  
  try {
    const userId = getUserId();
    if (!userId) throw new Error('User not authenticated');
    const subscriptionRef = doc(db, `users/${userId}/subscriptions`, subscriptionId);
    const subscriptionSnap = await getDoc(subscriptionRef);
    
    if (!subscriptionSnap.exists()) {
      throw new Error('Subscription not found');
    }
    
    const subscription = {
      id: subscriptionSnap.id,
      ...subscriptionSnap.data(),
      nextBillingDate: timestampToISO(subscriptionSnap.data().nextBillingDate),
      createdAt: timestampToISO(subscriptionSnap.data().createdAt),
      updatedAt: timestampToISO(subscriptionSnap.data().updatedAt),
    } as Subscription;
    
    const billingDate = new Date(subscription.nextBillingDate);
    
    // Create transaction for the payment
    await createSubscriptionTransaction(db, userId, subscription, billingDate);
    
    // Calculate next billing date based on frequency
    let nextBilling: Date;
    if (subscription.frequency === 'weekly') {
      nextBilling = addWeeks(billingDate, 1);
    } else if (subscription.frequency === 'monthly') {
      nextBilling = addMonths(billingDate, 1);
    } else {
      nextBilling = addYears(billingDate, 1);
    }
    
    // Update subscription with new billing date
    await setDoc(subscriptionRef, {
      nextBillingDate: isoToTimestamp(nextBilling.toISOString()),
      updatedAt: isoToTimestamp(new Date().toISOString()),
    }, { merge: true });
  } catch (error) {
    console.error('Error marking subscription as paid:', error);
    throw error;
  }
};

export const cloudDeleteSubscription = async (id: string): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase not available');
  }
  
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not initialized');
  
  try {
    const userId = getUserId();
    const subscriptionRef = doc(db, `users/${userId}/subscriptions`, id);
    await deleteDoc(subscriptionRef);
  } catch (error) {
    console.error('Error deleting subscription from cloud:', error);
    throw error;
  }
};

// Debt operations
export const cloudGetDebts = async (): Promise<Debt[]> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available');
  }
  
  const db = getFirestoreDb();
  if (!db) {
    throw new Error('Firestore database not initialized');
  }
  
  try {
    const userId = getUserId();
    const debtsRef = collection(db, `users/${userId}/debts`);
    const snapshot = await getDocs(query(debtsRef, orderBy('createdAt', 'desc')));
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      dueDate: timestampToISO(doc.data().dueDate),
      createdAt: timestampToISO(doc.data().createdAt),
      updatedAt: timestampToISO(doc.data().updatedAt),
    })) as Debt[];
  } catch (error) {
    console.error('Error fetching debts from cloud:', error);
    throw error;
  }
};

export const cloudAddDebt = async (debt: Omit<Debt, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase not available');
  }
  
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not initialized');
  
  try {
    const userId = getUserId();
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const now = new Date().toISOString();
    const debtRef = doc(db, `users/${userId}/debts`, id);
    
    // Filter out undefined values - Firestore doesn't allow undefined
    const debtData: any = {
      name: debt.name,
      description: debt.description || '',
      totalAmount: debt.totalAmount,
      remainingAmount: debt.remainingAmount,
      dueDate: isoToTimestamp(debt.dueDate),
      type: debt.type,
      status: debt.status,
      createdAt: isoToTimestamp(now),
      updatedAt: isoToTimestamp(now),
    };
    
    // Only add optional fields if they have values
    if (debt.interestRate !== undefined && debt.interestRate !== null) {
      debtData.interestRate = debt.interestRate;
    }
    if (debt.minimumPayment !== undefined && debt.minimumPayment !== null) {
      debtData.minimumPayment = debt.minimumPayment;
    }
    if (debt.accountId !== undefined && debt.accountId !== null && debt.accountId !== '') {
      debtData.accountId = debt.accountId;
    }
    if (debt.budgetCategory !== undefined && debt.budgetCategory !== null && debt.budgetCategory !== '') {
      debtData.budgetCategory = debt.budgetCategory;
    }
    
    await setDoc(debtRef, debtData);
    
    return id;
  } catch (error) {
    console.error('Error adding debt to cloud:', error);
    throw error;
  }
};

export const cloudUpdateDebt = async (id: string, updates: Partial<Debt>): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase not available');
  }
  
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not initialized');
  
  try {
    const userId = getUserId();
    const debtRef = doc(db, `users/${userId}/debts`, id);
    const updateData: any = {
      updatedAt: isoToTimestamp(new Date().toISOString()),
    };
    
    // Only include defined fields
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.totalAmount !== undefined) updateData.totalAmount = updates.totalAmount;
    if (updates.remainingAmount !== undefined) updateData.remainingAmount = updates.remainingAmount;
    if (updates.type !== undefined) updateData.type = updates.type;
    if (updates.status !== undefined) updateData.status = updates.status;
    
    if (updates.dueDate) {
      updateData.dueDate = isoToTimestamp(updates.dueDate);
    }
    if (updates.interestRate !== undefined && updates.interestRate !== null) {
      updateData.interestRate = updates.interestRate;
    }
    if (updates.minimumPayment !== undefined && updates.minimumPayment !== null) {
      updateData.minimumPayment = updates.minimumPayment;
    }
    if (updates.accountId !== undefined) {
      updateData.accountId = updates.accountId && updates.accountId !== '' ? updates.accountId : null;
    }
    if (updates.budgetCategory !== undefined) {
      updateData.budgetCategory = updates.budgetCategory && updates.budgetCategory !== '' ? updates.budgetCategory : null;
    }
    if (updates.createdAt) {
      updateData.createdAt = isoToTimestamp(updates.createdAt);
    }
    
    await setDoc(debtRef, updateData, { merge: true });
  } catch (error) {
    console.error('Error updating debt in cloud:', error);
    throw error;
  }
};

export const cloudDeleteDebt = async (id: string): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase not available');
  }
  
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not initialized');
  
  try {
    const userId = getUserId();
    const debtRef = doc(db, `users/${userId}/debts`, id);
    await deleteDoc(debtRef);
  } catch (error) {
    console.error('Error deleting debt from cloud:', error);
    throw error;
  }
};

// Sync functions - sync local to cloud
export const syncLocalToCloud = async (): Promise<void> => {
  // This will be called to sync local data to cloud
  // Implementation depends on your sync strategy
};

// Sync functions - sync cloud to local
export const syncCloudToLocal = async (): Promise<void> => {
  // This will be called to sync cloud data to local
  // Implementation depends on your sync strategy
};

// TrueLayer sync functions
export const syncTrueLayerAccounts = async (connectionId: string): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase not available');
  }

  try {
    // Fetch accounts from TrueLayer
    const accountsResponse = await getTrueLayerAccounts(connectionId);
    const truelayerAccounts = accountsResponse.results;

    if (truelayerAccounts.length === 0) {
      console.log('No accounts found in TrueLayer connection');
      return;
    }

    const db = getFirestoreDb();
    if (!db) throw new Error('Firestore not initialized');

    const userId = getUserId();
    const now = new Date().toISOString();

    // Get existing accounts to check for updates
    const existingAccounts = await cloudGetAccounts();
    const truelayerAccountMap = new Map(
      existingAccounts
        .filter(acc => acc.truelayerConnectionId === connectionId)
        .map(acc => [acc.truelayerAccountId || '', acc])
    );

    // Process each TrueLayer account
    for (const tlAccount of truelayerAccounts) {
      try {
        // Fetch balance for this account
        const balanceResponse = await getAccountBalance(connectionId, tlAccount.account_id);
        const balance = balanceResponse.results[0];

        // Check if account already exists
        const existingAccount = truelayerAccountMap.get(tlAccount.account_id);

        // For TrueLayer accounts, don't store balance in Firestore (security: minimize persisted financial data)
        // Balance will be fetched on-demand from TrueLayer API and cached locally
        const accountData: Partial<Account> = {
          name: tlAccount.display_name,
          type: 'bank' as const,
          balance: 0, // Placeholder - actual balance fetched on-demand
          currency: tlAccount.currency,
          truelayerConnectionId: connectionId,
          truelayerAccountId: tlAccount.account_id,
          isSynced: true,
          lastSyncedAt: now,
          truelayerAccountType: tlAccount.account_type,
          updatedAt: now,
        };

        if (existingAccount) {
          // Update existing account - ensure all TrueLayer fields are included
          await cloudUpdateAccount(existingAccount.id, accountData);
        } else {
          // Create new account
          await cloudAddAccount({
            name: accountData.name!,
            type: accountData.type!,
            balance: accountData.balance!,
            currency: accountData.currency!,
            truelayerConnectionId: accountData.truelayerConnectionId,
            truelayerAccountId: accountData.truelayerAccountId,
            isSynced: accountData.isSynced,
            lastSyncedAt: accountData.lastSyncedAt,
            truelayerAccountType: accountData.truelayerAccountType,
          });
        }
      } catch (error) {
        console.error(`Error syncing account:`, error);
        // Continue with other accounts even if one fails
      }
    }

    console.log(`Successfully synced ${truelayerAccounts.length} account(s) from TrueLayer`);
  } catch (error) {
    console.error('Error syncing TrueLayer accounts:', error);
    throw error;
  }
};

export const createOrUpdateTrueLayerAccount = async (
  connectionId: string,
  truelayerAccount: TrueLayerAccount,
  balance: number
): Promise<string> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase not available');
  }

  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not initialized');

  const userId = getUserId();
  const now = new Date().toISOString();

  // Check if account already exists
  const existingAccounts = await cloudGetAccounts();
  const existingAccount = existingAccounts.find(
    acc => acc.truelayerAccountId === truelayerAccount.account_id &&
           acc.truelayerConnectionId === connectionId
  );

  // For TrueLayer accounts, don't store balance in Firestore (security: minimize persisted financial data)
  // Balance will be fetched on-demand from TrueLayer API and cached locally
  const accountData: Partial<Account> = {
    name: truelayerAccount.display_name,
    type: 'bank' as const,
    balance: 0, // Placeholder - actual balance fetched on-demand
    currency: truelayerAccount.currency,
    truelayerConnectionId: connectionId,
    truelayerAccountId: truelayerAccount.account_id,
    isSynced: true,
    lastSyncedAt: now,
    truelayerAccountType: truelayerAccount.account_type,
    updatedAt: now,
  };

  if (existingAccount) {
    await cloudUpdateAccount(existingAccount.id, accountData);
    return existingAccount.id;
  } else {
    return await cloudAddAccount({
      name: accountData.name!,
      type: accountData.type!,
      balance: 0, // Placeholder - actual balance fetched on-demand
      currency: accountData.currency!,
      truelayerConnectionId: accountData.truelayerConnectionId,
      truelayerAccountId: accountData.truelayerAccountId,
      isSynced: accountData.isSynced,
      lastSyncedAt: accountData.lastSyncedAt,
      truelayerAccountType: accountData.truelayerAccountType,
    });
  }
};

const mapTrueLayerCategory = (tlCategory: string): string => {
  const categoryMap: Record<string, string> = {
    'general': 'Other',
    'entertainment': 'Entertainment',
    'eating_out': 'Food & Dining',
    'expenses': 'Other',
    'transport': 'Transport',
    'cash': 'Cash',
    'bills': 'Bills',
    'groceries': 'Groceries',
    'shopping': 'Shopping',
    'holidays': 'Travel',
    'gas_stations': 'Transport',
    'atm': 'Cash',
    'fees': 'Fees',
    'general_merchandise': 'Shopping',
    'food_and_drink': 'Food & Dining',
    'recreation': 'Entertainment',
    'service': 'Other',
    'utilities': 'Bills',
    'healthcare': 'Healthcare',
    'transfer': 'Transfer',
    'income': 'Income',
  };
  
  const normalized = tlCategory.toLowerCase().replace(/\s+/g, '_');
  return categoryMap[normalized] || 'Other';
};

const mapTrueLayerTransaction = (
  tlTransaction: TrueLayerTransaction,
  accountId: string
): Omit<Transaction, 'id' | 'createdAt'> => {
  const transactionType = (tlTransaction.transaction_type || '').toUpperCase();
  const isCredit = transactionType === 'CREDIT';
  
  const type: 'income' | 'expense' = isCredit ? 'income' : 'expense';
  const amount = Math.abs(tlTransaction.amount);
  const category = mapTrueLayerCategory(tlTransaction.transaction_category || 'general');
  const description = tlTransaction.merchant_name || tlTransaction.description || 'Transaction';
  
  let date: string;
  try {
    date = new Date(tlTransaction.timestamp).toISOString();
    if (isNaN(new Date(date).getTime())) {
      date = new Date().toISOString();
    }
  } catch {
    date = new Date().toISOString();
  }
  
  return {
    accountId,
    amount,
    type,
    category,
    description,
    date,
    truelayerTransactionId: tlTransaction.transaction_id,
  };
};

export const syncTrueLayerTransactions = async (connectionId: string): Promise<void> => {
  console.log(`[syncTrueLayerTransactions] Starting transaction sync`);
  
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase not available');
  }

  try {
    const db = getFirestoreDb();
    if (!db) throw new Error('Firestore not initialized');

    const userId = getUserId();

    let existingAccounts = await cloudGetAccounts();
    console.log(`[syncTrueLayerTransactions] Found ${existingAccounts.length} total accounts`);
    
    // Log account count only (no sensitive data)
    console.log(`[syncTrueLayerTransactions] Checking ${existingAccounts.length} account(s) for sync eligibility`);
    
    let syncedAccounts = existingAccounts.filter(
      acc => acc.truelayerConnectionId === connectionId && 
             acc.truelayerAccountId && 
             acc.isSynced
    );

    console.log(`[syncTrueLayerTransactions] Found ${syncedAccounts.length} synced accounts on first attempt`);

    if (syncedAccounts.length === 0) {
      console.log(`[syncTrueLayerTransactions] No synced accounts found, waiting 300ms and retrying...`);
      await new Promise(resolve => setTimeout(resolve, 300));
      existingAccounts = await cloudGetAccounts();
      syncedAccounts = existingAccounts.filter(
        acc => acc.truelayerConnectionId === connectionId && 
               acc.truelayerAccountId && 
               acc.isSynced
      );
      
      console.log(`[syncTrueLayerTransactions] Found ${syncedAccounts.length} synced accounts after retry`);
      
      if (syncedAccounts.length === 0) {
        console.warn(`[syncTrueLayerTransactions] No synced accounts found, skipping transaction sync`);
        return;
      }
    }

    const existingTransactions = await cloudGetTransactions();
    const initialTransactionCount = existingTransactions.length;
    const existingTlTransactionIds = new Set(
      existingTransactions
        .filter(tx => tx.truelayerTransactionId)
        .map(tx => tx.truelayerTransactionId!)
    );

    let syncedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    console.log(`[syncTrueLayerTransactions] Starting sync for ${syncedAccounts.length} account(s)`);

    for (const account of syncedAccounts) {
      if (!account.truelayerAccountId) {
        console.warn(`[syncTrueLayerTransactions] Account missing required identifier, skipping`);
        continue;
      }

      try {
        console.log(`[syncTrueLayerTransactions] Fetching transactions for account`);
        const transactionsResponse = await getAccountTransactions(
          connectionId,
          account.truelayerAccountId
        );
        const pendingTransactionsResponse = await getAccountPendingTransactions(
          connectionId,
          account.truelayerAccountId
        );

        const allTransactions = [
          ...transactionsResponse.results,
          ...pendingTransactionsResponse.results,
        ];

        console.log(`[syncTrueLayerTransactions] Found ${allTransactions.length} transactions (${transactionsResponse.results.length} confirmed, ${pendingTransactionsResponse.results.length} pending)`);

        for (const tlTransaction of allTransactions) {
          if (existingTlTransactionIds.has(tlTransaction.transaction_id)) {
            skippedCount++;
            continue;
          }

          try {
            const transactionData = mapTrueLayerTransaction(tlTransaction, account.id);
            await cloudAddTransaction(transactionData);
            existingTlTransactionIds.add(tlTransaction.transaction_id);
            syncedCount++;
          } catch (error: unknown) {
            errorCount++;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[syncTrueLayerTransactions] Error adding transaction:`, errorMessage);
          }
        }
      } catch (error: unknown) {
        errorCount++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[syncTrueLayerTransactions] Error syncing transactions for account:`, errorMessage);
      }
    }

    const finalTransactionCount = (await cloudGetTransactions()).length;
    console.log(`[syncTrueLayerTransactions] Sync completed: ${syncedCount} new, ${skippedCount} skipped, ${errorCount} errors. Total transactions: ${finalTransactionCount} (was ${initialTransactionCount})`);
    
    if (errorCount > 0) {
      console.error(`[syncTrueLayerTransactions] Transaction sync completed with ${errorCount} error(s)`);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error syncing TrueLayer transactions:', errorMessage);
    throw error;
  }
};

