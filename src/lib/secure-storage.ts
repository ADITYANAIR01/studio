/**
 * Secure Storage System
 * Replaces vulnerable localStorage with encrypted IndexedDB
 * Implements enterprise-grade data persistence with automatic cleanup
 */

import { cryptoManager, type EncryptedPayload } from './crypto-advanced';
import { appConfig } from './config';

// Storage configuration
const DB_NAME = 'CitadelSecureVault';
const DB_VERSION = 2;
const STORE_NAME = 'encryptedData';
const INDEX_NAME = 'timestamp';

// Storage interfaces
export interface SecureStorageItem {
  id: string;
  encryptedData: EncryptedPayload;
  metadata: {
    userId: string;
    dataType: 'masterPassword' | 'credential' | 'setting' | 'backup';
    createdAt: number;
    lastAccessed: number;
    expiresAt?: number;
    version: string;
  };
}

export interface StorageOptions {
  ttl?: number; // Time to live in milliseconds
  compress?: boolean;
  autoExpire?: boolean;
}

/**
 * Secure IndexedDB Storage Manager
 * Provides encrypted, persistent storage with automatic cleanup
 */
export class SecureIndexedDBManager {
  private static instance: SecureIndexedDBManager;
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private readonly version = DB_VERSION;

  static getInstance(): SecureIndexedDBManager {
    if (!SecureIndexedDBManager.instance) {
      SecureIndexedDBManager.instance = new SecureIndexedDBManager();
    }
    return SecureIndexedDBManager.instance;
  }

