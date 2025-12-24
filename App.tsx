import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { initDatabase } from './src/database/db';
import { initializeNotifications } from './src/services/notifications';
import { initFirebase } from './src/services/firebase';
import { colors } from './src/theme/colors';

// Screens
import HomeScreen from './src/screens/HomeScreen';
import FinanceStack from './src/screens/FinanceScreen';
import SubscriptionsScreen from './src/screens/SubscriptionsScreen';
import AIScreen from './src/screens/AIScreen';
import AddSubscriptionScreen from './src/screens/AddSubscriptionScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function SubscriptionsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '600', fontSize: 18 },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="SubscriptionsList" component={SubscriptionsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="AddSubscription" component={AddSubscriptionScreen} options={{ title: 'Add Subscription' }} />
    </Stack.Navigator>
  );
}

function HomeStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '600', fontSize: 18 },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="HomeMain" component={HomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
    </Stack.Navigator>
  );
}

export default function App() {
  useEffect(() => {
    const initialize = async () => {
      // Initialize Firebase first (if configured)
      await initFirebase();
      // Initialize local database
      await initDatabase();
      // Initialize notifications
      await initializeNotifications();
    };
    initialize();
  }, []);

  return (
    <NavigationContainer>
      <StatusBar style="dark" />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            let iconName: keyof typeof Ionicons.glyphMap;

            if (route.name === 'Home') {
              iconName = focused ? 'home' : 'home-outline';
            } else if (route.name === 'Finance') {
              iconName = focused ? 'wallet' : 'wallet-outline';
            } else if (route.name === 'Subscriptions') {
              iconName = focused ? 'repeat' : 'repeat-outline';
            } else {
              iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
            }

            return <Ionicons name={iconName} size={24} color={color} />;
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarStyle: {
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            height: 60,
            paddingBottom: 8,
            paddingTop: 8,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '500',
          },
          headerShown: false,
        })}
      >
        <Tab.Screen name="Home" component={HomeStack} />
        <Tab.Screen name="Finance" component={FinanceStack} />
        <Tab.Screen name="Subscriptions" component={SubscriptionsStack} />
        <Tab.Screen name="AI" component={AIScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

