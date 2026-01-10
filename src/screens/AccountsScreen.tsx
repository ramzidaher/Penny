import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { useNavigation } from '../utils/navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getAccounts, deleteAccount } from '../database/db';
import { syncTrueLayerAccounts } from '../database/db';
import { refreshTransactions } from '../services/transactionService';
import { Account } from '../database/schema';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { SkeletonCard, SkeletonList } from '../components/SkeletonLoader';
import { waitForFirebase } from '../services/firebase';
import { getSettings } from '../services/settingsService';
import { formatCurrencySync } from '../utils/currency';
import CompanyLogo from '../components/CompanyLogo';
import { formatDistanceToNow } from 'date-fns';
import { getAllConnections } from '../services/truelayerService';

export default function AccountsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currencyCode, setCurrencyCode] = useState<string>('USD');
  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);
  const [activeConnectionIds, setActiveConnectionIds] = useState<Set<string>>(new Set());

  const loadAccounts = async () => {
    try {
      setLoading(true);
      await waitForFirebase();
      const [accs, settings, connections] = await Promise.all([
        getAccounts(),
        getSettings(),
        getAllConnections(),
      ]);
      
      console.log(`📋 Loaded ${accs.length} total account(s) from database`);
      
      // Track which connections are active on this device
      const activeIds = new Set(connections.map(conn => conn.id));
      setActiveConnectionIds(activeIds);
      
      setAccounts(accs);
      setCurrencyCode(settings.defaultCurrency);
    } catch (error) {
      console.error('Error loading accounts:', error);
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    const timer = setTimeout(() => {
      loadAccounts();
    }, 100);
    // Use focus listener for Expo Router compatibility
    navigation.addListener('focus', loadAccounts);
    return () => {
      clearTimeout(timer);
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // Sync TrueLayer accounts and transactions if any connections exist
      const connections = await getAllConnections();
      for (const connection of connections) {
        try {
          await syncTrueLayerAccounts(connection.id);
          await refreshTransactions();
        } catch (error) {
          console.error(`Error syncing connection:`, error);
          // Continue with other connections even if one fails
        }
      }
      
      // Refresh account balances (fetches from API for TrueLayer accounts)
      const { refreshAccountBalances } = await import('../services/accountBalanceService');
      const currentAccounts = await getAccounts();
      const refreshedAccounts = await refreshAccountBalances(currentAccounts);
      setAccounts(refreshedAccounts);
    } catch (error) {
      console.error('Error syncing TrueLayer data:', error);
    }
    await loadAccounts();
    setRefreshing(false);
  };

  const handleDelete = async (id: string) => {
    await deleteAccount(id);
    await loadAccounts();
  };

  const handleSyncAccount = async (account: Account) => {
    if (!account.truelayerConnectionId) {
      console.error('Account does not have a connection ID');
      return;
    }

    try {
      setSyncingAccountId(account.id);
      
      // Verify connection exists before attempting sync
      const { getAllConnections } = await import('../services/truelayerService');
      const connections = await getAllConnections();
      const connectionExists = connections.some(conn => conn.id === account.truelayerConnectionId);
      
      if (!connectionExists) {
        // Connection was deleted or doesn't exist
        // Show user-friendly message and suggest reconnecting
        Alert.alert(
          'Connection Not Found',
          `The connection for "${account.name}" is no longer available. Please reconnect this account from the Connect Bank screen.`,
          [{ text: 'OK' }]
        );
        return;
      }
      
      // Sync accounts and transactions for this connection
      await syncTrueLayerAccounts(account.truelayerConnectionId);
      await refreshTransactions();
      
      // Refresh account balances
      const { refreshAccountBalances } = await import('../services/accountBalanceService');
      const currentAccounts = await getAccounts();
      const refreshedAccounts = await refreshAccountBalances(currentAccounts, true);
      setAccounts(refreshedAccounts);
      
      // Reload accounts to get latest data
      await loadAccounts();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error syncing account:', errorMessage);
      
      // Handle "Connection not found" errors gracefully
      if (errorMessage.includes('Connection not found')) {
        Alert.alert(
          'Connection Not Found',
          `The connection for "${account.name}" is no longer available. Please reconnect this account from the Connect Bank screen.`,
          [{ text: 'OK' }]
        );
      } else {
        // For other errors, show generic error message
        Alert.alert(
          'Sync Failed',
          `Failed to sync "${account.name}". Please try again.`,
          [{ text: 'OK' }]
        );
      }
    } finally {
      setSyncingAccountId(null);
    }
  };

  const calculateTotalBalance = () => {
    return accounts.reduce((total, account) => {
      // For card accounts with linked accounts, use the linked account balance
      if (account.type === 'card' && account.linkedAccountId) {
        const linkedAccount = accounts.find(acc => acc.id === account.linkedAccountId);
        return total + (linkedAccount ? linkedAccount.balance : account.balance);
      }
      return total + account.balance;
    }, 0);
  };

  const getAccountIcon = (type: string) => {
    switch (type) {
      case 'bank':
        return 'business';
      case 'card':
        return 'card';
      case 'cash':
        return 'cash';
      case 'investment':
        return 'trending-up';
      default:
        return 'wallet';
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.container}>
        <View style={styles.listContent}>
          <SkeletonList count={5} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={accounts}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View style={styles.headerSection}>
            <View style={styles.quickActionsSection}>
              <Text style={styles.sectionTitle}>Quick Actions</Text>
              <View style={styles.actionsContainer}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => navigation.navigate('ConnectBank' as never)}
                >
                  <View style={styles.actionIconContainer}>
                    <Ionicons name="link" size={22} color={colors.primary} />
                  </View>
                  <View style={styles.actionTextContainer}>
                    <Text style={styles.actionTitle}>Connect Bank</Text>
                    <Text style={styles.actionSubtitle}>Auto-sync with TrueLayer</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => navigation.navigate('AddAccount' as never)}
                >
                  <View style={styles.actionIconContainer}>
                    <Ionicons name="wallet-outline" size={22} color={colors.primary} />
                  </View>
                  <View style={styles.actionTextContainer}>
                    <Text style={styles.actionTitle}>Add Manual</Text>
                    <Text style={styles.actionSubtitle}>Create account manually</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
            {accounts.length > 0 && (
              <View style={styles.summarySection}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Total Balance</Text>
                  <Text style={styles.summaryAmount}>
                    {formatCurrencySync(calculateTotalBalance(), currencyCode)}
                  </Text>
                  <Text style={styles.summaryCount}>
                    {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
                  </Text>
                </View>
              </View>
            )}
            {accounts.length > 0 && (
              <View style={styles.accountsSection}>
                <Text style={styles.sectionTitle}>Your Accounts</Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No accounts yet</Text>
            <Text style={styles.emptySubtext}>Add your first account to get started</Text>
          </View>
        }
        renderItem={({ item }) => {
          // For cards, show logo and PIN, and display linked account balance
          if (item.type === 'card' && item.linkedAccountId) {
            const linkedAccount = accounts.find(acc => acc.id === item.linkedAccountId);
            const displayBalance = linkedAccount ? linkedAccount.balance : item.balance;
            
            return (
              <View style={styles.cardAccountCard}>
                <View style={styles.cardAccountLeft}>
                  {item.cardLogo ? (
                    <CompanyLogo
                      name={item.cardLogo}
                      type="subscription"
                      size={56}
                      fallbackIcon="card"
                    />
                  ) : (
                    <View style={styles.cardIcon}>
                      <Ionicons name="card" size={28} color={colors.background} />
                    </View>
                  )}
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardName}>{item.name}</Text>
                    <Text style={styles.cardPin}>
                      {item.cardPin ? `•••• •••• •••• ${item.cardPin}` : 'Card'}
                    </Text>
                    {linkedAccount && (
                      <Text style={styles.linkedAccountText}>
                        Linked to {linkedAccount.name}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.cardAccountRight}>
                  <Text style={styles.cardBalance}>{formatCurrencySync(displayBalance, currencyCode)}</Text>
                  <TouchableOpacity
                    onPress={() => handleDelete(item.id)}
                    style={styles.deleteButton}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          }
          
          // Regular account display
          return (
            <View style={styles.accountCard}>
              <View style={styles.accountLeft}>
                <View style={styles.accountIcon}>
                  <Ionicons name={getAccountIcon(item.type) as any} size={24} color={colors.background} />
                </View>
                <View style={styles.accountInfo}>
                  <View style={styles.accountNameRow}>
                    <Text style={styles.accountName}>{item.name}</Text>
                    {item.isSynced && (
                      <>
                        {item.truelayerConnectionId && activeConnectionIds.has(item.truelayerConnectionId) ? (
                          <View style={styles.syncBadge}>
                            <Ionicons name="sync" size={12} color={colors.primary} />
                            <Text style={styles.syncBadgeText}>Synced</Text>
                          </View>
                        ) : item.truelayerConnectionId ? (
                          <TouchableOpacity
                            style={styles.reconnectBadge}
                            onPress={() => navigation.navigate('ConnectBank' as never)}
                          >
                            <Ionicons name="refresh" size={12} color={colors.error} />
                            <Text style={styles.reconnectBadgeText}>Reconnect</Text>
                          </TouchableOpacity>
                        ) : (
                          <View style={styles.syncBadge}>
                            <Ionicons name="sync" size={12} color={colors.primary} />
                            <Text style={styles.syncBadgeText}>Synced</Text>
                          </View>
                        )}
                      </>
                    )}
                  </View>
                  <View style={styles.accountMetaRow}>
                    <Text style={styles.accountType}>{item.type}</Text>
                    {item.truelayerAccountType && (
                      <>
                        <Text style={styles.accountTypeSeparator}>•</Text>
                        <Text style={styles.accountType}>{item.truelayerAccountType}</Text>
                      </>
                    )}
                    {item.lastSyncedAt && (
                      <>
                        <Text style={styles.accountTypeSeparator}>•</Text>
                        <Text style={styles.syncTime}>
                          {formatDistanceToNow(new Date(item.lastSyncedAt), { addSuffix: true })}
                        </Text>
                      </>
                    )}
                  </View>
                </View>
              </View>
              <View style={styles.accountRight}>
                <Text style={styles.accountBalance}>
                  {formatCurrencySync(
                    item.balance,
                    item.currency || currencyCode
                  )}
                </Text>
                <View style={styles.accountActions}>
                  {item.isSynced && item.truelayerConnectionId && (
                    <TouchableOpacity
                      onPress={() => handleSyncAccount(item)}
                      style={styles.syncButton}
                      disabled={syncingAccountId === item.id}
                    >
                      {syncingAccountId === item.id ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Ionicons name="refresh" size={18} color={colors.primary} />
                      )}
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => handleDelete(item.id)}
                    style={styles.deleteButton}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        }}
        contentContainerStyle={[styles.listContent, { paddingTop: 8, paddingBottom: 20 }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingHorizontal: 20,
  },
  headerSection: {
    marginBottom: 8,
  },
  quickActionsSection: {
    marginTop: 0,
    marginBottom: 24,
  },
  sectionTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  actionsContainer: {
    // gap: 10, // Not supported in all RN versions
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  actionTextContainer: {
    flex: 1,
  },
  actionTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
    fontSize: 15,
    marginBottom: 2,
  },
  actionSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 12,
  },
  summarySection: {
    marginBottom: 24,
  },
  summaryCard: {
    backgroundColor: colors.primary,
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryLabel: {
    ...typography.caption,
    color: colors.background,
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 8,
    opacity: 0.8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryAmount: {
    ...typography.h2,
    color: colors.background,
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  summaryCount: {
    ...typography.caption,
    color: colors.background,
    fontSize: 13,
    opacity: 0.7,
  },
  accountsSection: {
    marginBottom: 12,
  },
  accountCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 20,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  accountLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  accountIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  accountInfo: {
    flex: 1,
  },
  accountNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  accountName: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
    marginRight: 8,
  },
  accountMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  accountType: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },
  accountTypeSeparator: {
    ...typography.caption,
    color: colors.textSecondary,
    marginHorizontal: 6,
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  syncBadgeText: {
    ...typography.caption,
    color: colors.primary,
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 4,
  },
  reconnectBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: colors.error,
  },
  reconnectBadgeText: {
    ...typography.caption,
    color: colors.error,
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 4,
  },
  syncTime: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
  },
  accountRight: {
    alignItems: 'flex-end',
  },
  accountBalance: {
    ...typography.h3,
    color: colors.text,
    marginBottom: 4,
  },
  loadingBalance: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
    marginBottom: 4,
  },
  accountActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncButton: {
    padding: 4,
    minWidth: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    padding: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    ...typography.h3,
    color: colors.text,
    marginBottom: 8,
  },
  emptySubtext: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  // Card-specific styles
  cardAccountCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 20,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardAccountLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  cardIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  cardInfo: {
    flex: 1,
  },
  cardName: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardPin: {
    ...typography.bodySmall,
    color: colors.text,
    fontFamily: 'monospace',
    letterSpacing: 2,
    marginBottom: 2,
  },
  linkedAccountText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  cardAccountRight: {
    alignItems: 'flex-end',
  },
  cardBalance: {
    ...typography.h3,
    color: colors.text,
    marginBottom: 4,
  },
});

