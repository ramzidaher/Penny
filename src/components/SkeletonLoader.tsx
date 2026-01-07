import React from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';

interface SkeletonLoaderProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: any;
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  width = '100%',
  height = 20,
  borderRadius = 8,
  style,
}) => {
  const animatedValue = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [animatedValue]);

  const opacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: colors.border,
          opacity,
        },
        style,
      ]}
    />
  );
};

// Pre-built skeleton components
export const SkeletonCard = () => (
  <View style={styles.card}>
    <View style={styles.cardHeader}>
      <SkeletonLoader width={48} height={48} borderRadius={24} />
      <View style={styles.cardHeaderText}>
        <SkeletonLoader width={120} height={16} style={styles.marginBottom} />
        <SkeletonLoader width={80} height={12} />
      </View>
    </View>
    <SkeletonLoader width="100%" height={1} style={styles.divider} />
    <View style={styles.cardContent}>
      <SkeletonLoader width={100} height={14} style={styles.marginBottom} />
      <SkeletonLoader width={60} height={12} />
    </View>
  </View>
);

export const SkeletonList = ({ count = 3 }: { count?: number }) => (
  <View>
    {Array.from({ length: count }).map((_, index) => (
      <SkeletonCard key={index} />
    ))}
  </View>
);

export const SkeletonStatCard = () => (
  <View style={styles.statCard}>
    <SkeletonLoader width={48} height={48} borderRadius={24} style={styles.marginBottom} />
    <SkeletonLoader width={60} height={20} style={styles.marginBottom} />
    <SkeletonLoader width={80} height={12} />
  </View>
);

export const SkeletonHeader = () => {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
      <SkeletonLoader width={200} height={32} style={styles.marginBottom} />
      <SkeletonLoader width={150} height={16} />
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardHeaderText: {
    flex: 1,
    marginLeft: 16,
  },
  cardContent: {
    marginTop: 16,
  },
  divider: {
    marginVertical: 16,
  },
  marginBottom: {
    marginBottom: 8,
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
  header: {
    padding: 20,
    paddingBottom: 24,
  },
});








