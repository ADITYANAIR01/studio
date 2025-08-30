/**
 * Advanced Cryptographic Security Layer
 * Implements enterprise-grade encryption with Web Crypto API
 * Replaces weak CryptoJS with proper PBKDF2 + AES-GCM
 */

import { appConfig } from './config';

// Enhanced cryptographic types
export interface SecureKey {
  key: CryptoKey;
  salt: Uint8Array;
  iterations: number;
  algorithm: string;
  keyLength: number;
  timestamp: number;
}

export interface EncryptedPayload {
  data: string;           // Base64 encoded encrypted data
  iv: string;             // Base64 encoded initialization vector
  salt: string;           // Base64 encoded salt
  iterations: number;     // PBKDF2 iterations used
  algorithm: string;      // Encryption algorithm identifier
  keyLength: number;      // Key length in bits
  version: string;        // Encryption version for future compatibility
  checksum: string;       // Integrity checksum
}

export interface KeyDerivationOptions {
  iterations?: number;
  salt?: Uint8Array;
  keyLength?: number;
  algorithm?: string;
}

export interface EncryptionOptions {
  algorithm?: 'AES-GCM' | 'AES-CBC';
  keyLength?: 128 | 192 | 256;
  ivLength?: number;
}

// Constants for cryptographic operations
const getDefaultIterations = () => {
  try {
    return appConfig.security.encryptionIterations;
  } catch (error) {
    console.warn('Failed to get encryption iterations from config, using fallback:', error);
    return 300000; // fallback value
  }
};
const DEFAULT_KEY_LENGTH = 256;
const DEFAULT_SALT_LENGTH = 32;
const DEFAULT_IV_LENGTH = 12; // 96 bits for GCM
const ENCRYPTION_VERSION = '2.0.0';

/**
 * Advanced Cryptographic Manager
 * Handles all encryption, decryption, and key management operations
 */
class AdvancedCryptoManager {
  private static instance: AdvancedCryptoManager;
  private keyCache = new Map<string, SecureKey>();
  private readonly maxCacheSize = 10;

  static getInstance(): AdvancedCryptoManager {
    if (!AdvancedCryptoManager.instance) {
      AdvancedCryptoManager.instance = new AdvancedCryptoManager();
    }
    return AdvancedCryptoManager.instance;
  }

  /**
   * Derive a strong encryption key from password using PBKDF2
   */
  async deriveKeyFromPassword(
    password: string, 
    options: KeyDerivationOptions = {}
  ): Promise<SecureKey> {
    const {
      iterations = getDefaultIterations(),
      salt = crypto.getRandomValues(new Uint8Array(DEFAULT_SALT_LENGTH)),
      keyLength = DEFAULT_KEY_LENGTH,
      algorithm = 'PBKDF2'
    } = options;

    // Validate inputs
    this.validatePassword(password);
    this.validateIterations(iterations);

    // Create cache key for performance
    const cacheKey = this.createCacheKey(password, salt, iterations);
    const cached = this.keyCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < 300000) { // 5 minute cache
      return cached;
    }

    try {
      // Import password as key material
      const passwordKey = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
      );

