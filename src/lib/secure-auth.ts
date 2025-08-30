/**
 * Secure Authentication System
 * Implements hybrid zero-knowledge architecture for universal device access
 * Balances security with usability for multi-device scenarios
 */

import { cryptoManager } from './crypto-advanced';
import { appConfig } from './config';

// Types for secure authentication
export interface SecureAuthData {
  // Stored on server (Firestore) - for authentication only
  userEmail: string;
  authHash: string; // Hash of master password - used only for auth, NOT encryption
  authSalt: string; // Salt for auth hash
  encryptionSalt: string; // Different salt for encryption key derivation
  accountCreated: number;
  lastLogin: number;
  deviceTrust: {
    trustedDevices: string[]; // Device fingerprints
    requiresVerification: boolean;
  };
}

export interface DerivedKeys {
  authKey: string; // For server authentication
  encryptionKey: CryptoKey; // For local data encryption (NEVER stored)
}

export interface DeviceInfo {
  fingerprint: string;
  isTrusted: boolean;
  lastSeen: number;
  userAgent: string;
}

/**
 * Secure Authentication Manager
 * Implements zero-knowledge encryption with universal device access
 */
export class SecureAuthManager {
  private static instance: SecureAuthManager;
  private currentEncryptionKey: CryptoKey | null = null;
  private deviceFingerprint: string | null = null;

  static getInstance(): SecureAuthManager {
    if (!SecureAuthManager.instance) {
      SecureAuthManager.instance = new SecureAuthManager();
    }
    return SecureAuthManager.instance;
  }

