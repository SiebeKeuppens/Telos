// Health Connect (Google Fit's successor) bridge — Android only. Everything
// here is best-effort: Health Connect may be missing (emulators, old devices,
// iOS), the user may deny permissions, or the native module may simply throw.
// No caller should ever have to try/catch us; we swallow everything and
// degrade to false/null so the rest of the app can treat this as "nice to
// have" telemetry rather than a hard dependency.
import { Platform } from "react-native";
import {
  initialize,
  insertRecords,
  readRecords,
  requestPermission,
} from "react-native-health-connect";

const WORKOUT_EXERCISE_TYPE = 70; // ExerciseType.STRENGTH_TRAINING

// Module-scoped cache so repeated calls in a session don't re-init/re-prompt.
let initPromise: Promise<boolean> | null = null;

function initOnce(): Promise<boolean> {
  if (!initPromise) {
    initPromise = doInit();
  }
  return initPromise;
}

async function doInit(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    const ok = await initialize();
    if (!ok) return false;

    const granted = await requestPermission([
      { accessType: "write", recordType: "ExerciseSession" },
      { accessType: "read", recordType: "Weight" },
      { accessType: "write", recordType: "Weight" },
    ]);

    const has = (recordType: string, accessType: "read" | "write") =>
      granted.some(
        (p) => "recordType" in p && p.recordType === recordType && p.accessType === accessType,
      );

    return (
      has("ExerciseSession", "write") && has("Weight", "read") && has("Weight", "write")
    );
  } catch {
    return false;
  }
}

/** Initialize Health Connect and request the permissions this app needs.
 * Returns false (never throws) if Health Connect is unavailable, the user
 * denies permissions, or anything else goes wrong. Safe to call repeatedly —
 * the result is cached for the life of the app. */
export function initHealthConnect(): Promise<boolean> {
  return initOnce();
}

/** Best-effort: log a strength-training session to Health Connect. */
export async function writeWorkoutSession(opts: {
  name: string;
  startedAt: string;
  completedAt: string;
}): Promise<boolean> {
  try {
    const ready = await initOnce();
    if (!ready) return false;

    await insertRecords([
      {
        recordType: "ExerciseSession",
        exerciseType: WORKOUT_EXERCISE_TYPE,
        title: opts.name,
        startTime: opts.startedAt,
        endTime: opts.completedAt,
      },
    ]);
    return true;
  } catch {
    return false;
  }
}

/** Best-effort: most recent Weight record (kg) written in the last 90 days,
 * or null if unavailable/none found. */
export async function readLatestWeightKg(): Promise<number | null> {
  try {
    const ready = await initOnce();
    if (!ready) return null;

    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 90 * 24 * 60 * 60 * 1000);

    const { records } = await readRecords("Weight", {
      timeRangeFilter: {
        operator: "between",
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      },
      ascendingOrder: false,
      pageSize: 1,
    });

    const latest = records[0];
    if (!latest) return null;
    return latest.weight.inKilograms;
  } catch {
    return null;
  }
}

/** Best-effort: write a Weight record (kg) for the given date. Accepts either
 * a bare "YYYY-MM-DD" (interpreted as local noon, avoiding day-boundary
 * timezone slippage) or a full ISO instant. */
export async function writeWeightKg(weightKg: number, dateISO: string): Promise<boolean> {
  try {
    const ready = await initOnce();
    if (!ready) return false;

    const time = /^\d{4}-\d{2}-\d{2}$/.test(dateISO)
      ? `${dateISO}T12:00:00.000Z`
      : dateISO;

    await insertRecords([
      {
        recordType: "Weight",
        time,
        weight: { value: weightKg, unit: "kilograms" },
      },
    ]);
    return true;
  } catch {
    return false;
  }
}
