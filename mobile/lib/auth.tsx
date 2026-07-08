// Auth context for the mobile client. Mirrors the web's two-mode design:
//   • firebase (default): real Firebase Auth; the API receives ID tokens.
//   • dev (EXPO_PUBLIC_AUTH_MODE=dev): a fixed identity for testing against a
//     server running AUTH_MODE=insecure-dev. No Firebase traffic at all.
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { isDevAuth } from "./config";

export interface AuthState {
  status: "loading" | "signed_out" | "signed_in";
  uid: string | null;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
}

const AuthContext = createContext<AuthState>({
  status: "loading",
  uid: null,
  email: null,
  displayName: null,
  emailVerified: false,
});

// getToken is consumed by the API/sync layers outside React — kept module-level.
type FirebaseUser = import("firebase/auth").User;
let currentUser: FirebaseUser | null = null;

export async function getToken(): Promise<string | null> {
  if (isDevAuth) return "dev:devuser:dev@telos.local";
  if (!currentUser) return null;
  return currentUser.getIdToken();
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<void> {
  const { auth } = await import("./firebase");
  const { signInWithEmailAndPassword } = await import("firebase/auth");
  await signInWithEmailAndPassword(auth, email.trim(), password);
}

// Mirrors web/src/lib/firebase.ts's registerWithEmail.
export async function registerWithEmail(
  email: string,
  password: string,
): Promise<void> {
  const { auth } = await import("./firebase");
  const { createUserWithEmailAndPassword, sendEmailVerification } =
    await import("firebase/auth");
  const cred = await createUserWithEmailAndPassword(
    auth,
    email.trim(),
    password,
  );
  // Best-effort: an unverified password account left dangling can later
  // collide with a Google sign-in on the same email (Firebase silently drops
  // the password provider), breaking sign-in on this project's other apps.
  // Never let a failure here block registration.
  try {
    await sendEmailVerification(cred.user);
  } catch (err) {
    console.warn("sendEmailVerification failed", err);
  }
}

export async function resendVerificationEmail(): Promise<void> {
  const { auth } = await import("./firebase");
  const { sendEmailVerification } = await import("firebase/auth");
  if (!auth.currentUser) {
    throw new Error("No current user");
  }
  await sendEmailVerification(auth.currentUser);
}

// Firebase caches the User snapshot, so emailVerified only flips after a
// reload() or a token refresh (~1h). Reload, and if the flag turned true force
// a token refresh so onIdTokenChanged fires and AuthProvider re-reads it.
export async function refreshEmailVerification(): Promise<void> {
  if (isDevAuth) return;
  const { auth } = await import("./firebase");
  const { reload, getIdToken } = await import("firebase/auth");
  const user = auth.currentUser;
  if (!user) return;
  await reload(user);
  if (user.emailVerified) {
    await getIdToken(user, true);
  }
}

export async function signOutUser(): Promise<void> {
  if (isDevAuth) return;
  const { auth } = await import("./firebase");
  const { signOut } = await import("firebase/auth");
  await signOut(auth);
  // Best-effort: clears the native Google session so the account picker
  // reappears next time, instead of silently re-signing the same user in.
  try {
    const { GoogleSignin } = await import(
      "@react-native-google-signin/google-signin"
    );
    await GoogleSignin.signOut();
  } catch {
    // Not configured, not signed in via Google, or native module unavailable.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() =>
    isDevAuth
      ? {
          status: "signed_in",
          uid: "devuser",
          email: "dev@telos.local",
          displayName: "Dev User",
          emailVerified: true,
        }
      : {
          status: "loading",
          uid: null,
          email: null,
          displayName: null,
          emailVerified: false,
        },
  );

  useEffect(() => {
    if (isDevAuth) return;
    let unsub = () => {};
    // Lazy import keeps Firebase off the dev-mode code path entirely.
    void Promise.all([import("./firebase"), import("firebase/auth")]).then(
      ([{ auth }, { onIdTokenChanged }]) => {
        unsub = onIdTokenChanged(auth, (user) => {
          currentUser = user;
          setState(
            user
              ? {
                  status: "signed_in",
                  uid: user.uid,
                  email: user.email,
                  displayName: user.displayName,
                  emailVerified: user.emailVerified ?? false,
                }
              : {
                  status: "signed_out",
                  uid: null,
                  email: null,
                  displayName: null,
                  emailVerified: false,
                },
          );
        });
      },
    );
    return () => unsub();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
