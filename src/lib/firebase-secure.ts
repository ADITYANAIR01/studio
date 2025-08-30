/**
 * Firebase Configuration and Authentication
 * Handles email authentication and user management
 */

import { initializeApp, type FirebaseApp } from 'firebase/app'
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  AuthError,
  updateProfile,
  UserCredential,
  type Auth
} from 'firebase/auth'
import { getFirestore, collection, doc, setDoc, getDoc, type Firestore } from 'firebase/firestore'
import { encryptCredential, decryptCredential } from './crypto'
// Using user-provided static Firebase config (replaces env-based appConfig.firebase)
const firebaseConfig = {
  apiKey: 'AIzaSyC_wf0Yew8slRJkoIvnH_tmzRZkdnbQXeQ',
  authDomain: 'citadel-guard-nya4s.firebaseapp.com',
  projectId: 'citadel-guard-nya4s',
  storageBucket: 'citadel-guard-nya4s.firebasestorage.app',
  messagingSenderId: '397789642202',
  appId: '1:397789642202:web:99397c09799affb44f14e3'
};

// Initialize Firebase app singleton
let firebaseApp: FirebaseApp | null = null
let firestoreDb: Firestore | null = null
let firebaseAuthInstance: Auth | null = null
let firebaseDisabled = false; // set true if config invalid (dev fallback)

function isValidFirebaseConfig(cfg: { apiKey: string; projectId: string; authDomain: string; appId: string }): boolean {
  if (!cfg.apiKey || !cfg.projectId || !cfg.authDomain || !cfg.appId) return false;
  if (!cfg.apiKey.startsWith('AIza')) return false;
  if (!cfg.authDomain.endsWith('.firebaseapp.com')) return false;
  if (!cfg.appId.includes(':') || !cfg.appId.includes('web:')) return false;
  return true;
}

function getFirebaseApp(): { app: FirebaseApp | null; db: Firestore | null; auth: Auth | null } {
  if (!firebaseApp && !firebaseDisabled) {
  const valid = isValidFirebaseConfig(firebaseConfig);
    if (!valid) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Invalid Firebase configuration. Check environment variables.');
      } else {
        firebaseDisabled = true;
        console.warn('[Firebase] Disabled - missing or invalid config. Set NEXT_PUBLIC_FIREBASE_* vars in .env.local to enable.');
        return { app: null, db: null, auth: null };
      }
    }
    console.log('[Firebase] Initializing with project:', firebaseConfig.projectId);
    firebaseApp = initializeApp(firebaseConfig);
    firestoreDb = getFirestore(firebaseApp);
    firebaseAuthInstance = getAuth(firebaseApp);
  }
  return { app: firebaseApp, db: firestoreDb, auth: firebaseAuthInstance };
}

export function isFirebaseEnabled(): boolean {
  return !firebaseDisabled && !!firebaseApp;
}

// Save encrypted credential for current user
export async function saveCredential(credential: { name: string; username: string; password: string; type?: string; notes?: string }, masterPassword: string) {
  const { auth, db } = getFirebaseApp();
  if (firebaseDisabled || !auth || !db) {
    throw new Error('Firebase is disabled (missing configuration).');
  }
  const user = auth.currentUser
  if (!user) throw new Error('User not authenticated')
  
  const encryptedPassword = encryptCredential(credential.password, masterPassword)
  const credentialData = {
    name: credential.name,
    username: credential.username,
    encryptedPassword,
    type: credential.type || '',
    notes: credential.notes || ''
  }
  
  const credRef = doc(collection(doc(collection(db, 'users'), user.uid), 'credentials'))
  await setDoc(credRef, credentialData)
  return credRef.id
}

// Retrieve and decrypt credential for current user
export async function getCredential(credentialId: string, masterPassword: string) {
  const { auth, db } = getFirebaseApp();
  if (firebaseDisabled || !auth || !db) {
    throw new Error('Firebase is disabled (missing configuration).');
  }
  const user = auth.currentUser
  if (!user) throw new Error('User not authenticated')
  
  const credRef = doc(collection(doc(collection(db, 'users'), user.uid), 'credentials'), credentialId)
  const credSnap = await getDoc(credRef)
  if (!credSnap.exists()) throw new Error('Credential not found')
  
  const data = credSnap.data()
  return {
    name: data.name,
    username: data.username,
    password: decryptCredential(data.encryptedPassword, masterPassword),
    type: data.type,
    notes: data.notes
  }
}

export async function signInWithEmail(email: string, password: string): Promise<UserCredential> {
  const { auth } = getFirebaseApp();
  if (firebaseDisabled || !auth) {
    throw new Error('Firebase auth disabled (missing configuration).');
  }
  return await signInWithEmailAndPassword(auth, email, password)
}

export async function signUpWithEmail(email: string, password: string): Promise<UserCredential> {
  const { auth } = getFirebaseApp();
  if (firebaseDisabled || !auth) {
    throw new Error('Firebase auth disabled (missing configuration).');
  }
  return await createUserWithEmailAndPassword(auth, email, password);
}

