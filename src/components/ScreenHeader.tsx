import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  rightAction?: {
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
  };
  style?: ViewStyle;
  titleFontFamily?: string;
  titleLetterSpacing?: number;
}

export default function ScreenHeader({ title, subtitle, rightAction, style, titleFontFamily, titleLetterSpacing }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  
  // Minimal padding: safe area top only
  const paddingTop = insets.top;

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/components/ScreenHeader.tsx:21',message:'ScreenHeader padding calculation',data:{insetsTop:insets.top,insetsBottom:insets.bottom,insetsLeft:insets.left,insetsRight:insets.right,paddingTop:paddingTop,title:title,hasSubtitle:!!subtitle,hasRightAction:!!rightAction},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'C'})}).catch(()=>{});
  // #endregion

  return (
    <View style={[styles.header, { paddingTop }, style]}>
      <View style={styles.headerContent}>
        <View style={styles.headerTextContainer}>
          {subtitle && (
            <Text style={styles.subtitle}>{subtitle}</Text>
          )}
          <Text 
            style={[
              styles.title, 
              titleFontFamily && { 
                fontFamily: titleFontFamily,
                fontWeight: undefined // Remove fontWeight when using custom font
              },
              titleLetterSpacing !== undefined && { letterSpacing: titleLetterSpacing }
            ]}
          >
            {title}
          </Text>
        </View>
        {rightAction && (
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={rightAction.onPress}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name={rightAction.icon} size={24} color={colors.text} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTextContainer: {
    flex: 1,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
    fontWeight: '500',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -1,
  },
  titleWithCustomFont: {
    fontWeight: undefined, // Remove fontWeight when using custom font
  },
  actionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginLeft: 12,
  },
});

