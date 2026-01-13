import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Platform } from 'react-native';
import { useNavigation } from '../utils/navigation';
import { useRouter } from 'expo-router';
import { useDialog } from '../contexts/DialogContext';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getSubscriptions, deleteSubscription, markSubscriptionAsPaid, processDueSubscriptions, getTransactions } from '../database/db';
import { scheduleAllNotifications } from '../services/notifications';
import { Subscription, Transaction } from '../database/schema';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { format, differenceInDays } from 'date-fns';
import CompanyLogo from '../components/CompanyLogo';
import { SkeletonList, SkeletonStatCard, SkeletonHeader } from '../components/SkeletonLoader';
import ScreenHeader from '../components/ScreenHeader';
import ScreenWrapper from '../components/ScreenWrapper';
import { waitForFirebase } from '../services/firebase';
import { getSettings } from '../services/settingsService';
import { formatCurrencySync } from '../utils/currency';

export default function SubscriptionsScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const dialog = useDialog();
  const insets = useSafeAreaInsets();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expandedSubscriptionId, setExpandedSubscriptionId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currencyCode, setCurrencyCode] = useState<string>('USD');

  const loadSubscriptions = async () => {
    try {
      setLoading(true);
      await waitForFirebase();
      
      // Process due subscriptions first (creates transactions automatically)
      try {
        await processDueSubscriptions();
      } catch (error) {
        console.error('Error processing due subscriptions:', error);
      }
      
      // Backfill subscription links for existing transactions (one-time, runs silently)
      try {
        const { backfillSubscriptionLinks } = await import('../services/backfillService');
        const result = await backfillSubscriptionLinks();
        if (result.linked > 0) {
          console.log(`[SubscriptionsScreen] Backfilled ${result.linked} subscription links`);
        }
      } catch (error) {
        // Silent fail - backfill is optional
        console.error('Error backfilling subscription links:', error);
      }
      
      const [subs, trans, settings] = await Promise.all([
        getSubscriptions(),
        getTransactions(),
        getSettings(),
      ]);
      setSubscriptions(subs);
      setTransactions(trans);
      setCurrencyCode(settings.defaultCurrency);
    } catch (error) {
      console.error('Error loading subscriptions:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(() => {
        loadSubscriptions();
      }, 100);
      return () => clearTimeout(timer);
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSubscriptions();
    setRefreshing(false);
  };

  const handleDelete = async (id: string) => {
    await deleteSubscription(id);
    // Reschedule notifications after deleting subscription
    await scheduleAllNotifications();
    await loadSubscriptions();
  };

  const handleMarkAsPaid = async (id: string) => {
    try {
      await markSubscriptionAsPaid(id);
      // Reschedule notifications after marking as paid
      await scheduleAllNotifications();
      await loadSubscriptions();
    } catch (error) {
      console.error('Error marking subscription as paid:', error);
      dialog.alert('Error', 'Failed to mark subscription as paid');
    }
  };

  const getDaysUntil = (date: string) => {
    const billingDate = new Date(date);
    const now = new Date();
    const days = differenceInDays(billingDate, now);
    return days;
  };

  const getSubscriptionTransactions = (subscription: Subscription): Transaction[] => {
    const filtered = transactions.filter(t => {
      // Match by subscriptionId (direct link) - highest priority
      if (t.subscriptionId === subscription.id) {
        return true;
      }
      
      // Fallback: Match by category and description/merchant name
      // This handles cases where user categorized as "Subscription" but auto-linking didn't find a match
      if (t.category === 'Subscription' && t.description) {
        const subscriptionNameLower = subscription.name.toLowerCase().trim();
        const transactionDescLower = t.description.toLowerCase().trim();
        
        // Extract merchant name from transaction description (multiple methods)
        const cleanDesc = t.description
          .replace(/^Subscription:\s*/i, '')
          .replace(/^Payment\s+to\s+/i, '')
          .replace(/^Payment\s+/i, '')
          .trim();
        
        const merchantName = cleanDesc.split(/[,\s-]/)[0].trim().toLowerCase();
        const firstTwoWords = cleanDesc.split(/\s+/).slice(0, 2).join(' ').toLowerCase();
        
        // Multiple matching strategies for better accuracy
        const matches = 
          // Direct name match
          subscriptionNameLower === merchantName ||
          subscriptionNameLower === firstTwoWords ||
          // Contains match (more flexible)
          subscriptionNameLower.includes(merchantName) || 
          merchantName.includes(subscriptionNameLower) ||
          subscriptionNameLower.includes(firstTwoWords) ||
          firstTwoWords.includes(subscriptionNameLower) ||
          // Full description match
          transactionDescLower.includes(subscriptionNameLower) ||
          subscriptionNameLower.includes(transactionDescLower);
        
        return matches;
      }
      
      return false;
    });
    
    // Debug logging (only in development)
    if (__DEV__ && filtered.length > 0) {
      console.log(`[SubscriptionsScreen] Found ${filtered.length} transaction(s) for subscription "${subscription.name}"`);
      filtered.forEach(t => {
        console.log(`  - ${t.description} (${t.category}) - subscriptionId: ${t.subscriptionId || 'none'}`);
      });
    }
    
    return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  // Get unlinked subscription transactions (categorized as Subscription but not linked to any subscription)
  const getUnlinkedSubscriptionTransactions = (): Transaction[] => {
    return transactions
      .filter(t => t.category === 'Subscription' && !t.subscriptionId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const toggleExpand = (subscriptionId: string) => {
    setExpandedSubscriptionId(expandedSubscriptionId === subscriptionId ? null : subscriptionId);
  };

  // Calculate stats including both subscriptions and unlinked subscription transactions
  const unlinkedTransactions = getUnlinkedSubscriptionTransactions();
  
  // Count active subscriptions + unlinked transactions
  const activeCount = subscriptions.length + unlinkedTransactions.length;
  
  // Calculate monthly cost from subscriptions
  const totalMonthlyCost = subscriptions
    .filter(s => s.frequency === 'monthly')
    .reduce((sum, s) => sum + s.amount, 0);
  
  const totalYearlyCost = subscriptions
    .filter(s => s.frequency === 'yearly')
    .reduce((sum, s) => sum + s.amount, 0);
  
  // Add monthly cost from unlinked transactions (estimate as monthly)
  const unlinkedMonthlyCost = unlinkedTransactions.reduce((sum, t) => sum + t.amount, 0);
  
  const totalMonthlyCostWithTransactions = totalMonthlyCost + (totalYearlyCost / 12) + unlinkedMonthlyCost;

  const upcomingSubscriptions = subscriptions
    .filter(s => {
      const days = getDaysUntil(s.nextBillingDate);
      return days >= 0 && days <= 7;
    })
    .sort((a, b) => getDaysUntil(a.nextBillingDate) - getDaysUntil(b.nextBillingDate));

  const loadingComponent = (
    <>
      <SkeletonHeader />
      <View style={styles.skeletonStatsContainer}>
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </View>
      <View style={styles.skeletonContainer}>
        <SkeletonList count={3} />
      </View>
    </>
  );

  return (
    <View style={styles.container}>
      <ScreenWrapper
        onRefresh={onRefresh}
        refreshing={refreshing}
        loading={loading && !refreshing}
        loadingComponent={loadingComponent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <ScreenHeader
          title="Subscriptions"
          subtitle="Track your recurring payments"
        />

        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <View style={styles.statIconContainer}>
              <Ionicons name="repeat" size={24} color={colors.primary} />
            </View>
            <Text style={styles.statValue}>{activeCount}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={styles.statCard}>
            <View style={styles.statIconContainer}>
              <Ionicons name="calendar" size={24} color={colors.primary} />
            </View>
            <Text style={styles.statValue}>{upcomingSubscriptions.length}</Text>
            <Text style={styles.statLabel}>Upcoming</Text>
          </View>
          <View style={styles.statCard}>
            <View style={styles.statIconContainer}>
              <Ionicons name="cash" size={24} color={colors.primary} />
            </View>
            <Text style={styles.statValue}>
              {formatCurrencySync(totalMonthlyCostWithTransactions, currencyCode)}
            </Text>
            <Text style={styles.statLabel}>Monthly</Text>
          </View>
        </View>

        {/* Upcoming Subscriptions */}
        {upcomingSubscriptions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upcoming This Week</Text>
            <View style={styles.upcomingList}>
              {upcomingSubscriptions.slice(0, 3).map((subscription) => {
                const daysUntil = getDaysUntil(subscription.nextBillingDate);
                const isDueToday = daysUntil === 0;
                return (
                  <TouchableOpacity
                    key={subscription.id}
                    style={[
                      styles.upcomingCard,
                      isDueToday && styles.upcomingCardDue
                    ]}
                    activeOpacity={0.7}
                  >
                    <CompanyLogo
                      name={subscription.name}
                      type="subscription"
                      size={48}
                    />
                    <View style={styles.upcomingInfo}>
                      <Text style={styles.upcomingName}>{subscription.name}</Text>
                      <Text style={styles.upcomingDate}>
                        {format(new Date(subscription.nextBillingDate), 'MMM dd, yyyy')}
                      </Text>
                    </View>
                    <View style={styles.upcomingRight}>
                      <Text style={styles.upcomingAmount}>
                        {formatCurrencySync(subscription.amount, currencyCode)}
                      </Text>
                      {isDueToday ? (
                        <View style={styles.dueTodayBadge}>
                          <Text style={styles.dueTodayText}>Due Today</Text>
                        </View>
                      ) : (
                        <Text style={styles.upcomingDays}>
                          {daysUntil} day{daysUntil !== 1 ? 's' : ''}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Unlinked Subscription Transactions */}
        {(() => {
          const unlinkedTransactions = getUnlinkedSubscriptionTransactions();
          if (unlinkedTransactions.length > 0) {
            return (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Subscription Transactions</Text>
                  <Text style={styles.sectionSubtitle}>{unlinkedTransactions.length} transaction{unlinkedTransactions.length !== 1 ? 's' : ''}</Text>
                </View>
                <View style={styles.subscriptionsList}>
                  {unlinkedTransactions.map((transaction, index) => (
                    <TouchableOpacity
                      key={transaction.id}
                      style={[
                        styles.subscriptionCard,
                        index === unlinkedTransactions.length - 1 && styles.subscriptionCardLast
                      ]}
                      onPress={() => router.push({ pathname: '/(tabs)/finance/transaction-detail' as any, params: { id: transaction.id } })}
                      activeOpacity={0.7}
                    >
                      <View style={styles.subscriptionContent}>
                        <View style={styles.subscriptionLeft}>
                          <CompanyLogo
                            name={transaction.description || 'Subscription'}
                            type="subscription"
                            size={56}
                          />
                          <View style={styles.subscriptionInfo}>
                            <Text style={styles.subscriptionName} numberOfLines={1}>
                              {transaction.description || 'No description'}
                            </Text>
                            <View style={styles.subscriptionMeta}>
                              <Text style={styles.subscriptionFrequency}>
                                {format(new Date(transaction.date), 'MMM dd, yyyy')}
                              </Text>
                            </View>
                          </View>
                        </View>
                        <View style={styles.subscriptionRight}>
                          <Text style={styles.subscriptionAmount}>
                            {formatCurrencySync(transaction.amount, currencyCode)}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            );
          }
          return null;
        })()}

        {/* All Subscriptions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>All Subscriptions</Text>
            {subscriptions.length > 0 && (
              <Text style={styles.sectionSubtitle}>{subscriptions.length} total</Text>
            )}
          </View>
          {subscriptions.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="repeat-outline" size={64} color={colors.textLight} />
              <Text style={styles.emptyText}>No subscriptions yet</Text>
              <Text style={styles.emptySubtext}>Add your subscriptions to track them</Text>
            </View>
          ) : (
            <View style={styles.subscriptionsList}>
              {subscriptions.map((subscription, index) => {
                const daysUntil = getDaysUntil(subscription.nextBillingDate);
                const isUpcoming = daysUntil <= 7 && daysUntil >= 0;
                const isDueToday = daysUntil === 0;
                
                const subscriptionTransactions = getSubscriptionTransactions(subscription);
                const isExpanded = expandedSubscriptionId === subscription.id;
                
                return (
                  <View
                    key={subscription.id}
                    style={[
                      styles.subscriptionCard,
                      index === subscriptions.length - 1 && styles.subscriptionCardLast,
                      isUpcoming && styles.subscriptionCardUpcoming,
                      isDueToday && styles.subscriptionCardDue
                    ]}
                  >
                    <TouchableOpacity
                      onPress={() => toggleExpand(subscription.id)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.subscriptionContent}>
                        <View style={styles.subscriptionLeft}>
                          <CompanyLogo
                            name={subscription.name}
                            type="subscription"
                            size={56}
                          />
                          <View style={styles.subscriptionInfo}>
                            <Text style={styles.subscriptionName}>{subscription.name}</Text>
                            <View style={styles.subscriptionMeta}>
                              <Text style={styles.subscriptionFrequency}>
                                {subscription.frequency.charAt(0).toUpperCase() + subscription.frequency.slice(1)}
                              </Text>
                              {isDueToday && (
                                <View style={styles.dueTodayBadge}>
                                  <Text style={styles.dueTodayText}>Due Today</Text>
                                </View>
                              )}
                              <Text style={styles.transactionCount}>
                                {subscriptionTransactions.length} payment{subscriptionTransactions.length !== 1 ? 's' : ''}
                              </Text>
                            </View>
                          </View>
                        </View>
                        <View style={styles.subscriptionRight}>
                          <Ionicons 
                            name={isExpanded ? "chevron-up" : "chevron-down"} 
                            size={20} 
                            color={colors.textSecondary} 
                          />
                          <Text style={styles.subscriptionAmount}>
                            {formatCurrencySync(subscription.amount, currencyCode)}
                          </Text>
                          <Text style={styles.subscriptionDate}>
                            {format(new Date(subscription.nextBillingDate), 'MMM dd, yyyy')}
                          </Text>
                          {daysUntil >= 0 && daysUntil <= 7 && (
                            <Text style={[
                              styles.subscriptionDays,
                              isDueToday && styles.subscriptionDaysDue
                            ]}>
                              {isDueToday ? 'Due today' : `${daysUntil} day${daysUntil !== 1 ? 's' : ''} left`}
                            </Text>
                          )}
                          {(isDueToday || daysUntil < 0) && (
                            <TouchableOpacity
                              onPress={(e) => {
                                e.stopPropagation();
                                handleMarkAsPaid(subscription.id);
                              }}
                              style={styles.markPaidButton}
                            >
                              <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                              <Text style={styles.markPaidText}>Mark as Paid</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                    <View style={styles.subscriptionActions}>
                      <TouchableOpacity
                        onPress={() => handleDelete(subscription.id)}
                        style={styles.deleteButton}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                    
                    {isExpanded && (
                      <View style={styles.transactionsContainer}>
                        {subscriptionTransactions.length === 0 ? (
                          <Text style={styles.noTransactionsText}>No payments yet</Text>
                        ) : (
                          subscriptionTransactions.slice(0, 5).map((transaction) => (
                            <TouchableOpacity
                              key={transaction.id}
                              style={styles.transactionRow}
                              onPress={() => router.push({ pathname: '/(tabs)/finance/transaction-detail' as any, params: { id: transaction.id } })}
                            >
                              <View style={styles.transactionLeft}>
                                <Text style={styles.transactionDescription} numberOfLines={1}>
                                  {transaction.description || 'Payment'}
                                </Text>
                                <Text style={styles.transactionDate}>
                                  {format(new Date(transaction.date), 'MMM dd, yyyy')}
                                </Text>
                              </View>
                              <Text style={styles.transactionAmount}>
                                {formatCurrencySync(transaction.amount, currencyCode)}
                              </Text>
                            </TouchableOpacity>
                          ))
                        )}
                        {subscriptionTransactions.length > 5 && (
                          <Text style={styles.moreTransactionsText}>
                            +{subscriptionTransactions.length - 5} more payments
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.bottomPadding} />
      </ScreenWrapper>
      <TouchableOpacity
        style={[styles.fab, { bottom: 20 + insets.bottom + 80 }]}
        onPress={() => navigation.navigate('AddSubscription' as never)}
        activeOpacity={0.8}
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
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 24,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.5,
    marginBottom: 16,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  upcomingList: {
    gap: 16,
  },
  upcomingCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  upcomingCardDue: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  upcomingInfo: {
    flex: 1,
  },
  upcomingName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  upcomingDate: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  upcomingRight: {
    alignItems: 'flex-end',
  },
  upcomingAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  upcomingDays: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  subscriptionsList: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  subscriptionCard: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  subscriptionCardLast: {
    borderBottomWidth: 0,
  },
  subscriptionCardUpcoming: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  subscriptionCardDue: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    backgroundColor: colors.surface,
  },
  subscriptionContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  subscriptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 16,
  },
  subscriptionInfo: {
    flex: 1,
  },
  subscriptionName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  subscriptionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  transactionCount: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  subscriptionActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  transactionsContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  transactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  transactionLeft: {
    flex: 1,
    marginRight: 12,
  },
  transactionDescription: {
    ...typography.body,
    color: colors.text,
    marginBottom: 4,
  },
  transactionDate: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  transactionAmount: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  noTransactionsText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 16,
  },
  moreTransactionsText: {
    ...typography.caption,
    color: colors.primary,
    textAlign: 'center',
    marginTop: 8,
  },
  subscriptionFrequency: {
    fontSize: 13,
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },
  dueTodayBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  dueTodayText: {
    fontSize: 11,
    color: colors.background,
    fontWeight: '600',
  },
  subscriptionRight: {
    alignItems: 'flex-end',
  },
  subscriptionAmount: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  subscriptionDate: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  subscriptionDays: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  subscriptionDaysDue: {
    color: colors.primary,
    fontWeight: '700',
  },
  markPaidButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: colors.primary + '20',
    borderRadius: 8,
    gap: 6,
  },
  markPaidText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
  },
  deleteButton: {
    padding: 8,
    borderRadius: 8,
    alignSelf: 'flex-end',
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 40,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  bottomPadding: {
    height: 100,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#1A1A1A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      web: {
        boxShadow: '0px 4px 8px rgba(26, 26, 26, 0.3)',
      },
    }),
  },
  skeletonStatsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 24,
    gap: 12,
  },
  skeletonContainer: {
    paddingHorizontal: 20,
  },
});
