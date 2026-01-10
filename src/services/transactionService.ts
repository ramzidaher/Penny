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
 */
export const getTransactions = async (forceRefresh: boolean = false): Promise<Transaction[]> => {
  const connections = await getAllConnections();
  if (connections.length === 0) {
    console.log('[transactionService] No connections found');
    return [];
  }

  console.log(`[transactionService] Found ${connections.length} connection(s)`);
  
  const accounts = await cloudGetAccounts();
  console.log(`[transactionService] Found ${accounts.length} total account(s)`);
  
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
      console.log(`[transactionService] No accounts found with connectionId, fetching accounts from TrueLayer to match...`);
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
          console.log(`[transactionService] Updated ${connectionAccounts.length} account(s) with connectionId`);
        }
      } catch (error) {
        console.error(`[transactionService] Error fetching TrueLayer accounts for matching:`, error);
      }
    }

    console.log(`[transactionService] Found ${connectionAccounts.length} synced account(s) for connection`);

    for (const account of connectionAccounts) {
      if (!account.truelayerAccountId) {
        console.warn('[transactionService] Account missing truelayerAccountId, skipping');
        continue;
      }

      try {
        console.log(`[transactionService] Fetching transactions for account (forceRefresh=${forceRefresh})`);
        const transactions = await getCachedTransactions(
          connection.id,
          account.truelayerAccountId,
          account.id,
          forceRefresh
        );
        console.log(`[transactionService] Fetched ${transactions.length} transactions for account`);
        allTransactions.push(...transactions);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[transactionService] Error fetching cached transactions:`, errorMessage);
      }
    }
  }

  console.log(`[transactionService] Returning ${allTransactions.length} total transactions`);
  
  // Sort by date (newest first)
  return allTransactions.sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });
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

