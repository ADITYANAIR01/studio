export interface Password {
  id: string;
  name: string;
  username?: string;
  email: string;
  value: string;
  category?: string;
}

export interface ApiKey {
  id: string;
  name: string;
  value: string;
}

export type GoogleBackupCode = string;

export interface StoredGoogleCode {
    id: string;
    platform: string;
    email: string;
    codes: GoogleBackupCode[];
}

export interface AppData {
  passwords: Password[];
  apiKeys: ApiKey[];
  googleCodes: StoredGoogleCode[];
  // Secure credentials from new system
  secureCredentials?: any[];
  // Full encrypted vault export (stringified) from SecureStorageService
  secureVaultData?: string | null;
  // Application settings and preferences
  settings?: any;
  // Export metadata
  exportedAt: string;
  version: string;
}
