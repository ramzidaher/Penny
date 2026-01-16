import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useNavigation } from '../utils/navigation';
import { useDialog } from '../contexts/DialogContext';
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
import { convertCurrency } from '../services/currencyConversionService';

// Helper function to format TrueLayer account types for display
const formatAccountType = (accountType?: string): string => {
  if (!accountType) return '';
  
  // Convert common TrueLayer account types to readable format
  const typeMap: Record<string, string> = {
    'SAVINGS': 'Savings',
    'CURRENT_ACCOUNT': 'Current',
    'CURRENT': 'Current',
    'CHECKING': 'Checking',
    'CHECKING_ACCOUNT': 'Checking',
    'CREDIT_CARD': 'Credit Card',
    'CREDIT': 'Credit Card',
    'PREPAID': 'Prepaid',
    'PREPAID_CARD': 'Prepaid',
    'BUSINESS': 'Business',
    'BUSINESS_ACCOUNT': 'Business',
    'INVESTMENT': 'Investment',
    'LOAN': 'Loan',
    'MORTGAGE': 'Mortgage',
    'TRANSACTION': 'Transaction',
    'TRANSACTION_ACCOUNT': 'Transaction',
  };
  
  const upperType = accountType.toUpperCase();
  return typeMap[upperType] || accountType.split('_').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
};

