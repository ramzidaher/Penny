import * as Notifications from 'expo-notifications';
import { getSubscriptions, getBudgets, getTransactions, getAccounts, getDebts } from '../database/db';
import { getSettings } from './settingsService';
import { format, addDays, differenceInDays, startOfMonth, endOfMonth, startOfDay, isToday } from 'date-fns';

// Configure notification handler (will be updated based on settings)
const updateNotificationHandler = async () => {
  try {
    const settings = await getSettings();
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: settings.enableNotifications,
        shouldPlaySound: settings.enableSound,
        shouldSetBadge: settings.enableBadge,
        shouldShowBanner: settings.enableNotifications,
        shouldShowList: settings.enableNotifications,
      }),
    });
  } catch (error) {
    // Default handler if settings not available
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  }
};

// Initialize notification handler
updateNotificationHandler();

export const requestPermissions = async () => {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    finalStatus = status;
  }
  
  return finalStatus === 'granted';
};

// Cancel all existing notifications and reschedule
export const cancelAllNotifications = async () => {
  await Notifications.cancelAllScheduledNotificationsAsync();
};

// Low balance alerts for accounts
export const checkLowBalanceAlerts = async () => {
  const settings = await getSettings();
  if (!settings.enableLowBalanceAlerts) return;
  
  const accounts = await getAccounts();
  const lowBalanceThreshold = settings.lowBalanceThreshold;
  
  for (const account of accounts) {
    if (account.balance < lowBalanceThreshold && account.balance >= 0) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Low Balance Alert',
          body: `${account.name} balance is low: $${account.balance.toFixed(2)}. Consider adding funds.`,
          data: { type: 'low_balance', accountId: account.id },
        },
        trigger: null, // Immediate
      });
    } else if (account.balance < 0) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Negative Balance Warning',
          body: `${account.name} has a negative balance: $${account.balance.toFixed(2)}. Please add funds immediately.`,
          data: { type: 'negative_balance', accountId: account.id },
        },
        trigger: null, // Immediate
      });
    }
  }
};

// Daily account update reminder
export const scheduleDailyAccountUpdateReminder = async () => {
  const settings = await getSettings();
  if (!settings.enableDailyReminders) return;
  
  // Parse time from settings (HH:mm format)
  const [hours, minutes] = settings.dailyReminderTime.split(':').map(Number);
  
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Daily Account Update',
      body: 'Don\'t forget to update your account balances today!',
      data: { type: 'daily_update' },
    },
    trigger: {
      hour: hours || 9,
      minute: minutes || 0,
      repeats: true,
    } as any,
  });
};

// Subscription payment reminders
export const scheduleSubscriptionReminders = async () => {
  const settings = await getSettings();
  if (!settings.enableSubscriptionReminders) return;
  
  const subscriptions = await getSubscriptions();
  const now = new Date();
  
  // Cancel existing subscription notifications
  const allNotifications = await Notifications.getAllScheduledNotificationsAsync();
  for (const notification of allNotifications) {
    if (notification.content.data?.type === 'subscription') {
      await Notifications.cancelScheduledNotificationAsync(notification.identifier);
    }
  }
  
  const reminderDays = settings.subscriptionReminderDays || [3, 1, 0];
  
  for (const subscription of subscriptions) {
    const nextBilling = new Date(subscription.nextBillingDate);
    const daysUntil = differenceInDays(nextBilling, now);
    
    // Schedule reminders based on settings
    for (const daysBefore of reminderDays) {
      if (daysUntil >= daysBefore && daysBefore > 0) {
        const reminderDate = addDays(now, daysUntil - daysBefore);
        reminderDate.setHours(10, 0, 0, 0);
        
        let title = '';
        let body = '';
        if (daysBefore === 3) {
          title = 'Upcoming Subscription';
          body = `${subscription.name} will be charged $${subscription.amount.toFixed(2)} in 3 days.`;
        } else if (daysBefore === 1) {
          title = 'Subscription Renewal Tomorrow';
          body = `${subscription.name} will be charged $${subscription.amount.toFixed(2)} tomorrow.`;
        } else {
          title = 'Upcoming Subscription';
          body = `${subscription.name} will be charged $${subscription.amount.toFixed(2)} in ${daysBefore} days.`;
        }
        
        await Notifications.scheduleNotificationAsync({
          content: {
            title,
            body,
            data: { type: 'subscription', id: subscription.id, daysUntil: daysBefore },
          },
        trigger: reminderDate as any,
        });
      }
    }
    
    // Schedule reminder on the day (if 0 is in reminderDays)
    if (reminderDays.includes(0) && daysUntil >= 0) {
      const reminderDate = new Date(nextBilling);
      reminderDate.setHours(9, 0, 0, 0);
      
      if (reminderDate > now) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Subscription Payment Due Today',
            body: `${subscription.name} will be charged $${subscription.amount.toFixed(2)} today.`,
            data: { type: 'subscription', id: subscription.id, daysUntil: 0 },
          },
        trigger: reminderDate as any,
        });
      }
    }
  }
};

