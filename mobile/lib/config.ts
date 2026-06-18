// Runtime config, read from EXPO_PUBLIC_* env (inlined by Expo at build time).
// Mirrors the web client's env contract so both front ends hit the same API.

const API_BASE = (
  process.env.EXPO_PUBLIC_API_BASE ?? "https://telos.keuppens.online"
).replace(/\/+$/, "");

export const config = {
  apiBase: API_BASE,
  /** Full base for the versioned API. */
  apiV1: `${API_BASE}/api/v1`,
  /** "dev" bypasses Firebase and sends a dev bearer (server: insecure-dev). */
  authMode: process.env.EXPO_PUBLIC_AUTH_MODE === "dev" ? "dev" : "firebase",
  firebase: {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? "",
  },
} as const;

export const isDevAuth = config.authMode === "dev";
