import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { addDays, differenceInDays } from 'date-fns';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { MemoryCategory, MemoryTier, UserMemory } from '../database/schema';
import AdvisorMemoryList from './AdvisorMemoryList';
import { MemoryDraft } from '../services/memoryService';

interface AdvisorMemoryModalProps {
  visible: boolean;
  memories: UserMemory[];
  onClose: () => void;
  onCreate: (draft: MemoryDraft) => void;
  onUpdate: (id: string, draft: MemoryDraft) => void;
  onDelete: (memory: UserMemory) => void;
  onTogglePause: (memory: UserMemory) => void;
  onConfirm: (memory: UserMemory) => void;
  onForgetAll: () => void;
}

const tierOptions: Array<{ value: MemoryTier; label: string }> = [
  { value: 'core', label: 'Core' },
  { value: 'dynamic', label: 'Dynamic' },
  { value: 'session', label: 'Session' },
];

const categoryOptions: Array<{ value: MemoryCategory; label: string }> = [
  { value: 'income', label: 'Income' },
  { value: 'household', label: 'Household' },
  { value: 'housing', label: 'Housing' },
  { value: 'goals', label: 'Goals' },
  { value: 'risk', label: 'Risk' },
  { value: 'preferences', label: 'Preferences' },
  { value: 'constraints', label: 'Constraints' },
  { value: 'situation', label: 'Situation' },
  { value: 'spending', label: 'Spending' },
  { value: 'employment', label: 'Employment' },
  { value: 'debt', label: 'Debt' },
  { value: 'savings', label: 'Savings' },
  { value: 'budgeting', label: 'Budgeting' },
  { value: 'health', label: 'Health' },
  { value: 'legal', label: 'Legal' },
  { value: 'family', label: 'Family' },
  { value: 'other', label: 'Other' },
];

const confidenceOptions: Array<{ value: MemoryDraft['confidence']; label: string }> = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const emptyDraft: MemoryDraft = {
  tier: 'core',
  category: 'goals',
  title: '',
  detail: '',
  confidence: 'high',
  status: 'active',
};

