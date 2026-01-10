import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Animated, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';

interface ActionMenuItem {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  description?: string;
}

interface ActionMenuProps {
  visible: boolean;
  onClose: () => void;
  renderAsOverlay?: boolean; // If true, render as overlay instead of Modal
}

const menuItems: ActionMenuItem[] = [
  {
    label: 'Add Transaction',
    icon: 'receipt-outline',
    route: '/(tabs)/finance/add-transaction',
    description: 'Manual input',
  },
  {
    label: 'Add Subscription',
    icon: 'repeat-outline',
    route: '/(tabs)/finance/subscriptions/add',
    description: 'Manual recurring',
  },
  {
    label: 'Add Goal / Budget',
    icon: 'pie-chart-outline',
    route: '/(tabs)/finance/add-budget',
  },
  {
    label: 'Connect Bank',
    icon: 'card-outline',
    route: '/(tabs)/finance/connect-bank',
    description: 'Link your bank account',
  },
  {
    label: 'Ask AI',
    icon: 'chatbubble-outline',
    route: '/(tabs)/ai',
    description: '"Should I buy?"',
  },
  {
    label: 'Feature Request',
    icon: 'bulb-outline',
    route: '/(tabs)/ai',
    description: 'Suggest a feature',
  },
  {
    label: 'Bug Report',
    icon: 'bug-outline',
    route: '/(tabs)/ai',
    description: 'Report an issue',
  },
];

export default function ActionMenu({ visible, onClose, renderAsOverlay = false }: ActionMenuProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: SCREEN_HEIGHT } = useWindowDimensions();
  // Start completely off-screen (below the screen)
  const [slideAnim] = useState(() => new Animated.Value(SCREEN_HEIGHT || 800));
  const [fadeAnim] = useState(new Animated.Value(0));
  const [itemAnims] = useState(menuItems.map(() => new Animated.Value(0)));

  React.useEffect(() => {
    if (visible) {
      // Reset animation value to screen height when opening
      slideAnim.setValue(SCREEN_HEIGHT || 800);
      
      // Fade in overlay
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();

      // Slide up menu with spring - always animate to 0 (full screen)
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 8,
        velocity: 0,
      }).start();

      // Stagger menu items - start immediately with shorter delay
      const staggerDelay = 15;
      itemAnims.forEach((anim, index) => {
        // Start with slight visibility so items are never completely invisible
        anim.setValue(0.3);
        Animated.timing(anim, {
          toValue: 1,
          duration: 200,
          delay: index * staggerDelay,
          useNativeDriver: true,
        }).start();
      });
    } else {
      // Slide down and fade out
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT || 800,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Reset item animations
        itemAnims.forEach(anim => anim.setValue(0));
      });
    }
  }, [visible, slideAnim, fadeAnim, itemAnims, SCREEN_HEIGHT]);

  const handleItemPress = (route: string) => {
    onClose();
    router.push(route as any);
  };

  // Calculate tab bar height (approximately 60 + safe area bottom)
  const tabBarHeight = Math.max(insets.bottom, 8) + 60;

  const menuContent = (
    <Animated.View 
      style={[
        renderAsOverlay ? styles.overlayAbsolute : styles.overlay, 
        {
          opacity: fadeAnim,
        }
      ]} 
      pointerEvents={visible ? "box-none" : "none"}
    >
      {/* Full screen overlay background */}
      <Pressable 
        style={styles.fullScreenOverlay}
        onPress={onClose}
      />
      {/* Tab bar pass-through area - completely transparent to touches */}
      {renderAsOverlay && (
        <View 
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: tabBarHeight,
          }}
          pointerEvents="none"
        />
      )}
      <View style={styles.overlayContent} pointerEvents="box-none">
        <Pressable onPress={(e) => e.stopPropagation()}>
          <Animated.View
            style={[
              styles.menuContainer,
              {
                transform: [{ translateY: slideAnim }],
                height: (SCREEN_HEIGHT || 800) - tabBarHeight,
                maxHeight: (SCREEN_HEIGHT || 800) - tabBarHeight,
                minHeight: (SCREEN_HEIGHT || 800) - tabBarHeight,
              },
            ]}
            pointerEvents="auto"
          >
            {/* Header with close button */}
            <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
              <View style={styles.headerSpacer} />
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeButton}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Scrollable menu items */}
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={[
                styles.scrollContent,
                { paddingBottom: tabBarHeight + Math.max(insets.bottom, 12) }
              ]}
              showsVerticalScrollIndicator={false}
              bounces={true}
              nestedScrollEnabled={true}
            >
              {menuItems.map((item, index) => {
                const itemOpacity = itemAnims[index];
                const itemScale = itemAnims[index].interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.95, 1],
                });
                
                return (
                  <Animated.View
                    key={`${item.label}-${index}`}
                    style={{
                      opacity: itemOpacity,
                      transform: [{ scale: itemScale }],
                    }}
                  >
                    <TouchableOpacity
                      style={[
                        styles.menuItem,
                        index === menuItems.length - 1 && styles.menuItemLast,
                      ]}
                      onPress={() => handleItemPress(item.route)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.menuItemLeft}>
                        <View style={styles.menuItemIconContainer}>
                          <Ionicons name={item.icon} size={20} color={colors.primary} />
                        </View>
                        <View style={styles.menuItemText}>
                          <Text style={styles.menuItemLabel}>{item.label}</Text>
                          {item.description && (
                            <Text style={styles.menuItemDescription}>{item.description}</Text>
                          )}
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </ScrollView>
          </Animated.View>
        </Pressable>
      </View>
    </Animated.View>
  );

  // If rendering as overlay, return directly (no Modal wrapper)
  if (renderAsOverlay) {
    return visible ? menuContent : null;
  }

  // Otherwise use Modal (for backwards compatibility)
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
    >
      {menuContent}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  overlayAbsolute: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    zIndex: 1000,
  },
  fullScreenOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  overlayContent: {
    flex: 1,
    justifyContent: 'flex-end',
    pointerEvents: 'box-none',
  },
  menuContainer: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    width: '100%',
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerSpacer: {
    flex: 1,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    flexGrow: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minHeight: 56,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  menuItemIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuItemText: {
    flex: 1,
  },
  menuItemLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 1,
  },
  menuItemDescription: {
    fontSize: 12,
    color: colors.textSecondary,
  },
});

