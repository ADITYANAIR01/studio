/**
 * Secure Storage Service for Zero-Knowledge Password Manager
 * Implements client-side encryption for all sensitive data
 */

import { 
  encryptData, 
  decryptData, 
  SecureVaultManager, 
  generateItemKey,
  exportKey,
  importKey,
  type EncryptedData 
} from '@/lib/crypto';
import type { Password, ApiKey, StoredGoogleCode } from '@/lib/types';

// Enhanced types with encryption metadata
export interface EncryptedItem {
  id: string;
  encryptedData: EncryptedData;
  encryptedKey: EncryptedData; // Item key encrypted with vault key
  lastModified: number;
  type: 'password' | 'apiKey' | 'googleCode' | 'note';
}

export interface SecureVaultData {
  version: string;
  items: EncryptedItem[];
  lastBackup?: number;
  settings?: EncryptedData;
}

export class SecureStorageService {
  private static instance: SecureStorageService;
  private vaultManager: SecureVaultManager;
  private readonly STORAGE_KEY = 'citadel-secure-vault';
  private readonly VERSION = '1.0.0';

  private constructor() {
    this.vaultManager = SecureVaultManager.getInstance();
  }

  static getInstance(): SecureStorageService {
    if (!SecureStorageService.instance) {
      SecureStorageService.instance = new SecureStorageService();
    }
    return SecureStorageService.instance;
  }

  /**
   * Store encrypted password
   */
  async savePassword(password: Password): Promise<void> {
  throw new Error('Use savePasswordSecure(password, masterPassword) instead.');
  }

  /**
   * Store encrypted API key
   */
  async saveApiKey(apiKey: ApiKey): Promise<void> {
  throw new Error('Use saveApiKeySecure(apiKey, masterPassword) instead.');
  }

  /**
   * Store encrypted Google backup codes
   */
  async saveGoogleCode(googleCode: StoredGoogleCode): Promise<void> {
    throw new Error('Use saveGoogleCodeSecure(googleCode, masterPassword) instead.');
  }

  /**
   * Securely save password to Firestore
   */
  async savePasswordSecure(password: Password, masterPassword: string): Promise<void> {
    const { saveCredential } = await import('@/lib/firebase');
    await saveCredential({
      name: password.name,
      username: password.username || password.email || '',
      password: password.value,
      type: 'password',
      notes: password.category || ''
    }, masterPassword);
  }

  /**
   * Securely save API key to Firestore
   */
  async saveApiKeySecure(apiKey: ApiKey, masterPassword: string): Promise<void> {
    const { saveCredential } = await import('@/lib/firebase');
    await saveCredential({
      name: apiKey.name,
      username: '',
      password: apiKey.value,
      type: 'apiKey',
      notes: ''
    }, masterPassword);
  }

