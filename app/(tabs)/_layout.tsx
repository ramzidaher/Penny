import { useColorScheme } from 'react-native';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const textColor = colorScheme === 'dark' ? 'white' : 'black';
  
  return (
    <NativeTabs
      labelStyle={{
        color: textColor,
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

