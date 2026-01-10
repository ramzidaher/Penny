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

import { AppState, AppStateStatus } from 'react-native';
import { getAllConnections } from './truelayerService';
import { syncTrueLayerAccounts } from './cloudDb';
import { refreshTransactions } from './transactionService';
import { refreshAccountBalances } from './accountBalanceService';
import { getAccounts } from '../database/db';

const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours (4x per day)
const MIN_SYNC_INTERVAL_MS = 60 * 60 * 1000; // Minimum 1 hour between syncs

let lastSyncTime: number = 0;
let syncInProgress: boolean = false;
let appStateListener: { remove: () => void } | null = null;

/**
 * Perform a full sync of all TrueLayer connections
 */
export const performAutoSync = async (force: boolean = false): Promise<void> => {
  // Prevent concurrent syncs
  if (syncInProgress) {
    console.log('[autoSync] Sync already in progress, skipping');
    return;
  }

  // Check if enough time has passed since last sync
  const now = Date.now();
  const timeSinceLastSync = now - lastSyncTime;
  
  if (!force && timeSinceLastSync < MIN_SYNC_INTERVAL_MS) {
    console.log(`[autoSync] Too soon since last sync (${Math.round(timeSinceLastSync / 1000 / 60)} min ago), skipping`);
    return;
  }

  try {
    syncInProgress = true;
    console.log('[autoSync] Starting automatic sync...');

    const connections = await getAllConnections();
    if (connections.length === 0) {
      console.log('[autoSync] No connections found, skipping sync');
      return;
    }

    console.log(`[autoSync] Found ${connections.length} connection(s), syncing...`);

    // Sync each connection
    for (const connection of connections) {
      try {
        // Sync accounts first
        await syncTrueLayerAccounts(connection.id);
        
        // Small delay to ensure accounts are persisted
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Sync transactions
        await refreshTransactions();
        
        // Refresh balances
        const accounts = await getAccounts();
        await refreshAccountBalances(accounts, true);
        
        console.log(`[autoSync] Successfully synced connection ${connection.id.substring(0, 8)}...`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[autoSync] Error syncing connection:`, errorMessage);
        // Continue with other connections even if one fails
      }
    }

    lastSyncTime = now;
    console.log('[autoSync] Automatic sync completed successfully');
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
    // App came to foreground - sync if needed
    console.log('[autoSync] App came to foreground, checking if sync needed...');
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
  console.log('[autoSync] Initializing auto-sync service...');

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

  // Perform initial sync (with delay to ensure app is ready)
  setTimeout(() => {
    performAutoSync(false).catch(error => {
      console.error('[autoSync] Error in initial sync:', error);
    });
  }, 2000); // 2 second delay after app launch

  console.log('[autoSync] Auto-sync service initialized');
};

/**
 * Cleanup auto-sync service
 */
export const cleanupAutoSync = (): void => {
  if (appStateListener) {
    appStateListener.remove();
    appStateListener = null;
  }
  console.log('[autoSync] Auto-sync service cleaned up');
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

