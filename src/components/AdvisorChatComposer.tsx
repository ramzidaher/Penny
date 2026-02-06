import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { typography } from '../theme/typography';

interface AdvisorChatComposerProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onClear?: () => void;
  onNewThread?: () => void;
  loading?: boolean;
  bottomInset?: number;
  tabBarOffset?: number;
  focusRequestId?: number;
}

export default function AdvisorChatComposer({
  value,
  onChangeText,
  onSend,
  onClear,
  onNewThread,
  loading,
  bottomInset = 0,
  tabBarOffset = 0,
  focusRequestId = 0,
}: AdvisorChatComposerProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isIOS = Platform.OS === 'ios';
  const canSend = !!value.trim() && !loading;
  const [contentHeight, setContentHeight] = useState(0);
  const inputRef = useRef<TextInput>(null);
  const inputLineHeight = isIOS ? 20 : 18;

  const inputHeight = useMemo(() => {
    const min = 36;
    const max = 96;
    if (!contentHeight) return min;
    return Math.max(min, Math.min(max, contentHeight));
  }, [contentHeight]);
  const inputVerticalPadding = Math.max(0, (inputHeight - inputLineHeight) / 2);

  useEffect(() => {
    if (!focusRequestId) return;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [focusRequestId]);

  return (
    <View style={[styles.container, { paddingBottom: bottomInset + 12, marginBottom: tabBarOffset }]}>
      {!!onNewThread && (
        <TouchableOpacity
          style={styles.sideButton}
          onPress={onNewThread}
          activeOpacity={0.8}
          disabled={!!loading}
        >
          <Ionicons name="add" size={20} color={colors.text} />
        </TouchableOpacity>
      )}

      <View style={[styles.pill, !!loading && styles.pillDisabled]}>
        <Ionicons name="search" size={18} color={colors.textSecondary} />
        <TextInput
          ref={inputRef}
          style={[
            styles.input,
            {
              height: inputHeight,
              lineHeight: inputLineHeight,
              paddingTop: isIOS ? inputVerticalPadding : 0,
              paddingBottom: isIOS ? inputVerticalPadding : 0,
            },
          ]}
          value={value}
          onChangeText={onChangeText}
          multiline
          editable={!loading}
          onContentSizeChange={(e) => setContentHeight(e.nativeEvent.contentSize.height)}
          textAlignVertical={isIOS ? 'top' : 'center'}
        />

        {!!value && !!onClear && !loading && (
          <TouchableOpacity onPress={onClear} activeOpacity={0.8} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color={colors.textLight} />
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
        onPress={onSend}
        disabled={!canSend}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color={colors.background} size="small" />
        ) : (
          <Ionicons name="send" size={18} color={colors.background} />
        )}
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
  },
  sideButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 0,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  pillDisabled: {
    opacity: 0.7,
  },
  input: {
    flex: 1,
    ...typography.body,
    paddingVertical: 0,
    includeFontPadding: false,
    color: colors.text,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 0,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});

