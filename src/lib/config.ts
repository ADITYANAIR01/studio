/**
 * Secure Configuration Management
 * Validates and manages environment variables with security checks
 */

export interface SecurityConfig {
  encryptionIterations: number;
  maxLoginAttempts: number;
  lockoutDuration: number;
  sessionTimeout: number;
  idleTimeout: number;
  securityLevel: 'low' | 'medium' | 'high' | 'maximum';
  enableSecurityHeaders: boolean;
}

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface AppConfig {
  firebase: FirebaseConfig;
  security: SecurityConfig;
  environment: 'development' | 'production' | 'test';
  version: string;
}

const firebaseConfig: FirebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

class ConfigManager {
  private static instance: ConfigManager;
  private config: AppConfig | null = null;
  private isValidated = false;
  private initializationError: Error | null = null;

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Check if we're in a browser environment
   */
  private isBrowser(): boolean {
    return typeof window !== 'undefined';
  }

  /**
   * Initialize and validate configuration
   */
  initialize(): AppConfig {
    if (this.config && this.isValidated) {
      return this.config;
    }

    try {
      this.config = this.loadConfiguration();
      this.validateConfiguration(this.config);
      this.isValidated = true;

      // Log configuration status (without sensitive data)
      console.log('[Config] Configuration loaded successfully', {
        environment: this.config.environment,
        securityLevel: this.config.security.securityLevel,
        projectId: this.config.firebase.projectId,
        version: this.config.version
      });

      return this.config;
    } catch (error) {
      this.initializationError = error as Error;
      
      // If we're in the browser and this is an env var issue, provide fallback
      if (this.isBrowser()) {
        console.warn('[Config] Failed to load environment variables in browser, using fallback configuration');
        return this.getFallbackConfig();
      }
      
      throw error;
    }
  }

  /**
   * Get fallback configuration for client-side when env vars aren't available
   */
  private getFallbackConfig(): AppConfig {
    return {
      firebase: {
        apiKey: '',
        authDomain: '',
        projectId: '',
        storageBucket: '',
        messagingSenderId: '',
        appId: ''
      },
      security: {
        encryptionIterations: 300000,
        maxLoginAttempts: 5,
        lockoutDuration: 900000,
        sessionTimeout: 3600000,
        idleTimeout: 1800000,
        securityLevel: 'high',
        enableSecurityHeaders: true
      },
      environment: 'development',
      version: '1.0.0'
    };
  }

  /**
   * Get configuration (must be initialized first)
   */
  getConfig(): AppConfig {
    if (!this.config || !this.isValidated) {
      throw new Error('Configuration not initialized. Call initialize() first.');
    }
    return this.config;
  }

