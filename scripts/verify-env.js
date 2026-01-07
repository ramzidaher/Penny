#!/usr/bin/env node

/**
 * Verification script to check if environment variables are loaded correctly
 * Run with: node scripts/verify-env.js
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');

console.log('🔍 Verifying .env file configuration...\n');

// Check if .env file exists
if (!fs.existsSync(envPath)) {
  console.error('❌ .env file not found at:', envPath);
  process.exit(1);
}

console.log('✅ .env file exists');

// Read and parse .env file
const envContent = fs.readFileSync(envPath, 'utf8');
const envLines = envContent.split('\n').filter(line => {
  const trimmed = line.trim();
  return trimmed && !trimmed.startsWith('#') && trimmed.includes('=');
});

console.log(`✅ Found ${envLines.length} environment variables\n`);

// Required variables for the app
const requiredVars = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
  'EXPO_PUBLIC_OPENAI_API_KEY',
];

const optionalVars = [
  'EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID',
  'EXPO_PUBLIC_LOGO_DEV_KEY',
];

console.log('📋 Checking required variables:');
let allPresent = true;

requiredVars.forEach(varName => {
  const found = envLines.some(line => line.trim().startsWith(varName + '='));
  if (found) {
    console.log(`  ✅ ${varName}`);
  } else {
    console.log(`  ❌ ${varName} - MISSING`);
    allPresent = false;
  }
});

console.log('\n📋 Checking optional variables:');
optionalVars.forEach(varName => {
  const found = envLines.some(line => line.trim().startsWith(varName + '='));
  if (found) {
    console.log(`  ✅ ${varName}`);
  } else {
    console.log(`  ⚠️  ${varName} - Optional (not required)`);
  }
});

// Check for EXPO_PUBLIC_ prefix
console.log('\n🔐 Checking variable naming:');
const invalidVars = envLines.filter(line => {
  const varName = line.split('=')[0].trim();
  return varName && !varName.startsWith('EXPO_PUBLIC_') && !varName.startsWith('#');
});

if (invalidVars.length > 0) {
  console.log('  ⚠️  Found variables without EXPO_PUBLIC_ prefix:');
  invalidVars.forEach(line => {
    const varName = line.split('=')[0].trim();
    console.log(`     - ${varName} (will not be accessible in app)`);
  });
  console.log('  💡 Tip: Only variables with EXPO_PUBLIC_ prefix are accessible in Expo apps');
} else {
  console.log('  ✅ All variables use EXPO_PUBLIC_ prefix');
}

// Summary
console.log('\n' + '='.repeat(50));
if (allPresent) {
  console.log('✅ All required environment variables are present!');
  console.log('\n💡 Next steps:');
  console.log('   1. Restart Expo server: npx expo start --clear');
  console.log('   2. Verify variables are loaded in your app');
  process.exit(0);
} else {
  console.log('❌ Some required environment variables are missing!');
  console.log('\n💡 Please add the missing variables to your .env file');
  process.exit(1);
}



