import React, { useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, StatusBar, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ReceiptSplitFlow from '../components/ReceiptSplitFlow';
import { TEST_RECEIPT_ITEMS, TEST_RECEIPT_CURRENCY } from '../data/testReceipt';
import { useTheme } from '../contexts/ThemeContext';

/** Standalone screen for the split receipt flow (2–8 players, avatars, tap to claim). Full screen: hides tab bar and status bar. Respects theme/accent from settings. */
export default function ReceiptSplitFlowScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors, refreshFromCloud } = useTheme();
  // Match other tab screens: reserve space for floating tab bar on Android (layout hides it on receipt-split route, but safe fallback).
  const tabBarOffset = Platform.OS === 'android' ? 72 : 0;
  const styles = React.useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollArea: {
      flex: 1,
      paddingTop: insets.top,
      paddingBottom: insets.bottom + tabBarOffset,
    },
    closeButton: {
      position: 'absolute',
      top: insets.top + 8,
      right: 16,
      zIndex: 100,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
    },
  }), [colors, insets.top, insets.bottom, tabBarOffset]);

  useFocusEffect(
    useCallback(() => {
      // Refresh theme from settings so accent/colour change in settings is applied when entering this screen
      refreshFromCloud?.();
      const parent = navigation.getParent();
      if (parent?.setOptions) {
        parent.setOptions({ tabBarStyle: { display: 'none' } });
      }
      if (Platform.OS !== 'web') {
        StatusBar.setHidden(true, 'fade');
      }
      return () => {
        if (parent?.setOptions) {
          parent.setOptions({ tabBarStyle: { display: 'flex' } });
        }
        if (Platform.OS !== 'web') {
          StatusBar.setHidden(false, 'fade');
        }
      };
    }, [navigation, refreshFromCloud])
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.closeButton}
        onPress={() => router.back()}
        activeOpacity={0.8}
      >
        <Ionicons name="close" size={24} color={colors.text} />
      </TouchableOpacity>
      <View style={styles.scrollArea}>
        <ReceiptSplitFlow
          items={TEST_RECEIPT_ITEMS}
          currency={TEST_RECEIPT_CURRENCY}
          onClose={() => router.back()}
        />
      </View>
    </View>
  );
}