  /**
   * Securely save Google backup codes to Firestore
   */
  async saveGoogleCodeSecure(googleCode: StoredGoogleCode, masterPassword: string): Promise<void> {
    const { saveCredential } = await import('@/lib/firebase');
    await saveCredential({
      name: googleCode.platform,
      username: googleCode.email,
      password: JSON.stringify(googleCode.codes),
      type: 'googleCode',
      notes: ''
    }, masterPassword);
  }
  }

  /**
   * Retrieve and decrypt passwords
   */
  async getPasswords(): Promise<Password[]> {
    return await this.getItemsByType<Password>('password');
  }

  /**
   * Retrieve and decrypt API keys
   */
  async getApiKeys(): Promise<ApiKey[]> {
    return await this.getItemsByType<ApiKey>('apiKey');
  }

  /**
   * Retrieve and decrypt Google codes
   */
  async getGoogleCodes(): Promise<StoredGoogleCode[]> {
    return await this.getItemsByType<StoredGoogleCode>('googleCode');
  }

  /**
   * Update existing item
   */
  async updateItem<T extends { id: string }>(
    item: T, 
    type: 'password' | 'apiKey' | 'googleCode'
  ): Promise<void> {
    const vaultData = await this.loadVaultData();
    const itemIndex = vaultData.items.findIndex(i => i.id === item.id && i.type === type);
    
    if (itemIndex === -1) {
      throw new Error('Item not found');
    }

    // Create new encrypted item
    const encryptedItem = await this.encryptItem(item, type);
    vaultData.items[itemIndex] = encryptedItem;
    
    await this.saveVaultData(vaultData);
  }

  /**
   * Delete item by ID
   */
  async deleteItem(id: string, type: 'password' | 'apiKey' | 'googleCode'): Promise<void> {
    const vaultData = await this.loadVaultData();
    vaultData.items = vaultData.items.filter(item => !(item.id === id && item.type === type));
    await this.saveVaultData(vaultData);
  }

  /**
   * Delete multiple items
   */
  async deleteItems(ids: string[], type: 'password' | 'apiKey' | 'googleCode'): Promise<void> {
    const vaultData = await this.loadVaultData();
    vaultData.items = vaultData.items.filter(item => 
      !(ids.includes(item.id) && item.type === type)
    );
    await this.saveVaultData(vaultData);
  }

  /**
   * Get vault statistics
   */
  async getVaultStats(): Promise<{
    passwords: number;
    apiKeys: number;
    googleCodes: number;
    totalItems: number;
    lastModified?: Date;
  }> {
    const vaultData = await this.loadVaultData();
    
    const passwords = vaultData.items.filter(i => i.type === 'password').length;
    const apiKeys = vaultData.items.filter(i => i.type === 'apiKey').length;
    const googleCodes = vaultData.items.filter(i => i.type === 'googleCode').length;
    
    const lastModified = vaultData.items.length > 0 
      ? new Date(Math.max(...vaultData.items.map(i => i.lastModified)))
      : undefined;

    return {
      passwords,
      apiKeys,
      googleCodes,
      totalItems: vaultData.items.length,
      lastModified
    };
  }

  /**
   * Export vault data for backup
   */
  async exportVault(): Promise<string> {
    const vaultData = await this.loadVaultData();
    return JSON.stringify(vaultData, null, 2);
  }

  /**
   * Import vault data from backup
   */
  async importVault(backupData: string, mergeWithExisting = false): Promise<void> {
    try {
      const importedData: SecureVaultData = JSON.parse(backupData);
      
      if (!this.isValidVaultData(importedData)) {
        throw new Error('Invalid vault data format');
      }

      let vaultData: SecureVaultData;
      
      if (mergeWithExisting) {
        vaultData = await this.loadVaultData();
        
        // Merge items, avoiding duplicates
        const existingIds = new Set(vaultData.items.map(i => `${i.id}-${i.type}`));
        const newItems = importedData.items.filter(i => 
          !existingIds.has(`${i.id}-${i.type}`)
        );
        
        vaultData.items.push(...newItems);
      } else {
        vaultData = importedData;
      }

      await this.saveVaultData(vaultData);
    } catch (error) {
      throw new Error('Failed to import vault data: ' + (error as Error).message);
    }
  }

  /**
   * Clear all vault data (for account deletion)
   */
  async clearVault(): Promise<void> {
    localStorage.removeItem(this.STORAGE_KEY);
    localStorage.removeItem('citadel-vault-salt');
  }

  /**
   * Search encrypted items (searches decrypted data)
   */
  async searchItems(query: string): Promise<{
    passwords: Password[];
    apiKeys: ApiKey[];
    googleCodes: StoredGoogleCode[];
  }> {
    const [passwords, apiKeys, googleCodes] = await Promise.all([
      this.getPasswords(),
      this.getApiKeys(),
      this.getGoogleCodes()
    ]);

    const lowerQuery = query.toLowerCase();

    const filteredPasswords = passwords.filter(p => 
      p.name.toLowerCase().includes(lowerQuery) ||
      (p.email && p.email.toLowerCase().includes(lowerQuery)) ||
      (p.username && p.username.toLowerCase().includes(lowerQuery)) ||
      (p.category && p.category.toLowerCase().includes(lowerQuery))
    );

    const filteredApiKeys = apiKeys.filter(k =>
      k.name.toLowerCase().includes(lowerQuery)
    );

    const filteredGoogleCodes = googleCodes.filter(g =>
      g.platform.toLowerCase().includes(lowerQuery) ||
      g.email.toLowerCase().includes(lowerQuery)
    );

    return {
      passwords: filteredPasswords,
      apiKeys: filteredApiKeys,
      googleCodes: filteredGoogleCodes
    };
  }

  // Private methods

  private async saveItem<T extends { id: string }>(
    item: T, 
    type: 'password' | 'apiKey' | 'googleCode'
  ): Promise<void> {
    const vaultData = await this.loadVaultData();
    
    // Remove existing item if it exists
    vaultData.items = vaultData.items.filter(i => !(i.id === item.id && i.type === type));
    
    // Add encrypted item
    const encryptedItem = await this.encryptItem(item, type);
    vaultData.items.push(encryptedItem);
    
    await this.saveVaultData(vaultData);
  }

  private async getItemsByType<T>(type: 'password' | 'apiKey' | 'googleCode'): Promise<T[]> {
    const vaultData = await this.loadVaultData();
    const items = vaultData.items.filter(item => item.type === type);
    
    const decryptedItems: T[] = [];
    
    for (const item of items) {
      try {
        const decrypted = await this.decryptItem<T>(item);
        decryptedItems.push(decrypted);
      } catch (error) {
        console.error(`Failed to decrypt item ${item.id}:`, error);
        // Skip corrupted items rather than failing entirely
      }
    }
    
    return decryptedItems;
  }

  private async encryptItem<T extends { id: string }>(
    item: T, 
    type: 'password' | 'apiKey' | 'googleCode'
  ): Promise<EncryptedItem> {
    const vaultKey = this.vaultManager.getVaultKey();
    if (!vaultKey) {
      throw new Error('Vault is locked');
    }

    // Generate unique key for this item
    const itemKey = await generateItemKey();
    
    // Encrypt the item data with item key
    const encryptedData = await encryptData(JSON.stringify(item), itemKey);
    
    // Encrypt the item key with vault key
    const exportedItemKey = await exportKey(itemKey);
    const encryptedKey = await encryptData(
      btoa(String.fromCharCode(...new Uint8Array(exportedItemKey))), 
      vaultKey.masterKey
    );

    return {
      id: item.id,
      encryptedData,
      encryptedKey,
      lastModified: Date.now(),
      type
    };
  }

  private async decryptItem<T>(encryptedItem: EncryptedItem): Promise<T> {
    const vaultKey = this.vaultManager.getVaultKey();
    if (!vaultKey) {
      throw new Error('Vault is locked');
    }

    // Decrypt item key
    const encryptedKeyData = await decryptData(encryptedItem.encryptedKey, vaultKey.masterKey);
    const keyBytes = new Uint8Array(
      atob(encryptedKeyData).split('').map(char => char.charCodeAt(0))
    );
    const itemKey = await importKey(keyBytes.buffer);

    // Decrypt item data
    const decryptedData = await decryptData(encryptedItem.encryptedData, itemKey);
    
    return JSON.parse(decryptedData) as T;
  }

  private async loadVaultData(): Promise<SecureVaultData> {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    
    if (!stored) {
      return {
        version: this.VERSION,
        items: []
      };
    }

    try {
      const data: SecureVaultData = JSON.parse(stored);
      return data;
    } catch (error) {
      console.error('Failed to parse vault data:', error);
      return {
        version: this.VERSION,
        items: []
      };
    }
  }

  private async saveVaultData(data: SecureVaultData): Promise<void> {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        throw new Error('Storage quota exceeded. Please free up space.');
      }
      throw new Error('Failed to save vault data');
    }
  }

  private isValidVaultData(data: any): data is SecureVaultData {
    return (
      typeof data === 'object' &&
      typeof data.version === 'string' &&
      Array.isArray(data.items) &&
      data.items.every((item: any) => 
        typeof item.id === 'string' &&
        typeof item.encryptedData === 'object' &&
        typeof item.encryptedKey === 'object' &&
        typeof item.lastModified === 'number' &&
        ['password', 'apiKey', 'googleCode', 'note'].includes(item.type)
      )
    );
  }
}

