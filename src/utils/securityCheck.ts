/**
 * Security Validation Utilities
 * 
 * Checks for exposed secrets and security misconfigurations
 * Only runs in development mode
 */

const SENSITIVE_PATTERNS = [
  /client[_-]?secret/i,
  /api[_-]?key/i,
  /private[_-]?key/i,
  /password/i,
  /token/i,
];

const checkForExposedSecrets = (): void => {
  if (__DEV__) {
    const clientSecret = process.env.EXPO_PUBLIC_TRUELAYER_CLIENT_SECRET;
    if (clientSecret && clientSecret.length > 0) {
      console.warn(
        '[SecurityCheck] WARNING: TrueLayer client secret detected in client code. ' +
        'Client secrets should NEVER be in client code. Move to backend service.'
      );
    }

    const openAiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
    if (openAiKey && openAiKey.startsWith('sk-')) {
      console.warn(
        '[SecurityCheck] WARNING: OpenAI API key detected in client code. ' +
        'Consider using a backend proxy for API calls.'
      );
    }
  }
};

export const runSecurityChecks = (): void => {
  if (__DEV__) {
    checkForExposedSecrets();
  }
};