export default function AdvisorMemoryModal({
  visible,
  memories,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  onTogglePause,
  onConfirm,
  onForgetAll,
}: AdvisorMemoryModalProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MemoryDraft>(emptyDraft);
  const [expiresInDays, setExpiresInDays] = useState('30');

  const coreMemories = useMemo(
    () => memories.filter((m) => m.tier === 'core'),
    [memories]
  );
  const dynamicMemories = useMemo(
    () => memories.filter((m) => m.tier === 'dynamic'),
    [memories]
  );
  const sessionMemories = useMemo(
    () => memories.filter((m) => m.tier === 'session'),
    [memories]
  );

  useEffect(() => {
    if (!visible) {
      setEditingId(null);
      setDraft(emptyDraft);
      setExpiresInDays('30');
      return;
    }
    if (editingId && draft.tier !== 'core' && draft.expiresAt) {
      const days = Math.max(1, differenceInDays(new Date(draft.expiresAt), new Date()));
      setExpiresInDays(String(days));
    }
  }, [visible, editingId, draft.tier, draft.expiresAt]);

  const startNew = () => {
    setEditingId(null);
    setDraft(emptyDraft);
    setExpiresInDays('30');
  };

  const startEdit = (memory: UserMemory) => {
    setEditingId(memory.id);
    setDraft({
      tier: memory.tier,
      category: memory.category,
      title: memory.title,
      detail: memory.detail,
      confidence: memory.confidence,
      status: memory.status,
      requiresReview: memory.requiresReview,
      isConfirmed: memory.isConfirmed,
      expiresAt: memory.expiresAt,
      tags: memory.tags,
    });
    if (memory.expiresAt && memory.tier !== 'core') {
      const days = Math.max(1, differenceInDays(new Date(memory.expiresAt), new Date()));
      setExpiresInDays(String(days));
    }
  };

  const handleSave = () => {
    if (!draft.title.trim() || !draft.detail.trim()) return;
    const nextDraft: MemoryDraft = { ...draft };
    if (nextDraft.tier !== 'core') {
      const days = Math.max(1, parseInt(expiresInDays, 10) || 30);
      nextDraft.expiresAt = addDays(new Date(), days).toISOString();
    } else {
      nextDraft.expiresAt = undefined;
    }
    if (editingId) {
      onUpdate(editingId, nextDraft);
    } else {
      onCreate(nextDraft);
    }
    startNew();
  };

  const hasEditing = editingId !== null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalContainer}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>AI Memory</Text>
              <Text style={styles.subtitle}>Review and manage what Penny remembers.</Text>
            </View>
            <TouchableOpacity onPress={onClose} activeOpacity={0.8}>
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.editorCard}>
              <View style={styles.editorHeader}>
                <Text style={styles.editorTitle}>{hasEditing ? 'Edit memory' : 'New memory'}</Text>
                <TouchableOpacity onPress={startNew} activeOpacity={0.8}>
                  <Text style={styles.editorAction}>Reset</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>Tier</Text>
              <View style={styles.rowWrap}>
                {tierOptions.map((tier) => (
                  <TouchableOpacity
                    key={tier.value}
                    style={[
                      styles.optionButton,
                      draft.tier === tier.value && styles.optionButtonActive,
                    ]}
                    onPress={() => setDraft((prev) => ({ ...prev, tier: tier.value }))}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        draft.tier === tier.value && styles.optionTextActive,
                      ]}
                    >
                      {tier.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Category</Text>
              <View style={styles.rowWrap}>
                {categoryOptions.map((category) => (
                  <TouchableOpacity
                    key={category.value}
                    style={[
                      styles.optionButton,
                      draft.category === category.value && styles.optionButtonActive,
                    ]}
                    onPress={() => setDraft((prev) => ({ ...prev, category: category.value }))}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        draft.category === category.value && styles.optionTextActive,
                      ]}
                    >
                      {category.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Title</Text>
              <TextInput
                style={styles.input}
                placeholder="Short label (e.g., Debt payoff)"
                placeholderTextColor={colors.textLight}
                value={draft.title}
                onChangeText={(text) => setDraft((prev) => ({ ...prev, title: text }))}
              />

              <Text style={styles.fieldLabel}>Details</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                placeholder="Add a short description or intent"
                placeholderTextColor={colors.textLight}
                value={draft.detail}
                onChangeText={(text) => setDraft((prev) => ({ ...prev, detail: text }))}
                multiline
              />

              <Text style={styles.fieldLabel}>Confidence</Text>
              <View style={styles.rowWrap}>
                {confidenceOptions.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.optionButton,
                      draft.confidence === opt.value && styles.optionButtonActive,
                    ]}
                    onPress={() => setDraft((prev) => ({ ...prev, confidence: opt.value || 'high' }))}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        draft.confidence === opt.value && styles.optionTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {draft.tier !== 'core' && (
                <>
                  <Text style={styles.fieldLabel}>Expires in (days)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={expiresInDays}
                    onChangeText={setExpiresInDays}
                  />
                </>
              )}

              <TouchableOpacity style={styles.saveButton} onPress={handleSave} activeOpacity={0.85}>
                <Text style={styles.saveButtonText}>{hasEditing ? 'Update memory' : 'Add memory'}</Text>
                <Ionicons name="checkmark" size={18} color={colors.background} />
              </TouchableOpacity>
            </View>

            <View style={styles.sectionDivider} />

            <AdvisorMemoryList
              title="Core memory"
              memories={coreMemories}
              onEdit={startEdit}
              onDelete={onDelete}
              onTogglePause={onTogglePause}
              onConfirm={onConfirm}
            />

            <AdvisorMemoryList
              title="Dynamic memory"
              memories={dynamicMemories}
              onEdit={startEdit}
              onDelete={onDelete}
              onTogglePause={onTogglePause}
              onConfirm={onConfirm}
            />

            <AdvisorMemoryList
              title="Session memory"
              memories={sessionMemories}
              onEdit={startEdit}
              onDelete={onDelete}
              onTogglePause={onTogglePause}
              onConfirm={onConfirm}
            />

            <TouchableOpacity style={styles.forgetButton} onPress={onForgetAll} activeOpacity={0.85}>
              <Ionicons name="trash" size={16} color={colors.text} />
              <Text style={styles.forgetButtonText}>Forget all AI memories</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  sheet: {
    backgroundColor: colors.background,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: '90%',
  },
  header: {
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    ...typography.body,
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 4,
  },
  content: {
    padding: 18,
    paddingBottom: 30,
  },
  editorCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
    backgroundColor: colors.surface,
  },
  editorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  editorTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
  },
  editorAction: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  fieldLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.background,
  },
  optionButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionText: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: '600',
  },
  optionTextActive: {
    color: colors.background,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.background,
    ...typography.body,
    color: colors.text,
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  saveButton: {
    marginTop: 14,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  saveButtonText: {
    ...typography.body,
    color: colors.background,
    fontWeight: '700',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 16,
  },
  forgetButton: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  forgetButtonText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '600',
  },
});
