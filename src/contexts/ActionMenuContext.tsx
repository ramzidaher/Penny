import React, { createContext, useContext, useState, ReactNode, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'expo-router';
import ActionMenu from '../components/ActionMenu';

interface ActionMenuContextType {
  showMenu: () => void;
  hideMenu: () => void;
  setPreviousRoute: (route: string) => void;
  getPreviousRoute: () => string | null;
}

const ActionMenuContext = createContext<ActionMenuContextType | undefined>(undefined);

export function ActionMenuProvider({ children }: { children: ReactNode }) {
  const [menuVisible, setMenuVisible] = useState(false);
  const previousRouteRef = useRef<string | null>('/(tabs)'); // Initialize to home
  const pathname = usePathname();
  const router = useRouter();

  // Track route changes - store the route BEFORE navigating to add
  useEffect(() => {
    // If modal is open and user navigates away from add (to a different tab), close the modal
    if (menuVisible && pathname && !pathname.includes('/add')) {
      setMenuVisible(false);
    }
    
    // Only store if it's not the add route - this preserves the route before navigating to add
    if (pathname && !pathname.includes('/add')) {
      // Store the current route as previous (for when we navigate back from add)
      previousRouteRef.current = pathname;
    }
  }, [pathname, menuVisible]);

  const showMenu = () => {
    setMenuVisible(true);
  };

  const hideMenu = () => {
    setMenuVisible(false);
    // If we're on the add route, navigate to the previous route when modal closes
    if (pathname?.includes('/add')) {
      const previousRoute = previousRouteRef.current || '/(tabs)';
      // Small delay to ensure modal closes smoothly
      setTimeout(() => {
        // Use replace to go to the exact previous route, not just back
        router.replace(previousRoute as any);
      }, 50);
    }
  };

  const setPreviousRoute = (route: string) => {
    // Only store if it's not the add route
    if (!route.includes('/add')) {
      previousRouteRef.current = route;
    }
  };

  const getPreviousRoute = () => {
    return previousRouteRef.current;
  };

  return (
    <ActionMenuContext.Provider value={{ showMenu, hideMenu, setPreviousRoute, getPreviousRoute }}>
      {children}
      {/* Only render modal in context if NOT on add route (add route renders it directly) */}
      {!pathname?.includes('/add') && (
        <ActionMenu visible={menuVisible} onClose={hideMenu} />
      )}
    </ActionMenuContext.Provider>
  );
}

export function useActionMenu() {
  const context = useContext(ActionMenuContext);
  if (context === undefined) {
    throw new Error('useActionMenu must be used within an ActionMenuProvider');
  }
  return context;
}

