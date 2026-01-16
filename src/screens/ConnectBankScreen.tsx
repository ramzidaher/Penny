import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNavigation } from '../utils/navigation';
import { useDialog } from '../contexts/DialogContext';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { useToast } from '../contexts/ToastContext';
import {
  openAuthUrl,
  exchangeCodeForTokens,
  getAllConnections,
  clearTokens,
  getAccounts as getTrueLayerAccounts,
  getAccountBalance,
} from '../services/truelayerService';
import { TrueLayerConnection } from '../types/truelayer';
import { syncTrueLayerAccounts } from '../database/db';
import { refreshTransactions } from '../services/transactionService';
import { formatDistanceToNow } from 'date-fns';
import { setOAuthFlowActive } from '../services/oAuthFlowService';

// Module-level tracking to persist across component mounts/unmounts
// Use Map with timestamps to auto-expire old entries (prevent stale codes from blocking new ones)
const processedCodesGlobal = new Map<string, number>();
const CODE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes - codes should be processed quickly
const processingGlobal = { current: false };

// Clean up expired codes periodically
const cleanupExpiredCodes = () => {
  const now = Date.now();
  for (const [code, timestamp] of processedCodesGlobal.entries()) {
    if (now - timestamp > CODE_EXPIRY_MS) {
      processedCodesGlobal.delete(code);
    }
  }
};

