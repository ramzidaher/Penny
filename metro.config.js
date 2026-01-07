// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Ensure watchFolders includes the project root
config.watchFolders = [path.resolve(__dirname)];

// Fix for URL-encoded asset paths in development builds
// Use enhanceMiddleware to decode URL-encoded asset paths before Metro processes them
if (config.server) {
  const originalEnhanceMiddleware = config.server.enhanceMiddleware;
  config.server.enhanceMiddleware = (middleware) => {
    return (req, res, next) => {
      // Decode URL-encoded paths in asset requests (e.g., .%2Fassets -> ./assets)
      if (req.url) {
        try {
          // Check if URL contains encoded characters
          if (req.url.includes('%')) {
            // Decode the URL
            const decodedUrl = decodeURIComponent(req.url);
            // Only update if it actually changed and contains assets
            if (decodedUrl !== req.url && decodedUrl.includes('assets')) {
              req.url = decodedUrl;
            }
          }
        } catch (e) {
          // If decoding fails, continue with original URL
          console.warn('Failed to decode URL:', req.url, e);
        }
      }
      return middleware(req, res, next);
    };
  };
}

module.exports = config;