/**
 * Hook for using secure storage in React components
 */
export function useSecureStorage() {
  const storage = SecureStorageService.getInstance();
  
  return {
    // Password operations
    savePassword: storage.savePassword.bind(storage),
    getPasswords: storage.getPasswords.bind(storage),
    updatePassword: (password: Password) => storage.updateItem(password, 'password'),
    deletePassword: (id: string) => storage.deleteItem(id, 'password'),
    deletePasswords: (ids: string[]) => storage.deleteItems(ids, 'password'),
    
    // API key operations
    saveApiKey: storage.saveApiKey.bind(storage),
    getApiKeys: storage.getApiKeys.bind(storage),
    updateApiKey: (apiKey: ApiKey) => storage.updateItem(apiKey, 'apiKey'),
    deleteApiKey: (id: string) => storage.deleteItem(id, 'apiKey'),
    deleteApiKeys: (ids: string[]) => storage.deleteItems(ids, 'apiKey'),
    
    // Google codes operations
    saveGoogleCode: storage.saveGoogleCode.bind(storage),
    getGoogleCodes: storage.getGoogleCodes.bind(storage),
    updateGoogleCode: (code: StoredGoogleCode) => storage.updateItem(code, 'googleCode'),
    deleteGoogleCode: (id: string) => storage.deleteItem(id, 'googleCode'),
    
    // Utility operations
    getVaultStats: storage.getVaultStats.bind(storage),
    exportVault: storage.exportVault.bind(storage),
    importVault: storage.importVault.bind(storage),
    clearVault: storage.clearVault.bind(storage),
    searchItems: storage.searchItems.bind(storage)
  };
}

