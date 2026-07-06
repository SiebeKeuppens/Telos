// Typed API client. Same contract as the web client, but talks to an absolute
// base URL (config.apiBase) since a native app has no same-origin proxy.
// Reads go through here; writes flow through the sync outbox (lib/sync.ts).
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

export const api = {
  getMe: () => request<User>("/me"),
  putMe: (user: Partial<User>) =>
    request<User>("/me", { method: "PUT", body: JSON.stringify(user) }),
  getProfiles: () => request<TrainingProfile[]>("/profiles"),
  getProgram: () => request<ProgramView>("/program"),
  getWorkout: (id: string) =>
    request<Workout>(`/workouts/${encodeURIComponent(id)}`),
  listWorkouts: (from: string, to: string) =>
    request<Workout[]>(`/workouts?from=${from}&to=${to}`),
  getExercises: () => request<Exercise[]>("/exercises"),
  getSubstitute: (exerciseId: string) =>
    request<Exercise>(`/exercises/${encodeURIComponent(exerciseId)}/substitute`),
  getDashboard: () => request<Dashboard>("/dashboard"),
  listBodyweight: (days = 90) =>
    request<BodyweightEntry[]>(`/me/bodyweight?days=${days}`),
  listCheckins: (days = 30) =>
    request<CheckIn[]>(`/me/checkins?days=${days}`),
};
