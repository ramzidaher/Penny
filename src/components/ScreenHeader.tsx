import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import Avatar from './Avatar';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  size?: 'default' | 'compact';
  rightAction?: {
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
  };
  /** When set, shows this avatar in the right action area instead of rightAction icon. rightAction.onPress still used. */
  rightAvatarSeed?: string | null;
  style?: ViewStyle;
  titleFontFamily?: string;
  titleLetterSpacing?: number;
}

export default function ScreenHeader({ title, subtitle, size = 'default', rightAction, rightAvatarSeed, style, titleFontFamily, titleLetterSpacing }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isNarrow = width < 375;
  const headerAvatarSize = isNarrow ? 44 : 52;
  const headerButtonSize = isNarrow ? 44 : 52;

  // Minimal padding: safe area top only
  const paddingTop = insets.top;

  return (
    <View style={[styles.header, size === 'compact' && styles.headerCompact, { paddingTop }, style]}>
      <View style={styles.headerContent}>
        <View style={styles.headerTextContainer}>
          {subtitle && (
            <Text
              style={[styles.subtitle, size === 'compact' && styles.subtitleCompact]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {subtitle}
            </Text>
          )}
          <Text 
            style={[
              styles.title, 
              size === 'compact' && styles.titleCompact,
              titleFontFamily && { 
                fontFamily: titleFontFamily,
                fontWeight: undefined // Remove fontWeight when using custom font
              },
              titleLetterSpacing !== undefined && { letterSpacing: titleLetterSpacing }
            ]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {title}
          </Text>
        </View>
        {rightAction && (
          <TouchableOpacity 
            style={[
              styles.actionButton,
              rightAvatarSeed ? styles.actionButtonAvatar : null,
              { width: headerButtonSize, height: headerButtonSize, borderRadius: headerButtonSize / 2 },
            ]}
            onPress={rightAction.onPress}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {rightAvatarSeed ? (
              <Avatar seed={rightAvatarSeed} size={headerAvatarSize} />
            ) : (
              <Ionicons name={rightAction.icon} size={isNarrow ? 22 : 24} color={colors.text} />
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  headerCompact: {
    paddingBottom: 12,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 0,
  },
  headerTextContainer: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
    fontWeight: '500',
  },
  subtitleCompact: {
    fontSize: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -1,
  },
  titleCompact: {
    fontSize: 22,
    letterSpacing: -0.5,
  },
  titleWithCustomFont: {
    fontWeight: undefined, // Remove fontWeight when using custom font
  },
  actionButton: {
    flexShrink: 0,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginLeft: 8,
  },
  actionButtonAvatar: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
  },
});

