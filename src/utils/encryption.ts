/**
 * Encryption and Hashing Utilities
 * 
 * Provides utilities for GDPR-compliant data handling:
 * - Description hashing (SHA-256) for transaction matching
 * - Field encryption (AES) for sensitive data (future-ready)
 * 
 * Security:
 * - Uses Web Crypto API for hashing
 * - One-way hashing for descriptions (cannot be reversed)
 * - Encryption keys stored in environment variables
 */

import * as Crypto from 'expo-crypto';

/**
 * Hash a description string using SHA-256
 * Used for GDPR-compliant transaction matching without storing raw descriptions
 * 
 * @param description - The raw transaction description to hash
 * @returns SHA-256 hash as hexadecimal string
 */
export const hashDescription = async (description: string): Promise<string> => {
  if (!description || description.trim() === '') {
    return '';
  }
  
  try {
    // Use expo-crypto for consistent hashing across platforms
    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      description.trim().toLowerCase()
    );
    return hash;
  } catch (error) {
    console.error('[encryption] Error hashing description:', error);
    // Return empty string on error to avoid breaking transaction storage
    return '';
  }
};

/**
 * Synchronous version of hashDescription (for cases where async is not possible)
 * Uses a simpler hash function - less secure but faster
 * 
 * @param description - The raw transaction description to hash
 * @returns Simple hash as string
 */
export const hashDescriptionSync = (description: string): string => {
  if (!description || description.trim() === '') {
    return '';
  }
  
  // Simple hash function for synchronous use
  // This is less secure than SHA-256 but acceptable for transaction matching
  let hash = 0;
  const str = description.trim().toLowerCase();
  
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return Math.abs(hash).toString(16);
};

/**
 * Encrypt a field value using AES encryption
 * Currently stubbed for future implementation
 * 
 * @param value - The value to encrypt
 * @returns Encrypted value (currently returns original value)
 */
export const encryptField = async (value: string): Promise<string> => {
  // TODO: Implement AES encryption when needed
  // For now, return original value (encryption can be enabled later)
  return value;
};

/**
 * Decrypt a field value using AES decryption
 * Currently stubbed for future implementation
 * 
 * @param encrypted - The encrypted value to decrypt
 * @returns Decrypted value (currently returns original value)
 */
export const decryptField = async (encrypted: string): Promise<string> => {
  // TODO: Implement AES decryption when needed
  // For now, return original value (decryption can be enabled later)
  return encrypted;
};


