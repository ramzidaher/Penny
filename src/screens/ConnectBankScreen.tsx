import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
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
  TrueLayerConnection,
} from '../services/truelayerService';
import { syncTrueLayerAccounts } from '../database/db';
import { refreshTransactions } from '../services/transactionService';
import { formatDistanceToNow } from 'date-fns';
import { setOAuthFlowActive } from '../services/oAuthFlowService';

// Module-level tracking to persist across component mounts/unmounts
const processedCodesGlobal = new Set<string>();
const processingGlobal = { current: false };

export default function ConnectBankScreen() {
  const navigation = useNavigation();
  const dialog = useDialog();
  const { code, state, error } = useLocalSearchParams<{ code?: string; state?: string; error?: string }>();
  const [connections, setConnections] = useState<TrueLayerConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const processingRef = useRef(false);
  const { showSuccess, showError } = useToast();

  useEffect(() => {
    loadConnections();
  }, []);

  useEffect(() => {
    // Handle OAuth callback from deep link (mobile)
    // This is a fallback - WebBrowser should handle it directly
    // On iOS production, WebBrowser might not return properly when OAuth goes through multiple apps
    // So we process deep link callbacks even if processing flags are set (after a short delay)
    
    if (error) {
      // Only show error if we haven't processed it already
      const errorKey = `error_${error}`;
      if (!processedCodesGlobal.has(errorKey)) {
        processedCodesGlobal.add(errorKey);
        showError(`Connection failed: ${error}`);
      }
      return;
    }

    if (code) {
      // Check if we've already processed this code (global check)
      if (processedCodesGlobal.has(code)) {
        console.log('[ConnectBankScreen] Code already processed, ignoring duplicate');
        return;
      }

      // On iOS production, WebBrowser might hang when OAuth goes through multiple apps
      // Give WebBrowser a chance to return (2 seconds), then process the deep link
      // This ensures we process the callback even if WebBrowser.openAuthSessionAsync() doesn't return
      const processCallback = () => {
        // Reset processing flags if they're still set (WebBrowser didn't return)
        if (processingRef.current || processingGlobal.current) {
          console.log('[ConnectBankScreen] WebBrowser did not return, processing deep link callback');
          processingRef.current = false;
          processingGlobal.current = false;
          setConnecting(false);
        }

        // Mark as processed immediately to prevent duplicate processing
        processedCodesGlobal.add(code);
        
        // Process the callback from deep link (fallback scenario) with state parameter
        // Pass forceProcess=true to allow processing even if flags are set (iOS production workaround)
        handleOAuthCallback(code, state, true);
      };

      // If processing flags are set, wait a bit for WebBrowser to return
      // Otherwise, process immediately
      if (processingRef.current || processingGlobal.current || connecting) {
        console.log('[ConnectBankScreen] Waiting for WebBrowser to return, will process deep link if it doesn\'t...');
        const timeout = setTimeout(processCallback, 2000);
        return () => clearTimeout(timeout);
      } else {
        // No processing flags set, process immediately
        processedCodesGlobal.add(code);
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
      // Mark OAuth flow as active to prevent lock screen interference
      setOAuthFlowActive(true);
      
      setConnecting(true);
      processingRef.current = true;
      processingGlobal.current = true;
      
      // On iOS, openAuthUrl uses system browser and returns null
      // On Android, it uses WebBrowser and returns a result
      const result = await openAuthUrl();
      
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
      // Reset connecting state since WebBrowser handled it
      setConnecting(false);
      processingRef.current = false;
      processingGlobal.current = false;
      
      if (result?.error) {
        // Clear OAuth flow flag on error
        setOAuthFlowActive(false);
        if (result.error !== 'Authentication cancelled by user' && result.error !== 'Authentication dismissed') {
          showError(`Connection failed: ${result.error}`);
        }
        return;
      }
      
      if (result?.code) {
        // Check if we've already processed this code (shouldn't happen, but safety check)
        if (processedCodesGlobal.has(result.code)) {
          console.log('[ConnectBankScreen] Code already processed via WebBrowser, ignoring');
          setOAuthFlowActive(false);
          return;
        }
        
        // Mark as processed immediately (global)
        processedCodesGlobal.add(result.code);
        
        // Process the OAuth callback directly with state parameter
        // Don't set connecting to true again - handleOAuthCallback will show its own loading
        await handleOAuthCallback(result.code, result.state);
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
    };
  }, []);

  const handleOAuthCallback = async (code: string, state?: string, forceProcess: boolean = false) => {
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
      processingRef.current = true;
      processingGlobal.current = true;
      setConnecting(true);
      
      const { connectionId } = await exchangeCodeForTokens(code, undefined, state);

      // Sync accounts first
      console.log('[ConnectBankScreen] Syncing accounts...');
      await syncTrueLayerAccounts(connectionId);

      // Reload connections immediately
      await loadConnections();

      // Navigate immediately - don't wait for transactions
      navigation.navigate('Accounts' as never);
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
      console.error('Error handling OAuth callback:', error);
      
      // Remove from processed codes so user can retry (global)
      processedCodesGlobal.delete(code);
      
      // Check for specific error messages
      const errorMessage = error.message || 'Failed to connect bank account';
      if (errorMessage.includes('invalid_grant') || errorMessage.includes('Invalid grant')) {
        showError('This authorization code has already been used. Please try connecting again.');
      } else {
        showError(errorMessage);
      }
    } finally {
      setConnecting(false);
      processingRef.current = false;
      processingGlobal.current = false;
      // Clear OAuth flow flag after callback is processed
      // Add a small delay to ensure navigation completes
      setTimeout(() => {
        setOAuthFlowActive(false);
      }, 1000);
    }
  };

  const handleDisconnect = async (connectionId: string) => {
    await dialog.showDialog(
      'Disconnect Account',
      'Are you sure you want to disconnect this account? You will need to reconnect to sync data again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearTokens(connectionId);
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
