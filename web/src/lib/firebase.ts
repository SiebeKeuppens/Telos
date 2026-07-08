// Firebase is auth-only in Telos (the datastore is the Go API + Postgres).
// Config is env-driven so the project can be swapped without code changes.
import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  reload,
  signOut,
  browserLocalPersistence,
  setPersistence,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
void setPersistence(auth, browserLocalPersistence);

export async function signInWithGoogle() {
  await signInWithPopup(auth, new GoogleAuthProvider());
}

export async function signInWithEmail(email: string, password: string) {
  await signInWithEmailAndPassword(auth, email, password);
}

export async function registerWithEmail(email: string, password: string) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  try {
    await sendEmailVerification(cred.user);
  } catch (err) {
    // Best-effort: registration must succeed even if the verification email
    // fails to send. The persistent banner lets the user retry via resend.
    console.warn("sendEmailVerification failed", err);
  }
}

export async function resendVerificationEmail(): Promise<void> {
  if (!auth.currentUser) {
    throw new Error("No signed-in user to send a verification email to.");
  }
  await sendEmailVerification(auth.currentUser);
}

// Firebase caches the User snapshot, so emailVerified only flips after a
// reload() or a token refresh (~1h). Reload, and if the flag turned true force
// a token refresh so onIdTokenChanged fires and AuthProvider re-reads it.
export async function refreshEmailVerification(): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  await reload(user);
  if (user.emailVerified) {
    await user.getIdToken(true);
  }
}

export async function logOut() {
  await signOut(auth);
}
