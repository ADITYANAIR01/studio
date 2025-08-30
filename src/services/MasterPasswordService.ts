/**
 * Master Password Management Service
 * Handles immutable master passwords tied to Firebase user accounts
 */

import { User } from 'firebase/auth'
import { deriveKeyFromPassword, SecureVaultManager, calculatePasswordStrength } from '@/lib/crypto'
import { firebaseAuth } from '@/lib/firebase'
// Update the import path if the file is located elsewhere, for example:
import { secureStorageCompat } from '../lib/secure-storage'
// Or, if the file does not exist, create 'secure-storage.ts' in the correct directory with the required export.
import { appConfig } from '@/lib/config'

// Types for master password management
export interface MasterPasswordSetupResult {
  success: boolean
  error?: string
  requiresSetup?: boolean
}

export interface MasterPasswordStatus {
  isSet: boolean
  userEmail: string | null
  setupDate?: string
  lastUsed?: string
}

export interface UserMasterPasswordData {
  userUid: string
  userEmail: string
  saltBase64: string
  setupTimestamp: number
  lastUsedTimestamp: number
  isImmutable: true // This ensures it cannot be changed
}

/**
 * Master Password Service
 * Manages one-time master password setup per Firebase user
 */
export class MasterPasswordService {
  private static instance: MasterPasswordService
  private vaultManager: SecureVaultManager
  private currentUser: User | null = null
  private masterPasswordData: UserMasterPasswordData | null = null

  static getInstance(): MasterPasswordService {
    if (!MasterPasswordService.instance) {
      MasterPasswordService.instance = new MasterPasswordService()
    }
    return MasterPasswordService.instance
  }

  constructor() {
    this.vaultManager = SecureVaultManager.getInstance()
    
    // Listen for authentication state changes
    firebaseAuth.addAuthStateListener(async (user) => {
      this.currentUser = user
      if (user) {
        await this.loadUserMasterPasswordData(user.uid)
      } else {
        this.clearUserMasterPasswordData()
      }
    })
  }

  /**
   * Check if current user has master password set
   */
  isMasterPasswordSet(): boolean {
    if (!this.currentUser) return false
    return this.masterPasswordData !== null
  }

  /**
   * Get master password status for current user
   */
  getMasterPasswordStatus(): MasterPasswordStatus {
    const user = this.currentUser
    return {
      isSet: this.isMasterPasswordSet(),
      userEmail: user?.email || null,
      setupDate: this.masterPasswordData?.setupTimestamp ? 
        new Date(this.masterPasswordData.setupTimestamp).toISOString() : undefined,
      lastUsed: this.masterPasswordData?.lastUsedTimestamp ? 
        new Date(this.masterPasswordData.lastUsedTimestamp).toISOString() : undefined
    }
  }

  /**
   * Setup master password for current user (one-time only)
   */
  async setupMasterPassword(password: string): Promise<MasterPasswordSetupResult> {
    const user = this.currentUser
    if (!user || !user.email) {
      return {
        success: false,
        error: 'User must be authenticated to setup master password'
      }
    }

    // Check if master password is already set
    if (this.isMasterPasswordSet()) {
      return {
        success: false,
        error: 'Master password is already set and cannot be changed'
      }
    }

    // Validate password strength
    const strength = calculatePasswordStrength(password)
    if (strength.score < 6) {
      return {
        success: false,
        error: `Password is too weak. ${strength.feedback.join(' ')}`
      }
    }

    try {
      // Generate salt and derive key to test password
      const salt = crypto.getRandomValues(new Uint8Array(32))
      const testResult = await this.vaultManager.unlockVault(password, salt)
      
      if (!testResult) {
        return {
          success: false,
          error: 'Failed to setup master password. Please try again.'
        }
      }

      // Store master password data (immutable)
      const masterPasswordData: UserMasterPasswordData = {
        userUid: user.uid,
        userEmail: user.email,
        saltBase64: btoa(String.fromCharCode(...salt)),
        setupTimestamp: Date.now(),
        lastUsedTimestamp: Date.now(),
        isImmutable: true
      }

      await this.saveMasterPasswordData(masterPasswordData)
      this.masterPasswordData = masterPasswordData

      return {
        success: true
      }
    } catch (error) {
      console.error('Master password setup error:', error)
      return {
        success: false,
        error: 'Failed to setup master password. Please try again.'
      }
    }
  }

