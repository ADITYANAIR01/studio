/**
 * Data Migration Service
 * Handles migration from localStorage to Firestore
 */

import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  deleteDoc,
  writeBatch,
  query,
  where
} from 'firebase/firestore';
import { db } from '@/lib/firebase-secure';
import type { Password, ApiKey, StoredGoogleCode } from '@/lib/types';

export interface MigrationResult {
  success: boolean;
  passwordsCount: number;
  apiKeysCount: number;
  googleCodesCount: number;
  settingsCount: number;
  errors: string[];
}

export class DataMigrationService {
  /**
   * Migrate all localStorage data to Firestore for the current user
   */
  static async migrateToFirestore(userId: string): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: false,
      passwordsCount: 0,
      apiKeysCount: 0,
      googleCodesCount: 0,
      settingsCount: 0,
      errors: []
    };

    if (!userId) {
      result.errors.push('User ID is required for migration');
      return result;
    }

    try {
      // Migrate passwords
      await this.migratePasswords(userId, result);
      
      // Migrate API keys
      await this.migrateApiKeys(userId, result);
      
      // Migrate Google codes
      await this.migrateGoogleCodes(userId, result);
      
      // Migrate settings
      await this.migrateSettings(userId, result);

      result.success = result.errors.length === 0;
      
      console.log('Migration completed:', result);
      return result;

    } catch (error) {
      console.error('Migration failed:', error);
      result.errors.push(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return result;
    }
  }

  /**
   * Migrate passwords from localStorage to Firestore
   */
  private static async migratePasswords(userId: string, result: MigrationResult): Promise<void> {
    try {
      const localPasswords = this.getLocalStorageData<Password[]>('citadel-passwords', []);
      
      if (localPasswords.length === 0) {
        console.log('No passwords to migrate');
        return;
      }

      const batch = writeBatch(db);
      const passwordsCollection = collection(db, 'users', userId, 'credentials');

      for (const password of localPasswords) {
        const docRef = doc(passwordsCollection);
        batch.set(docRef, {
          ...password,
          id: docRef.id,
          migratedAt: new Date(),
          source: 'localStorage'
        });
      }

      await batch.commit();
      result.passwordsCount = localPasswords.length;
      console.log(`Migrated ${localPasswords.length} passwords`);

    } catch (error) {
      result.errors.push(`Failed to migrate passwords: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Migrate API keys from localStorage to Firestore
   */
  private static async migrateApiKeys(userId: string, result: MigrationResult): Promise<void> {
    try {
      const localApiKeys = this.getLocalStorageData<ApiKey[]>('citadel-api-keys', []);
      
      if (localApiKeys.length === 0) {
        console.log('No API keys to migrate');
        return;
      }

      const batch = writeBatch(db);
      const apiKeysCollection = collection(db, 'users', userId, 'api-keys');

      for (const apiKey of localApiKeys) {
        const docRef = doc(apiKeysCollection);
        batch.set(docRef, {
          ...apiKey,
          id: docRef.id,
          migratedAt: new Date(),
          source: 'localStorage'
        });
      }

      await batch.commit();
      result.apiKeysCount = localApiKeys.length;
      console.log(`Migrated ${localApiKeys.length} API keys`);

    } catch (error) {
      result.errors.push(`Failed to migrate API keys: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Migrate Google codes from localStorage to Firestore
   */
  private static async migrateGoogleCodes(userId: string, result: MigrationResult): Promise<void> {
    try {
      const localGoogleCodes = this.getLocalStorageData<StoredGoogleCode[]>('citadel-google-codes', []);
      
      if (localGoogleCodes.length === 0) {
        console.log('No Google codes to migrate');
        return;
      }

      const batch = writeBatch(db);
      const googleCodesCollection = collection(db, 'users', userId, 'google-codes');

      for (const googleCode of localGoogleCodes) {
        const docRef = doc(googleCodesCollection);
        batch.set(docRef, {
          ...googleCode,
          id: docRef.id,
          migratedAt: new Date(),
          source: 'localStorage'
        });
      }

      await batch.commit();
      result.googleCodesCount = localGoogleCodes.length;
      console.log(`Migrated ${localGoogleCodes.length} Google codes`);

    } catch (error) {
      result.errors.push(`Failed to migrate Google codes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Migrate app settings from localStorage to Firestore
   */
  private static async migrateSettings(userId: string, result: MigrationResult): Promise<void> {
    try {
      const settings = {
        theme: localStorage.getItem('theme'),
        language: localStorage.getItem('language'),
        autoLock: localStorage.getItem('auto-lock'),
        masterPasswordHash: localStorage.getItem('masterPassword')
      };

      // Only migrate non-null settings
      const validSettings = Object.entries(settings)
        .filter(([_, value]) => value !== null)
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});

      if (Object.keys(validSettings).length === 0) {
        console.log('No settings to migrate');
        return;
      }

      const settingsDoc = doc(db, 'users', userId, 'settings', 'app-settings');
      await setDoc(settingsDoc, {
        ...validSettings,
        migratedAt: new Date(),
        source: 'localStorage'
      });

      result.settingsCount = Object.keys(validSettings).length;
      console.log(`Migrated ${Object.keys(validSettings).length} settings`);

    } catch (error) {
      result.errors.push(`Failed to migrate settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if user has already migrated data
   */
  static async hasMigratedData(userId: string): Promise<boolean> {
    try {
      const collections = [
        collection(db, 'users', userId, 'credentials'),
        collection(db, 'users', userId, 'api-keys'),
        collection(db, 'users', userId, 'google-codes')
      ];

      for (const coll of collections) {
        const snapshot = await getDocs(coll);
        if (!snapshot.empty) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Error checking migration status:', error);
      return false;
    }
  }

  /**
   * Clear localStorage data after successful migration
   */
  static clearLocalStorageData(): void {
    const keysToRemove = [
      'citadel-passwords',
      'citadel-api-keys',
      'citadel-google-codes',
      'theme',
      'language',
      'auto-lock'
      // Note: We keep 'masterPassword' as it's still needed for encryption
    ];

    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      console.log(`Removed localStorage key: ${key}`);
    });
  }

  /**
   * Get data from localStorage with error handling
   */
  private static getLocalStorageData<T>(key: string, defaultValue: T): T {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return defaultValue;
    }
  }

  /**
   * Create a backup of localStorage data before migration
   */
  static createLocalStorageBackup(): string {
    const backup = {
      timestamp: new Date().toISOString(),
      data: {
        passwords: this.getLocalStorageData('citadel-passwords', []),
        apiKeys: this.getLocalStorageData('citadel-api-keys', []),
        googleCodes: this.getLocalStorageData('citadel-google-codes', []),
        settings: {
          theme: localStorage.getItem('theme'),
          language: localStorage.getItem('language'),
          autoLock: localStorage.getItem('auto-lock'),
          masterPassword: localStorage.getItem('masterPassword')
        }
      }
    };

    return JSON.stringify(backup, null, 2);
  }
}
