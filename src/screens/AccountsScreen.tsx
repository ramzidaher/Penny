import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useNavigation } from '../utils/navigation';
import { useDialog } from '../contexts/DialogContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getAccounts, deleteAccount } from '../database/db';
import { Account } from '../database/schema';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { SkeletonCard, SkeletonList } from '../components/SkeletonLoader';
import { waitForFirebase } from '../services/firebase';
import { getSettings } from '../services/settingsService';
import { formatCurrencySync } from '../utils/currency';
import CompanyLogo from '../components/CompanyLogo';
import { formatDistanceToNow } from 'date-fns';
import { convertCurrency } from '../services/currencyConversionService';

// Helper function to format account types for display
const formatAccountType = (accountType?: string): string => {
  if (!accountType) return '';
  
  // Convert common account types to readable format
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
  const [showConvertedAmounts, setShowConvertedAmounts] = useState<boolean>(false);
  const [convertedBalances, setConvertedBalances] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    console.log('[AccountsScreen] 🟢 SCREEN MOUNTED - AccountsScreen');
    return () => {
      console.log('[AccountsScreen] 🔴 SCREEN UNMOUNTED - AccountsScreen');
    };
  }, []);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      await waitForFirebase();
      const [accs, settings] = await Promise.all([
        getAccounts(),
        getSettings(),
      ]);
      
      console.log(`📋 Loaded ${accs.length} total account(s) from database`);

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
            const converted = await convertCurrency(account.balance ?? 0, accountCurrency, targetCurrency);
            conversions.set(account.id, converted);
          } else {
            conversions.set(account.id, account.balance ?? 0);
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
    // Use focus listener to reload accounts when screen comes into focus
    const focusListener = navigation.addListener('focus', () => {
      console.log('[AccountsScreen] Focus detected, reloading accounts...');
      // Always reload accounts on focus to ensure new connections are shown
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
    await loadAccounts();
    setRefreshing(false);
  };

  const handleDelete = async (id: string) => {
    await deleteAccount(id);
    await loadAccounts();
  };

  const calculateTotalBalance = () => {
    return accounts.reduce((total, account) => {
      // For card accounts with linked accounts, use the linked account balance
      if (account.type === 'card' && account.linkedAccountId) {
        const linkedAccount = accounts.find(acc => acc.id === account.linkedAccountId);
        return total + (linkedAccount?.balance ?? account.balance ?? 0);
      }
      return total + (account.balance ?? 0);
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
                  onPress={() => navigation.navigate('/connect-bank' as never)}
                >
                  <View style={styles.actionIconContainer}>
                    <Ionicons name="link-outline" size={22} color={colors.primary} />
                  </View>
                  <View style={styles.actionTextContainer}>
                    <Text style={styles.actionTitle}>Connect Bank</Text>
                    <Text style={styles.actionSubtitle}>Link or reconnect your bank</Text>
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
                    <Text style={styles.actionTitle}>Add Account</Text>
                    <Text style={styles.actionSubtitle}>Create an account manually</Text>
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
                      <Text style={styles.accountName}>{item.name}</Text>
                    </View>
                  </View>
                  <View style={styles.accountMetaRow}>
                    {item.currency ? (
                      <Text style={styles.accountType}>{item.currency}</Text>
                    ) : (
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

