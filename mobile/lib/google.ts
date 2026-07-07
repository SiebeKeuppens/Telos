// Native Google sign-in, bridged into Firebase Auth. Only usable in firebase
// auth mode with a web client ID configured — dev mode never touches this.
import { isDevAuth } from "./config";

/** True when the native Google button should be shown at all. */
export function isGoogleSignInAvailable(): boolean {
  return !isDevAuth && !!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
}

export async function signInWithGoogleNative(): Promise<void> {
  const { GoogleSignin } = await import(
    "@react-native-google-signin/google-signin"
  );
  const { auth } = await import("./firebase");
  const { GoogleAuthProvider, signInWithCredential } = await import(
    "firebase/auth"
  );

  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });

  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();

  if (response.type !== "success") {
    // Cancelled — caller treats this as a silent no-op.
    return;
  }

  const idToken = response.data.idToken;
  if (!idToken) {
    throw new Error("Google sign-in did not return an ID token.");
  }

  const credential = GoogleAuthProvider.credential(idToken);
  await signInWithCredential(auth, credential);
}
