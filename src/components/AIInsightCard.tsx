import React, { useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { typography } from '../theme/typography';
import type { Insight, InsightType } from '../types/insight';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CONTAINER_WIDTH = SCREEN_WIDTH - 40; // marginHorizontal 20 * 2
const CARD_WIDTH = CONTAINER_WIDTH; // one card per page for pagingEnabled

interface AIInsightCardProps {
  insights: Insight[];
  loading: boolean;
  accessDenied?: boolean;
  accessDeniedReason?: 'upgrade' | 'limit' | 'demo_paywall';
  onRefresh: () => void;
}

function getIconForType(type: InsightType, priority: string): { name: keyof typeof Ionicons.glyphMap; color?: string } {
  if (priority === 'critical') {
    return { name: 'warning', color: '#F59E0B' };
  }
  switch (type) {
    case 'spending_pattern':
      return { name: 'trending-up' };
    case 'prediction':
      return { name: 'warning', color: '#F59E0B' };
    case 'opportunity':
      return { name: 'bulb' };
    case 'anomaly':
      return { name: 'alert-circle' };
    default:
      return { name: 'information-circle' };
  }
}

function SingleInsightCard({
  insight,
  colors,
  styles,
  onCtaPress,
}: {
  insight: Insight;
  colors: { surface: string; border: string; text: string; textSecondary: string; primary: string };
  styles: ReturnType<typeof createStyles>;
  onCtaPress: (insight: Insight) => void;
}) {
  const { name: iconName, color: iconColor } = getIconForType(insight.type, insight.priority);
  return (
    <View style={[styles.cardPage, { width: CARD_WIDTH }]}>
      <View style={styles.cardIconRow}>
        <View style={[styles.iconContainer, iconColor && { backgroundColor: iconColor + '20' }]}>
          <Ionicons name={iconName} size={20} color={iconColor || colors.primary} />
        </View>
      </View>
      <Text style={styles.headline} numberOfLines={2}>
        {insight.headline}
      </Text>
      <Text style={styles.detail} numberOfLines={3}>
        {insight.detail}
      </Text>
      <TouchableOpacity
        style={styles.ctaButton}
        onPress={() => onCtaPress(insight)}
        activeOpacity={0.7}
      >
        <Text style={styles.ctaLabel}>{insight.ctaLabel}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

export default function AIInsightCard({
  insights,
  loading,
  accessDenied = false,
  accessDeniedReason,
  onRefresh,
}: AIInsightCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [pageIndex, setPageIndex] = React.useState(0);

  const onCtaPress = (insight: Insight) => {
    if (insight.ctaRoute) {
      if (insight.ctaRoute.startsWith('/(tabs)')) {
        router.push(insight.ctaRoute as any);
      } else {
        router.push(insight.ctaRoute as any);
      }
    } else {
      router.push('/(tabs)/advisor');
    }
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const index = Math.round(x / CARD_WIDTH);
    if (index >= 0 && index < insights.length) setPageIndex(index);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Ionicons name="sparkles" size={18} color={colors.primary} />
          </View>
          <Text style={styles.title}>AI Insights</Text>
          <View style={styles.refreshButton} />
        </View>
        <View style={styles.content}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (accessDenied) {
    const message =
      accessDeniedReason === 'limit'
        ? 'Weekly AI limit reached. Try again next week.'
        : accessDeniedReason === 'demo_paywall'
          ? 'Sign in to see AI insights.'
          : 'Upgrade to see AI insights.';
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Ionicons name="sparkles" size={18} color={colors.primary} />
          </View>
          <Text style={styles.title}>AI Insights</Text>
          <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
            <Ionicons name="refresh" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <View style={styles.content}>
          <Text style={styles.insightText}>{message}</Text>
        </View>
      </View>
    );
  }

  if (!insights || insights.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Ionicons name="sparkles" size={18} color={colors.primary} />
          </View>
          <Text style={styles.title}>AI Insights</Text>
          <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
            <Ionicons name="refresh" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <View style={styles.content}>
          <Text style={styles.insightText}>No insights right now. Pull to refresh or tap Refresh.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Ionicons name="sparkles" size={18} color={colors.primary} />
        </View>
        <Text style={styles.title}>AI Insights</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
          <Ionicons name="refresh" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        contentContainerStyle={styles.carouselContent}
        decelerationRate="fast"
      >
        {insights.map((insight, index) => (
          <SingleInsightCard
            key={`${insight.headline}-${index}`}
            insight={insight}
            colors={colors}
            styles={styles}
            onCtaPress={onCtaPress}
          />
        ))}
      </ScrollView>
      {insights.length > 1 && (
        <View style={styles.dots}>
          {insights.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === pageIndex && styles.dotActive,
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: {
  surface: string;
  border: string;
  text: string;
  textSecondary: string;
  primary: string;
}) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.surface,
      marginHorizontal: 20,
      marginBottom: 24,
      paddingVertical: 16,
      paddingHorizontal: 0,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
      paddingHorizontal: 16,
      gap: 8,
    },
    iconContainer: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.primary + '10',
      justifyContent: 'center',
      alignItems: 'center',
    },
    title: {
      ...typography.body,
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      flex: 1,
    },
    refreshButton: {
      padding: 4,
      minWidth: 28,
    },
    content: {
      minHeight: 48,
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    insightText: {
      ...typography.bodySmall,
      fontSize: 13,
      lineHeight: 18,
      color: colors.textSecondary,
    },
    carouselContent: {
      paddingHorizontal: 16,
    },
    cardPage: {
      paddingHorizontal: 16,
    },
    cardIconRow: {
      marginBottom: 8,
    },
    headline: {
      ...typography.body,
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 6,
    },
    detail: {
      ...typography.bodySmall,
      fontSize: 13,
      lineHeight: 18,
      color: colors.textSecondary,
      marginBottom: 12,
    },
    ctaButton: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 4,
    },
    ctaLabel: {
      ...typography.bodySmall,
      fontSize: 13,
      fontWeight: '600',
      color: colors.primary,
    },
    dots: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 6,
      marginTop: 12,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.border,
    },
    dotActive: {
      backgroundColor: colors.primary,
      width: 8,
      height: 8,
      borderRadius: 4,
    },
  });
