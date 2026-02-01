import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { typography } from '../theme/typography';
import { colors } from '../theme/colors';
import { UserMemory } from '../database/schema';
import AdvisorMemoryCard from './AdvisorMemoryCard';

interface AdvisorMemoryListProps {
  title: string;
  memories: UserMemory[];
  onEdit: (memory: UserMemory) => void;
  onDelete: (memory: UserMemory) => void;
  onTogglePause: (memory: UserMemory) => void;
  onConfirm?: (memory: UserMemory) => void;
}

export default function AdvisorMemoryList({
  title,
  memories,
  onEdit,
  onDelete,
  onTogglePause,
  onConfirm,
}: AdvisorMemoryListProps) {
  if (memories.length === 0) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.emptyText}>No memories yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {memories.map((memory) => (
        <AdvisorMemoryCard
          key={memory.id}
          memory={memory}
          onEdit={onEdit}
          onDelete={onDelete}
          onTogglePause={onTogglePause}
          onConfirm={onConfirm}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '800',
    marginBottom: 10,
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: 8,
  },
});