// Budget alerts
export const checkBudgetAlerts = async () => {
  const settings = await getSettings();
  if (!settings.enableBudgetAlerts) return;
  
  const budgets = await getBudgets();
  const transactions = await getTransactions();
  const now = new Date();
  const startOfCurrentMonth = startOfMonth(now);
  const endOfCurrentMonth = endOfMonth(now);
  
  const monthlyTransactions = transactions.filter(t => {
    const date = new Date(t.date);
    return date >= startOfCurrentMonth && date <= endOfCurrentMonth && t.type === 'expense';
  });
  
  const thresholds = settings.budgetAlertThresholds || [80, 90, 100];
  
  for (const budget of budgets) {
    const categorySpent = monthlyTransactions
      .filter(t => t.category === budget.category)
      .reduce((sum, t) => sum + t.amount, 0);
    
    const percentage = (categorySpent / budget.limit) * 100;
    const remaining = budget.limit - categorySpent;
    
    // Check each threshold
    for (const threshold of thresholds.sort((a, b) => b - a)) {
      if (percentage >= threshold) {
        let title = '';
        let body = '';
        
        if (threshold === 100) {
          title = 'Budget Exceeded';
          body = `You've exceeded your ${budget.category} budget by $${Math.abs(remaining).toFixed(2)}.`;
        } else if (threshold === 90) {
          title = 'Budget Warning';
          body = `You've used ${percentage.toFixed(0)}% of your ${budget.category} budget. Only $${remaining.toFixed(2)} remaining.`;
        } else {
          title = 'Budget Alert';
          body = `You've used ${percentage.toFixed(0)}% of your ${budget.category} budget. $${remaining.toFixed(2)} remaining.`;
        }
        
        await Notifications.scheduleNotificationAsync({
          content: {
            title,
            body,
            data: { type: 'budget', id: budget.id },
          },
          trigger: null, // Immediate
        });
        break; // Only send one alert per budget
      }
    }
  }
};

