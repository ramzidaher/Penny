import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useColorScheme } from 'react-native';
import { useActionMenu } from '../../../src/contexts/ActionMenuContext';
import { colors } from '../../../src/theme/colors';
import ActionMenu from '../../../src/components/ActionMenu';

export default function AddIndex() {
  const pathname = usePathname();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const { hideMenu, getPreviousRoute } = useActionMenu();
  const hasShownMenu = useRef(false);
  const [menuVisible, setMenuVisible] = useState(false);

  const backgroundColor = colorScheme === 'dark' ? colors.dark.background : colors.background;

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

