import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Platform, Alert } from 'react-native';
import { useNavigation } from '../utils/navigation';
import { Ionicons } from '@expo/vector-icons';
import { getAccounts, deleteAccount } from '../database/db';
import { syncTrueLayerAccounts } from '../database/db';
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
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currencyCode, setCurrencyCode] = useState<string>('USD');

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
      // Sync TrueLayer accounts if any connections exist
      const connections = await getAllConnections();
      for (const connection of connections) {
        try {
          await syncTrueLayerAccounts(connection.id);
        } catch (error) {
          console.error(`Error syncing connection ${connection.id}:`, error);
          // Continue with other connections even if one fails
        }
      }
    } catch (error) {
      console.error('Error syncing TrueLayer accounts:', error);
    }
    await loadAccounts();
    setRefreshing(false);
  };

  const handleDelete = async (id: string) => {
    await deleteAccount(id);
    await loadAccounts();
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
          <TouchableOpacity
            style={styles.connectBankButton}
            onPress={() => navigation.navigate('ConnectBank' as never)}
          >
            <Ionicons name="link" size={24} color={colors.primary} />
            <View style={styles.connectBankTextContainer}>
              <Text style={styles.connectBankTitle}>Connect Bank Account</Text>
              <Text style={styles.connectBankSubtitle}>Sync accounts automatically with TrueLayer</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
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
                      <View style={styles.syncBadge}>
                        <Ionicons name="sync" size={12} color={colors.primary} />
                        <Text style={styles.syncBadgeText}>Synced</Text>
                      </View>
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
                <TouchableOpacity
                  onPress={() => handleDelete(item.id)}
                  style={styles.deleteButton}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        contentContainerStyle={styles.listContent}
      />
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('AddAccount' as never)}
      >
        <Ionicons name="add" size={28} color={colors.background} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    padding: 20,
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
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    ...Platform.select({
      ios: {
        shadowColor: '#1A1A1A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
      },
      web: {
        boxShadow: '0px 2px 3.84px rgba(26, 26, 26, 0.25)',
      },
    }),
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
  connectBankButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    marginHorizontal: 20,
    marginTop: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  connectBankTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  connectBankTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
    marginBottom: 4,
  },
  connectBankSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});

