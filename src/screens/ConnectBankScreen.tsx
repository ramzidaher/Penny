import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
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
  fetchAndStoreProviderName,
} from '../services/truelayerService';
import { TrueLayerConnection } from '../types/truelayer';
import { setOAuthFlowActive } from '../services/oAuthFlowService';
import { syncTrueLayerAccounts } from '../database/db';

export default function ConnectBankScreen() {
  const navigation = useNavigation();
  const dialog = useDialog();
  const router = useRouter();
  const { code, state, error } = useLocalSearchParams<{ code?: string; state?: string; error?: string }>();
  const [connections, setConnections] = useState<TrueLayerConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { showSuccess, showError } = useToast();
  const processedCodeRef = useRef<string | null>(null);

  // Load connections on mount
  useEffect(() => {
    loadConnections();
  }, []);

  // Handle OAuth callback
  useEffect(() => {
    // Prevent re-processing the same code if the screen re-renders or the user navigates back to this route.
    if (code && !connecting && processedCodeRef.current !== code) {
      processedCodeRef.current = code;
      handleOAuthCallback(code, state);
    }
    if (error) {
        showError(`Connection failed: ${error}`);
          setConnecting(false);
          // Clear params so we don't keep re-showing this error on re-render.
          requestAnimationFrame(() => {
            router.replace('/connect-bank' as any);
          });
        }
  }, [code, error, connecting, router, state]);

  const loadConnections = async () => {
    try {
      setLoading(true);
      const conns = await getAllConnections();
      // Defensive: de-dupe by connection id (should already be unique, but prevents weird UI states).
      const unique = new Map<string, TrueLayerConnection>();
      for (const c of conns) {
        if (c?.id) unique.set(c.id, c);
      }
      setConnections(Array.from(unique.values()));
    } catch (error) {
      console.error('Error loading connections:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      // Ensure RootLayout doesn't lock/unmount navigation while the user is in the bank/OAuth flow.
      // (On iOS this is especially important because we leave the app via Safari.)
      setOAuthFlowActive(true);
      setConnecting(true);
      const result = await openAuthUrl();
      
      if (result?.error) {
        showError(`Connection failed: ${result.error}`);
        setConnecting(false);
        setOAuthFlowActive(false);
        return;
      }
      
      if (result?.code) {
        // WebBrowser returned code directly (Android)
        await handleOAuthCallback(result.code, result.state);
      }
      // On iOS, deep link will handle the callback
    } catch (error: any) {
      console.error('Error opening auth URL:', error);
      showError(error.message || 'Failed to open TrueLayer authentication');
      setConnecting(false);
      setOAuthFlowActive(false);
    }
  };

  const handleOAuthCallback = async (code: string, state?: string) => {
    try {
      // Callback processing is part of the OAuth flow; keep the app in "OAuth active" mode
      // until we're fully done exchanging + storing.
      setOAuthFlowActive(true);
      setConnecting(true);
      
      // Exchange code for tokens
      const { connectionId } = await exchangeCodeForTokens(code, undefined, state);
      
      // Fetch and store provider name
      await fetchAndStoreProviderName(connectionId);

      // Immediately sync accounts for this connection so Accounts screen reflects the new bank right away.
      // This is especially important on Android where users expect to see the newly connected accounts instantly.
      await syncTrueLayerAccounts(connectionId);
      
      // Reload connections
      await loadConnections();
      
      showSuccess('Bank connected successfully!');
      
      // Don't navigate automatically - let user see the new connection
      // They can navigate back manually
      setConnecting(false);
      setOAuthFlowActive(false);
      // Clear the OAuth params so the callback is not re-processed if the user revisits this route.
      requestAnimationFrame(() => {
        router.replace('/connect-bank' as any);
      });
    } catch (error: any) {
      console.error('Error handling OAuth callback:', error);
      showError(error.message || 'Failed to connect bank');
      setConnecting(false);
      setOAuthFlowActive(false);
      // Clear the OAuth params to avoid retry loops (e.g., "code already used").
      requestAnimationFrame(() => {
        router.replace('/connect-bank' as any);
      });
    }
  };

  const handleDisconnect = async (connectionId: string) => {
    try {
      await clearTokens(connectionId);
      await loadConnections();
      showSuccess('Bank disconnected');
    } catch (error: any) {
      console.error('Error disconnecting:', error);
      showError(error.message || 'Failed to disconnect bank');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadConnections();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {!!code && connecting && (
        <View style={styles.finalizingBanner}>
          <ActivityIndicator color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.finalizingTitle}>Finalizing connection…</Text>
            <Text style={styles.finalizingSubtitle}>This can take a few seconds. Please keep the app open.</Text>
          </View>
        </View>
      )}
      <View style={styles.header}>
        <Text style={styles.title}>Connected Banks</Text>
        <TouchableOpacity
          style={[styles.connectButton, connecting && styles.connectButtonDisabled]}
          onPress={handleConnect}
          disabled={connecting}
        >
          {connecting ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <>
              <Ionicons name="add-circle-outline" size={20} color={colors.background} />
              <Text style={styles.connectButtonText}>Connect Bank</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {loading && connections.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : connections.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No banks connected</Text>
          <Text style={styles.emptySubtext}>Tap "Connect Bank" to get started</Text>
        </View>
      ) : (
        <View style={styles.connectionsList}>
            {connections.map((connection) => (
              <View key={connection.id} style={styles.connectionCard}>
                  <View style={styles.connectionInfo}>
                <Text style={styles.connectionName}>
                  {connection.providerName || 'Unknown Provider'}
                </Text>
                <Text style={styles.connectionId}>
                  {connection.id ? `Connection • ${connection.id.substring(3, 11)}` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.disconnectButton}
                    onPress={() => handleDisconnect(connection.id)}
                  >
                <Ionicons name="trash-outline" size={20} color={colors.error} />
                  </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  finalizingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    margin: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  finalizingTitle: {
    ...typography.body,
    fontWeight: '700',
    marginBottom: 2,
  },
  finalizingSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    ...typography.h1,
    marginBottom: 16,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  connectButtonDisabled: {
    opacity: 0.6,
  },
  connectButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    ...typography.h2,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  connectionsList: {
    padding: 20,
  },
  connectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  connectionInfo: {
    flex: 1,
  },
  connectionName: {
    ...typography.h3,
    marginBottom: 4,
  },
  connectionId: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  disconnectButton: {
    padding: 8,
  },
});
