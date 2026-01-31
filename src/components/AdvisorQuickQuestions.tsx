import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

interface AdvisorQuickQuestionsProps {
  title?: string;
  questions: string[];
  disabled?: boolean;
  visible?: boolean;
  onSelect: (question: string) => void;
}

export default function AdvisorQuickQuestions({
  title = 'Quick Questions',
  questions,
  disabled,
  visible = true,
  onSelect,
}: AdvisorQuickQuestionsProps) {
  if (!visible) return null;

  return (
    <View style={styles.quickQuestionsContainer}>
      <Text style={styles.quickQuestionsTitle}>{title}</Text>
      {questions.map((q, index) => (
        <TouchableOpacity
          key={index}
          style={styles.quickQuestionButton}
          onPress={() => onSelect(q)}
          disabled={disabled}
          activeOpacity={0.8}
        >
          <Text style={styles.quickQuestionText}>{q}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  quickQuestionsContainer: {
    marginTop: 8,
    paddingHorizontal: 20,
  },
  quickQuestionsTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
    marginBottom: 12,
  },
  quickQuestionButton: {
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  quickQuestionText: {
    ...typography.bodySmall,
    color: colors.text,
  },
});