  /**
   * Generate device fingerprint (non-invasive)
   */
  private async generateDeviceFingerprint(): Promise<string> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillText('Device fingerprint', 2, 2);
    }
    
    const fingerprint = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      screen: `${screen.width}x${screen.height}x${screen.colorDepth}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      canvas: canvas.toDataURL()
    };

    const fingerprintString = JSON.stringify(fingerprint);
    const encoder = new TextEncoder();
    const data = encoder.encode(fingerprintString);
    const hash = await crypto.subtle.digest('SHA-256', data);
    
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 16); // Use first 16 chars
  }

  /**
   * Derive authentication and encryption keys from master password
   */
  private async deriveKeys(masterPassword: string, authSalt: string, encryptionSalt: string): Promise<DerivedKeys> {
    const encoder = new TextEncoder();
    
    // 1. Derive authentication key (for server verification)
    const authSaltBytes = new Uint8Array(Buffer.from(authSalt, 'base64'));
    const authKeyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(masterPassword),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    
    const authKeyBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: authSaltBytes,
        iterations: 100000, // Different iteration count for auth
        hash: 'SHA-256'
      },
      authKeyMaterial,
      256
    );
    
    const authKey = Array.from(new Uint8Array(authKeyBits))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // 2. Derive encryption key (for data encryption - NEVER stored)
    const encryptionSaltBytes = new Uint8Array(Buffer.from(encryptionSalt, 'base64'));
    const encryptionKeyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(masterPassword + '::encryption'), // Different input for encryption
      'PBKDF2',
      false,
      ['deriveKey']
    );
    
    const encryptionKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encryptionSaltBytes,
        iterations: 210000, // Higher iterations for encryption key
        hash: 'SHA-256'
      },
      encryptionKeyMaterial,
      {
        name: 'AES-GCM',
        length: 256
      },
      false, // Not extractable - stays in memory only
      ['encrypt', 'decrypt']
    );

    return {
      authKey,
      encryptionKey
    };
  }

  /**
   * Register new user account with hybrid security
   */
  async registerUser(email: string, masterPassword: string): Promise<SecureAuthData> {
    // Generate salts
    const authSalt = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
    const encryptionSalt = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
    
    // Derive keys
    const keys = await this.deriveKeys(masterPassword, authSalt, encryptionSalt);
    
    // Generate device fingerprint
    this.deviceFingerprint = await this.generateDeviceFingerprint();
    
    const authData: SecureAuthData = {
      userEmail: email,
      authHash: keys.authKey, // Only auth hash stored on server
      authSalt,
      encryptionSalt,
      accountCreated: Date.now(),
      lastLogin: Date.now(),
      deviceTrust: {
        trustedDevices: [this.deviceFingerprint],
        requiresVerification: false
      }
    };

    // Store encryption key in memory
    this.currentEncryptionKey = keys.encryptionKey;
    
    return authData;
  }

  /**
   * Authenticate user from any device
   */
  async authenticateUser(
    email: string, 
    masterPassword: string, 
    storedAuthData: SecureAuthData
  ): Promise<{ success: boolean; encryptionKey?: CryptoKey; deviceInfo?: DeviceInfo }> {
    try {
      // Derive keys using stored salts
      const keys = await this.deriveKeys(
        masterPassword, 
        storedAuthData.authSalt, 
        storedAuthData.encryptionSalt
      );
      
      // Verify authentication hash
      if (keys.authKey !== storedAuthData.authHash) {
        return { success: false };
      }
      
      // Generate current device fingerprint
      this.deviceFingerprint = await this.generateDeviceFingerprint();
      
      const deviceInfo: DeviceInfo = {
        fingerprint: this.deviceFingerprint,
        isTrusted: storedAuthData.deviceTrust.trustedDevices.includes(this.deviceFingerprint),
        lastSeen: Date.now(),
        userAgent: navigator.userAgent
      };
      
      // Store encryption key in memory
      this.currentEncryptionKey = keys.encryptionKey;
      
      return {
        success: true,
        encryptionKey: keys.encryptionKey,
        deviceInfo
      };
      
    } catch (error) {
      console.error('[SecureAuth] Authentication failed:', error);
      return { success: false };
    }
  }

  /**
   * Get current encryption key (if authenticated)
   */
  getCurrentEncryptionKey(): CryptoKey | null {
    return this.currentEncryptionKey;
  }

  /**
   * Check if device is trusted
   */
  isDeviceTrusted(authData: SecureAuthData): boolean {
    return this.deviceFingerprint ? 
      authData.deviceTrust.trustedDevices.includes(this.deviceFingerprint) : 
      false;
  }

  /**
   * Add current device to trusted devices
   */
  async trustCurrentDevice(authData: SecureAuthData): Promise<SecureAuthData> {
    if (!this.deviceFingerprint) {
      this.deviceFingerprint = await this.generateDeviceFingerprint();
    }
    
    if (!authData.deviceTrust.trustedDevices.includes(this.deviceFingerprint)) {
      authData.deviceTrust.trustedDevices.push(this.deviceFingerprint);
    }
    
    return authData;
  }

  /**
   * Clear authentication state (logout)
   */
  clearAuthState(): void {
    this.currentEncryptionKey = null;
    // Note: Device fingerprint can stay for convenience
  }

  /**
   * Encrypt data using current encryption key
   */
  async encryptData(data: string): Promise<string> {
    if (!this.currentEncryptionKey) {
      throw new Error('No encryption key available. Please authenticate first.');
    }
    
    const payload = await cryptoManager.encryptDataWithKey(data, this.currentEncryptionKey);
    return JSON.stringify(payload);
  }

  /**
   * Decrypt data using current encryption key
   */
  async decryptData(encryptedData: string): Promise<string> {
    if (!this.currentEncryptionKey) {
      throw new Error('No encryption key available. Please authenticate first.');
    }
    
    const payload = JSON.parse(encryptedData);
    return await cryptoManager.decryptDataWithKey(payload, this.currentEncryptionKey);
  }

  /**
   * Generate secure backup recovery key
   */
  async generateRecoveryKey(): Promise<string> {
    const recoveryBytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(recoveryBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .match(/.{1,4}/g)!
      .join('-')
      .toUpperCase();
  }
}

// Export singleton
export const secureAuthManager = SecureAuthManager.getInstance();

// Development helper functions
if (appConfig.environment === 'development' && typeof window !== 'undefined') {
  if (window.location.hostname === 'localhost') {
    Object.defineProperty(window, 'debugSecureAuth', {
      value: () => {
        console.log('[Dev] Current encryption key:', !!secureAuthManager.getCurrentEncryptionKey());
        console.log('[Dev] Device fingerprint generated');
      },
      configurable: true,
      writable: false
    });
  }
}
