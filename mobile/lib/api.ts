// Typed API client. Same contract as the web client, but talks to an absolute
// base URL (config.apiBase) since a native app has no same-origin proxy.
// Reads are offline-first: a successful response is cached to AsyncStorage;
// on network failure or a 5xx the last-known-good cached payload is served so
// every screen renders offline. Writes flow through the sync outbox (lib/sync.ts).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { config } from "./config";
import { getToken } from "./auth";
import type {
  BodyweightEntry,
  CheckIn,
  Dashboard,
  Exercise,
  ProgramView,
  TrainingProfile,
  User,
  Workout,
} from "./types";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

const CACHE_PREFIX = "telos-cache:";

async function cacheGet<T>(path: string): Promise<T | undefined> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + path);
    if (raw === null) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

async function cachePut<T>(path: string, data: T): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_PREFIX + path, JSON.stringify(data));
  } catch {
    // Best-effort cache; a write failure (e.g. storage full) shouldn't break
    // the read that's already succeeded.
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken();
  if (!token) throw new ApiError(401, "not signed in");
  const res = await fetch(`${config.apiV1}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // keep the status message
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

/** GET with offline fallback to the AsyncStorage cache. */
async function cachedGet<T>(path: string): Promise<T> {
  try {
    const data = await request<T>(path);
    void cachePut(path, data);
    return data;
  } catch (err) {
    // 4xx responses are real answers (e.g. 404 = not onboarded) and must
    // surface. Network-level failures AND 5xx fall back to the last-known
    // good payload — an unreachable backend behind a proxy shows up as a
    // 502/504, not a fetch rejection.
    if (err instanceof ApiError && err.status < 500) throw err;
    const cached = await cacheGet<T>(path);
    if (cached !== undefined) return cached;
    throw err;
  }
}

export const api = {
  getMe: () => cachedGet<User>("/me"),
  putMe: (user: Partial<User>) =>
    request<User>("/me", { method: "PUT", body: JSON.stringify(user) }),
  getProfiles: () => cachedGet<TrainingProfile[]>("/profiles"),
  getProgram: () => cachedGet<ProgramView>("/program"),
  getWorkout: (id: string) =>
    cachedGet<Workout>(`/workouts/${encodeURIComponent(id)}`),
  listWorkouts: (from: string, to: string) =>
    cachedGet<Workout[]>(`/workouts?from=${from}&to=${to}`),
  getExercises: () => cachedGet<Exercise[]>("/exercises"),
  getSubstitute: (exerciseId: string) =>
    request<Exercise>(`/exercises/${encodeURIComponent(exerciseId)}/substitute`),
  getDashboard: () => cachedGet<Dashboard>("/dashboard"),
  listBodyweight: (days = 90) =>
    cachedGet<BodyweightEntry[]>(`/me/bodyweight?days=${days}`),
  listCheckins: (days = 30) =>
    cachedGet<CheckIn[]>(`/me/checkins?days=${days}`),
};
