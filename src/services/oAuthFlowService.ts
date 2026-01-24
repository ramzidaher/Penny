/**
 * Service to track TrueLayer OAuth flow state
 * This prevents lock screen from interfering with OAuth callbacks
 * Also tracks navigation transitions after OAuth to prevent router state errors
 */

let oAuthFlowActive = false;
let navigationTransitionActive = false;
let navigationTransitionTimer: NodeJS.Timeout | null = null;

/**
 * Set OAuth flow as active (when user starts OAuth or receives callback)
 */
export const setOAuthFlowActive = (active: boolean): void => {
  const wasActive = oAuthFlowActive;
  oAuthFlowActive = active;
  console.log('[oAuthFlowService] OAuth flow active:', active);
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'oAuthFlowService.ts:14',message:'setOAuthFlowActive called',data:{wasActive,active,willStartTransition:wasActive&&!active},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  // When OAuth becomes inactive, start navigation transition period
  if (wasActive && !active) {
    // OAuth just completed - mark navigation transition as active
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'oAuthFlowService.ts:22',message:'Starting navigation transition',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    setNavigationTransitionActive(true);
  }
};

/**
 * Set navigation transition as active (after OAuth completes, during router state update)
 */
export const setNavigationTransitionActive = (active: boolean): void => {
  navigationTransitionActive = active;
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'oAuthFlowService.ts:29',message:'setNavigationTransitionActive called',data:{active,currentState:navigationTransitionActive},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  if (active) {
    // Clear any existing timer
    if (navigationTransitionTimer) {
      clearTimeout(navigationTransitionTimer);
    }
    
    // Navigation transition lasts 2000ms after OAuth completes
    // This gives router time to fully update its internal state
    // Increased from 800ms because router state.routes can still be undefined
    // even after 1500ms (800ms transition + 600ms delay + 100ms check)
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'oAuthFlowService.ts:40',message:'Setting transition timer',data:{delay:2000},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    navigationTransitionTimer = setTimeout(() => {
      navigationTransitionActive = false;
      navigationTransitionTimer = null;
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'oAuthFlowService.ts:43',message:'Navigation transition completed',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
    }, 2000);
  } else {
    // Clear timer if manually deactivated
    if (navigationTransitionTimer) {
      clearTimeout(navigationTransitionTimer);
      navigationTransitionTimer = null;
    }
  }
};

/**
 * Check if OAuth flow is currently active
 */
export const getOAuthFlowActive = (): boolean => {
  return oAuthFlowActive;
};

/**
 * Check if navigation transition is active (router state is updating)
 */
export const isNavigationTransitionActive = (): boolean => {
  return navigationTransitionActive;
};

/**
 * Check if we should block rendering (OAuth active OR navigation transitioning)
 */
export const shouldBlockRendering = (): boolean => {
  const result = oAuthFlowActive || navigationTransitionActive;
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'oAuthFlowService.ts:70',message:'shouldBlockRendering check',data:{oAuthFlowActive,navigationTransitionActive,result},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  return result;
};

