import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
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
  const { hideMenu, getPreviousRoute } = useActionMenu();
  const { colors } = useTheme();
  const hasShownMenu = useRef(false);
  const [menuVisible, setMenuVisible] = useState(false);

  const backgroundColor = isDark ? colors.dark.background : colors.background;

  useEffect(() => {
    // Show menu when on add route
    if (pathname?.includes('/add') && !hasShownMenu.current) {
      hasShownMenu.current = true;
      setMenuVisible(true);
    }
    
    // Reset when leaving add route
    if (!pathname?.includes('/add')) {
      hasShownMenu.current = false;
      setMenuVisible(false);
    }
  }, [pathname]);

  const handleCloseMenu = () => {
    setMenuVisible(false);
    // Navigate back to previous page
    const previousRoute = getPreviousRoute();
    if (previousRoute && previousRoute !== pathname) {
      // Small delay to ensure menu closes smoothly before navigation
      setTimeout(() => {
        router.replace(previousRoute as any);
      }, 100);
    } else {
      // Fallback to router.back() if no previous route
      setTimeout(() => {
        router.back();
      }, 100);
    }
    hideMenu();
  };

  // When Menu tab is open: tapping Menu again (iOS native tabs) or reselect (Android) should close and go back
  useEffect(() => {
    const unsubs: Array<() => void> = [];

    if (navigation?.addListener) {
      const unsubTabPress = navigation.addListener('tabPress', () => {
        if (navigation.isFocused?.()) {
          hideMenu();
        }
      });
      if (typeof unsubTabPress === 'function') {
        unsubs.push(unsubTabPress);
      }
    }

    unsubs.push(onTabReselect('add', hideMenu));

    return () => {
      unsubs.forEach((u) => {
        try {
          u();
        } catch {
          // ignore
        }
      });
    };
  }, [navigation, hideMenu]);

  // Render only the menu overlay - no background screen duplication
  return (
    <View style={[styles.container, { backgroundColor }]}>
      <ActionMenu visible={menuVisible} onClose={handleCloseMenu} renderAsOverlay={true} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

