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
    
    await setDoc(accountRef, {
      ...account,
      createdAt: isoToTimestamp(now),
      updatedAt: isoToTimestamp(now),
    });
    
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
    const transactionsRef = collection(db, `users/${userId}/transactions`);
    const snapshot = await getDocs(query(transactionsRef, orderBy('createdAt', 'desc')));
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      date: timestampToISO(doc.data().date),
      createdAt: timestampToISO(doc.data().createdAt),
    })) as Transaction[];
  } catch (error) {
    console.error('Error fetching transactions from cloud:', error);
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
    
    await setDoc(transactionRef, {
      ...transaction,
      date: isoToTimestamp(transaction.date),
      createdAt: isoToTimestamp(now),
    });
    
    // Update account balance
    const accountRef = doc(db, `users/${userId}/accounts`, transaction.accountId);
    const accountSnap = await getDoc(accountRef);
    if (accountSnap.exists()) {
      const accountData = accountSnap.data();
      const balanceChange = transaction.type === 'income' ? transaction.amount : -transaction.amount;
      await setDoc(accountRef, {
        balance: (accountData.balance || 0) + balanceChange,
        updatedAt: isoToTimestamp(now),
      }, { merge: true });
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
      
      // Revert account balance
      const accountRef = doc(db, `users/${userId}/accounts`, transaction.accountId);
      const accountSnap = await getDoc(accountRef);
      if (accountSnap.exists()) {
        const accountData = accountSnap.data();
        const balanceChange = transaction.type === 'income' ? -transaction.amount : transaction.amount;
        await setDoc(accountRef, {
          balance: (accountData.balance || 0) + balanceChange,
          updatedAt: isoToTimestamp(new Date().toISOString()),
        }, { merge: true });
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

export const cloudAddSubscription = async (subscription: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase not available');
  }
  
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not initialized');
  
  try {
    const userId = getUserId();
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const now = new Date().toISOString();
    const subscriptionRef = doc(db, `users/${userId}/subscriptions`, id);
    
    await setDoc(subscriptionRef, {
      ...subscription,
      nextBillingDate: isoToTimestamp(subscription.nextBillingDate),
      createdAt: isoToTimestamp(now),
      updatedAt: isoToTimestamp(now),
    });
    
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