  /**
   * Unlock vault with master password
   */
  async unlockVault(password: string): Promise<MasterPasswordSetupResult> {
    const user = this.currentUser
    if (!user) {
      return {
        success: false,
        error: 'User must be authenticated'
      }
    }

    if (!this.isMasterPasswordSet()) {
      return {
        success: false,
        requiresSetup: true,
        error: 'Master password must be set up first'
      }
    }

    try {
      // Get stored salt for this user
      const saltBytes = Uint8Array.from(
        atob(this.masterPasswordData!.saltBase64), 
        c => c.charCodeAt(0)
      )

      // Attempt to unlock vault
      const success = await this.vaultManager.unlockVault(password, saltBytes)
      
      if (success) {
        // Update last used timestamp
        this.masterPasswordData!.lastUsedTimestamp = Date.now()
        await this.saveMasterPasswordData(this.masterPasswordData!)
        
        return {
          success: true
        }
      } else {
        return {
          success: false,
          error: 'Invalid master password'
        }
      }
    } catch (error) {
      console.error('Vault unlock error:', error)
      return {
        success: false,
        error: 'Failed to unlock vault. Please try again.'
      }
    }
  }

  /**
   * Lock the vault
   */
  lockVault(): void {
    this.vaultManager.lockVault()
  }

  /**
   * Check if vault is currently unlocked
   */
  isVaultUnlocked(): boolean {
    return this.vaultManager.isUnlocked()
  }

  /**
   * Get vault manager instance
   */
  getVaultManager(): SecureVaultManager {
    return this.vaultManager
  }

  /**
   * Check if user needs to setup master password
   */
  requiresMasterPasswordSetup(): boolean {
    return this.currentUser !== null && !this.isMasterPasswordSet()
  }

  /**
   * Get user-specific storage key
   */
  private getUserStorageKey(userUid: string): string {
    return `citadel-master-password-${userUid}`
  }

  /**
   * Load master password data for user (now using secure storage)
   */
  private async loadUserMasterPasswordData(userUid: string): Promise<void> {
    try {
      const storageKey = this.getUserStorageKey(userUid);
      let parsed: UserMasterPasswordData | null = null;

      if (appConfig.environment !== 'development') {
        // Try secure storage first
        try {
          // Use a derived key from UID for decryption
          const tempKey = userUid.substring(0, 16).padEnd(16, '0');
          parsed = await secureStorageCompat.getItem(storageKey, tempKey);
        } catch (error) {
          console.warn('[MasterPassword] Secure storage failed, falling back to localStorage');
        }
      }

      // Fallback to localStorage if secure storage fails or in development
      if (!parsed) {
        const storedData = localStorage.getItem(storageKey);
        if (storedData) {
          parsed = JSON.parse(storedData) as UserMasterPasswordData;
        }
      }

      if (parsed) {
        // Verify the data belongs to the current user
        if (parsed.userUid === userUid && parsed.isImmutable === true) {
          this.masterPasswordData = parsed;
        } else {
          // Invalid or corrupted data
          localStorage.removeItem(storageKey);
          this.masterPasswordData = null;
        }
      } else {
        this.masterPasswordData = null;
      }
    } catch (error) {
      console.error('Failed to load master password data:', error);
      this.masterPasswordData = null;
    }
  }

  /**
   * Save master password data for user (now using secure storage)
   */
  private async saveMasterPasswordData(data: UserMasterPasswordData): Promise<void> {
    try {
      if (appConfig.environment !== 'development') {
        // In production, use secure storage
        const storageKey = this.getUserStorageKey(data.userUid);
        await secureStorageCompat.setItem(storageKey, data, data.saltBase64);
      } else {
        // In development, fall back to localStorage with warning
        console.warn('[MasterPassword] Using localStorage in development mode');
        const storageKey = this.getUserStorageKey(data.userUid);
        localStorage.setItem(storageKey, JSON.stringify(data));
      }
    } catch (error) {
      console.error('Failed to save master password data:', error);
      throw error;
    }
  }

  /**
   * Clear master password data
   */
  private clearUserMasterPasswordData(): void {
    this.masterPasswordData = null
    this.vaultManager.lockVault()
  }

