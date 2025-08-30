/**
 * Simplified Authentication Context
 * Basic auth structure ready for backend integration
 */

'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { signInWithEmail, signUpWithEmail, signOutUser } from '@/lib/firebase';
import { MasterPasswordService } from '@/services/MasterPasswordService';
import { SecureVaultManager } from '@/lib/crypto';

// Basic authentication types
export interface AuthState {
  user: any | null;
  isAuthenticated: boolean;
  isVaultUnlocked: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface AuthActions {
  // Registration
  registerUser: (email: string, password: string, masterPassword: string) => Promise<void>;
  
  // Authentication
  signIn: (email: string, password: string, masterPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
  // Legacy name used in some components
  logout: () => Promise<void>;
  
  // Vault management
  lockVault: () => void;
  checkVaultStatus: () => boolean;
  unlockVault: (masterPassword: string) => Promise<boolean>;
  requiresMasterPasswordSetup: () => boolean;
  
  // Error handling
  clearError: () => void;
}

export type AuthContextType = AuthState & AuthActions;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isVaultUnlocked: false,
    isLoading: true,
    error: null
  });

  // Initialize auth state
  useEffect(() => {
    // Simulate checking existing session
    setTimeout(() => {
      setState(prev => ({ ...prev, isLoading: false }));
    }, 1000);
  }, []);

  const masterPasswordServiceRef = React.useRef<MasterPasswordService | null>(null);
  if (!masterPasswordServiceRef.current && typeof window !== 'undefined') {
    masterPasswordServiceRef.current = MasterPasswordService.getInstance();
  }

  const registerUser = async (email: string, password: string, masterPassword: string): Promise<void> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const cred = await signUpWithEmail(email, password);
      // Setup master password (one-time)
      await masterPasswordServiceRef.current?.setupMasterPassword(masterPassword);
      setState(prev => ({
        ...prev,
        user: cred.user,
        isAuthenticated: true,
        isVaultUnlocked: true,
        isLoading: false
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Registration failed',
        isLoading: false
      }));
      throw error;
    }
  };

  const signIn = async (email: string, password: string, masterPassword: string): Promise<void> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const cred = await signInWithEmail(email, password);
      // Unlock vault using provided master password
      const unlocked = await SecureVaultManager.getInstance().unlockVault(masterPassword);
      if (!unlocked) {
        throw new Error('Failed to unlock vault with provided master password');
      }
      setState(prev => ({
        ...prev,
        user: cred.user,
        isAuthenticated: true,
        isVaultUnlocked: true,
        isLoading: false
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Sign-in failed',
        isLoading: false
      }));
      throw error;
    }
  };

  const signOut = async (): Promise<void> => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      await signOutUser();
      SecureVaultManager.getInstance().lockVault();
      setState({
        user: null,
        isAuthenticated: false,
        isVaultUnlocked: false,
        isLoading: false,
        error: null
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Sign-out failed',
        isLoading: false
      }));
      throw error;
    }
  };

  const lockVault = (): void => {
    SecureVaultManager.getInstance().lockVault();
    setState(prev => ({ ...prev, isVaultUnlocked: false }));
  };

  const checkVaultStatus = (): boolean => {
    return state.isVaultUnlocked;
  };

  const unlockVault = async (masterPassword: string): Promise<boolean> => {
    try {
      const result = await masterPasswordServiceRef.current?.unlockVault(masterPassword);
      if (result?.success) {
        setState(prev => ({ ...prev, isVaultUnlocked: true }));
        return true;
      }
      if (result?.requiresSetup) {
        setState(prev => ({ ...prev, error: 'Master password setup required' }));
      } else if (result?.error) {
        setState(prev => ({ ...prev, error: result.error || null }));
      }
      return false;
    } catch (e) {
      setState(prev => ({ ...prev, error: 'Vault unlock failed' }));
      return false;
    }
  };

  const requiresMasterPasswordSetup = (): boolean => {
    return masterPasswordServiceRef.current?.requiresMasterPasswordSetup() || false;
  };

  const clearError = (): void => {
    setState(prev => ({ ...prev, error: null }));
  };

  const contextValue: AuthContextType = {
    ...state,
    registerUser,
    signIn,
    signOut,
  logout: signOut,
    lockVault,
    checkVaultStatus,
  unlockVault,
  requiresMasterPasswordSetup,
    clearError
  };

  return (
    <AuthContext.Provider value={contextValue}>
  {/* Ensure multiple direct children get stable implicit keys to avoid React key warnings */}
  {React.Children.toArray(children)}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthProvider;
