import { useColorScheme } from 'react-native';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
import { colors } from '../../src/theme/colors';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  
  // Use theme colors
  const backgroundColor = isDark ? colors.dark.background : colors.background;
  const activeColor = isDark ? colors.dark.primary : colors.primary;
  const inactiveColor = isDark ? colors.dark.textSecondary : colors.textSecondary;
  const textColor = isDark ? colors.dark.text : colors.text;
  
  return (
    <NativeTabs
      labelStyle={{
        color: textColor,
        fontSize: 12,
        fontWeight: '500',
      }}
      tintColor={activeColor}
      barTintColor={backgroundColor}
      unselectedTintColor={inactiveColor}
    >
      <NativeTabs.Trigger name="index">
        <Label>Home</Label>
        <Icon 
          sf={{ default: 'house', selected: 'house.fill' }} 
          drawable="ic_home"
        />
      </NativeTabs.Trigger>
      
      <NativeTabs.Trigger name="finance">
        <Label>Finance</Label>
        <Icon 
          sf={{ default: 'creditcard', selected: 'creditcard.fill' }} 
          drawable="ic_wallet"
        />
      </NativeTabs.Trigger>
      
      <NativeTabs.Trigger name="subscriptions">
        <Icon 
          sf={{ default: 'arrow.clockwise', selected: 'arrow.clockwise.circle.fill' }} 
          drawable="ic_repeat"
        />
        <Label>Subscriptions</Label>
      </NativeTabs.Trigger>
      
      <NativeTabs.Trigger name="ai">
        <Icon 
          sf={{ default: 'bubble.left.and.bubble.right', selected: 'bubble.left.and.bubble.right.fill' }} 
          drawable="ic_chat"
        />
        <Label>Advisor</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

