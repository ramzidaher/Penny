import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

type LeftButton =
  | { type: 'back'; onPress: () => void }
  | { type: 'text'; label: string; onPress: () => void };

interface ProfileSettingsHeaderProps {
  title: string;
  leftButton: LeftButton;
}

export default function ProfileSettingsHeader({ title, leftButton }: ProfileSettingsHeaderProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      {leftButton.type === 'back' ? (
        <TouchableOpacity onPress={leftButton.onPress} style={styles.leftButton} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={leftButton.onPress} style={styles.leftButton} activeOpacity={0.7}>
          <Text style={styles.leftButtonText}>{leftButton.label}</Text>
        </TouchableOpacity>
      )}
      <Text style={styles.title}>{title}</Text>
      <View style={styles.spacer} />
    </View>
  );
}

const createStyles = (colors: { background: string; text: string; primary: string }) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 12,
      backgroundColor: colors.background,
    },
    leftButton: {
      paddingVertical: 8,
      paddingHorizontal: 4,
    },
    leftButtonText: {
      fontSize: 17,
      color: colors.primary,
      fontWeight: '400',
    },
    title: {
      fontSize: 17,
      fontWeight: '600',
      color: colors.text,
    },
    spacer: {
      width: 60,
    },
  });
