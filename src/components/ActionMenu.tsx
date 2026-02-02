import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Animated, Pressable, ScrollView, useWindowDimensions, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useTheme } from '../contexts/ThemeContext';

interface ActionMenuItem {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  description?: string;
  tone?: 'default' | 'primary';
}

interface ActionMenuProps {
  visible: boolean;
  onClose: () => void;
  onSelect?: (route: string) => void;
  renderAsOverlay?: boolean; // If true, render as overlay instead of Modal
}

const menuSections: Array<{ title: string; items: ActionMenuItem[] }> = [
  {
    title: 'Add',
    items: [
      {
        label: 'Add Transaction',
        icon: 'receipt-outline',
        route: '/(tabs)/finance/add-transaction',
        description: 'Manual input',
        tone: 'primary',
      },
      {
        label: 'Add Subscription',
        icon: 'repeat-outline',
        route: '/(tabs)/finance/subscriptions/add',
        description: 'Manual recurring',
        tone: 'primary',
      },
      {
        label: 'Add Goal / Budget',
        icon: 'pie-chart-outline',
        route: '/(tabs)/finance/add-budget',
        tone: 'primary',
      },
    ],
  },
  {
    title: 'Support',
    items: [
      {
        label: 'Ask AI',
        icon: 'chatbubble-outline',
        route: '/(tabs)/ai/chat',
        description: '"Should I buy?"',
      },
      {
        label: 'Feature Request',
        icon: 'bulb-outline',
        route: '/feature-request',
        description: 'Suggest a feature',
      },
      {
        label: 'Bug Report',
        icon: 'bug-outline',
        route: '/(tabs)/ai/chat',
        description: 'Report an issue',
      },
    ],
  },
];

const hexToRgba = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '').trim();
  const full = normalized.length === 3 ? normalized.split('').map(c => `${c}${c}`).join('') : normalized;
  if (full.length !== 6) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

