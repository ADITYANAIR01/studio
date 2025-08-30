import CryptoJS from 'crypto-js';

// Encrypts a string using AES and a master password
export function encryptCredential(plainText: string, masterPassword: string): string {
  return CryptoJS.AES.encrypt(plainText, masterPassword).toString();
}

// Decrypts a string using AES and a master password
export function decryptCredential(cipherText: string, masterPassword: string): string {
  const bytes = CryptoJS.AES.decrypt(cipherText, masterPassword);
  return bytes.toString(CryptoJS.enc.Utf8);
}

// Utility functions for base64 encoding/decoding
/**
 * Secure cryptographic utilities for zero-knowledge password manager
 * Implements PBKDF2 key derivation and AES-GCM encryption
 */

// Types for cryptographic operations
export interface DerivedKey {
  key: CryptoKey;
  salt: Uint8Array;
}

export interface EncryptedData {
  data: string; // Base64 encoded encrypted data
  iv: string;   // Base64 encoded initialization vector
  salt?: string; // Base64 encoded salt (for key derivation)
}

export interface VaultKey {
  masterKey: CryptoKey;
  salt: Uint8Array;
  timestamp: number;
}

/**
 * Derive encryption key from master password using PBKDF2
 */
export async function deriveKeyFromPassword(
  password: string, 
  salt?: Uint8Array,
  iterations: number = 100000
): Promise<DerivedKey> {
  // Generate salt if not provided
  const keySalt = salt || crypto.getRandomValues(new Uint8Array(32));
  
  // Import password as key material
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Derive AES-GCM key
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: keySalt as BufferSource,
      iterations: iterations,
      hash: 'SHA-256'
    },
    passwordKey,
    {
      name: 'AES-GCM',
      length: 256
    },
    false, // Not extractable for security
    ['encrypt', 'decrypt']
  );

  return {
    key: derivedKey,
    salt: keySalt
  };
}

/**
 * Encrypt data using AES-GCM
 */
export async function encryptData(
  data: string, 
  key: CryptoKey
): Promise<EncryptedData> {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
  const encodedData = new TextEncoder().encode(data);

  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    key,
    encodedData
  );

  return {
    data: arrayBufferToBase64(encryptedBuffer),
    iv: arrayBufferToBase64(iv.buffer)
  };
}

/**
 * Decrypt data using AES-GCM
 */
export async function decryptData(
  encryptedData: EncryptedData, 
  key: CryptoKey
): Promise<string> {
  try {
    const iv = base64ToArrayBuffer(encryptedData.iv);
    const data = base64ToArrayBuffer(encryptedData.data);

    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      data
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch (error) {
    throw new Error('Decryption failed - invalid key or corrupted data');
  }
}

/**
 * Generate a random encryption key for individual items
 */
export async function generateItemKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256
    },
    false, // Not extractable
    ['encrypt', 'decrypt']
  );
}

/**
 * Export key for storage (encrypted with master key)
 */
export async function exportKey(key: CryptoKey): Promise<ArrayBuffer> {
  return await crypto.subtle.exportKey('raw', key);
}

/**
 * Import key from storage
 */
export async function importKey(keyData: ArrayBuffer): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    keyData,
    {
      name: 'AES-GCM',
      length: 256
    },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Secure memory management for vault keys
 */
export class SecureVaultManager {
  private static instance: SecureVaultManager;
  private vaultKey: VaultKey | null = null;
  private lockTimeout: NodeJS.Timeout | null = null;
  private readonly AUTO_LOCK_TIME = 15 * 60 * 1000; // 15 minutes

  static getInstance(): SecureVaultManager {
    if (!SecureVaultManager.instance) {
      SecureVaultManager.instance = new SecureVaultManager();
    }
    return SecureVaultManager.instance;
  }

  async unlockVault(masterPassword: string, salt?: Uint8Array): Promise<boolean> {
    try {
      const derived = await deriveKeyFromPassword(masterPassword, salt);
      
      this.vaultKey = {
        masterKey: derived.key,
        salt: derived.salt,
        timestamp: Date.now()
      };

      this.resetLockTimer();
      return true;
    } catch (error) {
      console.error('Failed to unlock vault:', error);
      return false;
    }
  }

  lockVault(): void {
    if (this.vaultKey) {
      // Clear sensitive data from memory
      this.vaultKey = null;
    }
    
    if (this.lockTimeout) {
      clearTimeout(this.lockTimeout);
      this.lockTimeout = null;
    }
  }

  isUnlocked(): boolean {
    return this.vaultKey !== null;
  }

  getVaultKey(): VaultKey | null {
    if (!this.vaultKey) return null;
    
    // Reset timer on access
    this.resetLockTimer();
    return this.vaultKey;
  }

  private resetLockTimer(): void {
    if (this.lockTimeout) {
      clearTimeout(this.lockTimeout);
    }
    
    this.lockTimeout = setTimeout(() => {
      this.lockVault();
      // Dispatch event for UI updates
      window.dispatchEvent(new CustomEvent('vault-locked'));
    }, this.AUTO_LOCK_TIME);
  }

