import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { ChatThread } from '../database/schema';

interface AdvisorThreadsModalProps {
  visible: boolean;
  threads: ChatThread[];
  currentThreadId: string | null;
  bottomInset?: number;
  onClose: () => void;
  onNewThread: () => void;
  onSelectThread: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
}

export default function AdvisorThreadsModal({
  visible,
  threads,
  currentThreadId,
  bottomInset = 0,
  onClose,
  onNewThread,
  onSelectThread,
  onDeleteThread,
}: AdvisorThreadsModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { paddingBottom: bottomInset }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Conversations</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseButton} activeOpacity={0.7}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.threadsList}
            contentContainerStyle={styles.threadsListContent}
            showsVerticalScrollIndicator={false}
          >
            <TouchableOpacity
              style={[
                styles.threadItem,
                styles.newConversationItem,
                !currentThreadId && styles.threadItemActive,
              ]}
              onPress={onNewThread}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle" size={20} color={colors.primary} />
              <Text style={styles.threadItemText}>New Conversation</Text>
            </TouchableOpacity>

            {threads.map((thread) => (
              <View key={thread.id} style={styles.threadItemContainer}>
                <TouchableOpacity
                  style={[styles.threadItem, currentThreadId === thread.id && styles.threadItemActive]}
                  onPress={() => onSelectThread(thread.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="chatbubble"
                    size={22}
                    color={currentThreadId === thread.id ? colors.primary : colors.text}
                  />
                  <Text style={styles.threadItemText} numberOfLines={1}>
                    {thread.title}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteThreadButton}
                  onPress={() => onDeleteThread(thread.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.textLight} />
                </TouchableOpacity>
              </View>
            ))}

            {threads.length === 0 && (
              <Text style={styles.emptyThreadsText}>No conversations yet</Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },
  modalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  threadsList: {
    flex: 1,
  },
  threadsListContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
  },
  threadItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  threadItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
    minHeight: 46,
  },
  newConversationItem: {
    marginBottom: 10,
  },
  threadItemActive: {
    backgroundColor: colors.primary + '15',
    borderColor: colors.primary + '50',
    borderWidth: 1.5,
  },
  threadItemText: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
  },
  deleteThreadButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyThreadsText: {
    ...typography.body,
    color: colors.textLight,
    textAlign: 'center',
    paddingVertical: 40,
  },
});

