// Rest timing between sets. One hook owns the countdown; two presentations
// share it: the compact ring in the sticky action bar, and a prominent
// banner that makes resting (and the moment it ends) unmistakable.
// Rest is capped at 2 minutes — a product rule, sessions keep moving.
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Minus, Plus } from "lucide-react";

export const MAX_REST_SECONDS = 120;
const REST_OVER_BANNER_MS = 5000;

function pad(n: number): string {
  return String(Math.floor(n)).padStart(2, "0");
}

function clock(totalSeconds: number): string {
  return `${Math.floor(totalSeconds / 60)}:${pad(totalSeconds % 60)}`;
}

// Two rising tones — audible without being alarming. Best-effort: audio may
// be blocked until the user has interacted, which logging a set satisfies.
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const play = (freq: number, at: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.4);
    };
    play(660, 0);
    play(880, 0.18);
    window.setTimeout(() => void ctx.close(), 1200);
  } catch {
    // silence is acceptable
  }
}

export interface RestTimerState {
  remaining: number;
  total: number;
  active: boolean;
  /** True for a few seconds right after the countdown hits zero. */
  justEnded: boolean;
  adjust: (deltaSeconds: number) => void;
  skip: () => void;
}

/** Owns the rest countdown. Call start via the trigger args: pass the rest
 * duration and bump `trigger` on every logged set.
 *
 * Timekeeping is WALL-CLOCK based (an end timestamp, recomputed every tick),
 * never decrement-based: browsers throttle intervals in background tabs and
 * phones lock mid-rest, and a drifting rest timer is worse than none. */
export function useRestTimer(secondsTotal: number, trigger: number): RestTimerState {
  const [remaining, setRemaining] = useState(0);
  const [total, setTotal] = useState(0);
  const [justEnded, setJustEnded] = useState(false);
  const endAtRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    endAtRef.current = null;
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const finish = useCallback(() => {
    stop();
    // Make the end unmistakable: strong haptic pattern + chime + a visible
    // "rest over" state that lingers briefly.
    navigator.vibrate?.([120, 80, 120]);
    chime();
    setJustEnded(true);
    if (endedTimerRef.current) clearTimeout(endedTimerRef.current);
    endedTimerRef.current = setTimeout(() => setJustEnded(false), REST_OVER_BANNER_MS);
  }, [stop]);

  // Recompute from the wall clock; safe to call at any frequency.
  const tick = useCallback(() => {
    const endAt = endAtRef.current;
    if (endAt === null) return;
    const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    setRemaining(left);
    if (left <= 0) {
      finish();
    }
  }, [finish]);

  // (Re)start whenever a set is logged — trigger bumps even when the rest
  // duration is identical to the previous set's.
  useEffect(() => {
    if (secondsTotal <= 0 || trigger <= 0) return stop;
    const secs = Math.min(secondsTotal, MAX_REST_SECONDS);
    stop();
    setJustEnded(false);
    setRemaining(secs);
    setTotal(secs);
    endAtRef.current = Date.now() + secs * 1000;
    intervalRef.current = setInterval(tick, 500);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsTotal, trigger]);

  // Throttled background tabs / unlocked phones: correct immediately on
  // return instead of waiting for the next (possibly delayed) tick.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [tick]);

  useEffect(
    () => () => {
      stop();
      if (endedTimerRef.current) clearTimeout(endedTimerRef.current);
    },
    [stop],
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
  }, [stop]);

  return { remaining, total, active: remaining > 0, justEnded, adjust, skip };
}

// ---- prominent rest banner ---------------------------------------------------

/** Sits above the sticky action bar while resting: a big countdown, a clear
 * instruction to rest, and an equally clear "rest over" moment. */
export function RestBanner({ timer }: { timer: RestTimerState }) {
  const { t } = useTranslation("workout");

  if (timer.justEnded) {
    return (
      <div
        className="bg-primary text-on-primary px-4 py-3 animate-rise"
        role="status"
        aria-live="assertive"
      >
        <p className="type-title">{t("rest.over")}</p>
        <p className="type-body-sm opacity-80">{t("rest.overHint")}</p>
      </div>
    );
  }

  if (!timer.active) return null;

  const progress = timer.total > 0 ? timer.remaining / timer.total : 0;
  return (
    <div
      className="tint-primary-14 border-t border-[color-mix(in_srgb,var(--primary)_30%,transparent)] px-4 pt-3 pb-2"
      role="timer"
      aria-label={t("rest.aria", { time: clock(timer.remaining) })}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="type-label text-primary">{t("rest.label")}</p>
          <p className="type-data !text-[28px] !leading-9 text-on-surface">
            {clock(timer.remaining)}
          </p>
          <p className="type-body-sm text-on-surface-variant">{t("rest.hint")}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            aria-label={t("rest.subtract")}
            onClick={() => timer.adjust(-15)}
            className="w-11 h-11 flex items-center justify-center rounded bg-surface-container border border-outline-variant text-on-surface active:bg-surface-container-high"
          >
            <Minus size={16} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            aria-label={t("rest.add")}
            onClick={() => timer.adjust(15)}
            disabled={timer.remaining >= MAX_REST_SECONDS}
            className="w-11 h-11 flex items-center justify-center rounded bg-surface-container border border-outline-variant text-on-surface active:bg-surface-container-high disabled:opacity-30"
          >
            <Plus size={16} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={timer.skip}
            className="h-11 px-3 rounded bg-surface-container border border-outline-variant type-body-sm text-on-surface active:bg-surface-container-high"
          >
            {t("rest.skip")}
          </button>
        </div>
      </div>
      {/* Thin progress line draining left to right */}
      <div className="mt-2 h-0.5 rounded-full bg-outline-variant overflow-hidden">
        <div
          className="h-full bg-primary rounded-full"
          style={{ width: `${progress * 100}%`, transition: "width 0.9s linear" }}
        />
      </div>
    </div>
  );
}

// ---- compact ring (action bar) ------------------------------------------------

const SIZE = 48;
const STROKE = 3;
const R = (SIZE - STROKE) / 2;
const CIRCUM = 2 * Math.PI * R;

/** The quiet sibling: a small ring in the action bar mirroring the banner. */
export function RestTimer({ timer }: { timer: RestTimerState }) {
  const { t } = useTranslation("workout");
  const progress = timer.total > 0 ? timer.remaining / timer.total : 0;
  const dashoffset = CIRCUM * (1 - progress);

  return (
    <button
      type="button"
      aria-label={
        timer.active
          ? t("rest.ringAria", { time: clock(timer.remaining) })
          : t("rest.inactive")
      }
      onClick={timer.active ? timer.skip : undefined}
      className="relative flex items-center justify-center"
      style={{ width: SIZE, height: SIZE }}
    >
      <svg
        width={SIZE}
        height={SIZE}
        style={{ transform: "rotate(-90deg)" }}
        aria-hidden="true"
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="var(--outline-variant)"
          strokeWidth={STROKE}
        />
        {timer.active && (
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUM}
            strokeDashoffset={dashoffset}
            style={{ transition: "stroke-dashoffset 0.9s linear" }}
          />
        )}
      </svg>
      <span
        className={`absolute type-data !text-[11px] tabular-nums ${
          timer.active ? "text-on-surface" : "text-on-surface-variant"
        }`}
      >
        {timer.active ? clock(timer.remaining) : "–:––"}
      </span>
    </button>
  );
}