      // Derive AES-GCM key with high iteration count
      const derivedKey = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt as BufferSource,
          iterations: iterations,
          hash: 'SHA-256'
        },
        passwordKey,
        {
          name: 'AES-GCM',
          length: keyLength
        },
        false, // Not extractable for security
        ['encrypt', 'decrypt']
      );

      const secureKey: SecureKey = {
        key: derivedKey,
        salt: salt,
        iterations: iterations,
        algorithm: algorithm,
        keyLength: keyLength,
        timestamp: Date.now()
      };

      // Cache the key (with size limit)
      this.cacheKey(cacheKey, secureKey);

      return secureKey;
    } catch (error) {
      console.error('[Crypto] Key derivation failed:', error);
      throw new Error('Failed to derive encryption key');
    }
  }

  /**
   * Encrypt data using AES-GCM with integrity protection
   */
  async encryptData(
    plaintext: string, 
    password: string, 
    options: EncryptionOptions = {}
  ): Promise<EncryptedPayload> {
    const {
      algorithm = 'AES-GCM',
      keyLength = DEFAULT_KEY_LENGTH,
      ivLength = DEFAULT_IV_LENGTH
    } = options;

    // Validate inputs
    this.validatePlaintext(plaintext);
    this.validatePassword(password);

    try {
      // Generate unique salt and IV for this operation
      const salt = crypto.getRandomValues(new Uint8Array(DEFAULT_SALT_LENGTH));
      const iv = crypto.getRandomValues(new Uint8Array(ivLength));

      // Derive encryption key
      const secureKey = await this.deriveKeyFromPassword(password, { 
        salt, 
        keyLength 
      });

      // Encrypt the data
      const encodedData = new TextEncoder().encode(plaintext);
      const encryptedBuffer = await crypto.subtle.encrypt(
        {
          name: algorithm,
          iv: iv
        },
        secureKey.key,
        encodedData
      );

      // Create encrypted payload with metadata
      const payload: EncryptedPayload = {
        data: this.arrayBufferToBase64(encryptedBuffer),
        iv: this.arrayBufferToBase64(iv.buffer),
        salt: this.arrayBufferToBase64(salt.buffer),
        iterations: secureKey.iterations,
        algorithm: algorithm,
        keyLength: keyLength,
        version: ENCRYPTION_VERSION,
        checksum: await this.calculateChecksum(encryptedBuffer, salt, iv)
      };

      return payload;
    } catch (error) {
      console.error('[Crypto] Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt data with integrity verification
   */
  async decryptData(
    encryptedPayload: EncryptedPayload, 
    password: string
  ): Promise<string> {
    // Validate payload
    this.validateEncryptedPayload(encryptedPayload);
    this.validatePassword(password);

    try {
      // Extract components
      const encryptedData = this.base64ToArrayBuffer(encryptedPayload.data);
      const iv = this.base64ToArrayBuffer(encryptedPayload.iv);
      const salt = new Uint8Array(this.base64ToArrayBuffer(encryptedPayload.salt));

      // Verify integrity
      const expectedChecksum = await this.calculateChecksum(encryptedData, salt, new Uint8Array(iv));
      if (expectedChecksum !== encryptedPayload.checksum) {
        throw new Error('Data integrity check failed');
      }

      // Derive decryption key
      const secureKey = await this.deriveKeyFromPassword(password, {
        salt: salt,
        iterations: encryptedPayload.iterations,
        keyLength: encryptedPayload.keyLength
      });

      // Decrypt the data
      const decryptedBuffer = await crypto.subtle.decrypt(
        {
          name: encryptedPayload.algorithm,
          iv: iv
        },
        secureKey.key,
        encryptedData
      );

      return new TextDecoder().decode(decryptedBuffer);
    } catch (error) {
      console.error('[Crypto] Decryption failed:', error);
      throw new Error('Failed to decrypt data - invalid password or corrupted data');
    }
  }

  /**
   * Generate cryptographically secure random password
   */
  generateSecurePassword(
    length: number = 32, 
    options: {
      includeSymbols?: boolean;
      includeNumbers?: boolean;
      includeUppercase?: boolean;
      includeLowercase?: boolean;
      excludeSimilar?: boolean;
    } = {}
  ): string {
    const {
      includeSymbols = true,
      includeNumbers = true,
      includeUppercase = true,
      includeLowercase = true,
      excludeSimilar = false
    } = options;

    let charset = '';
    
    if (includeLowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
    if (includeUppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (includeNumbers) charset += '0123456789';
    if (includeSymbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';

    if (excludeSimilar) {
      charset = charset.replace(/[0O1lI]/g, '');
    }

    if (charset.length === 0) {
      throw new Error('Invalid character set - at least one character type must be included');
    }

    const password = Array.from(crypto.getRandomValues(new Uint8Array(length)))
      .map(byte => charset[byte % charset.length])
      .join('');

    return password;
  }

  /**
   * Calculate password strength with detailed analysis
   */
  analyzePasswordStrength(password: string): {
    score: number;
    strength: 'Very Weak' | 'Weak' | 'Fair' | 'Good' | 'Strong' | 'Very Strong';
    feedback: string[];
    entropy: number;
    crackTime: string;
  } {
    let score = 0;
    const feedback: string[] = [];
    
    // Length analysis
    if (password.length < 8) {
      feedback.push('Password should be at least 8 characters long');
    } else if (password.length < 12) {
      score += 10;
      feedback.push('Consider using a longer password (12+ characters)');
    } else if (password.length >= 16) {
      score += 25;
    } else {
      score += 20;
    }

    // Character variety
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSymbol = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password);

    const charTypes = [hasLower, hasUpper, hasNumber, hasSymbol].filter(Boolean).length;
    score += charTypes * 10;

    if (charTypes < 3) {
      feedback.push('Use a mix of uppercase, lowercase, numbers, and symbols');
    }

    // Pattern detection
    if (/(.)\1{2,}/.test(password)) {
      score -= 10;
      feedback.push('Avoid repeating characters');
    }

    if (/123|abc|qwe/i.test(password)) {
      score -= 15;
      feedback.push('Avoid common sequences');
    }

    // Common password check
    const commonPasswords = ['password', '123456', 'qwerty', 'admin', 'letmein'];
    if (commonPasswords.some(common => password.toLowerCase().includes(common))) {
      score -= 25;
      feedback.push('Avoid common passwords or words');
    }

    // Calculate entropy
    const charset = this.getCharsetSize(password);
    const entropy = Math.log2(Math.pow(charset, password.length));
    
    // Estimate crack time
    const crackTime = this.estimateCrackTime(entropy);

    // Determine strength
    let strength: 'Very Weak' | 'Weak' | 'Fair' | 'Good' | 'Strong' | 'Very Strong';
    if (score < 20) strength = 'Very Weak';
    else if (score < 40) strength = 'Weak';
    else if (score < 60) strength = 'Fair';
    else if (score < 80) strength = 'Good';
    else if (score < 90) strength = 'Strong';
    else strength = 'Very Strong';

    return {
      score: Math.max(0, Math.min(100, score)),
      strength,
      feedback,
      entropy,
      crackTime
    };
  }

  /**
   * Secure memory clearing for sensitive data
   */
  secureMemoryClear(data: string | ArrayBuffer | Uint8Array): void {
    if (typeof data === 'string') {
      // For strings, we can't directly clear memory, but we can try to overwrite
      data = data.replace(/./g, '\0');
    } else if (data instanceof ArrayBuffer) {
      const view = new Uint8Array(data);
      crypto.getRandomValues(view); // Overwrite with random data
      view.fill(0); // Then zero out
    } else if (data instanceof Uint8Array) {
      crypto.getRandomValues(data);
      data.fill(0);
    }
  }

  // Private helper methods
  private validatePassword(password: string): void {
    if (!password || typeof password !== 'string') {
      throw new Error('Password must be a non-empty string');
    }
    if (password.length < 1) {
      throw new Error('Password cannot be empty');
    }
  }

  private validatePlaintext(plaintext: string): void {
    if (typeof plaintext !== 'string') {
      throw new Error('Plaintext must be a string');
    }
  }

  private validateIterations(iterations: number): void {
    if (iterations < 10000) {
      throw new Error('Iteration count too low for security (minimum 10,000)');
    }
    if (iterations > 10000000) {
      throw new Error('Iteration count too high (maximum 10,000,000)');
    }
  }

  private validateEncryptedPayload(payload: EncryptedPayload): void {
    const requiredFields = ['data', 'iv', 'salt', 'iterations', 'algorithm', 'checksum'];
    for (const field of requiredFields) {
      if (!(field in payload)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
  }

  private createCacheKey(password: string, salt: Uint8Array, iterations: number): string {
    const passwordHash = password.substring(0, 8); // Don't cache full password
    const saltHash = Array.from(salt.slice(0, 8)).join('');
    return `${passwordHash}-${saltHash}-${iterations}`;
  }

  private cacheKey(cacheKey: string, secureKey: SecureKey): void {
    if (this.keyCache.size >= this.maxCacheSize) {
      const oldestKey = this.keyCache.keys().next().value;
      if (oldestKey) {
        this.keyCache.delete(oldestKey);
      }
    }
    this.keyCache.set(cacheKey, secureKey);
  }

  /**
   * Encrypt data using provided CryptoKey (for secure auth system)
   */
  async encryptDataWithKey(plaintext: string, cryptoKey: CryptoKey): Promise<EncryptedPayload> {
    this.validatePlaintext(plaintext);

    try {
      const iv = crypto.getRandomValues(new Uint8Array(DEFAULT_IV_LENGTH));
      const encodedData = new TextEncoder().encode(plaintext);
      
      const encryptedBuffer = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        cryptoKey,
        encodedData
      );

      // Generate a random salt for consistency (not used for key derivation)
      const salt = crypto.getRandomValues(new Uint8Array(DEFAULT_SALT_LENGTH));

      const payload: EncryptedPayload = {
        data: this.arrayBufferToBase64(encryptedBuffer),
        iv: this.arrayBufferToBase64(iv.buffer),
        salt: this.arrayBufferToBase64(salt.buffer),
        iterations: 0, // Not applicable for direct key usage
        algorithm: 'AES-GCM',
        keyLength: 256,
        version: ENCRYPTION_VERSION,
        checksum: await this.calculateChecksum(encryptedBuffer, salt, iv)
      };

      return payload;
    } catch (error) {
      console.error('[Crypto] Key-based encryption failed:', error);
      throw new Error('Failed to encrypt data with provided key');
    }
  }

  /**
   * Decrypt data using provided CryptoKey (for secure auth system)
   */
  async decryptDataWithKey(payload: EncryptedPayload, cryptoKey: CryptoKey): Promise<string> {
    this.validateEncryptedPayload(payload);

    try {
      const encryptedData = this.base64ToArrayBuffer(payload.data);
      const iv = new Uint8Array(this.base64ToArrayBuffer(payload.iv));

      // Verify checksum
      const salt = new Uint8Array(this.base64ToArrayBuffer(payload.salt));
      const expectedChecksum = await this.calculateChecksum(encryptedData, salt, iv);
      if (expectedChecksum !== payload.checksum) {
        throw new Error('Data integrity check failed');
      }

      const decryptedBuffer = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        cryptoKey,
        encryptedData
      );

      return new TextDecoder().decode(decryptedBuffer);
    } catch (error) {
      console.error('[Crypto] Key-based decryption failed:', error);
      throw new Error('Failed to decrypt data with provided key');
    }
  }

  private async calculateChecksum(
    data: ArrayBuffer, 
    salt: Uint8Array, 
    iv: Uint8Array
  ): Promise<string> {
    const combined = new Uint8Array(data.byteLength + salt.length + iv.length);
    combined.set(new Uint8Array(data), 0);
    combined.set(salt, data.byteLength);
    combined.set(iv, data.byteLength + salt.length);

    const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
    return this.arrayBufferToBase64(hashBuffer);
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private getCharsetSize(password: string): number {
    let size = 0;
    if (/[a-z]/.test(password)) size += 26;
    if (/[A-Z]/.test(password)) size += 26;
    if (/\d/.test(password)) size += 10;
    if (/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) size += 32;
    return size;
  }

  private estimateCrackTime(entropy: number): string {
    const guessesPerSecond = 1e9; // 1 billion guesses per second
    const seconds = Math.pow(2, entropy - 1) / guessesPerSecond;
    
    if (seconds < 60) return 'Less than a minute';
    if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)} hours`;
    if (seconds < 31536000) return `${Math.round(seconds / 86400)} days`;
    if (seconds < 31536000000) return `${Math.round(seconds / 31536000)} years`;
    return 'Centuries';
  }
}

// Export singleton instance
export const cryptoManager = AdvancedCryptoManager.getInstance();

// Legacy compatibility functions (using new crypto manager)
export async function encryptCredential(plainText: string, masterPassword: string): Promise<string> {
  const payload = await cryptoManager.encryptData(plainText, masterPassword);
  return JSON.stringify(payload);
}

export async function decryptCredential(cipherText: string, masterPassword: string): Promise<string> {
  const payload: EncryptedPayload = JSON.parse(cipherText);
  return await cryptoManager.decryptData(payload, masterPassword);
}

// Enhanced exports
export { AdvancedCryptoManager };
