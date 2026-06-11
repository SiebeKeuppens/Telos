// Typed API client. Reads are offline-first: network result is cached to
// IndexedDB; on failure the last-known-good payload is served so every screen
// renders offline. Writes never go through here — they use the sync outbox.
import { getToken } from "./auth";
import { cacheGet, cachePut } from "./db";
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
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken();
  if (!token) throw new ApiError(401, "not signed in");
  const res = await fetch(`/api/v1${path}`, {
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

/** GET with offline fallback to the IndexedDB cache. */
async function cachedGet<T>(path: string): Promise<T> {
  try {
    const data = await request<T>(path);
    void cachePut(path, data);
    return data;
  } catch (err) {
    // 4xx responses are real answers (e.g. 404 = not onboarded); only fall
    // back to cache for network-level failures.
    if (err instanceof ApiError) throw err;
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
  getExercises: () => cachedGet<Exercise[]>("/exercises"),
  getSubstitute: (exerciseId: string) =>
    request<Exercise>(`/exercises/${encodeURIComponent(exerciseId)}/substitute`),

  getProgram: () => cachedGet<ProgramView>("/program"),
  regenerate: () =>
    request<ProgramView>("/program/regenerate", { method: "POST" }),

  getWorkout: (id: string) =>
    cachedGet<Workout>(`/workouts/${encodeURIComponent(id)}`),
  listWorkouts: (from: string, to: string) =>
    cachedGet<Workout[]>(`/workouts?from=${from}&to=${to}`),

  getDashboard: () => cachedGet<Dashboard>("/dashboard"),
  listBodyweight: (days = 90) =>
    cachedGet<BodyweightEntry[]>(`/me/bodyweight?days=${days}`),
  listCheckins: (days = 30) =>
    cachedGet<CheckIn[]>(`/me/checkins?days=${days}`),
};

export const queryKeys = {
  me: ["me"] as const,
  profiles: ["profiles"] as const,
  exercises: ["exercises"] as const,
  program: ["program"] as const,
  dashboard: ["dashboard"] as const,
  workout: (id: string) => ["workout", id] as const,
  workouts: (from: string, to: string) => ["workouts", from, to] as const,
  bodyweight: ["bodyweight"] as const,
  checkins: ["checkins"] as const,
};
