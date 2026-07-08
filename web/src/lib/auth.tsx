// Auth context. Two modes:
//  - firebase (default): real Firebase Auth; the API receives ID tokens.
//  - dev (VITE_AUTH_MODE=dev): a fixed local identity for development against
//    a server running AUTH_MODE=insecure-dev. No Firebase traffic at all.
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onIdTokenChanged, type User as FirebaseUser } from "firebase/auth";

const DEV_MODE = import.meta.env.VITE_AUTH_MODE === "dev";

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

// getToken is used by the API layer outside React — kept module-level.
let currentUser: FirebaseUser | null = null;

export async function getToken(): Promise<string | null> {
  if (DEV_MODE) return "dev:devuser:dev@telos.local";
  if (!currentUser) return null;
  return currentUser.getIdToken();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() =>
    DEV_MODE
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
    if (DEV_MODE) return;
    let unsub = () => {};
    // Lazy import keeps Firebase out of the bundle path in dev mode.
    void import("./firebase").then(({ auth }) => {
      unsub = onIdTokenChanged(auth, (user) => {
        currentUser = user;
        setState(
          user
            ? {
                status: "signed_in",
                uid: user.uid,
                email: user.email,
                displayName: user.displayName,
                emailVerified: user.emailVerified,
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
    });
    return () => unsub();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
