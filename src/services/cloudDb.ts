import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  updateDoc,
  query, 
  orderBy, 
  where,
  Timestamp,
  writeBatch,
  deleteField
} from 'firebase/firestore';
import { getFirestoreDb, getUserId, isFirebaseAvailable } from './firebase';
import { Account, Transaction, Budget, Subscription, Debt, ChatThread, ChatMessage } from '../database/schema';
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
    if (account.truelayerProviderName) accountData.truelayerProviderName = account.truelayerProviderName;
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
      
      // Explicitly preserve null values - don't let them get lost in the spread
      const transaction: Transaction = {
        id: doc.id,
        accountId: data.accountId,
        amount: data.amount,
        type: data.type,
        category: data.category,
        description: data.description || '',
        date: timestampToISO(data.date),
        createdAt: timestampToISO(data.createdAt),
        // Explicitly handle subscriptionId, debtId, and budgetId to preserve null values
        subscriptionId: data.subscriptionId !== undefined ? data.subscriptionId : undefined,
        debtId: data.debtId !== undefined ? data.debtId : undefined,
        budgetId: data.budgetId !== undefined ? data.budgetId : undefined,
        // Preserve optional fields
        ...(data.truelayerTransactionId && { truelayerTransactionId: data.truelayerTransactionId }),
        ...(data.descriptionHash && { descriptionHash: data.descriptionHash }),
      };
      
      // Log all transactions with their tag values for debugging
      const hasNullTags = data.subscriptionId === null || data.debtId === null || data.budgetId === null;
      const hasTags = data.subscriptionId || data.debtId || data.budgetId;
      
      // Always log transactions with any tag-related data
      if (hasNullTags || hasTags) {
        console.log(`[cloudGetTransactions] Transaction ${doc.id} tag info: subscriptionId=${data.subscriptionId}, debtId=${data.debtId}, budgetId=${data.budgetId}`);
      }
      
      return transaction;
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
    
    // Hash description for GDPR compliance
    const { hashDescription } = await import('../utils/encryption');
    const descriptionHash = await hashDescription(transaction.description);
    
    const transactionDoc: any = {
      ...transaction,
      date: isoToTimestamp(transaction.date),
      createdAt: isoToTimestamp(now),
    };
    
    // Add descriptionHash if we got one
    if (descriptionHash) {
      transactionDoc.descriptionHash = descriptionHash;
    }
    
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
    // Priority: budgetId (explicit link) > category matching (backward compatible)
    if (transaction.type === 'expense') {
      const budgetsRef = collection(db, `users/${userId}/budgets`);
      let budgetDocRef = null;
      
      // First, check if there's an explicit budgetId
      if (transaction.budgetId) {
        const budgetRef = doc(budgetsRef, transaction.budgetId);
        const budgetSnap = await getDoc(budgetRef);
        if (budgetSnap.exists()) {
          budgetDocRef = budgetSnap;
        }
      }
      
      // If no explicit budgetId or budget not found, fallback to category matching
      if (!budgetDocRef && transaction.category) {
        const budgetsSnapshot = await getDocs(query(budgetsRef, where('category', '==', transaction.category)));
        if (!budgetsSnapshot.empty) {
          budgetDocRef = budgetsSnapshot.docs[0];
        }
      }
      
      // Update budget if we found one
      if (budgetDocRef) {
        const budgetData = budgetDocRef.data();
        await setDoc(budgetDocRef.ref, {
          currentSpent: (budgetData.currentSpent || 0) + transaction.amount,
          updatedAt: isoToTimestamp(now),
        }, { merge: true });
        console.log(`[cloudAddTransaction] Updated budget currentSpent for budget: ${budgetDocRef.id}`);
      }
    }
    
    return id;
  } catch (error) {
    console.error('Error adding transaction to cloud:', error);
    throw error;
  }
};

