// Rest timing between sets. A wall-clock countdown (an end timestamp recomputed
// each tick, never decrement-based) so a backgrounded app or locked phone
// doesn't drift. Rest is capped at 2 minutes — a product rule, sessions keep
// moving. Ported from the web RestTimer; haptics via Vibration, foreground
// correction via AppState.
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, Vibration, View } from "react-native";
import { colors, fonts, radius, space } from "../../lib/theme";

export const MAX_REST_SECONDS = 120;
const REST_OVER_MS = 5000;

function clock(total: number): string {
  const s = Math.max(0, Math.floor(total));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export interface RestTimer {
  remaining: number;
  total: number;
  active: boolean;
  justEnded: boolean;
  start: (seconds: number) => void;
  adjust: (delta: number) => void;
  skip: () => void;
}

export function useRestTimer(): RestTimer {
  const [remaining, setRemaining] = useState(0);
  const [total, setTotal] = useState(0);
  const [justEnded, setJustEnded] = useState(false);
  const endAtRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endedRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    endAtRef.current = null;
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const finish = useCallback(() => {
    stop();
    setRemaining(0);
    Vibration.vibrate([0, 120, 80, 120]);
    setJustEnded(true);
    if (endedRef.current) clearTimeout(endedRef.current);
    endedRef.current = setTimeout(() => setJustEnded(false), REST_OVER_MS);
  }, [stop]);

  const tick = useCallback(() => {
    const endAt = endAtRef.current;
    if (endAt === null) return;
    const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    setRemaining(left);
    if (left <= 0) finish();
  }, [finish]);

  const start = useCallback(
    (seconds: number) => {
      const secs = Math.min(seconds, MAX_REST_SECONDS);
      stop();
      if (endedRef.current) clearTimeout(endedRef.current);
      setJustEnded(false);
      if (secs <= 0) {
        setRemaining(0);
        setTotal(0);
        return;
      }
      setTotal(secs);
      setRemaining(secs);
      endAtRef.current = Date.now() + secs * 1000;
      intervalRef.current = setInterval(tick, 500);
    },
    [stop, tick],
  );

  const adjust = useCallback(
    (delta: number) => {
      const endAt = endAtRef.current;
      if (endAt === null) return;
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      const next = Math.min(MAX_REST_SECONDS, Math.max(0, left + delta));
      if (next <= 0) {
        stop();
        setRemaining(0);
        return;
      }
      endAtRef.current = Date.now() + next * 1000;
      setRemaining(next);
      setTotal((t) => Math.min(MAX_REST_SECONDS, Math.max(next, t)));
    },
    [stop],
  );

  const skip = useCallback(() => {
    stop();
    setRemaining(0);
    setJustEnded(false);
    if (endedRef.current) clearTimeout(endedRef.current);
  }, [stop]);

  // Foreground correction: phones throttle timers while backgrounded.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") tick();
    });
    return () => sub.remove();
  }, [tick]);

  useEffect(
    () => () => {
      stop();
      if (endedRef.current) clearTimeout(endedRef.current);
    },
    [stop],
  );

  return { remaining, total, active: remaining > 0, justEnded, start, adjust, skip };
}

// ---- the bar -----------------------------------------------------------------

export function RestBar({ timer }: { timer: RestTimer }) {
  if (timer.justEnded) {
    return (
      <View style={styles.over} accessibilityLiveRegion="assertive">
        <Text style={styles.overTitle}>Rest over — next set.</Text>
        <Text style={styles.overHint}>Same focus as the last one. Go.</Text>
      </View>
    );
  }

  if (!timer.active) return null;

  const progress = timer.total > 0 ? timer.remaining / timer.total : 0;
  return (
    <View style={styles.bar}>
      <View style={styles.barRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>REST</Text>
          <Text style={styles.count}>{clock(timer.remaining)}</Text>
          <Text style={styles.hint}>Catch your breath — next set at zero.</Text>
        </View>
        <View style={styles.controls}>
          <Pressable
            accessibilityLabel="Subtract 15 seconds"
            onPress={() => timer.adjust(-15)}
            style={styles.ctrl}
          >
            <Text style={styles.ctrlText}>−15</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Add 15 seconds"
            onPress={() => timer.adjust(15)}
            disabled={timer.remaining >= MAX_REST_SECONDS}
            style={[styles.ctrl, timer.remaining >= MAX_REST_SECONDS && styles.ctrlDisabled]}
          >
            <Text style={styles.ctrlText}>+15</Text>
          </Pressable>
          <Pressable accessibilityLabel="Skip rest" onPress={timer.skip} style={styles.ctrl}>
            <Text style={styles.ctrlText}>Skip</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  over: { backgroundColor: colors.primary, paddingHorizontal: space(4), paddingVertical: space(3) },
  overTitle: { fontFamily: fonts.head, fontSize: 18, color: colors.onPrimary },
  overHint: { fontFamily: fonts.body, fontSize: 13, color: colors.onPrimary, opacity: 0.85, marginTop: 2 },

  bar: {
    backgroundColor: colors.primaryContainer,
    borderTopWidth: 1,
    borderTopColor: colors.primary,
    paddingHorizontal: space(4),
    paddingTop: space(3),
    paddingBottom: space(2),
  },
  barRow: { flexDirection: "row", alignItems: "center", gap: space(4) },
  label: { fontFamily: fonts.bodyMedium, fontSize: 11, letterSpacing: 1, color: colors.onPrimaryContainer },
  count: { fontFamily: fonts.head, fontSize: 28, color: colors.onSurface, lineHeight: 34 },
  hint: { fontFamily: fonts.body, fontSize: 12, color: colors.onSurfaceVariant },
  controls: { flexDirection: "row", alignItems: "center", gap: space(1.5) },
  ctrl: {
    height: 44,
    minWidth: 44,
    paddingHorizontal: space(2),
    borderRadius: radius.base,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    alignItems: "center",
    justifyContent: "center",
  },
  ctrlDisabled: { opacity: 0.35 },
  ctrlText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.onSurface },
  track: { marginTop: space(2), height: 3, borderRadius: 2, backgroundColor: colors.outlineVariant, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 2, backgroundColor: colors.primary },
});