export default function ActionMenu({ visible, onClose, onSelect, renderAsOverlay = false }: ActionMenuProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: theme } = useTheme();
  const isDark = false;
  const c = theme;
  const { height: SCREEN_HEIGHT } = useWindowDimensions();
  // Start completely off-screen (below the screen)
  const [slideAnim] = useState(() => new Animated.Value(SCREEN_HEIGHT || 800));
  const [fadeAnim] = useState(new Animated.Value(0));
  const allItems = useMemo(() => menuSections.flatMap(s => s.items), []);
  const [itemAnims] = useState(allItems.map(() => new Animated.Value(0)));

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
        anim.setValue(0);
        Animated.timing(anim, {
          toValue: 1,
          duration: 220,
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
    if (onSelect) {
      onSelect(route);
      return;
    }
    onClose();
    router.push(route as any);
  };

  // Tab bar height: Android uses floating pill (bar + gap); iOS uses native tab bar
  const tabBarContentHeight = Platform.OS === 'android' ? 72 + 12 + 10 + 10 : 60; // bar minHeight + floatingGap + paddings
  const tabBarHeight = Math.max(insets.bottom, 8) + tabBarContentHeight;
  const sheetMarginBottom = renderAsOverlay ? tabBarHeight : 0;
  const overlayDismissBottom = renderAsOverlay ? tabBarHeight : 0;
  const sheetMaxHeight = Math.min((SCREEN_HEIGHT || 800) * 0.82, (SCREEN_HEIGHT || 800) - (insets.top + 24));

  const sectionCardBg = isDark ? hexToRgba(c.surface, 0.92) : hexToRgba(c.surface, 0.98);
  const accentSoftBg = useMemo(() => hexToRgba(c.accent, isDark ? 0.18 : 0.12), [c.accent, isDark]);

  // Give the sheet a real height so the ScrollView can layout (maxHeight alone can collapse).
  const estimatedSheetHeight = useMemo(() => {
    const header = 92;
    const sectionHeader = 28;
    const sectionSpacing = 14;
    const row = 56;
    const chromePadding = 22;

    const totalRows = menuSections.reduce((acc, s) => acc + s.items.length, 0);
    const totalSections = menuSections.length;
    const estimated = header + (totalSections * sectionHeader) + (totalRows * row) + (totalSections * sectionSpacing) + chromePadding;

    // Keep it compact, but never too small.
    return Math.max(280, Math.min(estimated, 520));
  }, []);
  const sheetHeight = Math.min(sheetMaxHeight, estimatedSheetHeight);

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
      {/* Backdrop (blur + dim). Keep tab bar tappable in overlay mode. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <BlurView intensity={0} tint="light" style={StyleSheet.absoluteFill} />
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: c.background },
          ]}
        />
      </View>
      <Pressable
        style={[styles.dismissArea, { bottom: overlayDismissBottom }]}
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
                height: sheetHeight,
                maxHeight: sheetMaxHeight,
                marginBottom: sheetMarginBottom,
                backgroundColor: isDark ? hexToRgba(c.background, 0.88) : hexToRgba(c.background, 0.96),
                borderColor: isDark ? hexToRgba(c.border, 0.7) : c.border,
              },
            ]}
            pointerEvents="auto"
          >
            {/* Grab handle + header */}
            <View style={[styles.header, { paddingTop: 10 }]}>
              <View style={[styles.handle, { backgroundColor: isDark ? hexToRgba('#ffffff', 0.18) : hexToRgba('#000000', 0.12) }]} />
              <View style={styles.headerRow}>
                <View style={styles.headerTextWrap}>
                  <Text style={[styles.headerTitle, { color: c.text }]}>Menu</Text>
                  <Text style={[styles.headerSubtitle, { color: c.textSecondary }]}>Quick actions</Text>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  style={[
                    styles.closeButton,
                    { backgroundColor: isDark ? hexToRgba(c.surface, 0.55) : c.surface, borderColor: c.border },
                  ]}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={20} color={c.text} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Scrollable menu items */}
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={[
                styles.scrollContent,
                { paddingBottom: Math.max(insets.bottom, 12) + 16 }
              ]}
              showsVerticalScrollIndicator={false}
              bounces={true}
              nestedScrollEnabled={true}
            >
              {menuSections.map((section, sectionIndex) => (
                <View key={`${section.title}-${sectionIndex}`} style={styles.sectionWrap}>
                  <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>{section.title}</Text>
                  <View
                    style={[
                      styles.sectionCard,
                      {
                        backgroundColor: sectionCardBg,
                        borderColor: isDark ? hexToRgba(c.border, 0.6) : c.border,
                      },
                    ]}
                  >
                    {section.items.map((item, itemIndex) => {
                      const flatIndex = menuSections
                        .slice(0, sectionIndex)
                        .reduce((acc, s) => acc + s.items.length, 0) + itemIndex;
                      const itemOpacity = itemAnims[flatIndex];
                      const itemTranslateY = itemAnims[flatIndex].interpolate({
                        inputRange: [0, 1],
                        outputRange: [8, 0],
                      });

                      const iconTint = item.tone === 'primary' ? c.accent : c.text;
                      const iconBg =
                        item.tone === 'primary' ? accentSoftBg : (isDark ? hexToRgba(c.surface, 0.45) : c.surface);

                      return (
                        <Animated.View
                          key={`${item.label}-${flatIndex}`}
                          style={{
                            opacity: itemOpacity,
                            transform: [{ translateY: itemTranslateY }],
                          }}
                        >
                          <TouchableOpacity
                            style={[
                              styles.menuItem,
                              { borderBottomColor: isDark ? hexToRgba(c.border, 0.55) : c.border },
                              itemIndex === section.items.length - 1 && styles.menuItemLast,
                            ]}
                            onPress={() => handleItemPress(item.route)}
                            activeOpacity={0.7}
                          >
                            <View style={styles.menuItemLeft}>
                              <View
                                style={[
                                  styles.menuItemIconContainer,
                                  { backgroundColor: iconBg, borderColor: isDark ? hexToRgba(c.border, 0.4) : c.border },
                                ]}
                              >
                                <Ionicons name={item.icon} size={20} color={iconTint} />
                              </View>
                              <View style={styles.menuItemText}>
                                <Text style={[styles.menuItemLabel, { color: c.text }]}>{item.label}</Text>
                                {item.description && (
                                  <Text style={[styles.menuItemDescription, { color: c.textSecondary }]}>{item.description}</Text>
                                )}
                              </View>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={c.textSecondary} />
                          </TouchableOpacity>
                        </Animated.View>
                      );
                    })}
                  </View>
                </View>
              ))}
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
  dismissArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  overlayContent: {
    flex: 1,
    justifyContent: 'flex-end',
    pointerEvents: 'box-none',
  },
  menuContainer: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    borderWidth: 1,
    alignSelf: 'stretch',
    flexDirection: 'column',
    overflow: 'hidden',
    marginHorizontal: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -8 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
      },
      android: {
        elevation: 14,
      },
    }),
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    marginTop: 6,
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '500',
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 2,
    flexGrow: 1,
  },
  sectionWrap: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    minHeight: 56,
    paddingHorizontal: 14,
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
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
  },
  menuItemText: {
    flex: 1,
  },
  menuItemLabel: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 1,
  },
  menuItemDescription: {
    fontSize: 12,
  },
});