  // For biometric unlock (future implementation)
  async setupBiometricUnlock(): Promise<boolean> {
    // Placeholder for WebAuthn/biometric implementation
    return false;
  }
}

/**
 * Utility functions for base64 encoding/decoding
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Generate cryptographically secure random password
 */
export function generateSecurePassword(length: number = 16): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  
  return Array.from(array, byte => charset[byte % charset.length]).join('');
}

/**
 * Enhanced password strength calculation
 */
export function calculatePasswordStrength(password: string): {
  score: number;
  strength: 'Very Weak' | 'Weak' | 'Fair' | 'Good' | 'Strong';
  feedback: string[];
} {
  let score = 0;
  const feedback: string[] = [];

  // Length check
  if (password.length >= 12) score += 2;
  else if (password.length >= 8) score += 1;
  else feedback.push('Use at least 8 characters');

  // Character variety
  if (/[a-z]/.test(password)) score += 1;
  else feedback.push('Include lowercase letters');

  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push('Include uppercase letters');

  if (/\d/.test(password)) score += 1;
  else feedback.push('Include numbers');

  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  else feedback.push('Include special characters');

  // Bonus points
  if (password.length >= 16) score += 1;
  if (/[^A-Za-z0-9\s]/.test(password)) score += 1;

  let strength: 'Very Weak' | 'Weak' | 'Fair' | 'Good' | 'Strong';
  if (score >= 7) strength = 'Strong';
  else if (score >= 5) strength = 'Good';
  else if (score >= 3) strength = 'Fair';
  else if (score >= 1) strength = 'Weak';
  else strength = 'Very Weak';

  return { score, strength, feedback };
}

/**
 * Secure clipboard operations with auto-clear
 */
export class SecureClipboard {
  private static clearTimeouts = new Set<NodeJS.Timeout>();

  static async copy(text: string, clearAfterMs: number = 30000): Promise<void> {
    try {
      // Check if clipboard API is available
      if (!navigator.clipboard || !navigator.clipboard.writeText) {
        console.warn('Clipboard API not available');
        throw new Error('Clipboard API not supported');
      }

      // Check if document is focused
      if (!document.hasFocus()) {
        console.warn('Document not focused, attempting to focus');
        window.focus();
        // Give a small delay for focus to take effect
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      await navigator.clipboard.writeText(text);
      
      // Schedule automatic clearing
      const timeout = setTimeout(async () => {
        try {
          if (navigator.clipboard && navigator.clipboard.readText) {
            const current = await navigator.clipboard.readText();
            if (current === text) {
              await navigator.clipboard.writeText(' ');
            }
          }
        } catch (error) {
          // Ignore errors in clearing
        } finally {
          SecureClipboard.clearTimeouts.delete(timeout);
        }
      }, clearAfterMs);

      SecureClipboard.clearTimeouts.add(timeout);
    } catch (error) {
      console.warn('Failed to copy to clipboard:', error);
      // Fallback to execCommand for older browsers or when clipboard API fails
      try {
        await SecureClipboard.fallbackCopy(text);
      } catch (fallbackError) {
        console.error('All clipboard methods failed:', fallbackError);
        throw new Error('Unable to copy to clipboard. Please ensure the page is focused and try again.');
      }
    }
  }

  /**
   * Fallback clipboard copy using execCommand (deprecated but more reliable in some cases)
   */
  private static async fallbackCopy(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      
      try {
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        if (successful) {
          resolve();
        } else {
          reject(new Error('execCommand copy failed'));
        }
      } catch (error) {
        reject(error);
      } finally {
        document.body.removeChild(textArea);
      }
    });
  }

  static clearAll(): void {
    SecureClipboard.clearTimeouts.forEach(timeout => clearTimeout(timeout));
    SecureClipboard.clearTimeouts.clear();
    
    // Immediate clear
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(' ').catch(() => {
        // Ignore errors
      });
    }
  }
}

/**
 * Encrypt and store the master password securely
 */
export async function encryptAndStoreMasterPassword(password: string): Promise<EncryptedData> {
  const { key, salt } = await deriveKeyFromPassword(password);
  const encryptedPassword = await encryptData(password, key);
  encryptedPassword.salt = arrayBufferToBase64(salt.buffer as ArrayBuffer);

  // Store encrypted password securely (e.g., in local storage or a file)
  localStorage.setItem('masterPassword', JSON.stringify(encryptedPassword));

  return encryptedPassword;
}

/**
 * Validate the master password by decrypting and comparing
 */
export async function validateMasterPassword(inputPassword: string): Promise<boolean> {
  const storedData = localStorage.getItem('masterPassword');
  if (!storedData) {
    throw new Error('Master password not set');
  }

  const encryptedData: EncryptedData = JSON.parse(storedData);
  const salt = base64ToArrayBuffer(encryptedData.salt!);
  const { key } = await deriveKeyFromPassword(inputPassword, new Uint8Array(salt));

  try {
    const decryptedPassword = await decryptData(encryptedData, key);
    return decryptedPassword === inputPassword;
  } catch {
    return false;
  }
}

/**
 * Check if this is the first login (master password setup required)
 */
export function isFirstLogin(): boolean {
  return !localStorage.getItem('masterPassword');
}
