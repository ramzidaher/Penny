import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useDialog } from '../contexts/DialogContext';
import { getAccounts } from '../database/db';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FIRST_LOGIN_DIALOG_KEY = 'first_login_dialog_shown';

interface FirstLoginDialogProps {
  userId: string | null;
  isAppUnlocked: boolean;
}

export default function FirstLoginDialog({ userId, isAppUnlocked }: FirstLoginDialogProps) {
  const dialog = useDialog();
  const router = useRouter();
  const hasShownDialog = useRef(false);
  const isChecking = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dialogRef = useRef(dialog);
  const routerRef = useRef(router);

  // Keep refs updated
  useEffect(() => {
    dialogRef.current = dialog;
    routerRef.current = router;
  }, [dialog, router]);

  useEffect(() => {
    const checkAndShowDialog = async () => {
      // Only check if user is logged in, app is unlocked, and we haven't shown it yet
      if (!userId || !isAppUnlocked || hasShownDialog.current || isChecking.current) {
        return;
      }

      isChecking.current = true;

      try {
        // Check if we've already shown this dialog
        const hasShown = await AsyncStorage.getItem(`${FIRST_LOGIN_DIALOG_KEY}_${userId}`);
        if (hasShown === 'true') {
          console.log('[FirstLoginDialog] Dialog already shown for this user');
          isChecking.current = false;
          return;
        }

        // Check if user has any accounts
        const accounts = await getAccounts();
        console.log('[FirstLoginDialog] User has', accounts.length, 'account(s)');

        // If no accounts, show the dialog
        if (accounts.length === 0) {
          console.log('[FirstLoginDialog] No accounts found, showing connect bank dialog');
          hasShownDialog.current = true;

          // Don't await the dialog - let it resolve in the background
          // This prevents blocking the UI thread
          dialogRef.current.showDialog(
            'Connect Your First Bank',
            'Get started by connecting your bank account to track your finances and transactions.',
            [
              {
                text: 'Maybe Later',
                style: 'cancel',
                onPress: async () => {
                  // Mark as shown so we don't show it again
                  await AsyncStorage.setItem(`${FIRST_LOGIN_DIALOG_KEY}_${userId}`, 'true');
                },
              },
              {
                text: 'Connect Bank',
                onPress: async () => {
                  // Mark as shown
                  await AsyncStorage.setItem(`${FIRST_LOGIN_DIALOG_KEY}_${userId}`, 'true');
                  // Navigate to connect bank screen
                  routerRef.current.push('/(tabs)/finance/connect-bank');
                },
              },
            ]
          ).catch((error) => {
            console.error('[FirstLoginDialog] Error showing dialog:', error);
            // Reset flag on error so it can be retried
            hasShownDialog.current = false;
          });
        } else {
          // User has accounts, mark as shown so we don't check again
          await AsyncStorage.setItem(`${FIRST_LOGIN_DIALOG_KEY}_${userId}`, 'true');
        }
      } catch (error) {
        console.error('[FirstLoginDialog] Error checking accounts:', error);
        // Don't show dialog if there's an error
      } finally {
        isChecking.current = false;
      }
    };

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Longer delay to ensure app is fully loaded and UI is responsive
    timeoutRef.current = setTimeout(() => {
      checkAndShowDialog();
    }, 2000);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [userId, isAppUnlocked]);

  return null; // This component doesn't render anything
}




