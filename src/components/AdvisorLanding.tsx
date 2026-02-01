import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import AdvisorQuickActionsGrid, { AdvisorQuickAction } from './AdvisorQuickActionsGrid';
import AdvisorPromptChipsRow from './AdvisorPromptChipsRow';
import AdvisorProgressStrip from './AdvisorProgressStrip';
import AdvisorMissionsList from './AdvisorMissionsList';
import { AdvisorMission } from '../utils/advisorMissions';

interface AdvisorLandingProps {
  disabled?: boolean;
  onAsk: (prompt: string) => void;
  onStartCheckIn: () => void;
  onFocusSearch?: () => void;
  searchValue?: string;
  onSearchChange?: (text: string) => void;
  onSearchSubmit?: () => void;
  searchFocusRequestId?: number;
  quickActions: AdvisorQuickAction[];
  promptChips: string[];
  progress?: {
    xp: number;
    level: number;
    streakCount: number;
  } | null;
  missions?: AdvisorMission[];
  onAskForMission?: (mission: AdvisorMission) => void;
  onCompleteMission?: (mission: AdvisorMission) => void;
}

export default function AdvisorLanding({
  disabled,
  onAsk,
  onStartCheckIn,
  onFocusSearch,
  searchValue,
  onSearchChange,
  onSearchSubmit,
  searchFocusRequestId = 0,
  quickActions,
  promptChips,
  progress,
  missions,
  onAskForMission,
  onCompleteMission,
}: AdvisorLandingProps) {
  const searchInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!searchFocusRequestId) return;
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }, [searchFocusRequestId]);

  const showInlineSearchInput = !!onSearchChange && !!onSearchSubmit && typeof searchValue === 'string';

  return (
    <View style={styles.container}>
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroIcon}>
            <Ionicons name="sparkles" size={18} color={colors.primary} />
          </View>
          <Text style={styles.heroKicker}>Your financial co-pilot</Text>
        </View>

        <Text style={styles.heroTitle}>Penny Advisor</Text>
        <Text style={styles.heroSubtitle}>
          Quick check-ins, smart insights, and clear next steps — tailored to your real spending.
        </Text>

        <TouchableOpacity
          style={[styles.primaryButton, disabled && styles.primaryButtonDisabled]}
          onPress={onStartCheckIn}
          disabled={disabled}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>Start today’s check-in</Text>
          <Ionicons name="arrow-forward" size={18} color={colors.background} />
        </TouchableOpacity>

      </View>

      {showInlineSearchInput ? (
        <View style={styles.searchInputRow}>
          <View style={[styles.searchInputPill, disabled && styles.searchInputPillDisabled]}>
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              value={searchValue}
              onChangeText={onSearchChange}
              placeholder="Search or ask Penny…"
              placeholderTextColor={colors.textLight}
              editable={!disabled}
              returnKeyType="send"
              onSubmitEditing={onSearchSubmit}
              blurOnSubmit={false}
            />
            {!!searchValue && !disabled && (
              <TouchableOpacity onPress={() => onSearchChange('')} activeOpacity={0.8} hitSlop={10}>
                <Ionicons name="close-circle" size={18} color={colors.textLight} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[styles.searchSendButton, (disabled || !searchValue.trim()) && styles.searchSendButtonDisabled]}
            onPress={onSearchSubmit}
            disabled={disabled || !searchValue.trim()}
            activeOpacity={0.85}
          >
            <Ionicons name="send" size={16} color={colors.background} />
          </TouchableOpacity>
        </View>
      ) : (
        !!onFocusSearch && (
        <TouchableOpacity
          style={styles.searchCta}
          onPress={onFocusSearch}
          activeOpacity={0.85}
          disabled={disabled}
        >
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <Text style={styles.searchCtaText}>Search or ask Penny…</Text>
        </TouchableOpacity>
        )
      )}

      {!!progress && (
        <AdvisorProgressStrip
          xp={progress.xp}
          level={progress.level}
          streakCount={progress.streakCount}
        />
      )}

      {!!missions?.length && !!onAskForMission && !!onCompleteMission && (
        <>
          <Text style={styles.sectionTitle}>Missions</Text>
          <AdvisorMissionsList
            missions={missions}
            disabled={disabled}
            onAskForMission={onAskForMission}
            onCompleteMission={onCompleteMission}
          />
        </>
      )}

      <Text style={styles.sectionTitle}>Quick actions</Text>
      <AdvisorQuickActionsGrid actions={quickActions} disabled={disabled} onSelect={onAsk} />

      <Text style={styles.sectionTitle}>Popular prompts</Text>
      <AdvisorPromptChipsRow prompts={promptChips} disabled={disabled} onSelect={onAsk} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 8,
  },
  heroCard: {
    marginHorizontal: 20,
    marginBottom: 18,
    padding: 18,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  heroIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroKicker: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  heroTitle: {
    ...typography.body,
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: 14,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    ...typography.body,
    color: colors.background,
    fontWeight: '800',
  },
  sectionTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '800',
    paddingHorizontal: 20,
    marginTop: 16,
    marginBottom: 10,
  },
  searchCta: {
    marginHorizontal: 20,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchCtaText: {
    ...typography.body,
    color: colors.textLight,
    fontWeight: '700',
  },
  searchInputRow: {
    marginHorizontal: 20,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInputPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInputPillDisabled: {
    opacity: 0.7,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    paddingVertical: 0,
  },
  searchSendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchSendButtonDisabled: {
    opacity: 0.5,
  },
});

