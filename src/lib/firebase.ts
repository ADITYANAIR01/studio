// Lightweight compatibility layer re-exporting secure firebase utilities
// Ensures existing dynamic imports '@/lib/firebase' resolve.

export { 
  saveCredential, 
  getCredential, 
  signInWithEmail, 
  signUpWithEmail,
  signOutUser, 
  FirebaseAuthService, 
  firebaseAuth, 
  getAllCredentials,
  db, app, auth,
  isFirebaseEnabled
} from './firebase-secure';
