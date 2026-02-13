import { useEffect, useState } from 'react';
import { Appearance, Platform, DynamicColorIOS } from 'react-native';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';

// Use a stable color scheme from Appearance so the tab bar doesn't flip when switching tabs.
// useColorScheme() can change with the active screen's trait collection on iOS, causing the
// native tab bar to switch between dark/light. We only update when the user changes system appearance.
function useStableColorScheme(): 'light' | 'dark' | null {
  const [scheme, setScheme] = useState<'light' | 'dark' | null>(
    () => Appearance.getColorScheme() ?? null
  );
  useEffect(() => {
    setScheme(Appearance.getColorScheme() ?? null);
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setScheme(colorScheme ?? null);
    });
    return () => sub.remove();
  }, []);
  return scheme;
}

export default function TabLayout() {
  const colorScheme = useStableColorScheme();
  const isDark = colorScheme === 'dark';

  // Explicit bar appearance so the tab bar doesn't inherit the active screen's traits (fixes iOS flip).
  // systemMaterialDark/ Light sticks better than 'dark'/'light' when switching tabs on iOS.
  const blurEffect: 'systemMaterialDark' | 'systemMaterialLight' | undefined = Platform.OS === 'ios'
    ? (isDark ? 'systemMaterialDark' : 'systemMaterialLight')
    : undefined;
  const barBackgroundColor = isDark ? '#1a1a1a' : '#f5f4f1';

  // Use DynamicColorIOS for native tab bar colors that adapt to liquid glass on iOS
  const textColor = Platform.OS === 'ios'
    ? DynamicColorIOS({
        dark: 'white',
        light: 'black',
      })
    : isDark ? 'white' : 'black';

  // Per-tab TabBar forces the same appearance when that tab is focused, preventing the native
  // bar from switching to light when the active screen's trait collection changes.
  const tabBarAppearance =
    Platform.OS === 'ios' && blurEffect
      ? { blurEffect, backgroundColor: barBackgroundColor }
      : null;

  return (
    <NativeTabs
      blurEffect={blurEffect}
      backgroundColor={barBackgroundColor}
      labelStyle={{
        color: textColor,
        fontSize: 12,
        fontWeight: '500',
      }}
      tintColor={textColor}
    >
      <NativeTabs.Trigger name="index">
        {tabBarAppearance && <NativeTabs.Trigger.TabBar {...tabBarAppearance} />}
        <Label>Home</Label>
        <Icon 
          sf={{ default: 'house', selected: 'house.fill' }} 
          drawable="ic_home"
        />
      </NativeTabs.Trigger>
      
      <NativeTabs.Trigger name="finance">
        {tabBarAppearance && <NativeTabs.Trigger.TabBar {...tabBarAppearance} />}
        <Label>Finance</Label>
        <Icon 
          sf={{ default: 'creditcard', selected: 'creditcard.fill' }} 
          drawable="ic_wallet"
        />
      </NativeTabs.Trigger>
      
      <NativeTabs.Trigger name="ai">
        {tabBarAppearance && <NativeTabs.Trigger.TabBar {...tabBarAppearance} />}
        <Icon 
          sf={{ default: 'bubble.left.and.bubble.right', selected: 'bubble.left.and.bubble.right.fill' }} 
          drawable="ic_chat"
        />
        <Label>Advisor</Label>
      </NativeTabs.Trigger>
      
      <NativeTabs.Trigger name="add">
        {tabBarAppearance && <NativeTabs.Trigger.TabBar {...tabBarAppearance} />}
        <Icon 
          sf={{ default: 'line.horizontal.3', selected: 'line.horizontal.3.circle.fill' }} 
          drawable="ic_menu"
        />
        <Label>Menu</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}


