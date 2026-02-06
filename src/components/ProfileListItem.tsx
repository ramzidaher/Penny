import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import SettingsRow from './SettingsRow';

interface ProfileListItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
  iconColor?: string;
  right?: React.ReactNode;
  showDivider?: boolean;
  disabled?: boolean;
}

export default function ProfileListItem({
  icon,
  title,
  subtitle,
  onPress,
  iconColor,
  right,
  showDivider,
  disabled,
}: ProfileListItemProps) {
  return (
    <SettingsRow
      icon={icon}
      iconColor={iconColor}
      label={title}
      subtitle={subtitle}
      right={right != null ? { type: 'custom', node: right } : { type: 'chevron' }}
      onPress={onPress}
      showDivider={showDivider}
      disabled={disabled}
    />
  );
}
