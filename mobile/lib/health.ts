// Health Connect (Google Fit's successor) bridge — Android only. Everything
// here is best-effort: Health Connect may be missing (emulators, old devices,
// iOS), the user may deny permissions, or the native module may simply throw.
// No caller should ever have to try/catch us; we swallow everything and
// degrade to false/null so the rest of the app can treat this as "nice to
// have" telemetry rather than a hard dependency. Every swallowed failure is
// logged with a "[health]" prefix so `adb logcat` shows the real reason.
import { Platform } from "react-native";
import {
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  insertRecords,
  openHealthConnectSettings,
  readRecords,
  requestPermission,
  SdkAvailabilityStatus,
  type Permission,
} from "react-native-health-connect";

const WORKOUT_EXERCISE_TYPE = 70; // ExerciseType.STRENGTH_TRAINING

const REQUIRED_PERMISSIONS: Permission[] = [
  { accessType: "write", recordType: "ExerciseSession" },
  { accessType: "read", recordType: "Weight" },
  { accessType: "write", recordType: "Weight" },
];

// The granted-permission unions returned by requestPermission() and
// getGrantedPermissions() differ slightly; both fit this shape.
function hasAllRequired(
  granted: { accessType: "read" | "write"; recordType: string }[],
): boolean {
  return REQUIRED_PERMISSIONS.every((req) =>
    granted.some((p) => p.recordType === req.recordType && p.accessType === req.accessType),
  );
}

// Module-scoped cache so repeated calls in a session don't re-init/re-prompt.
// Only success is cached: a failure (Health Connect missing, user denied) can
// be fixed by the user later, so the next call must be able to retry.
let initPromise: Promise<boolean> | null = null;

function initOnce(): Promise<boolean> {
  if (!initPromise) {
    initPromise = doInit().then((ok) => {
      if (!ok) initPromise = null;
      return ok;
    });
  }
  return initPromise;
}

async function doInit(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    // initialize() (HealthConnectClient.getOrCreate) rejects outright when the
    // Health Connect app is missing or outdated — common on Android 13, where
    // it's a separate Play Store app rather than part of the OS. Gate on
    // getSdkStatus() so the log says why instead of an opaque native throw.
    const status = await getSdkStatus();
    if (status !== SdkAvailabilityStatus.SDK_AVAILABLE) {
      console.warn(
        status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED
          ? "[health] Health Connect app needs an update"
          : "[health] Health Connect is not available on this device",
      );
      return false;
    }

    const ok = await initialize();
    if (!ok) {
      console.warn("[health] initialize() returned false");
      return false;
    }

    // If the user denied before ("don't allow" twice = permanent), the system
    // resolves immediately with the already-granted set and shows no dialog —
    // a silent empty/partial grant is what a prior denial looks like here.
    const granted = await requestPermission(REQUIRED_PERMISSIONS);
    if (!hasAllRequired(granted)) {
      console.warn(
        `[health] permissions not granted (got: ${
          granted.map((p) => `${p.accessType}:${p.recordType}`).join(", ") || "none"
        })`,
      );
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[health] init failed:", e);
    return false;
  }
}

/** Initialize Health Connect and request the permissions this app needs.
 * Returns false (never throws) if Health Connect is unavailable, the user
 * denies permissions, or anything else goes wrong. Safe to call repeatedly —
 * success is cached for the life of the app; failures retry on the next call. */
export function initHealthConnect(): Promise<boolean> {
  return initOnce();
}

/** Best-effort: open Health Connect's own settings/permissions screen — the
 * manual grant path once the system stops showing the permission dialog (two
 * denials = permanently suppressed until the user grants it in there). */
export function openHealthConnectSettingsScreen(): boolean {
  if (Platform.OS !== "android") return false;
  try {
    openHealthConnectSettings();
    return true;
  } catch (e) {
    console.warn("[health] openHealthConnectSettings failed:", e);
    return false;
  }
}

/** High-level Health Connect state for settings-style UI. */
export type HealthConnectStatus =
  | "unsupported"
  | "unavailable"
  | "update_required"
  | "not_granted"
  | "granted";

/** Where Health Connect stands on this device. Never throws, never shows the
 * permission prompt — use initHealthConnect() to trigger that. */
export async function getHealthConnectStatus(): Promise<HealthConnectStatus> {
  if (Platform.OS !== "android") return "unsupported";
  try {
    const status = await getSdkStatus();
    if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
      return "update_required";
    }
    if (status !== SdkAvailabilityStatus.SDK_AVAILABLE) return "unavailable";

    // getGrantedPermissions() rejects unless the client is initialized;
    // initialize() is idempotent and never shows UI.
    if (!(await initialize())) return "unavailable";
    return hasAllRequired(await getGrantedPermissions()) ? "granted" : "not_granted";
  } catch (e) {
    console.warn("[health] getHealthConnectStatus failed:", e);
    return "unavailable";
  }
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
  } catch (e) {
    console.warn("[health] writeWorkoutSession failed:", e);
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
  } catch (e) {
    console.warn("[health] readLatestWeightKg failed:", e);
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
  } catch (e) {
    console.warn("[health] writeWeightKg failed:", e);
    return false;
  }
}
