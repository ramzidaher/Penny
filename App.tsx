import React, { useEffect, useState, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { useFonts } from 'expo-font';
import { initDatabase } from './src/database/db';
import { initializeNotifications } from './src/services/notifications';
import { initFirebase, isAuthenticated, onAuthStateChanged, getAuth, setCurrentUser, setAuthStateCallback, getIsSigningOut } from './src/services/firebase';
import type { User } from 'firebase/auth';
import { colors } from './src/theme/colors';

// Screens
import HomeScreen from './src/screens/HomeScreen';
import FinanceStack from './src/screens/FinanceScreen';
import SubscriptionsScreen from './src/screens/SubscriptionsScreen';
import AIScreen from './src/screens/AIScreen';
import AddSubscriptionScreen from './src/screens/AddSubscriptionScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';

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
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.tsx:61',message:'OLD App.tsx is being executed - this should NOT happen with Expo Router',data:{entryPoint:'App.tsx',usingReactNavigation:true},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  const [fontsLoaded] = useFonts({
    'Gulfs Display': require('./assets/fonts/GulfsDisplay-Normal.ttf'),
  });
  
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [user, setUser] = useState<any>(null);
  const navigationRef = useRef<NavigationContainerRef<any>>(null);

  // Handle deep links for TrueLayer OAuth callback (mobile-first)
  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      const { url } = event;
      
      // Mobile: Check if this is a TrueLayer callback (app scheme)
      // Format: penny://truelayer-callback?code=XXX or penny://truelayer-callback?error=XXX
      if (url.includes('truelayer-callback') || url.includes('penny://')) {
        try {
          const parsedUrl = Linking.parse(url);
          const code = parsedUrl.queryParams?.code as string;
          const error = parsedUrl.queryParams?.error as string;

          console.log('Deep link received:', { url, code: !!code, error: !!error });

          if (error) {
            console.error('TrueLayer OAuth error:', error);
            // Navigate to ConnectBank screen with error
            if (navigationRef.current && user) {
              // Small delay to ensure navigation is ready
              setTimeout(() => {
                navigationRef.current?.navigate('Finance', {
                  screen: 'ConnectBank',
                  params: { error: error },
                });
              }, 100);
            }
            return;
          }

          if (code) {
            console.log('TrueLayer OAuth callback received with code');
            // Navigate to ConnectBank screen with code
            if (navigationRef.current && user) {
              // Small delay to ensure navigation is ready
              setTimeout(() => {
                navigationRef.current?.navigate('Finance', {
                  screen: 'ConnectBank',
                  params: { code: code },
                });
              }, 100);
            }
          }
        } catch (error) {
          console.error('Error handling deep link:', error);
        }
      }
    };

    // Handle initial URL (if app was opened via deep link on mobile)
    // This is important for when the app is closed and opened via deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        console.log('Initial URL on app start:', url);
        handleDeepLink({ url });
      }
    }).catch((error) => {
      console.error('Error getting initial URL:', error);
    });

    // Listen for deep links while app is running (mobile)
    const subscription = Linking.addEventListener('url', (event) => {
      console.log('Deep link event received:', event.url);
      handleDeepLink(event);
    });

    return () => {
      subscription.remove();
    };
  }, [user]);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    
    const initialize = async () => {
      // Initialize Firebase first
      await initFirebase();
      
      // Listen for auth state changes
      const auth = getAuth();
      if (auth) {
        // Define the auth state change handler
        const handleAuthStateChange = async (user: User | null) => {
          console.log('Auth state changed:', user ? `User: ${user.email}` : 'User: null');
          
          // If we're in the process of signing out and user is being restored, ignore it
          if (getIsSigningOut() && user !== null) {
            console.log('Ignoring auto-restore during sign out');
            return;
          }
          
          // Update both local state and firebase.ts currentUser
          setCurrentUser(user);
          setUser(user);
          setIsAuthReady(true);
          
          if (user) {
            // User is signed in, initialize app features
            await initDatabase();
            await initializeNotifications();
          } else {
            // User signed out, clear any cached data if needed
            console.log('User signed out, clearing state');
          }
        };
        
        // Set up the callback for manual triggering (fallback)
        setAuthStateCallback(handleAuthStateChange);
        
        // Set up Firebase auth state listener
        unsubscribe = onAuthStateChanged(auth, handleAuthStateChange);
        
        // Set initial state
        const initialUser = auth.currentUser;
        console.log('Initial auth state:', initialUser ? `User: ${initialUser.email}` : 'User: null');
        setCurrentUser(initialUser);
        setUser(initialUser);
        setIsAuthReady(true);
      } else {
        setIsAuthReady(true);
      }
    };
    
    initialize();
    
    // Cleanup function
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  if (!fontsLoaded || !isAuthReady) {
    // Show loading screen while fonts are loading or checking auth
    return null;
  }

  // Auth Stack for login/register
  function AuthStack() {
    return (
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
      </Stack.Navigator>
    );
  }

  // Main App Stack (protected routes)
  function MainApp() {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.tsx:223',message:'OLD React Navigation Tab.Navigator being used',data:{navigationType:'React Navigation Bottom Tabs'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    return (
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
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <StatusBar style="dark" />
      {user ? <MainApp /> : <AuthStack />}
    </NavigationContainer>
  );
}