// Debt payment reminders
export const scheduleDebtReminders = async () => {
  const settings = await getSettings();
  if (!settings.enableSubscriptionReminders) return; // Use same setting for debt reminders
  
  const debts = await getDebts();
  const now = new Date();
  const { getCurrencySymbol } = await import('../utils/currency');
  const currencySymbol = getCurrencySymbol(settings.defaultCurrency);
  
  // Cancel existing debt notifications
  const allNotifications = await Notifications.getAllScheduledNotificationsAsync();
  for (const notification of allNotifications) {
    if (notification.content.data?.type === 'debt') {
      await Notifications.cancelScheduledNotificationAsync(notification.identifier);
    }
  }
  
  for (const debt of debts) {
    if (debt.status !== 'active') continue;
    
    const dueDate = new Date(debt.dueDate);
    const daysUntil = differenceInDays(dueDate, now);
    
    // Reminder 3 days before
    if (daysUntil >= 3) {
      const reminderDate = addDays(now, daysUntil - 3);
      reminderDate.setHours(10, 0, 0, 0);
      
      const amountText = debt.minimumPayment 
        ? `${currencySymbol}${debt.minimumPayment.toFixed(2)}` 
        : 'minimum amount';
      
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Debt Payment Due Soon',
          body: `${debt.name} payment of ${amountText} is due in 3 days.`,
          data: { type: 'debt', id: debt.id, daysUntil: 3 },
        },
        trigger: reminderDate as any,
      });
    }
    
    // Reminder 1 day before
    if (daysUntil >= 1) {
      const reminderDate = addDays(now, daysUntil - 1);
      reminderDate.setHours(10, 0, 0, 0);
      
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Debt Payment Due Tomorrow',
          body: `${debt.name} payment is due tomorrow.`,
          data: { type: 'debt', id: debt.id, daysUntil: 1 },
        },
        trigger: reminderDate as any,
      });
    }
    
    // Reminder on due date
    if (daysUntil >= 0) {
      const reminderDate = new Date(dueDate);
      reminderDate.setHours(9, 0, 0, 0);
      
      if (reminderDate > now) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Debt Payment Due Today',
            body: `${debt.name} payment is due today.`,
            data: { type: 'debt', id: debt.id, daysUntil: 0 },
          },
          trigger: reminderDate as any,
        });
      }
    }
    
    // Overdue reminder
    if (daysUntil < 0) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Debt Payment Overdue',
          body: `${debt.name} payment is ${Math.abs(daysUntil)} day${Math.abs(daysUntil) !== 1 ? 's' : ''} overdue!`,
          data: { type: 'debt', id: debt.id, overdue: true },
        },
        trigger: null, // Immediate
      });
    }
  }
};

// Payment reminders (for transactions with due dates - if you add this feature)
export const schedulePaymentReminders = async () => {
  // This can be extended if you add due dates to transactions
  // For now, we'll check for upcoming subscription payments
  const subscriptions = await getSubscriptions();
  const now = new Date();
  
  for (const subscription of subscriptions) {
    const nextBilling = new Date(subscription.nextBillingDate);
    
    // If payment is due today, send a reminder
    if (isToday(nextBilling)) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Payment Reminder',
          body: `Don't forget: ${subscription.name} payment of $${subscription.amount.toFixed(2)} is due today.`,
          data: { type: 'payment_reminder', id: subscription.id },
        },
        trigger: {
          hour: 8,
          minute: 0,
        } as any,
      });
    }
  }
};

// Main function to schedule all notifications
export const scheduleAllNotifications = async () => {
  try {
    // Update notification handler based on settings
    await updateNotificationHandler();
    
    // Cancel all existing notifications first
    await cancelAllNotifications();
    
    const settings = await getSettings();
    
    // Only schedule if notifications are enabled
    if (!settings.enableNotifications) {
      console.log('Notifications are disabled in settings');
      return;
    }
    
    // Schedule recurring daily account update reminder
    await scheduleDailyAccountUpdateReminder();
    
    // Check and schedule subscription reminders
    await scheduleSubscriptionReminders();
    
    // Check low balances
    await checkLowBalanceAlerts();
    
    // Check budget alerts
    await checkBudgetAlerts();
    
    // Schedule debt reminders
    await scheduleDebtReminders();
    
    // Schedule payment reminders
    await schedulePaymentReminders();
    
    console.log('All notifications scheduled successfully');
  } catch (error) {
    console.error('Error scheduling notifications:', error);
  }
};

// Daily check function (called daily to update notifications)
export const scheduleDailyCheck = async () => {
  await scheduleAllNotifications();
};

// Initialize notifications on app start
export const initializeNotifications = async () => {
  const hasPermission = await requestPermissions();
  if (hasPermission) {
    await scheduleAllNotifications();
  }
  return hasPermission;
};
