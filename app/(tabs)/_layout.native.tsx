import { useColorScheme, Platform, DynamicColorIOS } from 'react-native';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  
  // Use DynamicColorIOS for native tab bar colors that adapt to liquid glass on iOS
  const textColor = Platform.OS === 'ios' 
    ? DynamicColorIOS({
        dark: 'white',
        light: 'black',
      })
    : colorScheme === 'dark' ? 'white' : 'black';
  
  return (
    <NativeTabs
      labelStyle={{
        color: textColor,
        fontSize: 12,
        fontWeight: '500',
      }}
      tintColor={textColor}
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
      
      <NativeTabs.Trigger name="ai">
        <Icon 
          sf={{ default: 'bubble.left.and.bubble.right', selected: 'bubble.left.and.bubble.right.fill' }} 
          drawable="ic_chat"
        />
        <Label>Advisor</Label>
      </NativeTabs.Trigger>
      
      <NativeTabs.Trigger name="add">
        <Icon 
          sf={{ default: 'line.horizontal.3', selected: 'line.horizontal.3.circle.fill' }} 
          drawable="ic_menu"
        />
        <Label>Menu</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}