export const cloudUpdateTransaction = async (id: string, updates: Partial<Transaction>): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase not available');
  }
  
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not initialized');
  
  try {
    const userId = getUserId();
    if (!userId) {
      throw new Error('User not authenticated');
    }
    
    // SECURITY: Strict input validation
    // Validate transaction ID format (allow shorter IDs for TrueLayer transactions)
    if (!id || typeof id !== 'string' || id.length < 1 || id.length > 200) {
      throw new Error('Invalid transaction ID format');
    }
    
    // SECURITY: Validate transaction type if provided
    if (updates.type !== undefined) {
      if (updates.type !== 'income' && updates.type !== 'expense') {
        throw new Error('Invalid transaction type');
      }
    }
    
    // SECURITY: Validate and sanitize category if provided
    if (updates.category !== undefined) {
      if (typeof updates.category !== 'string' || updates.category.length === 0 || updates.category.length > 100) {
        throw new Error('Invalid category format');
      }
      // Trim and validate category exists in our system
      const sanitizedCategory = updates.category.trim();
      const { isValidCategory, canCategoryBeType } = await import('../utils/categories');
      if (!isValidCategory(sanitizedCategory)) {
        throw new Error('Invalid category name');
      }
      // If type is provided, verify category is valid for that type
      if (updates.type !== undefined && !canCategoryBeType(sanitizedCategory, updates.type)) {
        throw new Error('Category not valid for transaction type');
      }
      updates.category = sanitizedCategory;
    }
    
    // SECURITY: Validate amount if provided
    if (updates.amount !== undefined) {
      if (typeof updates.amount !== 'number' || !isFinite(updates.amount) || updates.amount < 0 || updates.amount > 1000000000) {
        throw new Error('Invalid amount');
      }
      // Round to 2 decimal places for currency
      updates.amount = Math.round(updates.amount * 100) / 100;
    }
    
    // SECURITY: Validate and sanitize description if provided
    if (updates.description !== undefined) {
      if (typeof updates.description !== 'string') {
        throw new Error('Invalid description format');
      }
      // Sanitize: trim, limit length, remove control characters
      const sanitized = updates.description.trim().slice(0, 500).replace(/[\x00-\x1F\x7F]/g, '');
      updates.description = sanitized;
    }
    
    // SECURITY: Validate accountId if provided (must belong to user)
    if (updates.accountId !== undefined) {
      if (typeof updates.accountId !== 'string' || updates.accountId.length < 1 || updates.accountId.length > 200) {
        throw new Error('Invalid account ID format');
      }
      // Verify account belongs to user
      const accountRef = doc(db, `users/${userId}/accounts`, updates.accountId);
      const accountSnap = await getDoc(accountRef);
      if (!accountSnap.exists()) {
        throw new Error('Account not found or access denied');
      }
    }
    
    // SECURITY: Validate subscriptionId if provided (must belong to user)
    if (updates.subscriptionId !== undefined && updates.subscriptionId !== null) {
      if (typeof updates.subscriptionId !== 'string' || updates.subscriptionId.length < 1 || updates.subscriptionId.length > 200) {
        throw new Error('Invalid subscription ID format');
      }
      // Verify subscription belongs to user
      const subscriptionRef = doc(db, `users/${userId}/subscriptions`, updates.subscriptionId);
      const subscriptionSnap = await getDoc(subscriptionRef);
      if (!subscriptionSnap.exists()) {
        throw new Error('Subscription not found or access denied');
      }
    }
    
    // SECURITY: Validate debtId if provided (must belong to user)
    if (updates.debtId !== undefined && updates.debtId !== null) {
      if (typeof updates.debtId !== 'string' || updates.debtId.length < 1 || updates.debtId.length > 200) {
        throw new Error('Invalid debt ID format');
      }
      // Verify debt belongs to user
      const debtRef = doc(db, `users/${userId}/debts`, updates.debtId);
      const debtSnap = await getDoc(debtRef);
      if (!debtSnap.exists()) {
        throw new Error('Debt not found or access denied');
      }
    }
    
    // SECURITY: Validate budgetId if provided (must belong to user)
    if (updates.budgetId !== undefined && updates.budgetId !== null) {
      if (typeof updates.budgetId !== 'string' || updates.budgetId.length < 1 || updates.budgetId.length > 200) {
        throw new Error('Invalid budget ID format');
      }
      // Verify budget belongs to user
      const budgetRef = doc(db, `users/${userId}/budgets`, updates.budgetId);
      const budgetSnap = await getDoc(budgetRef);
      if (!budgetSnap.exists()) {
        throw new Error('Budget not found or access denied');
      }
    }
    
    // SECURITY: Validate date if provided
    if (updates.date !== undefined) {
      if (typeof updates.date !== 'string') {
        throw new Error('Invalid date format');
      }
      const dateObj = new Date(updates.date);
      if (isNaN(dateObj.getTime())) {
        throw new Error('Invalid date value');
      }
      // Prevent dates too far in future or past (reasonable bounds)
      const now = Date.now();
      const dateTime = dateObj.getTime();
      const tenYearsAgo = now - (10 * 365 * 24 * 60 * 60 * 1000);
      const oneYearAhead = now + (365 * 24 * 60 * 60 * 1000);
      if (dateTime < tenYearsAgo || dateTime > oneYearAhead) {
        throw new Error('Date out of valid range');
      }
    }
    
    const transactionRef = doc(db, `users/${userId}/transactions`, id);
    const transactionSnap = await getDoc(transactionRef);
    
    let existingTransaction: Transaction;
    
    if (!transactionSnap.exists()) {
      // Transaction doesn't exist in Firestore yet - this might be a TrueLayer transaction
      // that's only cached locally. We need to get it from the local cache or create it.
      // For now, we'll try to find it by truelayerTransactionId or create a new one
      const { getTransactions } = await import('../database/db');
      const allTransactions = await getTransactions();
      const localTransaction = allTransactions.find(t => t.id === id);
      
      if (!localTransaction) {
        throw new Error('Transaction not found in local cache or Firestore');
      }
      
      // Transaction exists locally but not in Firestore - create it first
      console.log('[cloudUpdateTransaction] Transaction not in Firestore, creating it first');
      const transactionToCreate: Omit<Transaction, 'id' | 'createdAt'> = {
        accountId: localTransaction.accountId,
        amount: localTransaction.amount,
        type: localTransaction.type,
        category: localTransaction.category,
        description: localTransaction.description,
        date: localTransaction.date,
        truelayerTransactionId: localTransaction.truelayerTransactionId,
        // Only include tags if they're not being explicitly removed in updates
        // If updates don't specify subscriptionId/debtId, include them from local
        // If updates explicitly set them to null/undefined, respect that
        subscriptionId: updates.subscriptionId !== undefined 
          ? (updates.subscriptionId || null) 
          : (localTransaction.subscriptionId || null),
        debtId: updates.debtId !== undefined
          ? (updates.debtId || null)
          : (localTransaction.debtId || null),
        budgetId: updates.budgetId !== undefined
          ? (updates.budgetId || null)
          : (localTransaction.budgetId || null),
      };
      
      // Use the existing ID when creating
      const now = new Date().toISOString();
      const createdAt = localTransaction.createdAt || now;
      
      // Convert date strings to Firestore timestamps
      // Only include fields that are defined (Firestore doesn't allow undefined)
      const transactionDoc: any = {
        accountId: transactionToCreate.accountId,
        amount: transactionToCreate.amount,
        type: transactionToCreate.type,
        category: transactionToCreate.category,
        description: transactionToCreate.description || '',
        date: isoToTimestamp(transactionToCreate.date),
        createdAt: isoToTimestamp(createdAt),
        updatedAt: isoToTimestamp(now),
      };
      
      // Add optional fields only if they exist and are not undefined
      if (transactionToCreate.truelayerTransactionId !== undefined && transactionToCreate.truelayerTransactionId !== null) {
        transactionDoc.truelayerTransactionId = transactionToCreate.truelayerTransactionId;
      }
      // Always include subscriptionId, debtId, and budgetId (even if null) so merge logic can distinguish
      // between "never existed" and "was deleted"
      if (transactionToCreate.subscriptionId !== undefined) {
        transactionDoc.subscriptionId = transactionToCreate.subscriptionId;
      }
      if (transactionToCreate.debtId !== undefined) {
        transactionDoc.debtId = transactionToCreate.debtId;
      }
      if (transactionToCreate.budgetId !== undefined) {
        transactionDoc.budgetId = transactionToCreate.budgetId;
      }
      
      // Hash description for GDPR compliance
      const { hashDescription } = await import('../utils/encryption');
      const descriptionHash = await hashDescription(transactionToCreate.description);
      if (descriptionHash) {
        transactionDoc.descriptionHash = descriptionHash;
      }
      
      await setDoc(transactionRef, transactionDoc);
      
      // Re-fetch to get the created transaction
      const createdSnap = await getDoc(transactionRef);
      if (!createdSnap.exists()) {
        throw new Error('Failed to create transaction in Firestore');
      }
      const createdData = createdSnap.data();
      existingTransaction = {
        id: localTransaction.id,
        accountId: createdData.accountId,
        amount: createdData.amount,
        type: createdData.type,
        category: createdData.category,
        description: createdData.description || '',
        date: timestampToISO(createdData.date),
        createdAt: timestampToISO(createdData.createdAt),
        truelayerTransactionId: createdData.truelayerTransactionId || undefined,
        subscriptionId: createdData.subscriptionId || undefined,
        debtId: createdData.debtId || undefined,
        budgetId: createdData.budgetId || undefined,
        descriptionHash: createdData.descriptionHash || undefined,
      } as Transaction;
    } else {
      // Transaction exists in Firestore
      const transactionData = transactionSnap.data();
      // SECURITY: Verify transaction belongs to user (defense in depth - Firestore rules also enforce this)
      if (!transactionData) {
        throw new Error('Transaction data not found');
      }
      existingTransaction = transactionData as Transaction;
      
      // SECURITY: Additional ownership verification - ensure accountId belongs to user
      if (existingTransaction.accountId) {
        const accountRef = doc(db, `users/${userId}/accounts`, existingTransaction.accountId);
        const accountSnap = await getDoc(accountRef);
        if (!accountSnap.exists()) {
          throw new Error('Transaction account ownership verification failed');
        }
      }
    }
    // SECURITY: Transaction ownership verified by Firestore rules (path-based) and explicit account check
    
    const now = new Date().toISOString();
    const updateData: any = {
      updatedAt: isoToTimestamp(now),
    };
    
    // Only update provided fields
    if (updates.type !== undefined) {
      updateData.type = updates.type;
    }
    if (updates.category !== undefined) {
      // Category already validated and sanitized above
      updateData.category = updates.category;
    }
    if (updates.description !== undefined) {
      // Description already sanitized above
      updateData.description = updates.description;
      
      // Hash description for GDPR compliance when description changes
      const { hashDescription } = await import('../utils/encryption');
      const descriptionHash = await hashDescription(updates.description);
      if (descriptionHash) {
        updateData.descriptionHash = descriptionHash;
      }
    }
    if (updates.amount !== undefined) {
      updateData.amount = updates.amount;
    }
    if (updates.date !== undefined) {
      updateData.date = isoToTimestamp(updates.date);
    }
    if (updates.accountId !== undefined) {
      updateData.accountId = updates.accountId;
    }
    // Handle subscriptionId, debtId, and budgetId
    // null means explicitly removed, undefined means not provided
    if (updates.subscriptionId !== undefined) {
      updateData.subscriptionId = updates.subscriptionId || null;
    }
    if (updates.debtId !== undefined) {
      updateData.debtId = updates.debtId || null;
    }
    if (updates.budgetId !== undefined) {
      updateData.budgetId = updates.budgetId || null;
    }
    
    // SECURITY: Auto-link to subscription BEFORE saving (so it's included in the main update)
    // This ensures subscriptionId is set in the same write operation
    const finalCategory = updateData.category || existingTransaction.category;
    if (updateData.subscriptionId === undefined && finalCategory === 'Subscription') {
      const finalDescription = updates.description !== undefined ? updates.description : existingTransaction.description;
      
      if (finalCategory === 'Subscription' && finalDescription) {
        try {
          const subscriptionsRef = collection(db, `users/${userId}/subscriptions`);
          const subscriptionsSnapshot = await getDocs(subscriptionsRef);
          
          console.log(`[cloudUpdateTransaction] Attempting to auto-link subscription. Found ${subscriptionsSnapshot.docs.length} subscription(s), description: "${finalDescription}"`);
          
          // SECURITY: Sanitize merchant name extraction (multiple strategies for better matching)
          const cleanDesc = finalDescription
            .replace(/^Subscription:\s*/i, '')
            .replace(/^Payment\s+to\s+/i, '')
            .replace(/^Payment\s+/i, '')
            .replace(/^PURCHASE\s*-\s*/i, '')
            .replace(/^RECURRENT\s+TRANSACTION\s+AT\s+/i, '')
            .replace(/^GOOGLE\s+PAY\s+IN-APP\s+AT\s+/i, '')
            .replace(/\s+AT\s+.*$/i, '') // Remove "AT London GBR..." suffix
            .replace(/\s+OF\s+\d+\.\d+\s+\w+\s+ON\s+.*$/i, '') // Remove "OF 33.32 GBP ON 2026-01-11" suffix
            .trim();
          
          const cleanDescLower = cleanDesc.toLowerCase();
          const descLower = finalDescription.toLowerCase();
          
          // Extract merchant name variations
          const merchantName = cleanDesc.split(/[,\s-]/)[0].trim().toLowerCase();
          const firstTwoWords = cleanDesc.split(/\s+/).slice(0, 2).join(' ').trim().toLowerCase();
          const firstThreeWords = cleanDesc.split(/\s+/).slice(0, 3).join(' ').trim().toLowerCase();
          
          console.log(`[cloudUpdateTransaction] Cleaned description: "${cleanDesc}", merchant: "${merchantName}", two words: "${firstTwoWords}"`);
          
          // Log all subscription names for debugging
          const subscriptionNames = subscriptionsSnapshot.docs.map(doc => doc.data().name);
          console.log(`[cloudUpdateTransaction] Available subscriptions: ${subscriptionNames.join(', ')}`);
          
          const matchingSubscription = subscriptionsSnapshot.docs.find(doc => {
            const sub = doc.data() as Subscription;
            const subNameLower = sub.name.toLowerCase().trim();
            
            // Strategy 1: Exact match with cleaned description
            if (subNameLower === cleanDescLower) {
              console.log(`[cloudUpdateTransaction] Exact match: "${sub.name}" === "${cleanDesc}"`);
              return true;
            }
            
            // Strategy 2: Subscription name is contained in description or vice versa
            if (cleanDescLower.includes(subNameLower) || subNameLower.includes(cleanDescLower)) {
              console.log(`[cloudUpdateTransaction] Contains match: "${sub.name}" in "${cleanDesc}"`);
              return true;
            }
            
            // Strategy 3: First word matches
            if (merchantName.length >= 2 && (subNameLower === merchantName || subNameLower.includes(merchantName) || merchantName.includes(subNameLower))) {
              console.log(`[cloudUpdateTransaction] First word match: "${sub.name}" matches "${merchantName}"`);
              return true;
            }
            
            // Strategy 4: First two words match
            if (firstTwoWords.length >= 2 && (subNameLower === firstTwoWords || subNameLower.includes(firstTwoWords) || firstTwoWords.includes(subNameLower))) {
              console.log(`[cloudUpdateTransaction] Two words match: "${sub.name}" matches "${firstTwoWords}"`);
              return true;
            }
            
            // Strategy 5: First three words match (for "Google One" type names)
            if (firstThreeWords.length >= 2 && (subNameLower === firstThreeWords || subNameLower.includes(firstThreeWords) || firstThreeWords.includes(subNameLower))) {
              console.log(`[cloudUpdateTransaction] Three words match: "${sub.name}" matches "${firstThreeWords}"`);
              return true;
            }
            
            // Strategy 6: Full description contains subscription name
            if (descLower.includes(subNameLower) || subNameLower.includes(descLower)) {
              console.log(`[cloudUpdateTransaction] Full description match: "${sub.name}" in "${finalDescription}"`);
              return true;
            }
            
            return false;
          });
          
          if (matchingSubscription) {
            updateData.subscriptionId = matchingSubscription.id;
            console.log(`[cloudUpdateTransaction] ✅ Auto-linked transaction to subscription: "${matchingSubscription.data().name}" (ID: ${matchingSubscription.id})`);
          } else {
            console.log(`[cloudUpdateTransaction] ⚠️ No matching subscription found for description: "${finalDescription}"`);
          }
        } catch (error) {
          // Log but don't throw - subscription linking is optional
          console.error('[cloudUpdateTransaction] Error linking subscription:', error instanceof Error ? error.message : 'Unknown error');
        }
      }
    }
    
    // SECURITY: Auto-link to debt BEFORE saving (so it's included in the main update)
    if (updateData.debtId === undefined && (updates.category || existingTransaction.category)) {
      const finalCategory = updates.category || existingTransaction.category;
      const finalDescription = updates.description !== undefined ? updates.description : existingTransaction.description;
      
      if (finalCategory && finalDescription) {
        try {
          const debtsRef = collection(db, `users/${userId}/debts`);
          const debtsSnapshot = await getDocs(debtsRef);
          
          const merchantName = extractMerchantName(finalDescription);
          if (merchantName && merchantName.length >= 2) {
            const matchingDebt = debtsSnapshot.docs.find(doc => {
              const debt = doc.data() as Debt;
              const debtNameLower = debt.name.toLowerCase();
              const merchantLower = merchantName.toLowerCase();
              const nameMatches = debtNameLower.includes(merchantLower) || merchantLower.includes(debtNameLower);
              const categoryMatches = debt.budgetCategory && debt.budgetCategory === finalCategory;
              return nameMatches && categoryMatches;
            });
            
            if (matchingDebt) {
              updateData.debtId = matchingDebt.id;
              console.log(`[cloudUpdateTransaction] Auto-linked transaction to debt: ${matchingDebt.data().name}`);
            }
          }
        } catch (error) {
          // Log but don't throw - debt linking is optional
          console.error('[cloudUpdateTransaction] Error linking debt:', error instanceof Error ? error.message : 'Unknown error');
        }
      }
    }
    
    await setDoc(transactionRef, updateData, { merge: true });
    
    // Update budgets when budgetId, category, type, or amount changes
    // Priority: budgetId (explicit link) > category matching (backward compatible)
    const budgetsRef = collection(db, `users/${userId}/budgets`);
    const oldBudgetId = existingTransaction.budgetId;
    const newBudgetId = updates.budgetId !== undefined ? (updates.budgetId || null) : existingTransaction.budgetId;
    const oldCategory = existingTransaction.category || '';
    const newCategory = updates.category !== undefined ? updates.category : existingTransaction.category || '';
    const oldType = existingTransaction.type;
    const newType = updates.type !== undefined ? updates.type : existingTransaction.type;
    const oldAmount = existingTransaction.amount;
    const newAmount = updates.amount !== undefined ? updates.amount : existingTransaction.amount;
    const budgetIdChanged = oldBudgetId !== newBudgetId;
    const categoryChanged = oldCategory !== newCategory;
    const typeChanged = oldType !== newType;
    const onlyAmountChanged = !categoryChanged && !typeChanged && !budgetIdChanged && updates.amount !== undefined;
    
    // Handle budget updates for expenses only
    if (newType === 'expense' || oldType === 'expense') {
      // Case 1: Remove from old budget if budgetId changed or was removed
      if (oldType === 'expense' && oldBudgetId && budgetIdChanged) {
        try {
          const oldBudgetRef = doc(budgetsRef, oldBudgetId);
          const oldBudgetSnap = await getDoc(oldBudgetRef);
          if (oldBudgetSnap.exists()) {
            const oldBudgetData = oldBudgetSnap.data();
            const currentSpent = Math.max(0, (oldBudgetData.currentSpent || 0) - oldAmount);
            await setDoc(oldBudgetRef, {
              currentSpent,
              updatedAt: isoToTimestamp(now),
            }, { merge: true });
            console.log(`[cloudUpdateTransaction] Removed ${oldAmount} from old budget ${oldBudgetId}`);
          }
        } catch (error) {
          console.error('[cloudUpdateTransaction] Error removing from old budget:', error);
        }
      }
      
      // Case 2: Remove from old category-based budget if category changed and no explicit budgetId
      if (oldType === 'expense' && !oldBudgetId && oldCategory && oldCategory.trim() !== '' && categoryChanged) {
        try {
          const oldBudgetSnapshot = await getDocs(query(budgetsRef, where('category', '==', oldCategory)));
          if (!oldBudgetSnapshot.empty) {
            const budgetDoc = oldBudgetSnapshot.docs[0];
            const budgetData = budgetDoc.data();
            const currentSpent = Math.max(0, (budgetData.currentSpent || 0) - oldAmount);
            await setDoc(budgetDoc.ref, {
              currentSpent,
              updatedAt: isoToTimestamp(now),
            }, { merge: true });
            console.log(`[cloudUpdateTransaction] Removed ${oldAmount} from old category-based budget`);
          }
        } catch (error) {
          console.error('[cloudUpdateTransaction] Error removing from old category budget:', error);
        }
      }
      
      // Case 3: Only amount changed - update existing budget
      if (onlyAmountChanged && newType === 'expense') {
        try {
          let budgetDocRef = null;
          
          // Check explicit budgetId first
          if (newBudgetId) {
            const budgetRef = doc(budgetsRef, newBudgetId);
            const budgetSnap = await getDoc(budgetRef);
            if (budgetSnap.exists()) {
              budgetDocRef = budgetSnap;
            }
          }
          
          // Fallback to category matching if no explicit budgetId
          if (!budgetDocRef && newCategory && newCategory.trim() !== '') {
            const budgetSnapshot = await getDocs(query(budgetsRef, where('category', '==', newCategory)));
            if (!budgetSnapshot.empty) {
              budgetDocRef = budgetSnapshot.docs[0];
            }
          }
          
          if (budgetDocRef) {
            const budgetData = budgetDocRef.data();
            const amountDifference = newAmount - oldAmount;
            const currentSpent = Math.max(0, (budgetData.currentSpent || 0) + amountDifference);
            await setDoc(budgetDocRef.ref, {
              currentSpent,
              updatedAt: isoToTimestamp(now),
            }, { merge: true });
            console.log(`[cloudUpdateTransaction] Updated budget amount by ${amountDifference}`);
          }
        } catch (error) {
          console.error('[cloudUpdateTransaction] Error updating budget amount:', error);
        }
      }
      
      // Case 4: Add to new budget (budgetId changed, category changed, or type changed to expense)
      if (newType === 'expense' && (budgetIdChanged || categoryChanged || typeChanged)) {
        try {
          let budgetDocRef = null;
          
          // Priority 1: Use explicit budgetId if provided
          if (newBudgetId) {
            const budgetRef = doc(budgetsRef, newBudgetId);
            const budgetSnap = await getDoc(budgetRef);
            if (budgetSnap.exists()) {
              budgetDocRef = budgetSnap;
            }
          }
          
          // Priority 2: Fallback to category matching if no explicit budgetId
          if (!budgetDocRef && newCategory && newCategory.trim() !== '') {
            const newBudgetSnapshot = await getDocs(query(budgetsRef, where('category', '==', newCategory)));
            if (!newBudgetSnapshot.empty) {
              budgetDocRef = newBudgetSnapshot.docs[0];
            }
          }
          
          if (budgetDocRef) {
            const budgetData = budgetDocRef.data();
            const currentSpent = Math.max(0, (budgetData.currentSpent || 0) + newAmount);
            await setDoc(budgetDocRef.ref, {
              currentSpent,
              updatedAt: isoToTimestamp(now),
            }, { merge: true });
            console.log(`[cloudUpdateTransaction] Added ${newAmount} to budget ${budgetDocRef.id}`);
          }
        } catch (error) {
          console.error('[cloudUpdateTransaction] Error adding to new budget:', error);
        }
      }
    }
    
    // Note: Auto-linking to subscriptions and debts now happens BEFORE the main update
    // (see code above) so subscriptionId/debtId are included in the main setDoc call
    
    // If we successfully linked a subscription, log it for debugging
    if (updateData.subscriptionId && !updates.subscriptionId) {
      console.log(`[cloudUpdateTransaction] ✅ Successfully set subscriptionId: ${updateData.subscriptionId}`);
    }
  } catch (error: unknown) {
    // SECURITY: Don't leak sensitive information in errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // SECURITY: Sanitize error messages - don't expose internal details
    let sanitizedError: Error;
    if (errorMessage.includes('permission') || errorMessage.includes('Permission')) {
      sanitizedError = new Error('Access denied');
    } else if (errorMessage.includes('not found') || errorMessage.includes('not exist')) {
      sanitizedError = new Error('Transaction not found');
    } else if (errorMessage.includes('Invalid') || errorMessage.includes('invalid')) {
      // Keep validation errors as they help user fix input
      sanitizedError = error instanceof Error ? error : new Error(errorMessage);
    } else {
      // Generic error for unexpected issues
      sanitizedError = new Error('Failed to update transaction');
    }
    
    // SECURITY: Log error details without sensitive data
    console.error('[cloudUpdateTransaction] Error updating transaction');
    if (error instanceof Error) {
      // Only log error type and operation, not transaction IDs or user data
      console.error('[cloudUpdateTransaction] Error type:', error.constructor.name);
      console.error('[cloudUpdateTransaction] Updating fields:', Object.keys(updates).join(', '));
    }
    
    throw sanitizedError;
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
      // Priority: budgetId (explicit link) > category matching (backward compatible)
      if (transaction.type === 'expense') {
        const budgetsRef = collection(db, `users/${userId}/budgets`);
        let budgetDocRef = null;
        
        // First, check if there's an explicit budgetId
        if (transaction.budgetId) {
          const budgetRef = doc(budgetsRef, transaction.budgetId);
          const budgetSnap = await getDoc(budgetRef);
          if (budgetSnap.exists()) {
            budgetDocRef = budgetSnap;
          }
        }
        
        // If no explicit budgetId or budget not found, fallback to category matching
        if (!budgetDocRef && transaction.category) {
          const budgetsSnapshot = await getDocs(query(budgetsRef, where('category', '==', transaction.category)));
          if (!budgetsSnapshot.empty) {
            budgetDocRef = budgetsSnapshot.docs[0];
          }
        }
        
        // Update budget if we found one
        if (budgetDocRef) {
          const budgetData = budgetDocRef.data();
          await setDoc(budgetDocRef.ref, {
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

/**
 * Untag transaction - Remove subscription, debt, or budget links
 */
export const cloudUntagTransaction = async (
  id: string,
  untagType: 'subscription' | 'debt' | 'budget' | 'all'
): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase not available');
  }
  
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not initialized');
  
  try {
    const userId = getUserId();
    const transactionRef = doc(db, `users/${userId}/transactions`, id);
    const transactionSnap = await getDoc(transactionRef);
    
    // Set fields to null to indicate they were explicitly removed
    const updateData: any = {};
    
    if (!transactionSnap.exists()) {
      // Transaction doesn't exist in Firestore yet - get from cache and create it with null tags
      const { getTransactions } = await import('../database/db');
      const allTransactions = await getTransactions();
      const localTransaction = allTransactions.find(t => t.id === id);
      
      if (!localTransaction) {
        throw new Error('Transaction not found in local cache or Firestore');
      }
      
      // Create transaction in Firestore with tags set to null if untagging
      const now = new Date().toISOString();
      const transactionDoc: any = {
        accountId: localTransaction.accountId,
        amount: localTransaction.amount,
        type: localTransaction.type,
        category: localTransaction.category,
        description: localTransaction.description || '',
        date: isoToTimestamp(localTransaction.date),
        createdAt: isoToTimestamp(localTransaction.createdAt || now),
        updatedAt: isoToTimestamp(now),
      };
      
      if (localTransaction.truelayerTransactionId) {
        transactionDoc.truelayerTransactionId = localTransaction.truelayerTransactionId;
      }
      
      // Always include subscriptionId, debtId, and budgetId (even if null) so merge logic can detect explicit removal
      if (untagType === 'subscription' || untagType === 'all') {
        transactionDoc.subscriptionId = null;
        console.log('[cloudUntagTransaction] Creating transaction with subscriptionId=null');
      } else if (localTransaction.subscriptionId) {
        transactionDoc.subscriptionId = localTransaction.subscriptionId;
      } else {
        transactionDoc.subscriptionId = null; // Explicitly set to null to indicate it was checked
      }
      
      if (untagType === 'debt' || untagType === 'all') {
        transactionDoc.debtId = null;
        console.log('[cloudUntagTransaction] Creating transaction with debtId=null');
      } else if (localTransaction.debtId) {
        transactionDoc.debtId = localTransaction.debtId;
      } else {
        transactionDoc.debtId = null; // Explicitly set to null to indicate it was checked
      }
      
      if (untagType === 'budget' || untagType === 'all') {
        transactionDoc.budgetId = null;
        console.log('[cloudUntagTransaction] Creating transaction with budgetId=null');
      } else if (localTransaction.budgetId) {
        transactionDoc.budgetId = localTransaction.budgetId;
      } else {
        transactionDoc.budgetId = null; // Explicitly set to null to indicate it was checked
      }
      
      console.log('[cloudUntagTransaction] Creating transaction in Firestore with tags:', { subscriptionId: transactionDoc.subscriptionId, debtId: transactionDoc.debtId, budgetId: transactionDoc.budgetId });
      await setDoc(transactionRef, transactionDoc);
      console.log('[cloudUntagTransaction] Successfully created transaction with null tags');
      return;
    }
    
    const transaction = transactionSnap.data() as Transaction;
    
    // Remove subscription link
    if (untagType === 'subscription' || untagType === 'all') {
      updateData.subscriptionId = null; // Always set to null, even if it was already null
      console.log('[cloudUntagTransaction] Setting subscriptionId to null for transaction:', id);
    }
    
    // Remove debt link
    if (untagType === 'debt' || untagType === 'all') {
      updateData.debtId = null; // Always set to null, even if it was already null
      console.log('[cloudUntagTransaction] Setting debtId to null for transaction:', id);
    }
    
    // Remove budget link
    if (untagType === 'budget' || untagType === 'all') {
      updateData.budgetId = null; // Always set to null, even if it was already null
      console.log('[cloudUntagTransaction] Setting budgetId to null for transaction:', id);
      
      // Also need to update budget's currentSpent when untagging
      // Find the budget that was linked and remove this transaction's amount
      if (transaction.budgetId) {
        try {
          const budgetsRef = collection(db, `users/${userId}/budgets`);
          const budgetRef = doc(budgetsRef, transaction.budgetId);
          const budgetSnap = await getDoc(budgetRef);
          
          if (budgetSnap.exists()) {
            const budgetData = budgetSnap.data();
            const currentSpent = Math.max(0, (budgetData.currentSpent || 0) - transaction.amount);
            await setDoc(budgetRef, {
              currentSpent,
              updatedAt: isoToTimestamp(new Date().toISOString()),
            }, { merge: true });
            console.log('[cloudUntagTransaction] Updated budget currentSpent after untagging');
          }
        } catch (error) {
          console.error('[cloudUntagTransaction] Error updating budget after untagging:', error);
          // Don't throw - budget update failure shouldn't prevent untagging
        }
      }
    }
    
    // Update transaction
    if (Object.keys(updateData).length > 0) {
      console.log('[cloudUntagTransaction] Updating transaction with:', updateData);
      await updateDoc(transactionRef, updateData);
      console.log('[cloudUntagTransaction] Successfully updated transaction tags');
    }
  } catch (error) {
    console.error('Error untagging transaction:', error);
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
    subscriptionId: subscription.id, // Link transaction to subscription
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
    // Use composite key (connectionId + accountId) to ensure uniqueness across different connections
    const existingAccounts = await cloudGetAccounts();
    const truelayerAccountMap = new Map(
      existingAccounts
        .filter(acc => acc.truelayerConnectionId === connectionId && acc.truelayerAccountId)
        .map(acc => [`${acc.truelayerConnectionId}_${acc.truelayerAccountId}`, acc])
    );

    console.log(`[syncTrueLayerAccounts] Found ${truelayerAccounts.length} account(s) from TrueLayer API`);
    console.log(`[syncTrueLayerAccounts] Found ${truelayerAccountMap.size} existing account(s) for connection ${connectionId}`);

    // Process each TrueLayer account
    for (const tlAccount of truelayerAccounts) {
      try {
        // Fetch balance for this account
        const balanceResponse = await getAccountBalance(connectionId, tlAccount.account_id);
        const balance = balanceResponse.results[0];

        // Check if account already exists using composite key
        const compositeKey = `${connectionId}_${tlAccount.account_id}`;
        const existingAccount = truelayerAccountMap.get(compositeKey);
        
        console.log(`[syncTrueLayerAccounts] Processing account: ${tlAccount.display_name} (${tlAccount.account_id}) from ${tlAccount.provider?.display_name || 'Unknown'}, exists: ${!!existingAccount}`);

        // For TrueLayer accounts, don't store balance in Firestore (security: minimize persisted financial data)
        // Balance will be fetched on-demand from TrueLayer API and cached locally
        const accountData: Partial<Account> = {
          name: tlAccount.display_name,
          type: 'bank' as const,
          balance: 0, // Placeholder - actual balance fetched on-demand
          currency: tlAccount.currency,
          truelayerConnectionId: connectionId,
          truelayerAccountId: tlAccount.account_id,
          truelayerProviderName: tlAccount.provider?.display_name,
          isSynced: true,
          lastSyncedAt: now,
          truelayerAccountType: tlAccount.account_type,
          updatedAt: now,
        };

        if (existingAccount) {
          // Update existing account - ensure all TrueLayer fields are included
          console.log(`[syncTrueLayerAccounts] Updating existing account: ${existingAccount.id} (${accountData.name})`);
          await cloudUpdateAccount(existingAccount.id, accountData);
        } else {
          // Create new account
          console.log(`[syncTrueLayerAccounts] Creating new account: ${accountData.name} (${accountData.truelayerAccountId}) from ${accountData.truelayerProviderName || 'Unknown'}`);
          await cloudAddAccount({
            name: accountData.name!,
            type: accountData.type!,
            balance: accountData.balance!,
            currency: accountData.currency!,
            truelayerConnectionId: accountData.truelayerConnectionId,
            truelayerAccountId: accountData.truelayerAccountId,
            truelayerProviderName: accountData.truelayerProviderName,
            isSynced: accountData.isSynced,
            lastSyncedAt: accountData.lastSyncedAt,
            truelayerAccountType: accountData.truelayerAccountType,
          });
        }
      } catch (error) {
        console.error(`[syncTrueLayerAccounts] Error syncing account ${tlAccount.account_id}:`, error);
        // Continue with other accounts even if one fails
      }
    }

    // Verify final state
    const finalAccounts = await cloudGetAccounts();
    const syncedAccountsForConnection = finalAccounts.filter(
      acc => acc.truelayerConnectionId === connectionId && acc.truelayerAccountId
    );
    
    console.log(`[syncTrueLayerAccounts] Sync complete. TrueLayer returned ${truelayerAccounts.length} account(s), database now has ${syncedAccountsForConnection.length} account(s) for this connection`);
    
    if (syncedAccountsForConnection.length !== truelayerAccounts.length) {
      console.warn(`[syncTrueLayerAccounts] Mismatch: Expected ${truelayerAccounts.length} accounts, but found ${syncedAccountsForConnection.length} in database`);
      console.log(`[syncTrueLayerAccounts] Account IDs from TrueLayer:`, truelayerAccounts.map(a => a.account_id));
      console.log(`[syncTrueLayerAccounts] Account IDs in database:`, syncedAccountsForConnection.map(a => `${a.truelayerAccountId} (${a.name})`));
    }
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
    truelayerProviderName: truelayerAccount.provider?.display_name,
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
      truelayerProviderName: accountData.truelayerProviderName,
      isSynced: accountData.isSynced,
      lastSyncedAt: accountData.lastSyncedAt,
      truelayerAccountType: accountData.truelayerAccountType,
    });
  }
};

import { getCategoryMetadata, getDefaultCategory } from '../utils/categories';

// Helper to extract merchant name from description (duplicated from categoryService to avoid circular dependency)
const extractMerchantName = (description: string): string | null => {
  if (!description) return null;
  
  const cleanDesc = description
    .replace(/^Subscription:\s*/i, '')
    .replace(/^Payment\s+to\s+/i, '')
    .replace(/^Purchase\s+at\s+/i, '')
    .trim();
  
  const parts = cleanDesc.split(/[,\s-]/);
  if (parts.length > 0 && parts[0].length > 2) {
    return parts[0].trim();
  }
  
  return null;
};

const mapTrueLayerCategory = (tlCategory: string, transactionType?: 'income' | 'expense'): string => {
  const categoryMap: Record<string, string> = {
    'general': 'Other',
    'entertainment': 'Entertainment',
    'eating_out': 'Food & Dining',
    'expenses': 'Other',
    'transport': 'Transport',
    'cash': 'Cash',
    'bills': 'Bills & Utilities',
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
    'utilities': 'Bills & Utilities',
    'healthcare': 'Healthcare',
    'transfer': 'Transfer',
    'income': transactionType === 'income' ? 'Salary' : 'Other Income',
  };
  
  const normalized = tlCategory.toLowerCase().replace(/\s+/g, '_');
  const mappedCategory = categoryMap[normalized] || 'Other';
  
  // Validate mapped category exists in our system
  const categoryMeta = getCategoryMetadata(mappedCategory);
  if (categoryMeta) {
    return mappedCategory;
  }
  
  // Fallback to default category for the transaction type
  return getDefaultCategory(transactionType || 'expense');
};

const mapTrueLayerTransaction = (
  tlTransaction: TrueLayerTransaction,
  accountId: string
): Omit<Transaction, 'id' | 'createdAt'> => {
  const transactionType = (tlTransaction.transaction_type || '').toUpperCase();
  const isCredit = transactionType === 'CREDIT';
  
  const type: 'income' | 'expense' = isCredit ? 'income' : 'expense';
  const amount = Math.abs(tlTransaction.amount);
  const category = mapTrueLayerCategory(tlTransaction.transaction_category || 'general', type);
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

// Chat Thread operations
export const cloudGetChatThreads = async (): Promise<ChatThread[]> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available');
  }
  
  const db = getFirestoreDb();
  if (!db) {
    throw new Error('Firestore database not initialized');
  }
  
  try {
    const userId = getUserId();
    const threadsRef = collection(db, `users/${userId}/chatThreads`);
    const snapshot = await getDocs(query(threadsRef, orderBy('updatedAt', 'desc')));
    
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.title,
        messages: (data.messages || []).map((msg: any) => ({
          role: msg.role,
          content: msg.content,
          createdAt: timestampToISO(msg.createdAt),
        })),
        createdAt: timestampToISO(data.createdAt),
        updatedAt: timestampToISO(data.updatedAt),
      };
    }) as ChatThread[];
  } catch (error) {
    console.error('Error fetching chat threads from cloud:', error);
    throw error;
  }
};