  /**
   * Initialize the IndexedDB database
   */
  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB not supported in this environment'));
        return;
      }

      const request = window.indexedDB.open(DB_NAME, this.version);

      request.onerror = () => {
        console.error('[SecureStorage] Failed to open database:', request.error);
        reject(new Error('Failed to initialize secure storage'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[SecureStorage] Database initialized successfully');
        
        // Set up error handling
        this.db.onerror = (event) => {
          console.error('[SecureStorage] Database error:', event);
        };

        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Delete old store if it exists
        if (db.objectStoreNames.contains(STORE_NAME)) {
          db.deleteObjectStore(STORE_NAME);
        }

        // Create new object store
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        
        // Create indexes
        store.createIndex(INDEX_NAME, 'metadata.lastAccessed', { unique: false });
        store.createIndex('userId', 'metadata.userId', { unique: false });
        store.createIndex('dataType', 'metadata.dataType', { unique: false });
        store.createIndex('expiresAt', 'metadata.expiresAt', { unique: false });

        console.log('[SecureStorage] Database schema updated');
      };
    });

    return this.initPromise;
  }

  /**
   * Store encrypted data securely
   */
  async setItem(
    key: string,
    value: any,
    password: string,
    userId: string,
    dataType: SecureStorageItem['metadata']['dataType'] = 'setting',
    options: StorageOptions = {}
  ): Promise<void> {
    await this.ensureInitialized();

    try {
      // Serialize and encrypt the data
      const serializedData = JSON.stringify(value);
      const encryptedData = await cryptoManager.encryptData(serializedData, password);

      // Create storage item with metadata
      const now = Date.now();
      const item: SecureStorageItem = {
        id: this.generateStorageKey(userId, key),
        encryptedData,
        metadata: {
          userId,
          dataType,
          createdAt: now,
          lastAccessed: now,
          expiresAt: options.ttl ? now + options.ttl : undefined,
          version: appConfig.version
        }
      };

      // Store in IndexedDB
      await this.writeToStore(item);

      console.log(`[SecureStorage] Stored item: ${key} for user: ${userId.substring(0, 8)}...`);
    } catch (error) {
      console.error('[SecureStorage] Failed to store item:', error);
      throw new Error('Failed to store data securely');
    }
  }

  /**
   * Retrieve and decrypt data
   */
  async getItem(
    key: string,
    password: string,
    userId: string
  ): Promise<any | null> {
    await this.ensureInitialized();

    try {
      const storageKey = this.generateStorageKey(userId, key);
      const item = await this.readFromStore(storageKey);

      if (!item) {
        return null;
      }

      // Check expiration
      if (item.metadata.expiresAt && Date.now() > item.metadata.expiresAt) {
        console.log(`[SecureStorage] Item expired: ${key}`);
        await this.removeItem(key, userId);
        return null;
      }

      // Update last accessed timestamp
      item.metadata.lastAccessed = Date.now();
      await this.writeToStore(item);

      // Decrypt and deserialize data
      const decryptedData = await cryptoManager.decryptData(item.encryptedData, password);
      return JSON.parse(decryptedData);
    } catch (error) {
      console.error('[SecureStorage] Failed to retrieve item:', error);
      return null;
    }
  }

  /**
   * Remove item from secure storage
   */
  async removeItem(key: string, userId: string): Promise<void> {
    await this.ensureInitialized();

    try {
      const storageKey = this.generateStorageKey(userId, key);
      await this.deleteFromStore(storageKey);
      console.log(`[SecureStorage] Removed item: ${key}`);
    } catch (error) {
      console.error('[SecureStorage] Failed to remove item:', error);
      throw new Error('Failed to remove data');
    }
  }

  /**
   * Clear all data for a specific user
   */
  async clearUserData(userId: string): Promise<void> {
    await this.ensureInitialized();

    try {
      if (!this.db) throw new Error('Database not initialized');

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('userId');
      const request = index.openCursor(IDBKeyRange.only(userId));

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      await this.waitForTransaction(transaction);
      console.log(`[SecureStorage] Cleared all data for user: ${userId.substring(0, 8)}...`);
    } catch (error) {
      console.error('[SecureStorage] Failed to clear user data:', error);
      throw new Error('Failed to clear user data');
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(userId?: string): Promise<{
    totalItems: number;
    totalSize: number;
    itemsByType: Record<string, number>;
    oldestItem: number;
    newestItem: number;
  }> {
    await this.ensureInitialized();

    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    let totalItems = 0;
    let totalSize = 0;
    const itemsByType: Record<string, number> = {};
    let oldestItem = Date.now();
    let newestItem = 0;

    const request = userId ? 
      store.index('userId').openCursor(IDBKeyRange.only(userId)) :
      store.openCursor();

    return new Promise((resolve, reject) => {
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const item: SecureStorageItem = cursor.value;
          totalItems++;
          totalSize += JSON.stringify(item).length;
          
          itemsByType[item.metadata.dataType] = (itemsByType[item.metadata.dataType] || 0) + 1;
          
          if (item.metadata.createdAt < oldestItem) {
            oldestItem = item.metadata.createdAt;
          }
          if (item.metadata.createdAt > newestItem) {
            newestItem = item.metadata.createdAt;
          }
          
          cursor.continue();
        } else {
          resolve({
            totalItems,
            totalSize,
            itemsByType,
            oldestItem,
            newestItem
          });
        }
      };

      request.onerror = () => {
        reject(new Error('Failed to get storage statistics'));
      };
    });
  }

  /**
   * Cleanup expired items
   */
  async cleanupExpiredItems(): Promise<number> {
    await this.ensureInitialized();

    if (!this.db) throw new Error('Database not initialized');

    const now = Date.now();
    let deletedCount = 0;

    const transaction = this.db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('expiresAt');
    
    // Get all items that have expired
    const request = index.openCursor(IDBKeyRange.upperBound(now));

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        const item: SecureStorageItem = cursor.value;
        if (item.metadata.expiresAt && item.metadata.expiresAt <= now) {
          cursor.delete();
          deletedCount++;
        }
        cursor.continue();
      }
    };

    await this.waitForTransaction(transaction);
    
    if (deletedCount > 0) {
      console.log(`[SecureStorage] Cleaned up ${deletedCount} expired items`);
    }

    return deletedCount;
  }

  /**
   * Export encrypted backup of user data
   */
  async exportUserData(userId: string, password: string): Promise<string> {
    await this.ensureInitialized();

    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('userId');
    const request = index.getAll(IDBKeyRange.only(userId));

    return new Promise((resolve, reject) => {
      request.onsuccess = async () => {
        try {
          const items: SecureStorageItem[] = request.result;
          const exportData = {
            version: appConfig.version,
            exportDate: new Date().toISOString(),
            userId: userId,
            itemCount: items.length,
            items: items
          };

          // Encrypt the entire export
          const exportPayload = await cryptoManager.encryptData(
            JSON.stringify(exportData),
            password
          );

          resolve(JSON.stringify(exportPayload));
        } catch (error) {
          reject(error);
        }
      };

      request.onerror = () => {
        reject(new Error('Failed to export user data'));
      };
    });
  }

  // Private helper methods
  private async ensureInitialized(): Promise<void> {
    if (!this.db) {
      await this.initialize();
    }
  }

  private generateStorageKey(userId: string, key: string): string {
    return `${userId}:${key}`;
  }

  private async writeToStore(item: SecureStorageItem): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.put(item);

    await this.waitForTransaction(transaction);
  }

  private async readFromStore(key: string): Promise<SecureStorageItem | null> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        reject(new Error('Failed to read from store'));
      };
    });
  }

  private async deleteFromStore(key: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.delete(key);

    await this.waitForTransaction(transaction);
  }

  private waitForTransaction(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(new Error('Transaction aborted'));
    });
  }
}

