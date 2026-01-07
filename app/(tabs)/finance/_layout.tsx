import { Stack } from 'expo-router';
import { colors } from '../../../src/theme/colors';

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
      <Stack.Screen name="add-transaction" options={{ title: 'Add Transaction' }} />
      <Stack.Screen name="budgets" options={{ title: 'Budgets' }} />
      <Stack.Screen name="add-budget" options={{ title: 'Add Budget' }} />
      <Stack.Screen name="debts" options={{ title: 'Debts' }} />
      <Stack.Screen name="add-debt" options={{ title: 'Add Debt' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
    </Stack>
  );
}