export async function signOutUser(): Promise<void> {
  const { auth } = getFirebaseApp();
  if (firebaseDisabled || !auth) return; // nothing to do
  return await signOut(auth)
}

// Types for authentication
export interface AuthResult {
  success: boolean
  user?: User
  error?: string
}

export interface UserSession {
  uid: string
  email: string
  emailVerified: boolean
  displayName?: string
  createdAt: string
  lastLoginAt: string
}

/**
 * Firebase Authentication Service
 */
export class FirebaseAuthService {
  private static instance: FirebaseAuthService
  private currentUser: User | null = null
  private authStateListeners: ((user: User | null) => void)[] = []

  static getInstance(): FirebaseAuthService {
    if (!FirebaseAuthService.instance) {
      FirebaseAuthService.instance = new FirebaseAuthService()
    }
    return FirebaseAuthService.instance
  }

  constructor() {
    // Listen for authentication state changes
    const { auth } = getFirebaseApp();
    if (!auth) {
      console.warn('[FirebaseAuthService] Auth listener not attached (firebase disabled).');
    } else {
      onAuthStateChanged(auth, (user) => {
        this.currentUser = user
        this.notifyAuthStateListeners(user)
      })
    }
  }

  /**
   * Sign in with email and password
   */
  async signIn(email: string, password: string): Promise<AuthResult> {
    try {
      const { auth } = getFirebaseApp();
      if (!auth) {
        return { success: false, error: 'Firebase disabled - cannot sign in' };
      }
      const userCredential = await signInWithEmailAndPassword(auth, email, password)
      return {
        success: true,
        user: userCredential.user
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleAuthError(error as AuthError)
      }
    }
  }

  /**
   * Sign out current user
   */
  async signOut(): Promise<AuthResult> {
    try {
      const { auth } = getFirebaseApp();
      if (auth) {
        await signOut(auth)
      }
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: this.handleAuthError(error as AuthError)
      }
    }
  }

  /**
   * Get current authenticated user
   */
  getCurrentUser(): User | null {
    return this.currentUser
  }

  /**
   * Get user session information
   */
  getUserSession(): UserSession | null {
    if (!this.currentUser) return null

    return {
      uid: this.currentUser.uid,
      email: this.currentUser.email!,
      emailVerified: this.currentUser.emailVerified,
      displayName: this.currentUser.displayName || undefined,
      createdAt: this.currentUser.metadata.creationTime!,
      lastLoginAt: this.currentUser.metadata.lastSignInTime!
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.currentUser !== null
  }

  /**
   * Wait for authentication state to be determined
   */
  waitForAuthState(): Promise<User | null> {
    return new Promise((resolve) => {
      const { auth } = getFirebaseApp();
      if (!auth) {
        resolve(null);
        return;
      }
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe()
        resolve(user)
      })
    })
  }

  /**
   * Add authentication state listener
   */
  addAuthStateListener(callback: (user: User | null) => void): () => void {
    this.authStateListeners.push(callback)
    
    // Return unsubscribe function
    return () => {
      const index = this.authStateListeners.indexOf(callback)
      if (index > -1) {
        this.authStateListeners.splice(index, 1)
      }
    }
  }

  /**
   * Notify all auth state listeners
   */
  private notifyAuthStateListeners(user: User | null): void {
    this.authStateListeners.forEach(listener => listener(user))
  }

  /**
   * Handle Firebase authentication errors
   */
  private handleAuthError(error: AuthError): string {
    switch (error.code) {
      case 'auth/user-not-found':
        return 'No account found with this email address'
      case 'auth/wrong-password':
        return 'Incorrect password'
      case 'auth/email-already-in-use':
        return 'An account with this email already exists'
      case 'auth/weak-password':
        return 'Password should be at least 6 characters'
      case 'auth/invalid-email':
        return 'Invalid email address'
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Please try again later'
      case 'auth/network-request-failed':
        return 'Network error. Please check your connection'
      case 'auth/user-disabled':
        return 'This account has been disabled'
      case 'auth/invalid-credential':
        return 'Invalid credentials provided'
      default:
        console.error('Firebase Auth Error:', error)
        return 'Authentication failed. Please try again'
    }
  }
}

// Export singleton instance
export const firebaseAuth = FirebaseAuthService.getInstance()

// Export the Firebase app components for direct use if needed
const core = getFirebaseApp();
export const app = core.app as FirebaseApp | null;
export const db = core.db as Firestore | null;
export const auth = core.auth as Auth | null;

// Additional exports for universal access system compatibility
export const secureFirebaseAuth = {
  getInstance: () => ({ /* placeholder for compatibility */ })
};

export async function getAllCredentials(): Promise<any[]> {
  // Placeholder function for backup compatibility
  console.log('getAllCredentials called - this is a placeholder');
  return [];
}