export default function AccountsScreen() {
  const navigation = useNavigation();
  const dialog = useDialog();
  const insets = useSafeAreaInsets();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currencyCode, setCurrencyCode] = useState<string>('USD');
  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);
  const [activeConnectionIds, setActiveConnectionIds] = useState<Set<string>>(new Set());
  const [showConvertedAmounts, setShowConvertedAmounts] = useState<boolean>(false);
  const [convertedBalances, setConvertedBalances] = useState<Map<string, number>>(new Map());

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
      const defaultCurrency = settings.defaultCurrency || 'USD';
      setCurrencyCode(defaultCurrency);
      
      // Pre-convert all account balances if conversion is enabled
      if (showConvertedAmounts && defaultCurrency) {
        await convertAllBalances(accs, defaultCurrency);
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const convertAllBalances = async (accs: Account[], targetCurrency: string) => {
    // Don't convert if target currency is not set
    if (!targetCurrency) {
      console.warn('[AccountsScreen] Target currency not set, skipping conversion');
      return;
    }
    
    try {
      const conversions = new Map<string, number>();
      await Promise.all(
        accs.map(async (account) => {
          const accountCurrency = account.currency || currencyCode || 'USD';
          if (accountCurrency !== targetCurrency) {
            const converted = await convertCurrency(account.balance, accountCurrency, targetCurrency);
            conversions.set(account.id, converted);
          } else {
            conversions.set(account.id, account.balance);
          }
        })
      );
      setConvertedBalances(conversions);
    } catch (error) {
      console.error('Error converting balances:', error);
    }
  };


  useEffect(() => {
    const timer = setTimeout(() => {
      loadAccounts();
    }, 100);
    // Use focus listener for Expo Router compatibility
    // Disable auto-refresh on focus in development mode to prevent constant reloading
    // when switching between apps (keeps dev build functionality but prevents auto-refresh)
    const focusListener = navigation.addListener('focus', () => {
      if (__DEV__) {
        // In development, only load accounts on initial mount, not on every focus
        // This prevents auto-refresh when switching between apps
        console.log('[AccountsScreen] Focus detected, but auto-refresh disabled in dev mode');
        return;
      }
      loadAccounts();
    });
    return () => {
      clearTimeout(timer);
      // Cleanup: remove the focus listener
      if (typeof focusListener === 'function') {
        focusListener();
      }
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
        dialog.alert(
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
        dialog.alert(
          'Connection Not Found',
          `The connection for "${account.name}" is no longer available. Please reconnect this account from the Connect Bank screen.`,
          [{ text: 'OK' }]
        );
      } else {
        // For other errors, show generic error message
        dialog.alert(
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
              <>
                <View style={styles.convertSection}>
                  <TouchableOpacity
                    style={styles.convertButton}
                    onPress={async () => {
                      const newState = !showConvertedAmounts;
                      setShowConvertedAmounts(newState);
                      if (newState && currencyCode) {
                        await convertAllBalances(accounts, currencyCode);
                      } else {
                        setConvertedBalances(new Map());
                      }
                    }}
                  >
                    <Ionicons 
                      name={showConvertedAmounts ? "checkmark-circle" : "swap-horizontal"} 
                      size={18} 
                      color={showConvertedAmounts ? colors.primary : colors.textSecondary} 
                    />
                    <Text style={[
                      styles.convertButtonText,
                      showConvertedAmounts && styles.convertButtonTextActive
                    ]}>
                      {showConvertedAmounts ? 'Showing Converted' : 'Convert All to ' + currencyCode}
                    </Text>
                  </TouchableOpacity>
                </View>
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
              </>
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
                    <View style={styles.accountNameContainer}>
                      <Text style={styles.accountName}>
                        {item.truelayerProviderName
                          ? item.truelayerAccountType && 
                            item.truelayerAccountType.toUpperCase() !== 'TRANSACTION' && 
                            item.truelayerAccountType.toUpperCase() !== 'TRANSACTION_ACCOUNT'
                            ? `${item.truelayerProviderName} ${formatAccountType(item.truelayerAccountType)}`
                            : item.truelayerProviderName
                          : item.name}
                      </Text>
                      {item.truelayerAccountType && 
                       item.truelayerAccountType.toUpperCase() !== 'TRANSACTION' && 
                       item.truelayerAccountType.toUpperCase() !== 'TRANSACTION_ACCOUNT' && 
                       !item.truelayerProviderName && (
                        <View style={styles.accountTypeBadge}>
                          <Text style={styles.accountTypeBadgeText}>
                            {formatAccountType(item.truelayerAccountType)}
                          </Text>
                        </View>
                      )}
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
                  </View>
                  <View style={styles.accountMetaRow}>
                    {item.truelayerProviderName && (
                      <>
                        <Text style={styles.accountType}>{item.truelayerProviderName}</Text>
                        {item.currency && (
                          <>
                            <Text style={styles.accountTypeSeparator}>•</Text>
                            <Text style={styles.accountType}>{item.currency}</Text>
                          </>
                        )}
                        {item.truelayerAccountType && 
                         item.truelayerAccountType.toUpperCase() !== 'TRANSACTION' && 
                         item.truelayerAccountType.toUpperCase() !== 'TRANSACTION_ACCOUNT' && (
                          <>
                            <Text style={styles.accountTypeSeparator}>•</Text>
                            <Text style={styles.accountType}>{formatAccountType(item.truelayerAccountType)}</Text>
                          </>
                        )}
                      </>
                    )}
                    {!item.truelayerProviderName && item.currency && (
                      <Text style={styles.accountType}>{item.currency}</Text>
                    )}
                    {!item.truelayerProviderName && !item.currency && item.truelayerAccountType && 
                     item.truelayerAccountType.toUpperCase() !== 'TRANSACTION' && 
                     item.truelayerAccountType.toUpperCase() !== 'TRANSACTION_ACCOUNT' && (
                      <Text style={styles.accountType}>{formatAccountType(item.truelayerAccountType)}</Text>
                    )}
                    {!item.truelayerProviderName && !item.currency && (!item.truelayerAccountType || 
                      item.truelayerAccountType.toUpperCase() === 'TRANSACTION' || 
                      item.truelayerAccountType.toUpperCase() === 'TRANSACTION_ACCOUNT') && (
                      <Text style={styles.accountType}>{item.type}</Text>
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
                  {showConvertedAmounts && convertedBalances.has(item.id)
                    ? formatCurrencySync(convertedBalances.get(item.id)!, currencyCode)
                    : formatCurrencySync(item.balance ?? 0, item.currency || currencyCode)
                  }
                </Text>
                {showConvertedAmounts && item.currency && item.currency !== currencyCode && (
                  <Text style={styles.originalBalance}>
                    {formatCurrencySync(item.balance ?? 0, item.currency)}
                  </Text>
                )}
                <View style={styles.accountActions}>
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
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 80,
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
    minWidth: 0,
    marginRight: 8,
  },
  accountNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  accountNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    flex: 1,
    minWidth: 0,
  },
  accountName: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
    marginRight: 6,
    flexShrink: 1,
  },
  accountTypeBadge: {
    backgroundColor: colors.background,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'flex-start',
    marginLeft: 6,
  },
  accountTypeBadgeText: {
    ...typography.caption,
    color: colors.text,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  currencyBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginLeft: 6,
  },
  currencyBadgeText: {
    ...typography.caption,
    color: colors.background,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  accountMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 2,
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
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    alignSelf: 'flex-start',
    flexShrink: 0,
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
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: colors.error,
    alignSelf: 'flex-start',
    flexShrink: 0,
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
    marginLeft: 12,
    minWidth: 100,
  },
  accountBalance: {
    ...typography.h3,
    color: colors.text,
    marginBottom: 6,
    textAlign: 'right',
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
  convertSection: {
    marginBottom: 16,
    marginTop: 8,
  },
  convertButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  convertButtonText: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
  },
  convertButtonTextActive: {
    color: colors.primary,
  },
  originalBalance: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
    opacity: 0.7,
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

