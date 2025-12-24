import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getDebts, deleteDebt } from '../database/db';
import { Debt } from '../database/schema';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { format, differenceInDays } from 'date-fns';
import { SkeletonList } from '../components/SkeletonLoader';
import { waitForFirebase } from '../services/firebase';
import { getSettings } from '../services/settingsService';
import { formatCurrencySync } from '../utils/currency';

export default function DebtsScreen() {
  const navigation = useNavigation();
  const [debts, setDebts] = useState<Debt[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currencyCode, setCurrencyCode] = useState<string>('USD');

  const loadDebts = async () => {
    try {
      setLoading(true);
      await waitForFirebase();
      const [debtsData, settings] = await Promise.all([
        getDebts(),
        getSettings(),
      ]);
      setDebts(debtsData);
      setCurrencyCode(settings.defaultCurrency);
    } catch (error) {
      console.error('Error loading debts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadDebts();
    }, 100);
    const unsubscribe = navigation.addListener('focus', loadDebts);
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [navigation]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDebts();
    setRefreshing(false);
  };

  const handleDelete = async (id: string) => {
    await deleteDebt(id);
    await loadDebts();
  };

  const getDebtIcon = (type: Debt['type']) => {
    switch (type) {
      case 'loan':
        return 'cash-outline';
      case 'credit_card':
        return 'card-outline';
      case 'buy_now_pay_later':
        return 'bag-outline';
      case 'personal':
        return 'person-outline';
      default:
        return 'document-text-outline';
    }
  };

  const getStatusColor = (status: Debt['status']) => {
    switch (status) {
      case 'overdue':
        return '#FF3B30';
      case 'paid_off':
        return '#34C759';
      default:
        return colors.primary;
    }
  };

  const getDaysUntilDue = (dueDate: string) => {
    const days = differenceInDays(new Date(dueDate), new Date());
    return days;
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

  const activeDebts = debts.filter(d => d.status === 'active');
  const totalDebt = activeDebts.reduce((sum, debt) => sum + debt.remainingAmount, 0);

  return (
    <View style={styles.container}>
      {/* Header Stats */}
      <View style={styles.headerStats}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{activeDebts.length}</Text>
          <Text style={styles.statLabel}>Active Debts</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{formatCurrencySync(totalDebt, currencyCode)}</Text>
          <Text style={styles.statLabel}>Total Debt</Text>
        </View>
      </View>

      <FlatList
        data={debts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const daysUntil = getDaysUntilDue(item.dueDate);
          const isOverdue = daysUntil < 0 && item.status === 'active';
          const percentagePaid = ((item.totalAmount - item.remainingAmount) / item.totalAmount) * 100;

          return (
            <TouchableOpacity
              style={styles.debtCard}
              activeOpacity={0.7}
            >
              <View style={styles.debtHeader}>
                <View style={styles.debtLeft}>
                  <View style={[styles.debtIconContainer, { backgroundColor: colors.surface }]}>
                    <Ionicons name={getDebtIcon(item.type) as any} size={24} color={colors.primary} />
                  </View>
                  <View style={styles.debtInfo}>
                    <Text style={styles.debtName}>{item.name}</Text>
                    <Text style={styles.debtType}>{item.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</Text>
                  </View>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
                  <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                    {item.status === 'paid_off' ? 'Paid Off' : item.status === 'overdue' ? 'Overdue' : 'Active'}
                  </Text>
                </View>
              </View>

              <View style={styles.debtAmounts}>
                <View>
                  <Text style={styles.amountLabel}>Remaining</Text>
                  <Text style={styles.remainingAmount}>{formatCurrencySync(item.remainingAmount, currencyCode)}</Text>
                </View>
                <View style={styles.amountDivider} />
                <View>
                  <Text style={styles.amountLabel}>Total</Text>
                  <Text style={styles.totalAmount}>{formatCurrencySync(item.totalAmount, currencyCode)}</Text>
                </View>
              </View>

              {item.minimumPayment && (
                <View style={styles.minPaymentRow}>
                  <Text style={styles.minPaymentLabel}>Minimum Payment:</Text>
                  <Text style={styles.minPaymentAmount}>{formatCurrencySync(item.minimumPayment, currencyCode)}</Text>
                </View>
              )}

              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${percentagePaid}%` }]} />
                </View>
                <Text style={styles.progressText}>{percentagePaid.toFixed(0)}% Paid</Text>
              </View>

              <View style={styles.debtFooter}>
                <View style={styles.footerItem}>
                  <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
                  <Text style={styles.footerText}>
                    Due: {format(new Date(item.dueDate), 'MMM dd, yyyy')}
                  </Text>
                </View>
                <View style={styles.footerRight}>
                  {isOverdue && (
                    <View style={styles.overdueBadge}>
                      <Text style={styles.overdueText}>{Math.abs(daysUntil)} days overdue</Text>
                    </View>
                  )}
                  {!isOverdue && item.status === 'active' && (
                    <View style={styles.daysBadge}>
                      <Text style={styles.daysText}>{daysUntil} days left</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={() => handleDelete(item.id)}
                    style={styles.deleteButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={64} color={colors.textLight} />
            <Text style={styles.emptyText}>No debts yet</Text>
            <Text style={styles.emptySubtext}>Track your loans and credit</Text>
          </View>
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('AddDebt' as never)}
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
  headerStats: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  listContent: {
    padding: 20,
    paddingTop: 0,
  },
  debtCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  debtHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  debtLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  debtIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  debtInfo: {
    flex: 1,
  },
  debtName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  debtType: {
    fontSize: 13,
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  debtAmounts: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  amountLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  remainingAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  amountDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
    marginHorizontal: 20,
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  minPaymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  minPaymentLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  minPaymentAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  progressContainer: {
    marginBottom: 12,
  },
  progressBar: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  progressText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'right',
  },
  debtFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  overdueBadge: {
    backgroundColor: '#FF3B3020',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  overdueText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF3B30',
  },
  daysBadge: {
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  daysText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  deleteButton: {
    padding: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});

