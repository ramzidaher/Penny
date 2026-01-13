import { Stack, useRouter } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../src/theme/colors';

function CustomBackButton() {
  const router = useRouter();
  return (
    <TouchableOpacity
      onPress={() => router.back()}
      style={{ marginLeft: 8, padding: 4 }}
    >
      <Ionicons name="arrow-back" size={24} color={colors.text} />
    </TouchableOpacity>
  );
}

export default function FinanceLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '600', fontSize: 18 },
        headerShadowVisible: false,
        headerBackTitle: '',
        headerBackTitleVisible: false,
        headerBackVisible: true,
      }}
    >
      <Stack.Screen 
        name="index" 
        options={{ title: 'Finance', headerShown: false }} 
      />
      <Stack.Screen name="accounts" options={{ title: 'Accounts' }} />
      <Stack.Screen name="add-account" options={{ title: 'Add Account' }} />
      <Stack.Screen name="connect-bank" options={{ title: 'Connect Bank' }} />
      <Stack.Screen name="transactions" options={{ title: 'Transactions' }} />
      <Stack.Screen name="transaction-detail" options={{ headerShown: false }} />
      <Stack.Screen name="income-expense" options={{ title: 'Income & Expenses' }} />
      <Stack.Screen name="add-transaction" options={{ title: 'Add Transaction' }} />
      <Stack.Screen name="budgets" options={{ title: 'Budgets' }} />
      <Stack.Screen name="add-budget" options={{ title: 'Add Budget' }} />
      <Stack.Screen name="debts" options={{ title: 'Debts' }} />
      <Stack.Screen name="add-debt" options={{ title: 'Add Debt' }} />
      <Stack.Screen 
        name="settings" 
        options={{ 
          title: 'Settings',
          headerBackVisible: true,
          headerLeft: () => <CustomBackButton />,
        }} 
      />
      <Stack.Screen 
        name="help" 
        options={{ 
          title: 'Help & Support',
          headerBackVisible: true,
          headerLeft: () => <CustomBackButton />,
        }} 
      />
      <Stack.Screen 
        name="about" 
        options={{ 
          title: 'About',
          headerBackVisible: true,
          headerLeft: () => <CustomBackButton />,
        }} 
      />
      <Stack.Screen 
        name="subscriptions" 
        options={{ headerShown: false }} 
      />
    </Stack>
  );
}

