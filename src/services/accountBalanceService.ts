/**
 * Account Balance Service - Secure On-Demand Balance Fetching
 * 
 * Fetches balances for TrueLayer accounts on-demand from API with encrypted caching.
 * Manual accounts use balance from Firestore (user-entered).
 * 
 * Security:
 * - TrueLayer balances: Fetched on-demand, cached locally (encrypted)
 * - Manual accounts: Stored in Firestore (user provided)
 * - No cloud persistence of TrueLayer balance data
 */

import { Account } from '../database/schema';
import { getCachedBalance, clearBalanceCache } from './balanceCache';

/**
 * Enrich accounts with balances
 * - TrueLayer accounts: Fetch from API/cache
 * - Manual accounts: Use balance from Firestore
 */
export const enrichAccountsWithBalances = async (
  accounts: Account[],
  forceRefresh: boolean = false
): Promise<Account[]> => {
  const enrichedAccounts = await Promise.all(
    accounts.map(async (account) => {
      // For TrueLayer synced accounts, fetch balance on-demand
      if (account.isSynced && account.truelayerConnectionId && account.truelayerAccountId) {
        // Verify connection exists before attempting to fetch balance
        const { getAllConnections } = await import('./truelayerService');
        const connections = await getAllConnections();
        const connectionExists = connections.some(conn => conn.id === account.truelayerConnectionId);
        
        if (!connectionExists) {
          console.warn(
            `[accountBalanceService] Connection not found for account, using existing balance`
          );
          // Clear any invalid cache entries
          try {
            await clearBalanceCache(account.truelayerConnectionId, account.truelayerAccountId);
          } catch (clearError) {
            // Ignore cache clear errors
          }
          return account;
        }
        
        try {
          const balanceData = await getCachedBalance(
            account.truelayerConnectionId,
            account.truelayerAccountId,
            forceRefresh
          );
          return {
            ...account,
            balance: balanceData.balance,
            currency: balanceData.currency,
          };
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          
          // Handle "Connection not found" errors gracefully
          // This happens when a connection was deleted but accounts still reference it
          if (errorMessage.includes('Connection not found') || errorMessage.includes('not found')) {
            console.warn(
              `[accountBalanceService] Connection not found for account, using existing balance`
            );
            // Clear the invalid cache entry
            if (account.truelayerConnectionId && account.truelayerAccountId) {
              try {
                await clearBalanceCache(account.truelayerConnectionId, account.truelayerAccountId);
              } catch (clearError) {
                // Ignore cache clear errors
              }
            }
            // Return account with existing balance
            return account;
          }
          
          // For other errors, log and return account with existing balance
          console.error('[accountBalanceService] Error fetching balance:', errorMessage);
          return account;
        }
      }
      
      // For manual accounts, use balance from Firestore
      return account;
    })
  );

  return enrichedAccounts;
};

/**
 * Refresh balances for all TrueLayer accounts
 */
export const refreshAccountBalances = async (accounts: Account[]): Promise<Account[]> => {
  return enrichAccountsWithBalances(accounts, true);
};

