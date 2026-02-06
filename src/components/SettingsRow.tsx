import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

type RightContent =
  | { type: 'switch'; value: boolean; onValueChange: (value: boolean) => void; disabled?: boolean }
  | { type: 'chevron' }
  | { type: 'custom'; node: React.ReactNode }
  | { type: 'none' };

interface SettingsRowProps {
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  label: string;
  subtitle?: string;
  right: RightContent;
  onPress?: () => void;
  showDivider?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export default function SettingsRow({
  icon,
  iconColor,
  label,
  subtitle,
  right,
  onPress,
  showDivider = false,
  destructive = false,
  disabled = false,
  style,
}: SettingsRowProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const labelColor = destructive ? (colors.destructive ?? colors.error) : colors.text;
  const iconTint = iconColor ?? (destructive ? (colors.destructive ?? colors.error) : colors.text);

  const renderRight = () => {
    if (right.type === 'switch') {
      return (
        <Switch
          value={right.value}
          onValueChange={right.onValueChange}
          disabled={right.disabled ?? disabled}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={right.value ? '#FFFFFF' : colors.textSecondary}
        />
      );
    }
    if (right.type === 'chevron') {
      return (
        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
      );
    }
    if (right.type === 'custom') {
      return right.node;
    }
    return null;
  };

  const content = (
    <>
      <View style={styles.left}>
        {icon != null && (
          <View style={styles.iconContainer}>
            <Ionicons name={icon} size={20} color={iconTint} />
          </View>
        )}
        <View style={styles.textContainer}>
          <Text style={[styles.label, { color: labelColor }]} numberOfLines={1}>
            {label}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.right}>{renderRight()}</View>
    </>
  );

  if (onPress && right.type !== 'switch') {
    return (
      <View style={style}>
        {showDivider && <View style={styles.divider} />}
        <TouchableOpacity
          style={styles.row}
          onPress={onPress}
          activeOpacity={0.7}
          disabled={disabled}
        >
          {content}
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={style}>
      {showDivider && <View style={styles.divider} />}
      <View style={styles.row}>{content}</View>
    </View>
  );
}

const createStyles = (colors: {
  text: string;
  textSecondary: string;
  border: string;
}) =>
  StyleSheet.create({
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 12,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    left: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      marginRight: 16,
    },
    iconContainer: {
      marginRight: 12,
    },
    textContainer: {
      flex: 1,
      minWidth: 0,
    },
    label: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 2,
    },
    subtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    right: {
      marginLeft: 8,
    },
  });