  /**
   * Emergency cleanup (DEVELOPMENT ONLY - Automatically disabled in production)
   */
  dangerousResetMasterPassword(): boolean {
    // Triple-check environment to prevent accidental production usage
    if (appConfig.environment !== 'development') {
      console.error('[SECURITY] Master password reset blocked - not in development environment');
      return false;
    }

    if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
      console.error('[SECURITY] Master password reset blocked - not on localhost');
      return false;
    }

    const user = this.currentUser
    if (!user) {
      console.warn('[Dev] No user authenticated for reset');
      return false;
    }

    try {
      console.warn('[Dev] DANGER: Resetting master password for development purposes');
      console.warn('[Dev] User:', user.email);
      console.warn('[Dev] This operation is IRREVERSIBLE and will delete all encrypted data');

      const storageKey = this.getUserStorageKey(user.uid)
      localStorage.removeItem(storageKey)
      this.clearUserMasterPasswordData()
      
      // Also clear secure storage if available
      try {
        secureStorageCompat.removeItem(storageKey).catch(() => {
          // Ignore errors in secure storage cleanup
        });
      } catch (error) {
        // Ignore secure storage errors during reset
      }
      
      console.warn('[Dev] Master password reset completed - all local data cleared');
      return true
    } catch (error) {
      console.error('[Dev] Failed to reset master password:', error)
      return false
    }
  }

  /**
   * Debug helper to check localStorage state
   */
  debugStorageState(): void {
    const user = this.currentUser
    if (!user) {
      console.log('No user authenticated')
      return
    }

    const storageKey = this.getUserStorageKey(user.uid)
    const storedData = localStorage.getItem(storageKey)
    
    console.log('=== Master Password Debug Info ===')
    console.log('User UID:', user.uid)
    console.log('User Email:', user.email)
    console.log('Storage Key:', storageKey)
    console.log('Has stored data:', !!storedData)
    console.log('Is master password set:', this.isMasterPasswordSet())
    console.log('Is vault unlocked:', this.isVaultUnlocked())
    
    if (storedData) {
      try {
        const parsed = JSON.parse(storedData)
        console.log('Stored data:', parsed)
      } catch (error) {
        console.log('Failed to parse stored data:', error)
      }
    }
    
    // Check for old master password data
    const oldData = localStorage.getItem('masterPassword')
    if (oldData) {
      console.log('Found old master password data (should be migrated):', !!oldData)
    }
    
    console.log('=== End Debug Info ===')
  }
}

// Export singleton instance
export const masterPasswordService = MasterPasswordService.getInstance()

// Development debugging - STRICTLY controlled access
if (appConfig.environment === 'development' && typeof window !== 'undefined') {
  // Only expose on localhost
  if (window.location.hostname === 'localhost') {
    console.warn('[Dev] Development debugging functions available');
    console.warn('[Dev] These functions are DISABLED in production');
    
    // Expose debug functions with clear warnings
    Object.defineProperty(window, 'debugMasterPassword', {
      value: () => {
        console.warn('[Dev] === DEVELOPMENT DEBUG INFO ===');
        masterPasswordService.debugStorageState();
        console.warn('[Dev] === END DEBUG INFO ===');
      },
      configurable: true,
      writable: false
    });
    
    Object.defineProperty(window, 'resetMasterPassword', {
      value: () => {
        console.warn('[Dev] === DANGEROUS OPERATION ===');
        console.warn('[Dev] This will DELETE ALL encrypted data!');
        console.warn('[Dev] Only use this for development testing!');
        const confirmed = confirm('DEVELOPMENT ONLY: Delete all master password data? This is IRREVERSIBLE!');
        if (confirmed) {
          return masterPasswordService.dangerousResetMasterPassword();
        }
        return false;
      },
      configurable: true,
      writable: false
    });
  } else {
    console.log('[Security] Development functions disabled - not on localhost');
  }
} else if (appConfig.environment === 'production') {
  // In production, actively block any debug access
  if (typeof window !== 'undefined') {
    ['debugMasterPassword', 'resetMasterPassword', 'console'].forEach(prop => {
      Object.defineProperty(window, prop, {
        value: () => {
          console.error('[SECURITY] Debug functions are disabled in production');
          return false;
        },
        configurable: false,
        writable: false
      });
    });
  }
}
