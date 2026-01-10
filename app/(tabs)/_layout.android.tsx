import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useRouter, usePathname, useSegments, Slot } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../src/theme/colors';

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
  
  // Determine active tab based on pathname or segments
  const getActiveTab = () => {
    // Check if we're on the home/index route
    if (pathname === '/(tabs)' || pathname === '/(tabs)/' || pathname === '/') {
      return 'index';
    }
    // Extract tab name from pathname
    const pathParts = pathname.split('/');
    const tabName = pathParts[pathParts.length - 1];
    
    // Map route names to tab names
    if (tabName === 'finance' || pathname.includes('/finance')) {
      return 'finance';
    }
    if (tabName === 'ai' || pathname.includes('/ai')) {
      return 'ai';
    }
    if (tabName === 'add' || pathname.includes('/add')) {
      return 'add';
    }
    
    // Fallback to segments
    const tabSegment = segments[1];
    return tabSegment || 'index';
  };
  
  const activeTab = getActiveTab();
  
  // Use theme colors
  const backgroundColor = isDark ? colors.dark.background : colors.background;
  const activeColor = isDark ? colors.dark.primary : colors.primary;
  const inactiveColor = isDark ? colors.dark.textSecondary : colors.textSecondary;
  const borderColor = isDark ? colors.dark.border : colors.border;
  
  const handleTabPress = (tab: TabItem) => {
    router.push(tab.route as any);
  };
  
  return (
    <View style={[styles.container, { backgroundColor }]}>
      <View style={styles.content}>
        <Slot />
      </View>
      <View style={[
        styles.tabBar, 
        { 
          backgroundColor, 
          borderTopColor: borderColor,
          paddingBottom: Math.max(insets.bottom, 8),
        }
      ]}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.name;
          const iconName = isActive ? tab.iconFilled : tab.icon;
          const iconColor = isActive ? activeColor : inactiveColor;
          const labelColor = isActive ? activeColor : inactiveColor;
          
          return (
            <TouchableOpacity
              key={tab.name}
              style={styles.tabItem}
              onPress={() => handleTabPress(tab)}
              activeOpacity={0.7}
            >
              <Ionicons 
                name={iconName} 
                size={24} 
                color={iconColor}
              />
              <Text style={[styles.tabLabel, { color: labelColor }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
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
  tabBar: {
    flexDirection: 'row',
    minHeight: 60,
    borderTopWidth: 1,
    paddingTop: 8,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    width: '100%',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minWidth: 0, // Ensures tabs can shrink on small screens
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
});

