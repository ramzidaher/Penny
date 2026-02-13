import React, { useState, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useNavigation } from '../utils/navigation';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getDebts, getTransactions, deleteDebt } from '../database/db';
import { scheduleAllNotifications } from '../services/notifications';
import { Debt, Transaction } from '../database/schema';
import { useTheme } from '../contexts/ThemeContext';
import { typography } from '../theme/typography';
import { format, differenceInDays } from 'date-fns';
import CompanyLogo from '../components/CompanyLogo';
import { SkeletonList, SkeletonStatStrip } from '../components/SkeletonLoader';
import ScreenWrapper, { ScreenWrapperRef } from '../components/ScreenWrapper';
import { waitForFirebase } from '../services/firebase';
import { getSettings } from '../services/settingsService';
import { formatCurrencySync } from '../utils/currency';
import DebtPaymentMatcher from '../components/DebtPaymentMatcher';
import {
  findPendingDebtMatches,
  applyMatch,
  dismissMatch,
} from '../services/debtReconciliationService';

export default function DebtsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [debts, setDebts] = useState<Debt[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expandedDebtId, setExpandedDebtId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currencyCode, setCurrencyCode] = useState<string>('USD');
  const [pendingMatches, setPendingMatches] = useState<
    Awaited<ReturnType<typeof findPendingDebtMatches>>
  >([]);
  const scrollRef = useRef<ScreenWrapperRef>(null);
  const hasLoadedRef = useRef(false);

  const loadDebts = useCallback(async (options?: { showLoading?: boolean }) => {
    const showLoading = options?.showLoading !== false;
    try {
      if (showLoading && !hasLoadedRef.current) {
        setLoading(true);
      }
      await waitForFirebase();
      const [debtsData, trans, settings] = await Promise.all([
        getDebts(),
        getTransactions(),
        getSettings(),
      ]);
      setDebts(debtsData);
      setTransactions(trans);
      setCurrencyCode(settings.defaultCurrency);
      hasLoadedRef.current = true;
      const matches = await findPendingDebtMatches(trans, debtsData);
      setPendingMatches(matches);
    } catch (error) {
      console.error('Error loading debts:', error);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      const rafId = requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      });
      const timer = setTimeout(() => {
        loadDebts({ showLoading: !hasLoadedRef.current });
      }, 100);
      return () => {
        cancelAnimationFrame(rafId);
        clearTimeout(timer);
      };
    }, [loadDebts])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDebts({ showLoading: false });
    setRefreshing(false);
  };

  const handleDelete = async (id: string) => {
    await deleteDebt(id);
    await scheduleAllNotifications();
    await loadDebts({ showLoading: false });
  };

  const getDaysUntilDue = (dueDate: string) => differenceInDays(new Date(dueDate), new Date());

  const getDebtTransactions = (debt: Debt): Transaction[] =>
    transactions
      .filter((t) => t.debtId === debt.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const debtCategories = ['Debt', 'Loan', 'Credit Card'];
  const getUnlinkedDebtTransactions = (): Transaction[] =>
    transactions
      .filter(
        (t) =>
          !t.debtId &&
          (debtCategories.includes(t.category) || t.category?.toLowerCase().includes('debt'))
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const toggleExpand = (debtId: string) => {
    setExpandedDebtId(expandedDebtId === debtId ? null : debtId);
  };

  const handleApplyMatch = useCallback(
    async (transactionId: string, debtId: string) => {
      await applyMatch(transactionId, debtId);
      await loadDebts({ showLoading: false });
    },
    [loadDebts]
  );

  const handleDismissMatch = useCallback(
    async (transactionId: string, debtId?: string) => {
      await dismissMatch(transactionId, debtId);
      setPendingMatches((prev) =>
        prev.filter(
          (m) =>
            m.transactionId !== transactionId ||
            (debtId != null && m.debtId !== debtId)
        )
      );
    },
    []
  );

  const activeDebts = debts.filter((d) => d.status === 'active');
  const totalRemaining = activeDebts.reduce((sum, d) => sum + d.remainingAmount, 0);
  const upcomingDebts = debts
    .filter((d) => {
      if (d.status !== 'active') return false;
      const days = getDaysUntilDue(d.dueDate);
      return days <= 7;
    })
    .sort((a, b) => getDaysUntilDue(a.dueDate) - getDaysUntilDue(b.dueDate));
  const unlinkedTransactions = getUnlinkedDebtTransactions();

  const loadingComponent = (
    <>
      <SkeletonStatStrip />
      <View style={styles.skeletonContainer}>
        <SkeletonList count={3} />
      </View>
    </>
  );

  return (
    <View style={styles.container}>
      <ScreenWrapper
        ref={scrollRef}
        onRefresh={onRefresh}
        refreshing={refreshing}
        loading={loading && !refreshing}
        loadingComponent={loadingComponent}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats strip */}
        <View style={styles.statsStrip}>
          <View style={styles.statsSegment}>
            <Text style={styles.statsSegmentLabel}>Active</Text>
            <Text style={styles.statsSegmentValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {activeDebts.length}
            </Text>
          </View>
          <View style={styles.statsDivider} />
          <View style={styles.statsSegment}>
            <Text style={styles.statsSegmentLabel}>Upcoming</Text>
            <Text style={styles.statsSegmentValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {upcomingDebts.length}
            </Text>
          </View>
          <View style={styles.statsDivider} />
          <View style={styles.statsSegment}>
            <Text style={styles.statsSegmentLabel}>Total</Text>
            <Text style={styles.statsSegmentValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {formatCurrencySync(totalRemaining, currencyCode)}
            </Text>
          </View>
        </View>

        {/* Pending debt payment matches */}
        <DebtPaymentMatcher
          pendingMatches={pendingMatches}
          currencyCode={currencyCode}
          onApply={handleApplyMatch}
          onDismiss={handleDismissMatch}
          onNavigateToTransaction={(id) =>
            router.push({
              pathname: '/(tabs)/finance/transaction-detail' as any,
              params: { id },
            })
          }
        />

        {/* Upcoming This Week */}
        {upcomingDebts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upcoming This Week</Text>
            <View style={styles.upcomingList}>
              {upcomingDebts.slice(0, 3).map((debt) => {
                const daysUntil = getDaysUntilDue(debt.dueDate);
                const isDueToday = daysUntil === 0;
                const isOverdue = daysUntil < 0;
                return (
                  <TouchableOpacity
                    key={debt.id}
                    style={[
                      styles.upcomingCard,
                      isDueToday && styles.upcomingCardDue,
                      isOverdue && styles.upcomingCardOverdue,
                    ]}
                    activeOpacity={0.7}
                  >
                    <CompanyLogo name={debt.name} type="transaction" size={48} />
                    <View style={styles.upcomingInfo}>
                      <Text style={styles.upcomingName}>{debt.name}</Text>
                      <Text style={styles.upcomingDate}>
                        Due: {format(new Date(debt.dueDate), 'MMM dd, yyyy')}
                      </Text>
                    </View>
                    <View style={styles.upcomingRight}>
                      <Text style={styles.upcomingAmount}>
                        {formatCurrencySync(debt.remainingAmount, currencyCode)}
                      </Text>
                      {isOverdue ? (
                        <Text style={styles.upcomingOverdue}>
                          {Math.abs(daysUntil)} day{Math.abs(daysUntil) !== 1 ? 's' : ''} overdue
                        </Text>
                      ) : isDueToday ? (
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

        {/* Unlinked Debt Transactions */}
        {unlinkedTransactions.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Debt Transactions</Text>
              <Text style={styles.sectionSubtitle}>
                {unlinkedTransactions.length} transaction
                {unlinkedTransactions.length !== 1 ? 's' : ''}
              </Text>
            </View>
            <View style={styles.debtsList}>
              {unlinkedTransactions.map((transaction, index) => (
                <TouchableOpacity
                  key={transaction.id}
                  style={[
                    styles.debtCard,
                    index === unlinkedTransactions.length - 1 && styles.debtCardLast,
                  ]}
                  onPress={() =>
                    router.push({
                      pathname: '/(tabs)/finance/transaction-detail' as any,
                      params: { id: transaction.id },
                    })
                  }
                  activeOpacity={0.7}
                >
                  <View style={styles.debtContent}>
                    <View style={styles.debtLeft}>
                      <CompanyLogo
                        name={transaction.description || 'Debt'}
                        type="transaction"
                        logoUrl={transaction.merchantLogoUrl}
                        size={44}
                      />
                      <View style={styles.debtInfo}>
                        <Text style={styles.debtName} numberOfLines={1}>
                          {transaction.description || 'No description'}
                        </Text>
                        <Text style={styles.debtMeta}>
                          {format(new Date(transaction.date), 'MMM dd, yyyy')}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.debtRight}>
                      <Text style={styles.debtAmount}>
                        {formatCurrencySync(transaction.amount, currencyCode)}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* All Debts */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>All Debts</Text>
            {debts.length > 0 && (
              <Text style={styles.sectionSubtitle}>{debts.length} total</Text>
            )}
          </View>
          {debts.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="card-outline" size={64} color={colors.textLight} />
              <Text style={styles.emptyText}>No debts yet</Text>
              <Text style={styles.emptySubtext}>Track your loans and credit</Text>
            </View>
          ) : (
            <View style={styles.debtsList}>
              {debts.map((debt, index) => {
                const daysUntil = getDaysUntilDue(debt.dueDate);
                const isUpcoming = daysUntil <= 7 && daysUntil >= 0 && debt.status === 'active';
                const isDueToday = daysUntil === 0;
                const isOverdue = daysUntil < 0 && debt.status === 'active';
                const debtTransactions = getDebtTransactions(debt);
                const isExpanded = expandedDebtId === debt.id;
                const percentagePaid =
                  debt.totalAmount > 0
                    ? ((debt.totalAmount - debt.remainingAmount) / debt.totalAmount) * 100
                    : 0;

                return (
                  <View
                    key={debt.id}
                    style={[
                      styles.debtCard,
                      index === debts.length - 1 && styles.debtCardLast,
                      isUpcoming && styles.debtCardUpcoming,
                      isDueToday && styles.debtCardDue,
                      isOverdue && styles.debtCardOverdue,
                    ]}
                  >
                    <TouchableOpacity onPress={() => toggleExpand(debt.id)} activeOpacity={0.7}>
                      <View style={styles.debtContent}>
                        <View style={styles.debtLeft}>
                          <CompanyLogo name={debt.name} type="transaction" size={44} />
                          <View style={styles.debtInfo}>
                            <Text style={styles.debtName}>{debt.name}</Text>
                            <View style={styles.debtMetaRow}>
                              <Text style={styles.debtType}>
                                {debt.type.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                              </Text>
                              <Text style={styles.transactionCount}>
                                {debtTransactions.length} payment
                                {debtTransactions.length !== 1 ? 's' : ''}
                              </Text>
                            </View>
                          </View>
                        </View>
                        <View style={styles.debtRight}>
                          <View style={styles.debtTopRow}>
                            <Ionicons
                              name={isExpanded ? 'chevron-up' : 'chevron-down'}
                              size={18}
                              color={colors.textSecondary}
                            />
                            <TouchableOpacity
                              onPress={(e) => {
                                e.stopPropagation();
                                handleDelete(debt.id);
                              }}
                              style={styles.deleteButtonInline}
                              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                              <Ionicons name="trash-outline" size={16} color={colors.textSecondary} />
                            </TouchableOpacity>
                          </View>
                          <Text style={styles.debtRemainingLabel}>Remaining</Text>
                          <Text style={styles.debtAmount}>
                            {formatCurrencySync(debt.remainingAmount, currencyCode)}
                          </Text>
                          {debtTransactions.length > 0 && (
                            <Text style={styles.debtLastPayment}>
                              Last payment: {formatCurrencySync(debtTransactions[0].amount, currencyCode)} on{' '}
                              {format(new Date(debtTransactions[0].date), 'MMM d')}
                            </Text>
                          )}
                          <Text style={[styles.debtDate, isOverdue && styles.debtDateOverdue]}>
                            Due: {format(new Date(debt.dueDate), 'MMM dd, yyyy')}
                          </Text>
                          {isOverdue && (
                            <Text style={styles.debtOverdueText}>
                              {Math.abs(daysUntil)} day{Math.abs(daysUntil) !== 1 ? 's' : ''} overdue
                            </Text>
                          )}
                          {daysUntil >= 0 && daysUntil <= 7 && debt.status === 'active' && !isOverdue && (
                            <Text style={[styles.debtDays, isDueToday && styles.debtDaysDue]}>
                              {isDueToday ? 'Due today' : `${daysUntil} day${daysUntil !== 1 ? 's' : ''} left`}
                            </Text>
                          )}
                          <View style={styles.progressContainer}>
                            <View style={styles.progressBar}>
                              <View
                                style={[styles.progressFill, { width: `${Math.min(percentagePaid, 100)}%` }]}
                              />
                            </View>
                            <Text style={styles.progressText}>{percentagePaid.toFixed(0)}% Paid</Text>
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={styles.transactionsContainer}>
                        {debtTransactions.length === 0 ? (
                          <Text style={styles.noTransactionsText}>No payments yet</Text>
                        ) : (
                          debtTransactions.slice(0, 5).map((transaction) => (
                            <TouchableOpacity
                              key={transaction.id}
                              style={styles.transactionRow}
                              onPress={() =>
                                router.push({
                                  pathname: '/(tabs)/finance/transaction-detail' as any,
                                  params: { id: transaction.id },
                                })
                              }
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
                        {debtTransactions.length > 5 && (
                          <Text style={styles.moreTransactionsText}>
                            +{debtTransactions.length - 5} more payments
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
        onPress={() => navigation.navigate('AddDebt' as never)}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color={colors.background} />
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    statsStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 20,
      marginBottom: 20,
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statsSegment: {
      flex: 1,
      alignItems: 'center',
      minWidth: 0,
    },
    statsSegmentLabel: {
      fontSize: 11,
      color: colors.textSecondary,
      marginBottom: 4,
      fontWeight: '500',
    },
    statsSegmentValue: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
    },
    statsDivider: {
      width: 1,
      height: 28,
      backgroundColor: colors.border,
      marginHorizontal: 4,
    },
    contentContainer: {
      paddingTop: 8,
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
    upcomingCardOverdue: {
      borderColor: colors.warning,
      borderWidth: 2,
      backgroundColor: (colors.warning || '#f59e0b') + '08',
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
    upcomingOverdue: {
      fontSize: 12,
      color: colors.warning,
      fontWeight: '600',
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
    debtsList: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
    },
    debtCard: {
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    debtCardLast: {
      borderBottomWidth: 0,
    },
    debtCardUpcoming: {
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
    },
    debtCardDue: {
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
      backgroundColor: colors.surface,
    },
    debtCardOverdue: {
      borderLeftWidth: 3,
      borderLeftColor: colors.warning,
      backgroundColor: (colors.warning || '#f59e0b') + '08',
    },
    debtContent: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    debtLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      gap: 12,
    },
    debtInfo: {
      flex: 1,
    },
    debtName: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 4,
    },
    debtMeta: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    debtMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    debtType: {
      fontSize: 12,
      color: colors.textSecondary,
      textTransform: 'capitalize',
    },
    transactionCount: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    debtRight: {
      alignItems: 'flex-end',
    },
    debtTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 2,
    },
    debtRemainingLabel: {
      fontSize: 11,
      color: colors.textSecondary,
      marginBottom: 2,
    },
    debtAmount: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 2,
    },
    debtLastPayment: {
      fontSize: 11,
      color: colors.textSecondary,
      marginBottom: 2,
    },
    debtDate: {
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 2,
    },
    debtDateOverdue: {
      color: colors.warning,
      fontWeight: '600',
    },
    debtOverdueText: {
      fontSize: 11,
      color: colors.warning,
      fontWeight: '600',
      marginBottom: 2,
    },
    debtDays: {
      fontSize: 11,
      color: colors.primary,
      fontWeight: '600',
    },
    debtDaysDue: {
      color: colors.primary,
      fontWeight: '700',
    },
    progressContainer: {
      marginTop: 8,
    },
    progressBar: {
      height: 6,
      backgroundColor: colors.border,
      borderRadius: 3,
      overflow: 'hidden',
      marginBottom: 4,
    },
    progressFill: {
      height: '100%',
      backgroundColor: colors.primary,
    },
    progressText: {
      fontSize: 11,
      color: colors.textSecondary,
      textAlign: 'right',
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
    deleteButtonInline: {
      padding: 4,
      borderRadius: 8,
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
    skeletonContainer: {
      paddingHorizontal: 20,
    },
  });
