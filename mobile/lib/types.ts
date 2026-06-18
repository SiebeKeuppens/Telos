// API types — mirrors the Go server's JSON contract (server/internal/domain),
// shared verbatim with the web client so both front ends stay in lock-step.
// Loads are always kilograms on the wire; the UI converts per user preference.

export type Goal = "stay_fit" | "build_muscle" | "strength" | "bodybuilding";
export type Experience = "beginner" | "intermediate" | "advanced";
export type Unit = "kg" | "lb";

export type Equipment =
  | "barbell"
  | "dumbbell"
  | "machine"
  | "cable"
  | "kettlebell"
  | "band"
  | "bodyweight"
  | "bench"
  | "pullup_bar"
  | "dip_bar"
  | "rowing_machine";

export type MuscleGroup =
  | "chest"
  | "back"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves"
  | "core";

export type WorkoutStatus =
  | "planned"
  | "in_progress"
  | "completed"
  | "skipped"
  | "aborted";

export interface WarmupMove {
  name: string;
  prescription: string;
}

export interface User {
  uid: string;
  email?: string;
  displayName?: string;
  goal: Goal;
  experience: Experience;
  daysPerWeek: number;
  equipment: Equipment[];
  limitations?: string;
  unit: Unit;
  heightCm?: number;
  birthYear?: number;
  sex?: "male" | "female";
  splitPreference?: string;
  onboardedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingProfile {
  goal: Goal;
  displayName: string;
  summary: string;
  frequencyMin: number;
  frequencyMax: number;
  compoundReps: { min: number; max: number };
  accessoryReps: { min: number; max: number };
  targetRpeMin: number;
  targetRpeMax: number;
}

export interface Exercise {
  id: string;
  name: string;
  equipment: Equipment[];
  pattern: string;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  isCompound: boolean;
  formCues: string[];
  commonMistakes: string[];
  substituteId?: string;
  progressionId?: string;
}

export interface SetEntry {
  id: string;
  workoutExerciseId: string;
  setNumber: number;
  loadKg: number;
  reps: number;
  rpe?: number;
  completed: boolean;
  loggedAt: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkoutExercise {
  id: string;
  workoutId: string;
  exerciseId: string;
  position: number;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  targetRpe?: number;
  targetLoadKg?: number;
  restSeconds: number;
  notes?: string;
  noteCode?: string;
  sets?: SetEntry[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Workout {
  id: string;
  userId: string;
  programId?: string;
  name: string;
  dayIndex: number;
  status: WorkoutStatus;
  scheduledFor?: string; // YYYY-MM-DD
  startedAt?: string;
  completedAt?: string;
  notes?: string;
  edited: boolean;
  warmup?: WarmupMove[];
  exercises?: WorkoutExercise[];
  createdAt: string;
  updatedAt: string;
}

export interface Program {
  id: string;
  userId: string;
  status: "active" | "archived";
  goal: Goal;
  split: string;
  daysPerWeek: number;
  phase:
    | "linear"
    | "undulating"
    | "accumulation"
    | "intensification"
    | "deload";
  weekInPhase: number;
  mesocycleWeek: number;
  startedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProgramView {
  program: Program | null;
  workouts: Workout[];
  notes: string[] | null;
}

// ---- dashboard ----

export interface WeightPoint {
  date: string;
  weightKg: number;
}

export interface EnergyEstimate {
  available: boolean;
  missing: ("profile" | "weight" | "height" | "birthYear")[];
  maintenanceKcal: number;
  targetKcalLow: number;
  targetKcalHigh: number;
  goalAdjustPct: number;
  trainingKcalPerDay: number;
}

export interface Dashboard {
  recentWorkouts: {
    id: string;
    name: string;
    date: string;
    exercises: number;
    sets: number;
    volumeKg: number;
  }[];
  bodyweight: { entries: WeightPoint[]; trend: WeightPoint[] };
  recovery: { avgScore7: number };
  weeklyVolume: {
    weekStart: string;
    setsByMuscle: Partial<Record<MuscleGroup, number>>;
    totalSets: number;
  }[];
  e1rm: {
    exerciseId: string;
    name: string;
    points: { date: string; e1rmKg: number }[];
  }[];
  energy: EnergyEstimate;
}

// ---- sync protocol ----

export type SyncEntity =
  | "workout"
  | "workout_exercise"
  | "set"
  | "bodyweight"
  | "checkin"
  | "profile";

export interface SyncOp {
  opId: string;
  entity: SyncEntity;
  action: "upsert" | "delete";
  clientTs: string;
  data: unknown;
}

export interface SyncResult {
  results: { opId: string; status: "applied" | "error"; error?: string }[];
  replanned: boolean;
  serverTime: string;
}
