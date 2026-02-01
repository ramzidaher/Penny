import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { UserMemory } from '../database/schema';

interface AdvisorMemoryCardProps {
  memory: UserMemory;
  onEdit: (memory: UserMemory) => void;
  onDelete: (memory: UserMemory) => void;
  onTogglePause: (memory: UserMemory) => void;
  onConfirm?: (memory: UserMemory) => void;
}

export default function AdvisorMemoryCard({
  memory,
  onEdit,
  onDelete,
  onTogglePause,
  onConfirm,
}: AdvisorMemoryCardProps) {
  const metaPieces = [
    memory.category,
    memory.source,
    memory.confidence,
    memory.status === 'paused' ? 'paused' : 'active',
  ];
  const expiresLabel =
    memory.expiresAt && memory.tier !== 'core'
      ? `Expires ${format(new Date(memory.expiresAt), 'MMM d, yyyy')}`
      : null;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>{memory.title}</Text>
          <Text style={styles.meta}>{metaPieces.filter(Boolean).join(' · ')}</Text>
        </View>
        <Ionicons
          name={memory.tier === 'core' ? 'shield-checkmark' : memory.tier === 'dynamic' ? 'time' : 'pulse'}
          size={18}
          color={colors.textSecondary}
        />
      </View>

      <Text style={styles.detail}>{memory.detail}</Text>
      {!!expiresLabel && <Text style={styles.expiry}>{expiresLabel}</Text>}

      {memory.requiresReview && !memory.isConfirmed && (
        <View style={styles.reviewBanner}>
          <Ionicons name="alert-circle" size={16} color={colors.text} />
          <Text style={styles.reviewText}>Needs confirmation before use</Text>
          {!!onConfirm && (
            <TouchableOpacity onPress={() => onConfirm(memory)} activeOpacity={0.8}>
              <Text style={styles.reviewAction}>Confirm</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity onPress={() => onEdit(memory)} activeOpacity={0.8}>
          <Text style={styles.actionText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onTogglePause(memory)} activeOpacity={0.8}>
          <Text style={styles.actionText}>
            {memory.status === 'paused' ? 'Resume' : 'Pause'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onDelete(memory)} activeOpacity={0.8}>
          <Text style={[styles.actionText, styles.actionDanger]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleWrap: {
    flex: 1,
  },
  title: {
    ...typography.body,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  meta: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  detail: {
    ...typography.body,
    color: colors.text,
    marginTop: 8,
  },
  expiry: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 6,
  },
  reviewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  reviewText: {
    ...typography.bodySmall,
    color: colors.text,
    flex: 1,
  },
  reviewAction: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 12,
  },
  actionText: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: '600',
  },
  actionDanger: {
    color: colors.text,
  },
});
