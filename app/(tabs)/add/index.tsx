import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useColorScheme } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useActionMenu } from '../../../src/contexts/ActionMenuContext';
import { useTheme } from '../../../src/contexts/ThemeContext';
import { onTabReselect } from '../../../src/utils/tabReselect';
import ActionMenu from '../../../src/components/ActionMenu';

export default function AddIndex() {
  const pathname = usePathname();
  const router = useRouter();
  const navigation = useNavigation<any>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { getPreviousRoute } = useActionMenu();
  const { colors } = useTheme();
  const hasShownMenu = useRef(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const returnRouteRef = useRef<string | null>(null);
  const pathnameRef = useRef<string | null>(pathname ?? null);

  const backgroundColor = isDark ? colors.dark.background : colors.background;

  useEffect(() => {
    pathnameRef.current = pathname ?? null;
  }, [pathname]);

  useEffect(() => {
    // Show menu when on add route
    if (pathname?.includes('/add') && !hasShownMenu.current) {
      hasShownMenu.current = true;
      setMenuVisible(true);
      returnRouteRef.current = getPreviousRoute();
    }

    // Reset when leaving add route
    if (!pathname?.includes('/add')) {
      hasShownMenu.current = false;
      setMenuVisible(false);
      returnRouteRef.current = null;
    }
  }, [pathname, getPreviousRoute]);

  const resolveReturnRoute = useCallback(() => {
    const fallbackRoute = '/(tabs)';
    const previousRoute = returnRouteRef.current || getPreviousRoute() || fallbackRoute;
    if (previousRoute && previousRoute !== pathname) {
      return previousRoute;
    }
    return fallbackRoute;
  }, [getPreviousRoute, pathname]);

  const getTabNameFromRoute = useCallback((route: string | null) => {
    if (route?.includes('/finance')) return 'finance';
    if (route?.includes('/ai')) return 'ai';
    if (route?.includes('/add')) return 'add';
    return 'index';
  }, []);

  const getTabNavigator = useCallback(() => {
    return navigation?.getParent ? navigation.getParent() : navigation;
  }, [navigation]);

  const handleCloseMenu = useCallback(() => {
    setMenuVisible(false);
    // Navigate back to previous page
    const previousRoute = resolveReturnRoute();
    const previousTab = getTabNameFromRoute(previousRoute);
    const tabNavigator = getTabNavigator();

    // Small delay to ensure menu closes smoothly before navigation
    setTimeout(() => {
      try {
        tabNavigator?.navigate?.(previousTab as never);
      } catch {
        // ignore
      }
      router.replace(previousRoute as any);

      // iOS NativeTabs can ignore replace in some cases; fallback to tab navigate.
      setTimeout(() => {
        if (Platform.OS === 'ios' && pathnameRef.current?.includes('/add')) {
          try {
            tabNavigator?.navigate?.(previousTab as never);
            tabNavigator?.jumpTo?.(previousTab as never);
          } catch {
            // ignore
          }
        }
      }, 150);
    }, 100);
  }, [resolveReturnRoute, router, getTabNameFromRoute, getTabNavigator]);

  // When Menu tab is open: tapping Menu again (iOS native tabs) or reselect (Android) should close and go back
  useEffect(() => {
    const unsubs: Array<() => void> = [];

    const tabNavigator = getTabNavigator();
    if (tabNavigator?.addListener) {
      const unsubTabPress = tabNavigator.addListener('tabPress', () => {
        if (tabNavigator.isFocused?.() || navigation.isFocused?.()) {
          handleCloseMenu();
        }
      });
      if (typeof unsubTabPress === 'function') {
        unsubs.push(unsubTabPress);
      }
    }

    unsubs.push(onTabReselect('add', handleCloseMenu));

    return () => {
      unsubs.forEach((u) => {
        try {
          u();
        } catch {
          // ignore
        }
      });
    };
  }, [navigation, handleCloseMenu, getTabNavigator]);

  // Render only the menu overlay - no background screen duplication
  return (
    <View style={[styles.container, { backgroundColor }]}>
      <ActionMenu
        visible={menuVisible}
        onClose={handleCloseMenu}
        renderAsOverlay={true}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

