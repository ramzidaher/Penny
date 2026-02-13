import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { formatCurrencySync } from '../utils/currency';
import { format } from 'date-fns';
import type { DuplicateGroup } from '../utils/subscriptionDeduplication';

const WARNING_AMBER = '#F59E0B';

export interface DuplicateSubscriptionAlertProps {
  duplicateGroups: DuplicateGroup[];
  currencyCode: string;
  onMarkAsDifferentServices: (subscriptionIds: string[]) => Promise<void>;
  onRemoveDuplicates: (subscriptionIdsToRemove: string[]) => Promise<void>;
}

export default function DuplicateSubscriptionAlert({
  duplicateGroups,
  currencyCode,
  onMarkAsDifferentServices,
  onRemoveDuplicates,
}: DuplicateSubscriptionAlertProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);
  const [removeModalGroup, setRemoveModalGroup] = useState<DuplicateGroup | null>(null);
  const [selectedIdsToRemove, setSelectedIdsToRemove] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((merchantKey: string) => {
    setExpandedGroupKey((k) => (k === merchantKey ? null : merchantKey));
  }, []);

  const handleMarkAsDifferent = useCallback(
    async (group: DuplicateGroup) => {
      await onMarkAsDifferentServices(group.subscriptions.map((s) => s.id));
    },
    [onMarkAsDifferentServices]
  );

  const openRemoveModal = useCallback((group: DuplicateGroup) => {
    setRemoveModalGroup(group);
    setSelectedIdsToRemove(new Set());
  }, []);

  const closeRemoveModal = useCallback(() => {
    setRemoveModalGroup(null);
    setSelectedIdsToRemove(new Set());
  }, []);

  const toggleSelectToRemove = useCallback((id: string) => {
    setSelectedIdsToRemove((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const confirmRemove = useCallback(async () => {
    if (!removeModalGroup || selectedIdsToRemove.size === 0) {
      closeRemoveModal();
      return;
    }
    await onRemoveDuplicates(Array.from(selectedIdsToRemove));
    closeRemoveModal();
  }, [removeModalGroup, selectedIdsToRemove, onRemoveDuplicates, closeRemoveModal]);

  if (duplicateGroups.length === 0) return null;

  return (
    <View style={styles.container}>
      {duplicateGroups.map((group) => {
        const isExpanded = expandedGroupKey === group.merchantKey;
        return (
          <View key={group.merchantKey} style={styles.banner}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => toggleExpand(group.merchantKey)}
            >
              <View style={styles.headerRow}>
                <Text style={styles.title} numberOfLines={2}>
                  ⚠️ {group.count} {group.displayName} subscription{group.count !== 1 ? 's' : ''} detected (
                  {formatCurrencySync(group.monthlyTotal, currencyCode)}/month total)
                </Text>
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color="#fff"
                />
              </View>
            </TouchableOpacity>
            {isExpanded && (
              <View style={styles.details}>
                {group.subscriptions.map((sub) => (
                  <View key={sub.id} style={styles.detailRow}>
                    <Text style={styles.detailName} numberOfLines={1}>
                      {sub.label ? `${sub.name} (${sub.label})` : sub.name}
                    </Text>
                    <Text style={styles.detailMeta}>
                      {formatCurrencySync(sub.amount, sub.currency)} · {sub.frequency} ·{' '}
                      {format(new Date(sub.nextBillingDate), 'MMM dd, yyyy')}
                    </Text>
                  </View>
                ))}
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleMarkAsDifferent(group)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.actionButtonText}>Mark as different services</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.actionButtonSecondary]}
                    onPress={() => openRemoveModal(group)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.actionButtonText}>Remove duplicates</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        );
      })}

      <Modal
        visible={!!removeModalGroup}
        transparent
        animationType="fade"
        onRequestClose={closeRemoveModal}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={closeRemoveModal}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Choose subscriptions to remove</Text>
              <Text style={styles.modalSubtitle}>
                Selected subscriptions will be deleted. The rest will be kept.
              </Text>
              {removeModalGroup && (
                <FlatList
                  data={removeModalGroup.subscriptions}
                  keyExtractor={(item) => item.id}
                  style={styles.modalList}
                  renderItem={({ item }) => {
                    const selected = selectedIdsToRemove.has(item.id);
                    return (
                      <TouchableOpacity
                        style={[styles.modalRow, selected && styles.modalRowSelected]}
                        onPress={() => toggleSelectToRemove(item.id)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={selected ? 'checkbox' : 'square-outline'}
                          size={22}
                          color={selected ? '#fff' : colors.textSecondary}
                        />
                        <View style={styles.modalRowText}>
                          <Text style={styles.modalRowName} numberOfLines={1}>
                            {item.label ? `${item.name} (${item.label})` : item.name}
                          </Text>
                          <Text style={styles.modalRowMeta}>
                            {formatCurrencySync(item.amount, item.currency)}/{item.frequency}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                />
              )}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={closeRemoveModal}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalConfirmButton,
                    selectedIdsToRemove.size === 0 && styles.modalConfirmDisabled,
                  ]}
                  onPress={confirmRemove}
                  disabled={selectedIdsToRemove.size === 0}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalConfirmText}>
                    Remove {selectedIdsToRemove.size} selected
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const createStyles = (colors: { text: string; textSecondary: string; surface: string; background: string }) =>
  StyleSheet.create({
    container: {
      marginHorizontal: 20,
      marginBottom: 12,
      gap: 12,
    },
    banner: {
      backgroundColor: WARNING_AMBER,
      borderRadius: 12,
      padding: 12,
      overflow: 'hidden',
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    title: {
      fontSize: 14,
      fontWeight: '700',
      color: '#fff',
      flex: 1,
      lineHeight: 20,
    },
    details: {
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: 'rgba(255,255,255,0.4)',
    },
    detailRow: {
      marginBottom: 8,
    },
    detailName: {
      fontSize: 13,
      fontWeight: '600',
      color: '#fff',
    },
    detailMeta: {
      fontSize: 12,
      color: 'rgba(255,255,255,0.9)',
      marginTop: 2,
    },
    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 12,
    },
    actionButton: {
      backgroundColor: 'rgba(0,0,0,0.2)',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
    },
    actionButtonSecondary: {
      backgroundColor: 'rgba(255,255,255,0.3)',
    },
    actionButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#fff',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    modalContent: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 20,
      width: '100%',
      maxWidth: 360,
      maxHeight: '80%',
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 4,
    },
    modalSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 16,
    },
    modalList: {
      maxHeight: 280,
      marginBottom: 16,
    },
    modalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 10,
      gap: 12,
    },
    modalRowSelected: {
      backgroundColor: WARNING_AMBER + '30',
    },
    modalRowText: {
      flex: 1,
    },
    modalRowName: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
    },
    modalRowMeta: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    modalActions: {
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'flex-end',
    },
    modalCancelButton: {
      paddingVertical: 10,
      paddingHorizontal: 16,
    },
    modalCancelText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    modalConfirmButton: {
      backgroundColor: WARNING_AMBER,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 10,
    },
    modalConfirmDisabled: {
      opacity: 0.5,
    },
    modalConfirmText: {
      fontSize: 15,
      fontWeight: '600',
      color: '#fff',
    },
  });
