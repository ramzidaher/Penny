/**
 * Auto Sync Service - Automatic Background Sync
 * 
 * Automatically syncs TrueLayer accounts, transactions, and balances:
 * - On app foreground/launch
 * - Periodically (configurable frequency)
 * - Auto-refreshes expired tokens
 * 
 * Based on Emma's approach:
 * - Free: 1 sync per day
 * - Premium: 4 syncs per day (configurable)
 */

import { AppState, AppStateStatus, Platform } from 'react-native';
import { getAllConnections } from './truelayerService';
import { syncTrueLayerAccounts, syncTrueLayerTransactions } from './cloudDb';
import { refreshTransactions, getTransactions } from './transactionService';
import { refreshAccountBalances } from './accountBalanceService';
import { getAccounts, getDebts } from '../database/db';
import { triggerAutoTaggingInBackground } from './autoTaggingService';
import { findPendingDebtMatches } from './debtReconciliationService';

const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours (4x per day)
const MIN_SYNC_INTERVAL_MS = 60 * 60 * 1000; // Minimum 1 hour between syncs

// Set to true to disable auto-refresh on foreground (useful for development)
// This only disables the foreground sync, not the development build functionality
// The development build will still work - this just prevents automatic syncing when app comes to foreground
// Change to false to re-enable auto-refresh
const DISABLE_FOREGROUND_SYNC = __DEV__ ? true : false;

let lastSyncTime: number = 0;
let syncInProgress: boolean = false;
let appStateListener: { remove: () => void } | null = null;

/**
 * Perform a full sync of all TrueLayer connections
 */
export const performAutoSync = async (force: boolean = false): Promise<void> => {
  // Prevent concurrent syncs
  if (syncInProgress) {
    return;
  }

  // Check if enough time has passed since last sync
  const now = Date.now();
  const timeSinceLastSync = now - lastSyncTime;
  
  if (!force && timeSinceLastSync < MIN_SYNC_INTERVAL_MS) {
    return;
  }

  try {
    syncInProgress = true;

    const connections = await getAllConnections();
    if (connections.length === 0) {
      return;
    }

    // Sync each connection
    for (const connection of connections) {
      try {
        // Sync accounts first
        await syncTrueLayerAccounts(connection.id);
        
        // Small delay to ensure accounts are persisted
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Sync transactions to Firestore so UI (db.getTransactions) sees them
        await syncTrueLayerTransactions(connection.id);
        
        // Warm local cache for any code using transactionService.getTransactions
        await refreshTransactions();
        
        // Refresh balances
        const accounts = await getAccounts();
        await refreshAccountBalances(accounts, true);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        // Check if it's an authentication error (401 or reconnect required)
        const isAuthError = 
          errorMessage.includes('401') ||
          errorMessage.includes('Authentication failed') ||
          errorMessage.includes('reconnect') ||
          errorMessage.includes('Token refresh failed') ||
          errorMessage.includes('Unauthorized');
        
        if (!isAuthError) {
          console.error(`[autoSync] Error syncing connection ${connection.id.substring(0, 8)}...:`, errorMessage);
        }
        // Continue with other connections even if one fails
      }
    }

    // Auto-tagging and debt reconciliation: run once in background (non-blocking) after all connections synced
    getTransactions(false).then(async (transactions) => {
      triggerAutoTaggingInBackground(transactions);
      try {
        const debts = await getDebts();
        await findPendingDebtMatches(transactions, debts);
      } catch {
        // Debt reconciliation is optional; ignore errors
      }
    }).catch(() => {});

    lastSyncTime = now;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[autoSync] Error during automatic sync:', errorMessage);
  } finally {
    syncInProgress = false;
  }
};

/**
 * Handle app state changes (foreground/background)
 */
const handleAppStateChange = (nextAppState: AppStateStatus): void => {
  if (nextAppState === 'active') {
    // App came to foreground - sync if needed (unless disabled)
    if (DISABLE_FOREGROUND_SYNC) {
      console.log('[autoSync] Foreground sync disabled (development mode)');
      return;
    }
    performAutoSync(false).catch(error => {
      console.error('[autoSync] Error syncing on foreground:', error);
    });
  }
};

/**
 * Initialize auto-sync service
 * - Sets up app state listener
 * - Performs initial sync if needed
 */
export const initializeAutoSync = async (): Promise<void> => {
  // Remove existing listener if any
  if (appStateListener) {
    if (Platform.OS === 'web') {
      // Web doesn't support removeEventListener
      window.removeEventListener('focus', appStateListener);
    } else {
      appStateListener.remove();
    }
  }

  // Add app state listener
  appStateListener = AppState.addEventListener('change', handleAppStateChange);

  // Perform initial sync (with delay to ensure app is ready) - only if not disabled
  if (!DISABLE_FOREGROUND_SYNC) {
    setTimeout(() => {
      performAutoSync(false).catch(error => {
        console.error('[autoSync] Error in initial sync:', error);
      });
    }, 2000); // 2 second delay after app launch
  } else {
    console.log('[autoSync] Initial sync disabled (development mode)');
  }
};

/**
 * Cleanup auto-sync service
 */
export const cleanupAutoSync = (): void => {
  if (appStateListener) {
    appStateListener.remove();
    appStateListener = null;
  }
};

/**
 * Force an immediate sync (for manual refresh)
 */
export const forceSync = async (): Promise<void> => {
  await performAutoSync(true);
};

/**
 * Get last sync time
 */
export const getLastSyncTime = (): number => {
  return lastSyncTime;
};

/**
 * Check if sync is in progress
 */
export const isSyncInProgress = (): boolean => {
  return syncInProgress;
};

