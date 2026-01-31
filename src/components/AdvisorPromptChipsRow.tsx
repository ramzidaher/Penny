import React from 'react';
import { ScrollView, Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

interface AdvisorPromptChipsRowProps {
  prompts: string[];
  disabled?: boolean;
  onSelect: (prompt: string) => void;
}

export default function AdvisorPromptChipsRow({ prompts, disabled, onSelect }: AdvisorPromptChipsRowProps) {
  if (!prompts.length) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {prompts.map((p) => (
        <TouchableOpacity
          key={p}
          style={styles.chip}
          onPress={() => onSelect(p)}
          disabled={disabled}
          activeOpacity={0.85}
        >
          <Text style={styles.chipText} numberOfLines={1}>
            {p}
          </Text>
        </TouchableOpacity>
      ))}
      <View style={styles.trailingSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
    gap: 10,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 260,
  },
  chipText: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: '600',
  },
  trailingSpacer: {
    width: 10,
  },
});

