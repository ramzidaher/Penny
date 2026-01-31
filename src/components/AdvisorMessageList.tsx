import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

export interface AdvisorChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AdvisorMessageListProps {
  messages: AdvisorChatMessage[];
  loading?: boolean;
  onRetryLastError?: () => void;
}

function isErrorMessage(text: string) {
  return text.startsWith('Error:') || text.includes('API key not configured');
}

export default function AdvisorMessageList({ messages, loading, onRetryLastError }: AdvisorMessageListProps) {
  const renderTextWithBold = (text: string) => {
    const parts: Array<{ text: string; bold: boolean }> = [];
    let currentIndex = 0;
    const regex = /\*\*(.*?)\*\*/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > currentIndex) {
        parts.push({ text: text.substring(currentIndex, match.index), bold: false });
      }
      parts.push({ text: match[1], bold: true });
      currentIndex = match.index + match[0].length;
    }

    if (currentIndex < text.length) {
      parts.push({ text: text.substring(currentIndex), bold: false });
    }

    if (parts.length === 0) {
      return <Text style={styles.messageText}>{text}</Text>;
    }

    return (
      <Text style={styles.messageText}>
        {parts.map((part, index) => (
          <Text key={index} style={part.bold ? styles.messageTextBold : undefined}>
            {part.text}
          </Text>
        ))}
      </Text>
    );
  };

  return (
    <View style={styles.messagesContainer}>
      {messages.map((message, index) => (
        <View
          key={index}
          style={[
            styles.messageContainer,
            message.role === 'user' ? styles.userMessage : styles.assistantMessage,
          ]}
        >
          <View style={styles.messageHeader}>
            <Ionicons
              name={message.role === 'user' ? 'person' : 'chatbubble'}
              size={16}
              color={message.role === 'user' ? colors.primary : colors.text}
            />
            <Text style={styles.messageLabel}>{message.role === 'user' ? 'You' : 'Penny'}</Text>
          </View>
          {message.role === 'assistant'
            ? renderTextWithBold(message.content)
            : <Text style={styles.messageText}>{message.content}</Text>}
        </View>
      ))}

      {!!loading && (
        <View style={[styles.messageContainer, styles.assistantMessage]}>
          <View style={styles.thinkingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.thinkingText}>Penny is thinking…</Text>
          </View>
        </View>
      )}

      {!loading && onRetryLastError && messages.length >= 2 && (
        (() => {
          const last = messages[messages.length - 1];
          if (last.role !== 'assistant' || !isErrorMessage(last.content)) return null;
          return (
            <TouchableOpacity
              style={styles.retryButton}
              onPress={onRetryLastError}
              activeOpacity={0.8}
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          );
        })()
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  messagesContainer: {
    paddingHorizontal: 20,
    marginBottom: 24,
    gap: 12,
  },
  messageContainer: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  userMessage: {
    backgroundColor: colors.primary + '20',
    borderColor: colors.primary + '40',
    alignSelf: 'flex-end',
    maxWidth: '85%',
  },
  assistantMessage: {
    backgroundColor: colors.surface,
    alignSelf: 'flex-start',
    maxWidth: '85%',
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  messageLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  messageText: {
    ...typography.body,
    color: colors.text,
    lineHeight: 24,
  },
  messageTextBold: {
    fontWeight: '700',
  },
  thinkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  thinkingText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  retryButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
    marginLeft: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retryText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '700',
  },
});

