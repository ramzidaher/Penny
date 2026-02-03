import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { typography } from '../theme/typography';
import AdvisorQuickActionsGrid, { AdvisorQuickAction } from './AdvisorQuickActionsGrid';
import AdvisorPromptChipsRow from './AdvisorPromptChipsRow';
import AdvisorProgressStrip from './AdvisorProgressStrip';
import AdvisorMissionsList from './AdvisorMissionsList';
import { AdvisorMission } from '../utils/advisorMissions';
import { useTheme } from '../contexts/ThemeContext';

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
  const [searchContentHeight, setSearchContentHeight] = useState(0);
  const isIOS = Platform.OS === 'ios';
  const searchLineHeight = isIOS ? 20 : 18;
  const searchInputHeight = React.useMemo(() => {
    const min = 20;
    const max = 88;
    if (!searchContentHeight) return min;
    return Math.max(min, Math.min(max, searchContentHeight));
  }, [searchContentHeight]);
  const searchVerticalPadding = Math.max(0, (searchInputHeight - searchLineHeight) / 2);
  const { colors } = useTheme();
  const c = colors;
  const styles = React.useMemo(() => createStyles(c), [c]);

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
            <Ionicons name="sparkles" size={18} color={c.primary} />
          </View>
          <Text style={styles.heroKicker}>Your money dashboard</Text>
        </View>

        <Text style={styles.heroTitle}>Today's check-in</Text>
        <Text style={styles.heroSubtitle}>
          Insights and next steps based on your real spending no fluff, just the plan.
        </Text>

        <TouchableOpacity
          style={[styles.primaryButton, disabled && styles.primaryButtonDisabled]}
          onPress={onStartCheckIn}
          disabled={disabled}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>Run today's check-in</Text>
          <Ionicons name="arrow-forward" size={18} color={c.background} />
        </TouchableOpacity>

      </View>

      {showInlineSearchInput ? (
        <View style={styles.searchInputRow}>
          <View style={[styles.searchInputPill, disabled && styles.searchInputPillDisabled]}>
            <Ionicons name="search" size={18} color={c.textSecondary} />
            <TextInput
              ref={searchInputRef}
              style={[
                styles.searchInput,
                {
                  height: searchInputHeight,
                  lineHeight: searchLineHeight,
                  paddingTop: isIOS ? searchVerticalPadding : 0,
                  paddingBottom: isIOS ? searchVerticalPadding : 0,
                },
              ]}
              value={searchValue}
              onChangeText={onSearchChange}
              placeholder="Review this month or search…"
              placeholderTextColor={c.textLight}
              editable={!disabled}
              returnKeyType="send"
              onSubmitEditing={onSearchSubmit}
              blurOnSubmit={false}
              multiline
              onContentSizeChange={(event) => setSearchContentHeight(event.nativeEvent.contentSize.height)}
              textAlignVertical={isIOS ? 'top' : 'center'}
            />
            {!!searchValue && !disabled && (
              <TouchableOpacity onPress={() => onSearchChange('')} activeOpacity={0.8} hitSlop={10}>
                <Ionicons name="close-circle" size={18} color={c.textLight} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[styles.searchSendButton, (disabled || !searchValue.trim()) && styles.searchSendButtonDisabled]}
            onPress={onSearchSubmit}
            disabled={disabled || !searchValue.trim()}
            activeOpacity={0.85}
          >
            <Ionicons name="send" size={16} color={c.background} />
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
          <Ionicons name="search" size={18} color={c.textSecondary} />
          <Text style={styles.searchCtaText}>Review this month or search…</Text>
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

      <Text style={styles.sectionTitle}>Plan actions</Text>
      <AdvisorQuickActionsGrid actions={quickActions} disabled={disabled} onSelect={onAsk} />

      <Text style={styles.sectionTitle}>Common check-ins</Text>
      <AdvisorPromptChipsRow prompts={promptChips} disabled={disabled} onSelect={onAsk} />
    </View>
  );
}

const createStyles = (c: {
  surface: string;
  border: string;
  primary: string;
  text: string;
  textSecondary: string;
  textLight: string;
  background: string;
}) =>
  StyleSheet.create({
    container: {
      paddingBottom: 8,
    },
    heroCard: {
      marginHorizontal: 20,
      marginBottom: 18,
      padding: 18,
      borderRadius: 22,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
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
      backgroundColor: c.primary + '10',
      justifyContent: 'center',
      alignItems: 'center',
    },
    heroKicker: {
      ...typography.bodySmall,
      color: c.textSecondary,
      fontWeight: '700',
    },
    heroTitle: {
      ...typography.body,
      fontSize: 22,
      fontWeight: '900',
      color: c.text,
      marginBottom: 6,
      letterSpacing: -0.3,
    },
    heroSubtitle: {
      ...typography.body,
      color: c.textSecondary,
      lineHeight: 22,
      marginBottom: 14,
    },
    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: c.primary,
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    primaryButtonDisabled: {
      opacity: 0.6,
    },
    primaryButtonText: {
      ...typography.body,
      color: c.background,
      fontWeight: '800',
    },
    sectionTitle: {
      ...typography.body,
      color: c.text,
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
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    searchCtaText: {
      ...typography.body,
      color: c.textLight,
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
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    searchInputPillDisabled: {
      opacity: 0.7,
    },
    searchInput: {
      flex: 1,
      ...typography.body,
      color: c.text,
      paddingVertical: 0,
      includeFontPadding: false,
    },
    searchSendButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    searchSendButtonDisabled: {
      opacity: 0.5,
    },
  });