  /**
   * Load configuration from environment variables
   */
  private loadConfiguration(): AppConfig {
    // Determine environment early
    const environment = (process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV || 'development') as AppConfig['environment'];

    // Helper to optionally be lenient in non-production
    const allowMissing = environment !== 'production';
    const missing: string[] = [];

    const safeGet = (name: string) => {
      const v = process.env[name];
      if (!v) {
        if (allowMissing) {
          missing.push(name);
          return '';
        }
        return this.getRequiredEnvVar(name); // will throw
      }
      return v;
    };

    const firebase: FirebaseConfig = {
      apiKey: safeGet('NEXT_PUBLIC_FIREBASE_API_KEY'),
      authDomain: safeGet('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'),
      projectId: safeGet('NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
      storageBucket: safeGet('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'),
      messagingSenderId: safeGet('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
      appId: safeGet('NEXT_PUBLIC_FIREBASE_APP_ID')
    };

    const security: SecurityConfig = {
      encryptionIterations: parseInt(process.env.NEXT_PUBLIC_ENCRYPTION_ITERATIONS || '300000'),
      maxLoginAttempts: parseInt(process.env.NEXT_PUBLIC_MAX_LOGIN_ATTEMPTS || '5'),
      lockoutDuration: parseInt(process.env.NEXT_PUBLIC_LOCKOUT_DURATION || '900000'),
      sessionTimeout: parseInt(process.env.NEXT_PUBLIC_SESSION_TIMEOUT || '3600000'),
      idleTimeout: parseInt(process.env.NEXT_PUBLIC_IDLE_TIMEOUT || '1800000'),
      securityLevel: (process.env.NEXT_PUBLIC_SECURITY_LEVEL || 'high') as SecurityConfig['securityLevel'],
      enableSecurityHeaders: process.env.NEXT_PUBLIC_ENABLE_SECURITY_HEADERS === 'true'
    };

    const config: AppConfig = {
      firebase,
      security,
      environment,
      version: process.env.npm_package_version || '1.0.0'
    };

    if (missing.length) {
      console.warn('[Config] Missing environment variables (development fallback in use):', missing);
      console.warn('[Config] Firebase features will be disabled until you provide the above in .env.local');
    }

    return config;
  }

  /**
   * Get required environment variable with validation
   */
  private getRequiredEnvVar(name: string): string {
    const value = process.env[name];
    if (!value) {
      console.error(`Missing environment variable: ${name}`);
      console.error('Available environment variables:', Object.keys(process.env).filter(key => key.startsWith('NEXT_PUBLIC_')));
      throw new Error(`Required environment variable ${name} is not set`);
    }
    return value;
  }

  /**
   * Validate configuration integrity and security
   */
  private validateConfiguration(config: AppConfig): void {
    // Validate Firebase configuration
    this.validateFirebaseConfig(config.firebase);
    
    // Validate security configuration
    this.validateSecurityConfig(config.security);
    
    // Environment-specific validations
    this.validateEnvironmentConfig(config);
  }

  /**
   * Validate Firebase configuration
   */
  private validateFirebaseConfig(firebase: FirebaseConfig): void {
    // Validate API key format
    if (!firebase.apiKey.startsWith('AIza') || firebase.apiKey.length < 35) {
      throw new Error('Invalid Firebase API key format');
    }

    // Validate auth domain
    if (!firebase.authDomain.endsWith('.firebaseapp.com')) {
      throw new Error('Invalid Firebase auth domain format');
    }

    // Validate project ID format
    if (!/^[a-z0-9-]+$/.test(firebase.projectId)) {
      throw new Error('Invalid Firebase project ID format');
    }

    // Validate app ID format
    if (!firebase.appId.includes(':') || !firebase.appId.includes('web:')) {
      throw new Error('Invalid Firebase app ID format');
    }
  }

  /**
   * Validate security configuration
   */
  private validateSecurityConfig(security: SecurityConfig): void {
    // Validate encryption iterations (minimum for security)
    if (security.encryptionIterations < 100000) {
      throw new Error('Encryption iterations must be at least 100,000 for security');
    }

    // Validate rate limiting
    if (security.maxLoginAttempts < 3 || security.maxLoginAttempts > 10) {
      throw new Error('Max login attempts must be between 3 and 10');
    }

    if (security.lockoutDuration < 300000) { // 5 minutes minimum
      throw new Error('Lockout duration must be at least 5 minutes');
    }

    // Validate session timeouts
    if (security.sessionTimeout < 900000) { // 15 minutes minimum
      throw new Error('Session timeout must be at least 15 minutes');
    }

    if (security.idleTimeout > security.sessionTimeout) {
      throw new Error('Idle timeout cannot be longer than session timeout');
    }

    // Validate security level
    const validSecurityLevels = ['low', 'medium', 'high', 'maximum'];
    if (!validSecurityLevels.includes(security.securityLevel)) {
      throw new Error(`Security level must be one of: ${validSecurityLevels.join(', ')}`);
    }
  }

  /**
   * Validate environment-specific configuration
   */
  private validateEnvironmentConfig(config: AppConfig): void {
    if (config.environment === 'production') {
      // Production-specific validations
      if (config.security.securityLevel === 'low') {
        throw new Error('Production environment cannot use low security level');
      }

      if (config.security.maxLoginAttempts > 5) {
        console.warn('[Config] High max login attempts in production may be risky');
      }

      if (!config.security.enableSecurityHeaders) {
        console.warn('[Config] Security headers should be enabled in production');
      }
    }

    if (config.environment === 'development') {
      // Development-specific warnings
      if (config.security.securityLevel === 'maximum') {
        console.warn('[Config] Maximum security level may slow down development');
      }
    }
  }

  /**
   * Get security configuration based on current environment
   */
  getSecurityDefaults(): Partial<SecurityConfig> {
    const env = this.config?.environment || 'development';
    
    switch (env) {
      case 'production':
        return {
          encryptionIterations: 500000,
          maxLoginAttempts: 3,
          lockoutDuration: 1800000, // 30 minutes
          sessionTimeout: 1800000,   // 30 minutes
          idleTimeout: 900000,       // 15 minutes
          securityLevel: 'maximum',
          enableSecurityHeaders: true
        };
      
      case 'development':
        return {
          encryptionIterations: 100000,
          maxLoginAttempts: 10,
          lockoutDuration: 300000,   // 5 minutes
          sessionTimeout: 7200000,   // 2 hours
          idleTimeout: 3600000,      // 1 hour
          securityLevel: 'medium',
          enableSecurityHeaders: false
        };
      
      default:
        return {
          encryptionIterations: 300000,
          maxLoginAttempts: 5,
          lockoutDuration: 900000,
          sessionTimeout: 3600000,
          idleTimeout: 1800000,
          securityLevel: 'high',
          enableSecurityHeaders: true
        };
    }
  }

  /**
   * Check if current environment is production
   */
  isProduction(): boolean {
    return this.getConfig().environment === 'production';
  }

  /**
   * Check if current environment is development
   */
  isDevelopment(): boolean {
    return this.getConfig().environment === 'development';
  }
}

// Export singleton instance
export const configManager = ConfigManager.getInstance();

// Create a function to get config safely
export const getAppConfig = (): AppConfig => {
  return configManager.initialize();
};

// For components that need immediate access, try to initialize but provide fallback
let _cachedConfig: AppConfig | null = null;

export const appConfig = new Proxy({} as AppConfig, {
  get(target, prop) {
    if (!_cachedConfig) {
      try {
        _cachedConfig = configManager.initialize();
      } catch (error) {
        console.warn('[Config] Using fallback config due to initialization error:', error);
        _cachedConfig = {
          firebase: {
            apiKey: '',
            authDomain: '',
            projectId: '',
            storageBucket: '',
            messagingSenderId: '',
            appId: ''
          },
          security: {
            encryptionIterations: 300000,
            maxLoginAttempts: 5,
            lockoutDuration: 900000,
            sessionTimeout: 3600000,
            idleTimeout: 1800000,
            securityLevel: 'high',
            enableSecurityHeaders: true
          },
          environment: 'development',
          version: '1.0.0'
        };
      }
    }
    return _cachedConfig[prop as keyof AppConfig];
  }
});
