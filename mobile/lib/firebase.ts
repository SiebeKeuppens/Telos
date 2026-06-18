// Firebase Auth for React Native. Persistence is backed by AsyncStorage so a
// signed-in session survives app restarts. Only initialised in firebase auth
// mode — dev mode never touches Firebase.
import { getApp, getApps, initializeApp } from "firebase/app";
import * as fbAuth from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { config } from "./config";

const app = getApps().length ? getApp() : initializeApp(config.firebase);

// getReactNativePersistence is exported from firebase/auth but its typings vary
// between releases — resolve it dynamically and degrade to in-memory if absent.
const getRNPersistence = (
  fbAuth as unknown as {
    getReactNativePersistence?: (s: unknown) => fbAuth.Persistence;
  }
).getReactNativePersistence;

let auth: fbAuth.Auth;
try {
  auth = getRNPersistence
    ? fbAuth.initializeAuth(app, {
        persistence: getRNPersistence(AsyncStorage),
      })
    : fbAuth.initializeAuth(app);
} catch {
  // Fast-refresh re-runs this module; auth is already initialised.
  auth = fbAuth.getAuth(app);
}

export { auth };