export default function ConnectBankScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const dialog = useDialog();
  const { code, state, error } = useLocalSearchParams<{ code?: string; state?: string; error?: string }>();
  const [connections, setConnections] = useState<TrueLayerConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const processingRef = useRef(false);
  const { showSuccess, showError } = useToast();

  useEffect(() => {
    console.log('[ConnectBankScreen] Component mounted, loading connections');
    loadConnections();
  }, []);

  useEffect(() => {
    // Handle OAuth callback from deep link (mobile)
    // On Android, the app may reload when returning from OAuth, so WebBrowser.openAuthSessionAsync
    // might not return. In this case, we process the deep link callback immediately.
    // On iOS, WebBrowser should return, but we handle deep link as fallback.
    
    console.log('[ConnectBankScreen] OAuth callback effect triggered', {
      hasCode: !!code,
      hasError: !!error,
      hasState: !!state,
      codeLength: code?.length,
      errorValue: error,
      processingRef: processingRef.current,
      processingGlobal: processingGlobal.current,
      connecting,
      processedCodesCount: processedCodesGlobal.size,
    });
    
    if (error) {
      // Only show error if we haven't processed it already
      const errorKey = `error_${error}`;
      cleanupExpiredCodes(); // Clean up before checking
      if (!processedCodesGlobal.has(errorKey)) {
        processedCodesGlobal.set(errorKey, Date.now());
        showError(`Connection failed: ${error}`);
        // Clear OAuth flow flag on error
        setTimeout(() => {
          setOAuthFlowActive(false);
        }, 1000);
      }
      return;
    }

    if (code) {
      console.log('[ConnectBankScreen] OAuth code received:', {
        codePrefix: code.substring(0, 20) + '...',
        codeLength: code.length,
        state,
        processingRef: processingRef.current,
        processingGlobal: processingGlobal.current,
        connecting,
      });
      
      // EARLY CHECK: If we already have connections, the code was likely already processed successfully
      // Check this BEFORE attempting to process to prevent infinite loops
      if (connections.length > 0) {
        console.log('[ConnectBankScreen] Connections already exist - code was likely already processed, navigating away', {
          connectionCount: connections.length,
        });
        // Use replace to prevent going back to this screen with the code param
        router.replace('/(tabs)/finance/accounts' as any);
        return;
      }
      
      // Also check asynchronously in case connections haven't loaded yet
      (async () => {
        try {
          const existingConnections = await getAllConnections();
          if (existingConnections.length > 0) {
            console.log('[ConnectBankScreen] Connections exist (async check) - code was already processed, navigating away', {
              connectionCount: existingConnections.length,
            });
            await loadConnections();
            // Use replace to prevent going back to this screen with the code param
            router.replace('/(tabs)/finance/accounts' as any);
          }
        } catch (checkError) {
          // Ignore errors - continue with normal processing
        }
      })();
      
      // Clean up expired codes first
      const beforeCleanup = processedCodesGlobal.size;
      cleanupExpiredCodes();
      const afterCleanup = processedCodesGlobal.size;
      if (beforeCleanup !== afterCleanup) {
        console.log(`[ConnectBankScreen] Cleaned up ${beforeCleanup - afterCleanup} expired codes`);
      }
      
      // Check if we've already processed this code (global check)
      // Only reject if it was processed recently (within expiry window)
      const processedTime = processedCodesGlobal.get(code);
      const now = Date.now();
      if (processedTime) {
        const age = now - processedTime;
        console.log('[ConnectBankScreen] Code check:', {
          wasProcessed: true,
          processedAge: age,
          expiryWindow: CODE_EXPIRY_MS,
          isExpired: age >= CODE_EXPIRY_MS,
        });
      } else {
        console.log('[ConnectBankScreen] Code check: Not processed before');
      }
      
      if (processedTime && (now - processedTime) < CODE_EXPIRY_MS) {
        console.log('[ConnectBankScreen] Code already processed recently, checking if connection exists', {
          processedAge: now - processedTime,
          expiryWindow: CODE_EXPIRY_MS,
        });
        
        // First check synchronously if we have connections in state
        // If we do, this means it was successfully processed - just navigate away
        if (connections.length > 0) {
          console.log('[ConnectBankScreen] Code was processed and connections exist in state - skipping reprocessing', {
            connectionCount: connections.length,
          });
          // Use replace to prevent going back to this screen with the code param
          router.replace('/(tabs)/finance/accounts' as any);
          return;
        }
        
        // If no connections in state, check asynchronously (might not be loaded yet)
        // If connections exist, skip processing. Otherwise, allow reprocessing.
        (async () => {
          try {
            const existingConnections = await getAllConnections();
            if (existingConnections.length > 0) {
              console.log('[ConnectBankScreen] Code was processed and connection exists - skipping reprocessing', {
                connectionCount: existingConnections.length,
              });
              // Reload connections state and navigate
              await loadConnections();
              // Use replace to prevent going back to this screen with the code param
              router.replace('/(tabs)/finance/accounts' as any);
            } else {
              // Code was processed but no connections found - might be a failed attempt
              // Allow reprocessing by removing from processed codes
              console.log('[ConnectBankScreen] Code was processed but no connections found - allowing reprocessing');
              processedCodesGlobal.delete(code);
            }
          } catch (checkError) {
            console.error('[ConnectBankScreen] Error checking existing connections:', checkError);
            // On error, allow reprocessing
            processedCodesGlobal.delete(code);
          }
        })();
        
        // Return early to prevent immediate reprocessing
        // The async check will either navigate away or allow reprocessing by deleting the code
        return;
      }
      
      // If code exists but is expired, remove it and allow processing
      if (processedTime && (now - processedTime) >= CODE_EXPIRY_MS) {
        console.log('[ConnectBankScreen] Code was processed but expired, allowing reprocessing', {
          processedAge: now - processedTime,
        });
        processedCodesGlobal.delete(code);
      }

      // On Android, if the app reloaded, processing flags will be reset
      // So if flags are NOT set, it means the app reloaded and we should process immediately
      // If flags ARE set, WebBrowser might still return, so wait a short time
      const processCallback = () => {
        // Reset processing flags if they're still set (WebBrowser didn't return)
        if (processingRef.current || processingGlobal.current) {
          console.log('[ConnectBankScreen] WebBrowser did not return, processing deep link callback');
          processingRef.current = false;
          processingGlobal.current = false;
          setConnecting(false);
        }
        
        // Process the callback from deep link (fallback scenario) with state parameter
        // Pass forceProcess=true to allow processing even if flags are set
        // Don't mark code as processed here - let handleOAuthCallback do it after success
        console.log('[ConnectBankScreen] Processing OAuth callback from deep link');
        handleOAuthCallback(code, state, true);
      };

      // On Android, if processing flags are NOT set, the app likely reloaded
      // Process immediately without waiting for WebBrowser
      if (Platform.OS === 'android' && !processingRef.current && !processingGlobal.current && !connecting) {
        console.log('[ConnectBankScreen] Android: App reloaded, processing deep link callback immediately', {
          codePrefix: code.substring(0, 20) + '...',
          state,
        });
        // Don't mark code as processed here - let handleOAuthCallback do it after success
        console.log('[ConnectBankScreen] Calling handleOAuthCallback with forceProcess=true');
        handleOAuthCallback(code, state, true);
        return;
      }

      // If processing flags are set, wait a bit for WebBrowser to return
      // On iOS, WebBrowser should return quickly
      // On Android, if flags are set, WebBrowser might still return (app didn't reload)
      if (processingRef.current || processingGlobal.current || connecting) {
        // On Android, use shorter delay since WebBrowser should return quickly if app didn't reload
        // On iOS, also use short delay
        const delay = Platform.OS === 'android' ? 200 : 300;
        console.log(`[ConnectBankScreen] Waiting ${delay}ms for WebBrowser to return, will process deep link if it doesn't...`, {
          processingRef: processingRef.current,
          processingGlobal: processingGlobal.current,
          connecting,
        });
        const timeout = setTimeout(() => {
          console.log('[ConnectBankScreen] Timeout reached, executing processCallback');
          processCallback();
        }, delay);
        return () => {
          console.log('[ConnectBankScreen] Cleaning up timeout');
          clearTimeout(timeout);
        };
      } else {
        // No processing flags set (iOS case or direct navigation)
        console.log('[ConnectBankScreen] No processing flags set, processing deep link callback immediately', {
          codePrefix: code.substring(0, 20) + '...',
          state,
        });
        // Don't mark code as processed here - let handleOAuthCallback do it after success
        console.log('[ConnectBankScreen] Calling handleOAuthCallback with forceProcess=false');
        handleOAuthCallback(code, state, false);
      }
    }
  }, [code, error, connecting, state]);

  const loadConnections = async () => {
    try {
      setLoading(true);
      const conns = await getAllConnections();
      setConnections(conns);
    } catch (error) {
      console.error('Error loading connections:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      // Mark OAuth flow as active FIRST to prevent any reloads or navigation interference
      setOAuthFlowActive(true);
      console.log('[ConnectBankScreen] OAuth flow started, marking as active');
      
      setConnecting(true);
      processingRef.current = true;
      processingGlobal.current = true;
      
      // On iOS, openAuthUrl uses system browser and returns null
      // On Android, it uses WebBrowser and returns a result
      // Note: On Android, opening WebBrowser may cause app to reload in development mode
      // The deep link handler will process the callback when user returns
      console.log('[ConnectBankScreen] Opening OAuth URL...');
      const result = await openAuthUrl();
      console.log('[ConnectBankScreen] OAuth URL opened, result:', result ? 'received' : 'null (will use deep link)');
      
      if (result === null) {
        // On iOS, system browser was opened
        // The deep link handler will process the callback when user returns to app
        console.log('[ConnectBankScreen] Opened system browser (iOS), waiting for deep link callback...');
        // Keep connecting state true and OAuth flow active
        // Don't reset processing flags - let deep link handler process it
        // The deep link handler will reset these when it processes the callback
        return;
      }
      
      // Android path: WebBrowser returned a result
      // Keep connecting state true until callback is processed or error occurs
      
      if (result?.error) {
        // Reset connecting state on error
        setConnecting(false);
        processingRef.current = false;
        processingGlobal.current = false;
        // Clear OAuth flow flag on error
        setOAuthFlowActive(false);
        if (result.error !== 'Authentication cancelled by user' && result.error !== 'Authentication dismissed') {
          showError(`Connection failed: ${result.error}`);
        }
        return;
      }
      
      if (result?.code) {
        console.log('[ConnectBankScreen] WebBrowser returned code', {
          codePrefix: result.code.substring(0, 20) + '...',
          codeLength: result.code.length,
          state: result.state,
        });
        
        // Check if we've already processed this code (shouldn't happen, but safety check)
        cleanupExpiredCodes();
        const processedTime = processedCodesGlobal.get(result.code);
        if (processedTime && (Date.now() - processedTime) < CODE_EXPIRY_MS) {
          console.log('[ConnectBankScreen] Code already processed via WebBrowser, ignoring', {
            processedAge: Date.now() - processedTime,
          });
          setConnecting(false);
          processingRef.current = false;
          processingGlobal.current = false;
          setOAuthFlowActive(false);
          return;
        }
        
        // CRITICAL: Clear processing flags BEFORE calling handleOAuthCallback
        // The flags were set when handleConnect was called, but now WebBrowser has returned
        // We need to clear them so handleOAuthCallback can process the code
        console.log('[ConnectBankScreen] Clearing processing flags before handling WebBrowser result');
        processingRef.current = false;
        processingGlobal.current = false;
        setConnecting(false);
        
        // DON'T mark as processed yet - let handleOAuthCallback mark it after successful processing
        // This prevents the code from being rejected if component remounts before processing completes
        console.log('[ConnectBankScreen] Calling handleOAuthCallback from WebBrowser result');
        
        // Process the OAuth callback directly with state parameter
        // handleOAuthCallback will set the flags and mark as processed after success
        await handleOAuthCallback(result.code, result.state);
      } else {
        // No code and no error - unexpected result, reset state
        setConnecting(false);
        processingRef.current = false;
        processingGlobal.current = false;
        setOAuthFlowActive(false);
      }
    } catch (error: any) {
      console.error('Error opening auth URL:', error);
      setConnecting(false);
      processingRef.current = false;
      processingGlobal.current = false;
      // Clear OAuth flow flag on error
      setOAuthFlowActive(false);
      showError(error.message || 'Failed to open TrueLayer authentication');
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      // Reset processing flags on unmount to prevent blocking
      processingRef.current = false;
      processingGlobal.current = false;
      // Clear OAuth flow flag if component unmounts during OAuth (shouldn't happen, but safety)
      // Note: We don't clear it here if connecting is true, as the callback might still be processing
      // The finally block in handleOAuthCallback will clear it
    };
  }, []);

  const handleOAuthCallback = async (code: string, state?: string, forceProcess: boolean = false) => {
    console.log('[ConnectBankScreen] handleOAuthCallback called', {
      codePrefix: code.substring(0, 20) + '...',
      codeLength: code.length,
      state,
      forceProcess,
      processingRef: processingRef.current,
      processingGlobal: processingGlobal.current,
      connecting,
    });
    
    // Prevent duplicate processing (check both local and global)
    // But allow processing if forceProcess is true (deep link callback on iOS production)
    if ((processingRef.current || processingGlobal.current) && !forceProcess) {
      console.log('[ConnectBankScreen] OAuth callback already being processed, ignoring duplicate');
      return;
    }
    
    // If processing flags are set but we're forcing processing (deep link callback), reset them
    // This handles the case where WebBrowser.openAuthSessionAsync() hung on iOS production
    if ((processingRef.current || processingGlobal.current) && forceProcess) {
      console.log('[ConnectBankScreen] Processing deep link callback, resetting flags');
      processingRef.current = false;
      processingGlobal.current = false;
      setConnecting(false);
    }

    try {
      console.log('[ConnectBankScreen] Starting OAuth callback processing', {
        codePrefix: code.substring(0, 20) + '...',
        state,
        forceProcess,
      });
      
      processingRef.current = true;
      processingGlobal.current = true;
      setConnecting(true);
      
      console.log('[ConnectBankScreen] Calling exchangeCodeForTokens...');
      const { connectionId } = await exchangeCodeForTokens(code, undefined, state);
      console.log('[ConnectBankScreen] exchangeCodeForTokens succeeded', { connectionId });
      
      // Mark code as processed ONLY after successful token exchange
      // This prevents duplicate processing if component remounts
      processedCodesGlobal.set(code, Date.now());
      console.log('[ConnectBankScreen] Code marked as processed after successful token exchange');

      // Sync accounts first
      console.log('[ConnectBankScreen] Syncing accounts...');
      try {
        await syncTrueLayerAccounts(connectionId);
        console.log('[ConnectBankScreen] Accounts synced successfully');
      } catch (syncError: any) {
        console.error('[ConnectBankScreen] Error syncing accounts:', syncError);
        // Still show success but log the error - accounts might have been partially synced
        const errorMessage = syncError?.message || 'Account sync had issues, but connection was established';
        console.warn('[ConnectBankScreen]', errorMessage);
      }

      // Removed unnecessary delay - Firestore writes are synchronous from our perspective
      // The 500ms delay was not needed and slowed down the connection process

      // Reload connections immediately
      await loadConnections();

      // Navigate immediately - don't wait for transactions
      // Use replace to prevent going back to this screen with the code param
      router.replace('/(tabs)/finance/accounts' as any);
      showSuccess('Bank account connected successfully!');

      // Fetch transactions in background (non-blocking)
      // This allows user to see accounts immediately while transactions load
      console.log('[ConnectBankScreen] Fetching transactions in background...');
      refreshTransactions()
        .then(() => {
          console.log('[ConnectBankScreen] Background transaction fetch completed');
        })
        .catch((error) => {
          console.error('[ConnectBankScreen] Background transaction fetch failed (non-critical):', error);
        });
    } catch (error: any) {
      console.error('[ConnectBankScreen] Error handling OAuth callback:', error);
      console.error('[ConnectBankScreen] Error details:', {
        message: error?.message,
        code: error?.code,
        stack: error?.stack?.substring(0, 200),
      });
      
      const errorMessage = error.message || 'Failed to connect bank account';
      
      // Check if error is "code already used" or "invalid state" - this might mean it was successfully processed
      // but the component remounted and tried again
      const isCodeAlreadyUsed = errorMessage.includes('invalid_grant') || 
                                 errorMessage.includes('Invalid grant') || 
                                 errorMessage.includes('authorization code has already been used');
      const isInvalidState = errorMessage.includes('Invalid or expired state') || 
                            errorMessage.includes('invalid state') ||
                            errorMessage.includes('Invalid state parameter');
      
      if (isCodeAlreadyUsed || isInvalidState) {
        console.log('[ConnectBankScreen] Code/state error - checking if connection was successful', {
          errorType: isCodeAlreadyUsed ? 'code_already_used' : 'invalid_state',
        });
        
        // Check if connection was actually created by loading connections directly
        try {
          const existingConnections = await getAllConnections();
          // If we have connections, the code was successfully processed before
          // This happens when component remounts after successful processing
          if (existingConnections.length > 0) {
            console.log('[ConnectBankScreen] Connection already exists - treating as success', {
              connectionCount: existingConnections.length,
              errorType: isCodeAlreadyUsed ? 'code_already_used' : 'invalid_state',
            });
            // Mark code as processed to prevent further attempts
            processedCodesGlobal.set(code, Date.now());
            // Reload connections state
            await loadConnections();
            // Navigate and show success (connection was already established)
            // Use replace to prevent going back to this screen with the code param
            router.replace('/(tabs)/finance/accounts' as any);
            showSuccess('Bank account connected successfully!');
            return;
          }
        } catch (checkError) {
          console.error('[ConnectBankScreen] Error checking existing connections:', checkError);
          // Continue to show error if we can't check
        }
      }
      
      // Remove from processed codes so user can retry (global)
      processedCodesGlobal.delete(code);
      console.log('[ConnectBankScreen] Removed code from processedCodesGlobal to allow retry');
      
      // Show error for actual failures
      if (isCodeAlreadyUsed) {
        showError('This authorization code has already been used. Please try connecting again.');
      } else if (isInvalidState) {
        showError('The authorization session has expired. Please try connecting again.');
      } else {
        showError(errorMessage);
      }
    } finally {
      console.log('[ConnectBankScreen] OAuth callback processing finished, cleaning up');
      setConnecting(false);
      processingRef.current = false;
      processingGlobal.current = false;
      // Clear OAuth flow flag after callback is processed
      // Add a small delay to ensure navigation completes
      setTimeout(() => {
        console.log('[ConnectBankScreen] Clearing OAuth flow flag');
        setOAuthFlowActive(false);
      }, 1000);
    }
  };

  const handleDisconnect = async (connectionId: string) => {
    await dialog.showDialog(
      'Disconnect Account',
      'Are you sure you want to disconnect this account? All linked accounts and their data will be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete all accounts linked to this connection
              const { cloudDeleteAccountsByConnection } = await import('../services/cloudDb');
              await cloudDeleteAccountsByConnection(connectionId);
              
              // Clear tokens
              await clearTokens(connectionId);
              
              // Reload connections
              await loadConnections();
              
              showSuccess('Account disconnected successfully');
            } catch (error: any) {
              console.error('Error disconnecting:', error);
              showError(error.message || 'Failed to disconnect account');
            }
          },
        },
      ]
    );
  };

  const handleSync = async (connectionId: string) => {
    try {
      setRefreshing(true);
      await syncTrueLayerAccounts(connectionId);
      await refreshTransactions();
      await loadConnections();
      showSuccess('Account and transactions synced successfully');
    } catch (error: any) {
      console.error('Error syncing:', error);
      showError(error.message || 'Failed to sync account');
    } finally {
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadConnections();
    setRefreshing(false);
  };

  if (loading && connections.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading connections...</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.content}>
        <Text style={styles.title}>Connect Bank Account</Text>
        <Text style={styles.subtitle}>
          Securely connect your bank account using TrueLayer to automatically sync your accounts and balances.
        </Text>

        {connecting && (
          <View style={styles.connectingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.connectingText}>Connecting...</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.connectButton, connecting && styles.connectButtonDisabled]}
          onPress={handleConnect}
          disabled={connecting}
        >
          <Ionicons name="link" size={24} color={colors.background} />
          <Text style={styles.connectButtonText}>Connect with TrueLayer</Text>
        </TouchableOpacity>

        {connections.length > 0 && (
          <View style={styles.connectionsSection}>
            <Text style={styles.sectionTitle}>Connected Accounts</Text>
            {connections.map((connection) => (
              <View key={connection.id} style={styles.connectionCard}>
                <View style={styles.connectionHeader}>
                  <View style={styles.connectionIcon}>
                    <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                  </View>
                  <View style={styles.connectionInfo}>
                    <Text style={styles.connectionId}>Connection {connection.id.substring(3, 11)}</Text>
                    <Text style={styles.connectionDate}>
                      Connected {formatDistanceToNow(new Date(connection.createdAt), { addSuffix: true })}
                    </Text>
                  </View>
                </View>
                <View style={styles.connectionActions}>
                  <TouchableOpacity
                    style={styles.syncButton}
                    onPress={() => handleSync(connection.id)}
                    disabled={refreshing}
                  >
                    <Ionicons name="refresh" size={18} color={colors.primary} />
                    <Text style={styles.syncButtonText}>Sync</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.disconnectButton}
                    onPress={() => handleDisconnect(connection.id)}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.error} />
                    <Text style={styles.disconnectButtonText}>Disconnect</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {connections.length === 0 && !loading && (
          <View style={styles.emptyContainer}>
            <Ionicons name="wallet-outline" size={64} color={colors.textSecondary} />
            <Text style={styles.emptyText}>No connected accounts</Text>
            <Text style={styles.emptySubtext}>
              Connect your bank account to automatically sync balances and transactions
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 12,
  },
  title: {
    ...typography.h1,
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: 24,
    lineHeight: 20,
  },
  connectingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: 16,
  },
  connectingText: {
    ...typography.body,
    color: colors.text,
    marginLeft: 12,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 12,
    marginBottom: 32,
  },
  connectButtonDisabled: {
    opacity: 0.6,
  },
  connectButtonText: {
    ...typography.body,
    color: colors.background,
    fontWeight: '600',
    marginLeft: 8,
  },
  connectionsSection: {
    marginTop: 8,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: 16,
  },
  connectionCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  connectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  connectionIcon: {
    marginRight: 12,
  },
  connectionInfo: {
    flex: 1,
  },
  connectionId: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
    marginBottom: 4,
  },
  connectionDate: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  connectionActions: {
    flexDirection: 'row',
    gap: 12,
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  syncButtonText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
    marginLeft: 4,
  },
  disconnectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.error,
  },
  disconnectButtonText: {
    ...typography.caption,
    color: colors.error,
    fontWeight: '600',
    marginLeft: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    ...typography.h3,
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
