/**
 * Service to track TrueLayer OAuth flow state
 * This prevents lock screen from interfering with OAuth callbacks
 */

let oAuthFlowActive = false;

/**
 * Set OAuth flow as active (when user starts OAuth or receives callback)
 */
export const setOAuthFlowActive = (active: boolean): void => {
  oAuthFlowActive = active;
  console.log('[oAuthFlowService] OAuth flow active:', active);
};

/**
 * Check if OAuth flow is currently active
 */
export const getOAuthFlowActive = (): boolean => {
  return oAuthFlowActive;
};

