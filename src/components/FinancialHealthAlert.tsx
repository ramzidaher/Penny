import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { formatCurrencySync } from '../utils/currency';

const DISMISSED_UNTIL_KEY = 'financial_health_alert_dismissed_until';
const WARNING_AMBER = '#F59E0B';

export type HealthStatus = 'critical' | 'warning' | 'healthy';

function getHealthStatus(income: number, expenses: number): HealthStatus {
  if (income === 0 && expenses === 0) return 'healthy';
  if (income === 0 && expenses > 0) return 'critical';
  if (expenses > income * 1.2) return 'critical';
  if (expenses > income * 0.9) return 'warning';
  return 'healthy';
}

function getStartOfNextDay(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

interface FinancialHealthAlertProps {
  income: number;
  expenses: number;
  currencyCode: string;
  onReviewSpending: () => void;
}

export default function FinancialHealthAlert({
  income,
  expenses,
  currencyCode,
  onReviewSpending,
}: FinancialHealthAlertProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const status = useMemo(() => getHealthStatus(income, expenses), [income, expenses]);
  const [dismissedUntil, setDismissedUntil] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_UNTIL_KEY).then((val) => {
      setDismissedUntil(val);
      setLoaded(true);
    });
  }, []);

  const isDismissed = useMemo(() => {
    if (!loaded || !dismissedUntil) return false;
    return new Date() < new Date(dismissedUntil);
  }, [loaded, dismissedUntil]);

  const visible = loaded && status !== 'healthy' && !isDismissed;

  useEffect(() => {
    if (!visible) return;
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 50,
        friction: 8,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible]);

  const handleDismiss = useCallback(async () => {
    const next = getStartOfNextDay();
    await AsyncStorage.setItem(DISMISSED_UNTIL_KEY, next);
    setDismissedUntil(next);
  }, []);

  if (!visible) return null;

  const overAmount = Math.max(0, expenses - income);
  const expensePct = income > 0 ? Math.round((expenses / income) * 100) : null;
  const isCritical = status === 'critical';

  const backgroundColor = isCritical ? colors.destructive : WARNING_AMBER;
  const bannerStyle = [styles.banner, { backgroundColor }];

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <View style={bannerStyle}>
        <View style={styles.content}>
          <Text style={styles.title} numberOfLines={2}>
            {isCritical
              ? income > 0 && expensePct !== null
                ? `⚠️ You're ${formatCurrencySync(overAmount, currencyCode)} over budget · ${expensePct}% of income`
                : `⚠️ Spending Alert: You're ${formatCurrencySync(overAmount, currencyCode)} over budget`
              : `Spending warning: expenses are ${expensePct ?? '—'}% of your income`}
          </Text>
          <TouchableOpacity
            style={styles.cta}
            onPress={onReviewSpending}
            activeOpacity={0.8}
          >
            <Text style={styles.ctaText}>Review Spending Plan</Text>
            <Ionicons name="arrow-forward" size={14} color="#fff" />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.dismissButton}
          onPress={handleDismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={18} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const createStyles = (colors: { destructive: string }) =>
  StyleSheet.create({
    container: {
      marginHorizontal: 20,
      marginBottom: 12,
    },
    banner: {
      borderRadius: 12,
      padding: 12,
      paddingRight: 36,
      flexDirection: 'row',
      alignItems: 'flex-start',
      borderWidth: 0,
    },
    content: {
      flex: 1,
    },
    title: {
      fontSize: 14,
      fontWeight: '700',
      color: '#fff',
      marginBottom: 8,
      lineHeight: 20,
    },
    cta: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: 'rgba(0,0,0,0.2)',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      gap: 4,
    },
    ctaText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#fff',
    },
    dismissButton: {
      position: 'absolute',
      top: 8,
      right: 8,
      padding: 2,
    },
  });
