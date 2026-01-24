import { Redirect } from 'expo-router';
import { getCurrentUser } from '../src/services/firebase';
import { useEffect, useState } from 'react';

/**
 * Root index page - required for Android to prevent "Unmatched Route" errors
 * This handles the root route (/) and redirects based on auth state
 * Also checks for TrueLayer callback URLs immediately to prevent route errors
 */
export default function Index() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'index.tsx:mount',message:'Index mounted',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'H'})}).catch(()=>{});
    // #endregion
    // Get current user to determine redirect
    const checkUser = () => {
      const currentUser = getCurrentUser();
      setUser(currentUser);
      setLoading(false);
    };

    checkUser();
  }, []);

  // Show nothing while loading - _layout.tsx will handle navigation
  if (loading) {
    return null;
  }

  // Redirect based on auth state
  // Note: The actual navigation is handled in _layout.tsx navigation effect
  // This is just to satisfy Android's requirement for an index route
  if (user) {
    return <Redirect href="/(tabs)" />;
  } else {
    return <Redirect href="/(auth)/login" />;
  }
}

