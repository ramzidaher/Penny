import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useNavigation } from '../utils/navigation';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
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
import { formatDistanceToNow } from 'date-fns';

export default function ConnectBankScreen() {
  const navigation = useNavigation();
  const { code, error } = useLocalSearchParams<{ code?: string; error?: string }>();
  const [connections, setConnections] = useState<TrueLayerConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadConnections();
  }, []);

  useEffect(() => {
    // Handle OAuth callback from deep link (mobile)
    // This is a fallback - WebBrowser should handle it directly
    // Only process if we're not already processing a WebBrowser result

    // Only process if we're not currently connecting via WebBrowser
    if (connecting) {
      return; // WebBrowser is handling it, ignore deep link
    }

    if (error) {
      Alert.alert('Connection Failed', `Error: ${error}`);
      return;
    }

    if (code) {
      // Process the callback from deep link (fallback scenario)
      handleOAuthCallback(code);
    }
  }, [code, error, connecting]);

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
      setConnecting(true);
      // On mobile, WebBrowser will handle the OAuth flow
      // It returns the result directly with the code
      const result = await openAuthUrl();
      
      // Always reset connecting state when WebBrowser returns
      setConnecting(false);
      
      if (result?.error) {
        if (result.error !== 'Authentication cancelled by user' && result.error !== 'Authentication dismissed') {
          Alert.alert('Connection Failed', result.error);
        }
        return;
      }
      
      if (result?.code) {
        // Process the OAuth callback directly
        // Don't set connecting to true again - handleOAuthCallback will show its own loading
        await handleOAuthCallback(result.code);
      }
      // If no result, it means we're using Linking fallback and deep link handler will process it
    } catch (error: any) {
      console.error('Error opening auth URL:', error);
      setConnecting(false);
      Alert.alert('Error', error.message || 'Failed to open TrueLayer authentication');
    }
  };

  const handleOAuthCallback = async (code: string) => {
    try {
      setConnecting(true);
      const { connectionId } = await exchangeCodeForTokens(code);

      // Immediately sync accounts
      await syncTrueLayerAccounts(connectionId);

      // Reload connections
      await loadConnections();

      Alert.alert('Success', 'Bank account connected successfully!');
    } catch (error: any) {
      console.error('Error handling OAuth callback:', error);
      Alert.alert('Connection Failed', error.message || 'Failed to connect bank account');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (connectionId: string) => {
    Alert.alert(
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
              Alert.alert('Success', 'Account disconnected successfully');
            } catch (error: any) {
              console.error('Error disconnecting:', error);
              Alert.alert('Error', error.message || 'Failed to disconnect account');
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
      await loadConnections();
      Alert.alert('Success', 'Account synced successfully');
    } catch (error: any) {
      console.error('Error syncing:', error);
      Alert.alert('Sync Failed', error.message || 'Failed to sync account');
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