/**
 * Legacy localStorage compatibility layer
 * Provides seamless migration from localStorage to secure IndexedDB
 */
export class SecureStorageCompat {
  private static instance: SecureStorageCompat;
  private storage: SecureIndexedDBManager;

  static getInstance(): SecureStorageCompat {
    if (!SecureStorageCompat.instance) {
      SecureStorageCompat.instance = new SecureStorageCompat();
    }
    return SecureStorageCompat.instance;
  }

  constructor() {
    this.storage = SecureIndexedDBManager.getInstance();
  }

  /**
   * Set item with automatic user context
   */
  async setItem(key: string, value: any, password: string): Promise<void> {
    const userId = this.getCurrentUserId();
    if (!userId) {
      throw new Error('No authenticated user for storage operation');
    }

    await this.storage.setItem(key, value, password, userId);
  }

  /**
   * Get item with automatic user context
   */
  async getItem(key: string, password: string): Promise<any | null> {
    const userId = this.getCurrentUserId();
    if (!userId) {
      return null;
    }

    return await this.storage.getItem(key, password, userId);
  }

  /**
   * Remove item with automatic user context
   */
  async removeItem(key: string): Promise<void> {
    const userId = this.getCurrentUserId();
    if (!userId) {
      return;
    }

    await this.storage.removeItem(key, userId);
  }

  /**
   * Clear all storage for current user
   */
  async clear(): Promise<void> {
    const userId = this.getCurrentUserId();
    if (!userId) {
      return;
    }

    await this.storage.clearUserData(userId);
  }

  private getCurrentUserId(): string | null {
    try {
      // Get current user from Firebase auth
      const { firebaseAuth } = require('./firebase');
      const currentUser = firebaseAuth.getCurrentUser();
      return currentUser?.uid || null;
    } catch (error) {
      console.error('[SecureStorage] Failed to get current user:', error);
      return null;
    }
  }
}

// Export singleton instances
export const secureStorage = SecureIndexedDBManager.getInstance();
export const secureStorageCompat = SecureStorageCompat.getInstance();

// Initialize storage on import
secureStorage.initialize().catch(error => {
  console.error('[SecureStorage] Failed to initialize:', error);
});

// Periodic cleanup
if (typeof window !== 'undefined') {
  // Clean up expired items every hour
  setInterval(() => {
    secureStorage.cleanupExpiredItems().catch(error => {
      console.error('[SecureStorage] Cleanup failed:', error);
    });
  }, 3600000); // 1 hour
}
