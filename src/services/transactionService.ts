/**
 * Transaction Service - Secure API-First Implementation
 * 
 * Fetches transactions directly from TrueLayer API with encrypted local caching.
 * No persistent cloud storage of raw transaction data.
 * 
 * Security:
 * - Encrypted SecureStore cache (keychain/keystore)
 * - Per-user isolation
 * - Auto-expiring cache (TTL)
 * - No cloud persistence
 */

import { Transaction } from '../database/schema';
import { getAllConnections } from './truelayerService';
import { cloudGetAccounts } from './cloudDb';
import { getCachedTransactions, clearTransactionCache } from './transactionCache';

/**
 * Get all transactions for all connected accounts
 * Uses secure encrypted cache with API fallback
 * Merges Firestore updates (user categorizations) with cached transactions
 */
export const getTransactions = async (forceRefresh: boolean = false): Promise<Transaction[]> => {
  const connections = await getAllConnections();
  if (connections.length === 0) {
    // Still check Firestore for manually added transactions
    try {
      const { cloudGetTransactions } = await import('./cloudDb');
      const firestoreTransactions = await cloudGetTransactions();
      return firestoreTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } catch (error) {
      return [];
    }
  }
  
  const accounts = await cloudGetAccounts();
  
  const allTransactions: Transaction[] = [];

  for (const connection of connections) {
    // First, try to get accounts that match by connectionId
    let connectionAccounts = accounts.filter(
      acc => acc.truelayerConnectionId === connection.id && 
             acc.truelayerAccountId && 
             acc.isSynced
    );

    // If no accounts match by connectionId, try to find accounts by fetching from TrueLayer
    // This handles the case where accounts were created before connectionId was set
    if (connectionAccounts.length === 0) {
      try {
        const { getAccounts: getTrueLayerAccounts } = await import('./truelayerService');
        const tlAccountsResponse = await getTrueLayerAccounts(connection.id);
        const tlAccountIds = new Set(tlAccountsResponse.results.map(acc => acc.account_id));
        
        // Find accounts that match TrueLayer account IDs but don't have connectionId set
        connectionAccounts = accounts.filter(
          acc => acc.truelayerAccountId && 
                 tlAccountIds.has(acc.truelayerAccountId) &&
                 (!acc.truelayerConnectionId || acc.truelayerConnectionId === connection.id)
        );
        
        // Update these accounts with the connectionId
        if (connectionAccounts.length > 0) {
          const { cloudUpdateAccount } = await import('./cloudDb');
          for (const account of connectionAccounts) {
            await cloudUpdateAccount(account.id, {
              truelayerConnectionId: connection.id,
              isSynced: true,
            });
          }
        }
      } catch (error) {
        console.error(`[transactionService] Error fetching TrueLayer accounts for matching:`, error);
      }
    }

    const accountPromises = connectionAccounts.map(async (account) => {
      if (!account.truelayerAccountId) {
        console.warn('[transactionService] Account missing truelayerAccountId, skipping');
        return [] as Transaction[];
      }
      
      try {
        return await getCachedTransactions(
          connection.id,
          account.truelayerAccountId,
          account.id,
          forceRefresh
        );
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[transactionService] Error fetching cached transactions:`, errorMessage);
        return [] as Transaction[];
      }
    });
    
    const connectionTransactions = await Promise.all(accountPromises);
    connectionTransactions.forEach(transactions => {
      allTransactions.push(...transactions);
    });
  }

  // SECURITY: Merge Firestore updates (user categorizations) with cached transactions
  // This ensures user's manual categorizations are reflected even if cache hasn't refreshed
  try {
    const { cloudGetTransactions } = await import('./cloudDb');
    const firestoreTransactions = await cloudGetTransactions();
    
    // Create a map of Firestore transactions by ID for fast lookup
    const firestoreMap = new Map<string, Transaction>();
    firestoreTransactions.forEach(t => {
      firestoreMap.set(t.id, t);
    });
    
    // Merge: Use Firestore version if it exists (has user updates), otherwise use cached version
    const mergedTransactions = allTransactions.map(cachedTransaction => {
      const firestoreVersion = firestoreMap.get(cachedTransaction.id);
      if (firestoreVersion) {
        // Verify IDs match
        if (firestoreVersion.id !== cachedTransaction.id) {
          console.warn(`[transactionService] ⚠️ ID mismatch! Cached: ${cachedTransaction.id}, Firestore: ${firestoreVersion.id}`);
        }
        // Firestore version has user updates - merge intelligently
        // Preserve TrueLayer data (amount, date, description from API) but apply user categorizations
        
        // Handle tags: null in Firestore means explicitly removed, undefined means never set
        // CRITICAL: If Firestore has null, we MUST use undefined (remove tags) regardless of cache
        // If Firestore has a value, use that value
        // If Firestore has undefined, it never existed - keep cached value
        
        // Determine final tag values
        let finalSubscriptionId: string | undefined;
        if (firestoreVersion.subscriptionId === null) {
          // NULL in Firestore = explicitly removed - ALWAYS use undefined
          finalSubscriptionId = undefined;
        } else if (firestoreVersion.subscriptionId !== undefined) {
          // Has a value in Firestore - use it
          finalSubscriptionId = firestoreVersion.subscriptionId || undefined;
        } else {
          // Undefined in Firestore = never existed - keep cached value
          finalSubscriptionId = cachedTransaction.subscriptionId;
        }
        
        let finalDebtId: string | undefined;
        if (firestoreVersion.debtId === null) {
          // NULL in Firestore = explicitly removed - ALWAYS use undefined
          finalDebtId = undefined;
          if (cachedTransaction.debtId) {
            console.log(`[transactionService] ✅ REMOVING debtId tag from ${cachedTransaction.id}: Firestore=null, cached=${cachedTransaction.debtId} → merged=undefined`);
          }
        } else if (firestoreVersion.debtId !== undefined) {
          // Has a value in Firestore - use it
          finalDebtId = firestoreVersion.debtId || undefined;
        } else {
          // Undefined in Firestore = never existed - keep cached value
          finalDebtId = cachedTransaction.debtId;
        }
        
        let finalBudgetId: string | undefined;
        if (firestoreVersion.budgetId === null) {
          // NULL in Firestore = explicitly removed - ALWAYS use undefined
          finalBudgetId = undefined;
          if (cachedTransaction.budgetId) {
            console.log(`[transactionService] ✅ REMOVING budgetId tag from ${cachedTransaction.id}: Firestore=null, cached=${cachedTransaction.budgetId} → merged=undefined`);
          }
        } else if (firestoreVersion.budgetId !== undefined) {
          // Has a value in Firestore - use it
          finalBudgetId = firestoreVersion.budgetId || undefined;
        } else {
          // Undefined in Firestore = never existed - keep cached value
          finalBudgetId = cachedTransaction.budgetId;
        }
        
        const merged: Transaction = {
          ...cachedTransaction, // Base: TrueLayer data (amount, date, description, accountId, truelayerTransactionId)
          // Override with user updates from Firestore (category, type, subscriptionId, debtId, budgetId)
          category: firestoreVersion.category !== undefined ? firestoreVersion.category : cachedTransaction.category,
          type: firestoreVersion.type !== undefined ? firestoreVersion.type : cachedTransaction.type,
          // CRITICAL: Use the final tag values we determined above
          subscriptionId: finalSubscriptionId,
          debtId: finalDebtId,
          budgetId: finalBudgetId,
          // Preserve description from cache (more accurate from TrueLayer), but allow Firestore override if user edited
          description: firestoreVersion.description && firestoreVersion.description !== cachedTransaction.description 
            ? firestoreVersion.description 
            : cachedTransaction.description,
          // Preserve descriptionHash from Firestore if it exists
          descriptionHash: firestoreVersion.descriptionHash !== undefined ? firestoreVersion.descriptionHash : cachedTransaction.descriptionHash,
        };
        
        return merged;
      }
      return cachedTransaction;
    });
    
    // Add any Firestore-only transactions (manually added, not from TrueLayer)
    firestoreTransactions.forEach(firestoreTransaction => {
      if (!allTransactions.find(t => t.id === firestoreTransaction.id)) {
        mergedTransactions.push(firestoreTransaction);
      }
    });
    
    
    // Sort by date (newest first)
    return mergedTransactions.sort((a, b) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  } catch (error) {
    // If Firestore merge fails, return cached transactions
    console.error('[transactionService] Error merging Firestore transactions, returning cached only');
    console.log(`[transactionService] Returning ${allTransactions.length} total transactions`);
    
    // Sort by date (newest first)
    return allTransactions.sort((a, b) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }
};

/**
 * Refresh transactions for all connections
 * Uses smart refresh: returns cached data immediately if available, then refreshes in background
 */
export const refreshTransactions = async (): Promise<Transaction[]> => {
  // First, try to get cached transactions (fast)
  const cachedTransactions = await getTransactions(false);
  
  // If we have cached data, return it immediately and refresh in background
  if (cachedTransactions.length > 0) {
    // Refresh in background (non-blocking)
    getTransactions(true).catch((error) => {
      console.error('[transactionService] Background refresh failed (non-critical):', error);
    });
    return cachedTransactions;
  }
  
  // No cache available, fetch fresh data (blocking)
  return getTransactions(true);
};

/**
 * Clear transaction cache (called on logout/token revocation)
 */
export const clearAllCaches = async (): Promise<void> => {
  const connections = await getAllConnections();
  const accounts = await cloudGetAccounts();

  for (const connection of connections) {
    const connectionAccounts = accounts.filter(
      acc => acc.truelayerConnectionId === connection.id && 
             acc.truelayerAccountId
    );

    for (const account of connectionAccounts) {
      if (account.truelayerAccountId) {
        await clearTransactionCache(connection.id, account.truelayerAccountId);
      }
    }
  }
};

