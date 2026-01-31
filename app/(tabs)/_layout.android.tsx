import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useRouter, usePathname, useSegments, Slot } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useActionMenu } from '../../src/contexts/ActionMenuContext';

interface TabItem {
  name: string;
  label: string;
  route: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconFilled: keyof typeof Ionicons.glyphMap;
}

const tabs: TabItem[] = [
  {
    name: 'index',
    label: 'Home',
    route: '/(tabs)',
    icon: 'home-outline',
    iconFilled: 'home',
  },
  {
    name: 'finance',
    label: 'Finance',
    route: '/(tabs)/finance',
    icon: 'wallet-outline',
    iconFilled: 'wallet',
  },
  {
    name: 'ai',
    label: 'Advisor',
    route: '/(tabs)/ai',
    icon: 'chatbubbles-outline',
    iconFilled: 'chatbubbles',
  },
  {
    name: 'add',
    label: 'Menu',
    route: '/(tabs)/add',
    icon: 'menu-outline',
    iconFilled: 'menu',
  },
];

export default function TabLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSegments();
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const isDark = colorScheme === 'dark';
  const { hideMenu } = useActionMenu();
  const { colors } = useTheme();

  const getActiveTab = () => {
    if (pathname === '/(tabs)' || pathname === '/(tabs)/' || pathname === '/') {
      return 'index';
    }
    const pathParts = pathname.split('/');
    const tabName = pathParts[pathParts.length - 1];

    if (tabName === 'finance' || pathname.includes('/finance')) {
      return 'finance';
    }
    if (tabName === 'ai' || pathname.includes('/ai')) {
      return 'ai';
    }
    if (tabName === 'add' || pathname.includes('/add')) {
      return 'add';
    }

    return 'index';
  };

  const activeTab = getActiveTab();

  const contentBackground = isDark ? colors.dark.background : colors.background;
  const barBackground = 'transparent';
  const barBorderColor = isDark ? colors.dark.border : colors.border;
  const inactiveColor = isDark ? colors.dark.textSecondary : colors.textSecondary;
  const pillBackground = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.07)';
  const circleBackground = isDark ? colors.dark.primary : colors.primary;
  const selectedLabelColor = isDark ? colors.dark.text : colors.text;
  const floatingGap = 6;
  const horizontalMargin = 14;
  const showDebug = false;
  const barGradientColors = isDark
    ? ['rgba(18,18,18,0.45)', 'rgba(18,18,18,0.25)', 'rgba(18,18,18,0.12)']
    : ['rgba(250,249,246,0.85)', 'rgba(250,249,246,0.55)', 'rgba(250,249,246,0.3)'];
  const blurTint = isDark ? 'dark' : 'light';
  const blurIntensity = Platform.OS === 'android' ? 25 : isDark ? 70 : 80;
  const debugColors = {
    content: 'rgba(255,0,0,0.5)',
    wrapper: 'rgba(0,128,255,0.5)',
    bar: 'rgba(0,255,128,0.6)',
  };

  const handleTabPress = (tab: TabItem) => {
    const isActive = activeTab === tab.name;

    if (isActive) {
      if (tab.name === 'index') {
        router.replace('/(tabs)' as any);
        return;
      }
      if (tab.name === 'finance') {
        router.replace('/(tabs)/finance' as any);
        return;
      }
      if (tab.name === 'ai') {
        router.replace('/(tabs)/ai' as any);
        return;
      }
      if (tab.name === 'add') {
        hideMenu();
        return;
      }
    }

    router.push(tab.route as any);
  };

  return (
    <View style={[styles.container, { backgroundColor: contentBackground }]}>
      <View
        style={[
          styles.content,
          {
            borderColor: showDebug ? debugColors.content : 'transparent',
            borderWidth: showDebug ? 2 : 0,
          },
        ]}
      >
        <Slot />
      </View>
      <View
        style={[
          styles.tabBarWrapper,
          {
            paddingHorizontal: horizontalMargin,
            bottom: Math.max(insets.bottom, 0) + floatingGap,
            borderColor: showDebug ? debugColors.wrapper : 'transparent',
            borderWidth: showDebug ? 2 : 0,
          },
        ]}
      >
        <View
          style={[
            styles.tabBar,
            {
              backgroundColor: barBackground,
              borderColor: showDebug ? debugColors.bar : barBorderColor,
              borderWidth: showDebug ? 2 : 1,
              paddingTop: 6,
              paddingBottom: 6,
              borderRadius: 999,
            },
          ]}
        >
          <View
            style={styles.tabBarSurface}
            pointerEvents="none"
            renderToHardwareTextureAndroid
            needsOffscreenAlphaCompositing
          >
            <BlurView
              tint={blurTint}
              intensity={blurIntensity}
              blurReductionFactor={0.7}
              experimentalBlurMethod="dimezisBlurView"
              style={styles.tabBarBlur}
            />
            <View style={styles.tabBarGradient}>
              {barGradientColors.map((color, index) => (
                <View key={`${color}-${index}`} style={[styles.gradientStop, { backgroundColor: color }]} />
              ))}
            </View>
          </View>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.name;
            const iconName = isActive ? tab.iconFilled : tab.icon;
            const iconColor = isActive ? '#000000' : inactiveColor;
            const labelColor = isActive ? selectedLabelColor : inactiveColor;

            const tabContent = (
              <>
                <Ionicons name={iconName} size={24} color={iconColor} />
                <Text style={[styles.tabLabel, { color: labelColor }]} numberOfLines={1}>
                  {tab.label}
                </Text>
              </>
            );

            return (
              <TouchableOpacity
                key={tab.name}
                style={styles.tabItem}
                onPress={() => handleTabPress(tab)}
                activeOpacity={0.7}
              >
                {isActive ? (
                  <View style={[styles.pill, { backgroundColor: pillBackground }]}>
                    {tabContent}
                  </View>
                ) : (
                  tabContent
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  tabBarWrapper: {
    width: '100%',
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  tabBar: {
    flexDirection: 'row',
    minHeight: 60,
    width: '100%',
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
  },
  tabBarSurface: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    overflow: 'hidden',
  },
  tabBarBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  tabBarGradient: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'column',
  },
  gradientStop: {
    flex: 1,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minWidth: 0,
    paddingHorizontal: 6,
  },
  pill: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 4,
    alignSelf: 'stretch',
    gap: 2,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
});

