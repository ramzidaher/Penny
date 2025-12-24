import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getBudgets, deleteBudget } from '../database/db';
import { Budget } from '../database/schema';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { SkeletonList } from '../components/SkeletonLoader';
import { waitForFirebase } from '../services/firebase';
import { getSettings } from '../services/settingsService';
import { formatCurrencySync } from '../utils/currency';

export default function BudgetsScreen() {
  const navigation = useNavigation();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currencyCode, setCurrencyCode] = useState<string>('USD');

  const loadBudgets = async () => {
    try {
      setLoading(true);
      await waitForFirebase();
      const [buds, settings] = await Promise.all([
        getBudgets(),
        getSettings(),
      ]);
      setBudgets(buds);
      setCurrencyCode(settings.defaultCurrency);
    } catch (error) {
      console.error('Error loading budgets:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadBudgets();
    }, 100);
    const unsubscribe = navigation.addListener('focus', loadBudgets);
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [navigation]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadBudgets();
    setRefreshing(false);
  };

  const handleDelete = async (id: string) => {
    await deleteBudget(id);
    await loadBudgets();
  };

  const getProgressPercentage = (budget: Budget) => {
    return Math.min((budget.currentSpent / budget.limit) * 100, 100);
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 100) return colors.error;
    if (percentage >= 80) return colors.textSecondary;
    return colors.primary;
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
        data={budgets}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No budgets yet</Text>
            <Text style={styles.emptySubtext}>Create a budget to track your spending</Text>
          </View>
        }
        renderItem={({ item }) => {
          const percentage = getProgressPercentage(item);
          const progressColor = getProgressColor(percentage);
          
          return (
            <View style={styles.budgetCard}>
              <View style={styles.budgetHeader}>
                <Text style={styles.budgetCategory}>{item.category}</Text>
                <TouchableOpacity
                  onPress={() => handleDelete(item.id)}
                  style={styles.deleteButton}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <View style={styles.budgetAmounts}>
                <Text style={styles.budgetSpent}>{formatCurrencySync(item.currentSpent, currencyCode)}</Text>
                <Text style={styles.budgetLimit}>/ {formatCurrencySync(item.limit, currencyCode)}</Text>
              </View>
              <View style={styles.progressContainer}>
                <View style={[styles.progressBar, { width: `${percentage}%`, backgroundColor: progressColor }]} />
              </View>
              <Text style={styles.budgetPeriod}>{item.period}</Text>
            </View>
          );
        }}
        contentContainerStyle={styles.listContent}
      />
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('AddBudget' as never)}
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
  budgetCard: {
    backgroundColor: colors.surface,
    padding: 20,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  budgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  budgetCategory: {
    ...typography.h3,
    color: colors.text,
  },
  deleteButton: {
    padding: 4,
  },
  budgetAmounts: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  budgetSpent: {
    ...typography.h2,
    color: colors.text,
  },
  budgetLimit: {
    ...typography.body,
    color: colors.textSecondary,
    marginLeft: 4,
  },
  progressContainer: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  budgetPeriod: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'capitalize',
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
    shadowColor: '#1A1A1A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
});