// Legacy compatibility layer for existing components
export class LegacyStorageAdapter {
  private secureStorage: SecureStorageService;

  constructor() {
    this.secureStorage = SecureStorageService.getInstance();
  }

  // Migrate existing localStorage data to encrypted storage
  async migrateFromLocalStorage(): Promise<{
    passwords: number;
    apiKeys: number;
    googleCodes: number;
  }> {
    let migrated = { passwords: 0, apiKeys: 0, googleCodes: 0 };

    try {
      // Migrate passwords
      const passwords = JSON.parse(localStorage.getItem('citadel-passwords') || '[]');
      for (const password of passwords) {
        await this.secureStorage.savePassword(password);
        migrated.passwords++;
      }

      // Migrate API keys
      const apiKeys = JSON.parse(localStorage.getItem('citadel-api-keys') || '[]');
      for (const apiKey of apiKeys) {
        await this.secureStorage.saveApiKey(apiKey);
        migrated.apiKeys++;
      }

      // Migrate Google codes
      const googleCodes = JSON.parse(localStorage.getItem('citadel-google-codes') || '[]');
      for (const googleCode of googleCodes) {
        await this.secureStorage.saveGoogleCode(googleCode);
        migrated.googleCodes++;
      }

      // Clear old data after successful migration
      localStorage.removeItem('citadel-passwords');
      localStorage.removeItem('citadel-api-keys');
      localStorage.removeItem('citadel-google-codes');

    } catch (error) {
      console.error('Migration failed:', error);
      throw new Error('Failed to migrate existing data');
    }

    return migrated;
  }

  // Check if migration is needed
  hasMigrationData(): boolean {
    return !!(
      localStorage.getItem('citadel-passwords') ||
      localStorage.getItem('citadel-api-keys') ||
      localStorage.getItem('citadel-google-codes')
    );
  }
}
