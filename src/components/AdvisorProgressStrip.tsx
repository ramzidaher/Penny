import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

interface AdvisorProgressStripProps {
  xp: number;
  level: number;
  streakCount: number;
  compact?: boolean;
}

export default function AdvisorProgressStrip({ xp, level, streakCount, compact }: AdvisorProgressStripProps) {
  const { intoLevel, toNext, pct } = useMemo(() => {
    const into = xp % 100;
    const toNextLevel = 100 - into;
    return {
      intoLevel: into,
      toNext: toNextLevel,
      pct: into / 100,
    };
  }, [xp]);

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <View style={styles.row}>
        <View style={styles.pill}>
          <Ionicons name="flame" size={16} color={colors.primary} />
          <Text style={styles.pillText}>{streakCount} day streak</Text>
        </View>
        <View style={styles.pill}>
          <Ionicons name="trophy" size={16} color={colors.primary} />
          <Text style={styles.pillText}>Level {level}</Text>
        </View>
        {!compact && (
          <Text style={styles.smallMeta}>{toNext} XP to next</Text>
        )}
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.max(4, pct * 100)}%` }]} />
      </View>

      {!compact && (
        <Text style={styles.progressLabel}>{intoLevel}/100 XP</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  containerCompact: {
    paddingVertical: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.primary + '10',
    borderWidth: 1,
    borderColor: colors.primary + '20',
  },
  pillText: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: '800',
  },
  smallMeta: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '700',
    marginLeft: 'auto',
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  progressLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '700',
    marginTop: 8,
  },
});

