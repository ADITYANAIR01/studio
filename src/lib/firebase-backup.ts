/**
 * Firebase Configuration and Authentication
 * Handles email authentication and user management
 */

import { initializeApp } from 'firebase/app'
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut,
  onAuthStateChanged,
  User,
  AuthError,
  updateProfile,
  UserCredential
} from 'firebase/auth'
import { getFirestore, collection, doc, setDoc, getDoc } from 'firebase/firestore';
import { encryptCredential, decryptCredential } from './crypto';

const db = getFirestore();

// Save encrypted credential for current user
export async function saveCredential(credential: { name: string; username: string; password: string; type?: string; notes?: string }, masterPassword: string) {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  const encryptedPassword = encryptCredential(credential.password, masterPassword);
  const credentialData = {
    name: credential.name,
    username: credential.username,
    import type { FirebaseApp } from 'firebase/app';
    import type { Firestore } from 'firebase/firestore';
    import type { Auth } from 'firebase/auth';

    let app: FirebaseApp | null = null;
    let db: Firestore | null = null;
    let auth: Auth | null = null;

    function getFirebaseApp(): { app: FirebaseApp; db: Firestore; auth: Auth } {
      if (!app) {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
      }
      // Type assertion since we guarantee initialization above
      return { app: app as FirebaseApp, db: db as Firestore, auth: auth as Auth };
    }
    type: credential.type || '',
    notes: credential.notes || ''
  import type { FirebaseApp } from 'firebase/app';
  import type { Firestore } from 'firebase/firestore';
  import type { Auth } from 'firebase/auth';
  };
  let firebaseApp: FirebaseApp | null = null;
  let firestoreDb: Firestore | null = null;
  let firebaseAuth: Auth | null = null;

  function getFirebaseApp(): { app: FirebaseApp; db: Firestore; auth: Auth } {
    if (!firebaseApp) {
      firebaseApp = initializeApp(firebaseConfig);
      firestoreDb = getFirestore(firebaseApp);
      firebaseAuth = getAuth(firebaseApp);
    }
    return { app: firebaseApp as FirebaseApp, db: firestoreDb as Firestore, auth: firebaseAuth as Auth };
  }
      const user = auth.currentUser;
  return credRef.id;
    const { auth, db } = getFirebaseApp();
    const user = auth.currentUser;
// Retrieve and decrypt credential for current user
export async function getCredential(credentialId: string, masterPassword: string) {
  const { auth, db } = getFirebaseApp();
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  const credRef = doc(collection(doc(collection(db, 'users'), user.uid), 'credentials'), credentialId);
  const credSnap = await getDoc(credRef);
  if (!credSnap.exists()) throw new Error('Credential not found');
  const data = credSnap.data();
  return {
    name: data.name,
    username: data.username,
    password: decryptCredential(data.encryptedPassword, masterPassword),
      const { auth, db } = getFirebaseApp();
      const user = auth.currentUser;
  };
}
// ...existing code...

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyC_wf0Yew8slRJkoIvnH_tmzRZkdnbQXeQ",
  authDomain: "citadel-guard-nya4s.firebaseapp.com",
  projectId: "citadel-guard-nya4s",
  storageBucket: "citadel-guard-nya4s.firebasestorage.app",
  messagingSenderId: "397789642202",
  appId: "1:397789642202:web:99397c09799affb44f14e3"
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)



export async function signInWithEmail(email: string, password: string): Promise<UserCredential> {
  const { auth } = getFirebaseApp();
  return await signInWithEmailAndPassword(auth, email, password);
}

export async function signOutUser(): Promise<void> {
  const { auth } = getFirebaseApp();
  return await signOut(auth);
}

// Types for authentication
      const { auth } = getFirebaseApp();
      return await signInWithEmailAndPassword(auth, email, password);
  success: boolean
  user?: User
  error?: string
      const { auth } = getFirebaseApp();
      return await signOut(auth);

export interface UserSession {
  uid: string
        const { auth } = getFirebaseApp();
        onAuthStateChanged(auth, (user) => {
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
  onAuthStateChanged(auth, (user) => {
      this.currentUser = user
      this.notifyAuthStateListeners(user)
    })
  }



  /**
   * Sign in with email and password
   */
  async signIn(email: string, password: string): Promise<AuthResult> {
    try {
  const { auth } = getFirebaseApp();
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
  await signOut(auth)
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