export const cloudGetChatThread = async (id: string): Promise<ChatThread | null> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available');
  }
  
  const db = getFirestoreDb();
  if (!db) {
    throw new Error('Firestore database not initialized');
  }
  
  try {
    const userId = getUserId();
    const threadRef = doc(db, `users/${userId}/chatThreads`, id);
    const threadSnap = await getDoc(threadRef);
    
    if (!threadSnap.exists()) {
      return null;
    }
    
    const data = threadSnap.data();
    return {
      id: threadSnap.id,
      title: data.title,
      messages: (data.messages || []).map((msg: any) => ({
        role: msg.role,
        content: msg.content,
        createdAt: timestampToISO(msg.createdAt),
      })),
      createdAt: timestampToISO(data.createdAt),
      updatedAt: timestampToISO(data.updatedAt),
    } as ChatThread;
  } catch (error) {
    console.error('Error fetching chat thread from cloud:', error);
    throw error;
  }
};

export const cloudAddChatThread = async (thread: Omit<ChatThread, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase not available');
  }
  
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not initialized');
  
  try {
    const userId = getUserId();
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const now = new Date().toISOString();
    const threadRef = doc(db, `users/${userId}/chatThreads`, id);
    
    await setDoc(threadRef, {
      title: thread.title,
      messages: thread.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        createdAt: isoToTimestamp(msg.createdAt),
      })),
      createdAt: isoToTimestamp(now),
      updatedAt: isoToTimestamp(now),
    });
    
    return id;
  } catch (error) {
    console.error('Error adding chat thread to cloud:', error);
    throw error;
  }
};

export const cloudUpdateChatThread = async (id: string, updates: Partial<ChatThread>): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase not available');
  }
  
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not initialized');
  
  try {
    const userId = getUserId();
    const threadRef = doc(db, `users/${userId}/chatThreads`, id);
    const updateData: any = {
      updatedAt: isoToTimestamp(new Date().toISOString()),
    };
    
    if (updates.title !== undefined) {
      updateData.title = updates.title;
    }
    
    if (updates.messages !== undefined) {
      updateData.messages = updates.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        createdAt: isoToTimestamp(msg.createdAt),
      }));
    }
    
    if (updates.createdAt) {
      updateData.createdAt = isoToTimestamp(updates.createdAt);
    }
    
    await setDoc(threadRef, updateData, { merge: true });
  } catch (error) {
    console.error('Error updating chat thread in cloud:', error);
    throw error;
  }
};

export const cloudDeleteChatThread = async (id: string): Promise<void> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase not available');
  }
  
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not initialized');
  
  try {
    const userId = getUserId();
    const threadRef = doc(db, `users/${userId}/chatThreads`, id);
    await deleteDoc(threadRef);
  } catch (error) {
    console.error('Error deleting chat thread from cloud:', error);
    throw error;
  }
};

