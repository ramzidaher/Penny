import { useEffect, useRef } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getCurrentUser } from '../src/services/firebase';

/**
 * Catch-all route handler for unmatched routes
 * This prevents "Unmatched Route" errors from showing to users
 * IMPORTANT: This redirects immediately without showing any UI
 */
export default function NotFound() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const hasRedirected = useRef(false);

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'+not-found.tsx:effect',message:'NotFound mounted',data:{hasParamsCode:!!params.code,hasParamsError:!!params.error},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'G'})}).catch(()=>{});
    // #endregion
    // Prevent multiple redirects
    if (hasRedirected.current) return;
    hasRedirected.current = true;
    
    // Generic redirect for unmatched routes.
    const redirect = async () => {
      const user = getCurrentUser();
      
      // Redirect immediately - no delay
      if (user) {
        // User is logged in, redirect to tabs
        router.replace('/(tabs)' as any);
      } else {
        // User not logged in, redirect to login
        router.replace('/(auth)/login' as any);
      }
    };

    // Run immediately - don't wait
    redirect();
  }, [router, params]);

  // Return null IMMEDIATELY to prevent any UI from showing
  // The redirect happens in useEffect above
  return null;
}

