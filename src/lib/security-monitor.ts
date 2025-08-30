/**
 * Production Security Monitor
 * Detects and prevents security vulnerabilities in production
 */

import { appConfig } from './config';

export interface SecurityEvent {
  type: 'debug_access_attempt' | 'dev_function_call' | 'suspicious_activity' | 'tamper_detection';
  timestamp: number;
  details: string;
  userAgent?: string;
  location?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export class ProductionSecurityMonitor {
  private static instance: ProductionSecurityMonitor;
  private events: SecurityEvent[] = [];
  private readonly maxEvents = 100;
  private alertThreshold = 5; // Alert after 5 suspicious events

  static getInstance(): ProductionSecurityMonitor {
    if (!ProductionSecurityMonitor.instance) {
      ProductionSecurityMonitor.instance = new ProductionSecurityMonitor();
    }
    return ProductionSecurityMonitor.instance;
  }

  constructor() {
    if (appConfig.environment === 'production') {
      this.initializeProductionSecurity();
    }
  }

  /**
   * Initialize production security measures
   */
  private initializeProductionSecurity(): void {
    // Block debug access attempts
    this.blockDebugAccess();
    
    // Monitor for tampering
    this.setupTamperDetection();
    
    // Monitor network requests
    this.setupRequestMonitoring();
    
    // Setup console protection
    this.setupConsoleProtection();

    console.log('[Security] Production security monitoring active');
  }

  /**
   * Block debug access attempts
   */
  private blockDebugAccess(): void {
    if (typeof window === 'undefined') return;

    // Block common debug properties
    const blockedProps = [
      'debugMasterPassword',
      'resetMasterPassword',
      '__REACT_DEVTOOLS_GLOBAL_HOOK__',
      '__REDUX_DEVTOOLS_EXTENSION__',
      'webkitStorageInfo'
    ];

    blockedProps.forEach(prop => {
      Object.defineProperty(window, prop, {
        get: () => {
          this.logSecurityEvent({
            type: 'debug_access_attempt',
            timestamp: Date.now(),
            details: `Attempt to access blocked property: ${prop}`,
            userAgent: navigator.userAgent,
            severity: 'medium'
          });
          return undefined;
        },
        set: () => {
          this.logSecurityEvent({
            type: 'debug_access_attempt',
            timestamp: Date.now(),
            details: `Attempt to set blocked property: ${prop}`,
            userAgent: navigator.userAgent,
            severity: 'high'
          });
        },
        configurable: false
      });
    });

    // Block eval and Function constructor
    window.eval = new Proxy(window.eval, {
      apply: () => {
        this.logSecurityEvent({
          type: 'suspicious_activity',
          timestamp: Date.now(),
          details: 'Attempt to use eval() - blocked',
          severity: 'critical'
        });
        throw new Error('eval() is disabled for security');
      }
    });
  }

  /**
   * Setup tamper detection
   */
  private setupTamperDetection(): void {
    if (typeof window === 'undefined') return;

    // Monitor for script injection
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            if (element.tagName === 'SCRIPT') {
              this.logSecurityEvent({
                type: 'tamper_detection',
                timestamp: Date.now(),
                details: `Script injection detected: ${element.getAttribute('src') || 'inline'}`,
                severity: 'critical'
              });
            }
          }
        });
      });
    });

    observer.observe(document, {
      childList: true,
      subtree: true
    });

    // Monitor for developer tools
    let devtools = { open: false, orientation: null };
    
    const threshold = 160;
    
    setInterval(() => {
      if (window.outerHeight - window.innerHeight > threshold || 
          window.outerWidth - window.innerWidth > threshold) {
        if (!devtools.open) {
          devtools.open = true;
          this.logSecurityEvent({
            type: 'debug_access_attempt',
            timestamp: Date.now(),
            details: 'Developer tools opened',
            severity: 'medium'
          });
        }
      } else {
        devtools.open = false;
      }
    }, 500);
  }

  /**
   * Setup request monitoring
   */
  private setupRequestMonitoring(): void {
    if (typeof window === 'undefined') return;

    // Monitor fetch requests
    const originalFetch = window.fetch;
    window.fetch = new Proxy(originalFetch, {
      apply: async (target, thisArg, args) => {
        const [url] = args;
        
        // Check for suspicious URLs
        if (typeof url === 'string' && this.isSuspiciousUrl(url)) {
          this.logSecurityEvent({
            type: 'suspicious_activity',
            timestamp: Date.now(),
            details: `Suspicious fetch request: ${url}`,
            severity: 'high'
          });
        }

        return target.apply(thisArg, args as [RequestInfo | URL, RequestInit?]);
      }
    });

    // Monitor XMLHttpRequest
    const originalXHR = window.XMLHttpRequest;
    const monitor = this;
    window.XMLHttpRequest = class extends originalXHR {
      open(method: string, url: string | URL, async?: boolean, user?: string | null, password?: string | null) {
        if (typeof url === 'string' && monitor.isSuspiciousUrl(url)) {
          monitor.logSecurityEvent({
            type: 'suspicious_activity',
            timestamp: Date.now(),
            details: `Suspicious XHR request: ${url}`,
            severity: 'high'
          });
        }
        return super.open(method, url, async ?? true, user, password);
      }
    };
  }

  /**
   * Setup console protection
   */
  private setupConsoleProtection(): void {
    if (typeof window === 'undefined') return;

    // Override console methods
    const originalConsole = { ...console };
    
    ['log', 'warn', 'error', 'debug', 'info'].forEach(method => {
      console[method as keyof Console] = new Proxy(originalConsole[method as keyof Console], {
        apply: (target, thisArg, args) => {
          // In production, limit console output
          if (args.some(arg => typeof arg === 'string' && arg.includes('[Dev]'))) {
            return; // Block development console logs
          }
          
          return (target as Function).apply(thisArg, args);
        }
      }) as any;
    });
  }

  /**
   * Log security event
   */
  private logSecurityEvent(event: SecurityEvent): void {
    this.events.push(event);
    
    // Keep only the most recent events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Check for alert threshold
    const recentEvents = this.events.filter(e => 
      Date.now() - e.timestamp < 300000 // Last 5 minutes
    );

    if (recentEvents.length >= this.alertThreshold) {
      this.triggerSecurityAlert(recentEvents);
    }

    // Log to secure endpoint if available
    this.reportSecurityEvent(event);
  }

  /**
   * Check if URL is suspicious
   */
  private isSuspiciousUrl(url: string): boolean {
    const suspiciousPatterns = [
      /localhost:\d+(?!:9002)/, // Localhost on unexpected ports
      /127\.0\.0\.1/,
      /192\.168\./,
      /10\./,
      /\.ngrok\./,
      /webhook\.site/,
      /requestbin/,
      /evil/,
      /hack/,
      /steal/
    ];

    return suspiciousPatterns.some(pattern => pattern.test(url));
  }

  /**
   * Trigger security alert
   */
  private triggerSecurityAlert(events: SecurityEvent[]): void {
    console.error('[SECURITY ALERT] Multiple suspicious events detected:', events.length);
    
    // In a real implementation, this would:
    // 1. Send alert to security team
    // 2. Lock user session
    // 3. Trigger additional monitoring
    
    // For now, we'll just log and potentially lock the app
    if (events.some(e => e.severity === 'critical')) {
      this.lockApplication();
    }
  }

  /**
   * Lock application due to security threat
   */
  private lockApplication(): void {
    console.error('[SECURITY] Application locked due to security threat');
    
    // Clear sensitive data
    try {
      // TODO: Update to use new auth system when available
      // const { masterPasswordService } = require('../services/MasterPasswordService');
      // masterPasswordService.lockVault();
    } catch (error) {
      // Continue with lockdown even if vault lock fails
    }

    // Redirect to security page
    if (typeof window !== 'undefined') {
      window.location.href = '/security-lockdown';
    }
  }

  /**
   * Report security event to monitoring service
   */
  private async reportSecurityEvent(event: SecurityEvent): Promise<void> {
    try {
      // In production, this would send to your security monitoring service
      // For now, we'll just store locally and log
      
      const reportData = {
        ...event,
        sessionId: this.getSessionId(),
        appVersion: appConfig.version,
        environment: appConfig.environment
      };

      // Could send to Firebase Analytics, Sentry, or custom endpoint
      console.warn('[Security] Event logged:', reportData.type);
    } catch (error) {
      // Silently fail to avoid revealing monitoring
    }
  }

  /**
   * Get or create session ID
   */
  private getSessionId(): string {
    if (typeof window === 'undefined') return 'server';
    
    let sessionId = sessionStorage.getItem('security_session_id');
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem('security_session_id', sessionId);
    }
    return sessionId;
  }

  /**
   * Get security events for debugging (development only)
   */
  getSecurityEvents(): SecurityEvent[] {
    if (appConfig.environment === 'development') {
      return [...this.events];
    }
    return [];
  }
}

// Initialize security monitor
export const securityMonitor = ProductionSecurityMonitor.getInstance();
