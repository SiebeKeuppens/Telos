// The sync engine: all writes flow through the outbox (IndexedDB) and flush
// to POST /api/v1/sync as idempotent, LWW-stamped ops. Flushing happens
// immediately when online, on reconnect, and on app focus. Screens subscribe
// to SyncState for the quiet sync chip in the top bar.
import { v4 as uuid } from "uuid";
import {
  outboxAdd,
  outboxAll,
  outboxRemove,
  outboxBumpAttempts,
  outboxCount,
} from "./db";
import { getToken } from "./auth";
import type { SyncEntity, SyncResult } from "./types";

export interface SyncState {
  online: boolean;
  flushing: boolean;
  pending: number;
  lastError: string | null;
}

let state: SyncState = {
  online: navigator.onLine,
  flushing: false,
  pending: 0,
  lastError: null,
};

type Listener = () => void;
const listeners = new Set<Listener>();
const flushListeners = new Set<Listener>();

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

// useSyncExternalStore contract.
export function subscribeSync(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSyncState(): SyncState {
  return state;
}

// onFlushed fires after a successful flush so data hooks can refetch
// (the server may have re-planned the program).
export function onFlushed(listener: Listener): () => void {
  flushListeners.add(listener);
  return () => flushListeners.delete(listener);
}

/** Queue a mutation and try to flush immediately. */
export async function enqueue(
  entity: SyncEntity,
  action: "upsert" | "delete",
  data: unknown,
): Promise<void> {
  await outboxAdd({
    opId: uuid(),
    entity,
    action,
    clientTs: new Date().toISOString(),
    data,
  });
  setState({ pending: await outboxCount() });
  void flush();
}

let flushPromise: Promise<void> | null = null;
let retryTimer: number | null = null;
let retryDelayMs = 5_000;

/** Flush the outbox in order. Concurrent calls coalesce. */
export function flush(): Promise<void> {
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (!flushPromise) {
    flushPromise = doFlush().finally(() => {
      flushPromise = null;
    });
  }
  return flushPromise;
}

// A failed flush schedules its own retry (with backoff, capped at 2 min) so a
// queued workout still lands when the server comes back even if the user
// never refocuses the app.
function scheduleRetry() {
  if (retryTimer !== null) return;
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    void flush();
  }, retryDelayMs);
  retryDelayMs = Math.min(retryDelayMs * 2, 120_000);
}

// The server caps a sync batch at 500 ops; stay well under it so a long
// offline stretch can never produce a request the server rejects wholesale.
const FLUSH_BATCH = 200;

async function doFlush(): Promise<void> {
  if (!navigator.onLine) {
    setState({ online: false });
    return;
  }
  const all = await outboxAll();
  if (all.length === 0) {
    setState({ pending: 0, lastError: null });
    return;
  }
  const ops = all.slice(0, FLUSH_BATCH);

  setState({ flushing: true });
  try {
    const token = await getToken();
    if (!token) {
      // Signed out (or token fetch failed): keep the queue for later.
      setState({ flushing: false });
      return;
    }
    const res = await fetch("/api/v1/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ops: ops.map(({ seq: _seq, attempts: _attempts, ...op }) => op),
      }),
    });
    if (!res.ok) {
      throw new Error(`sync failed: HTTP ${res.status}`);
    }
    const result = (await res.json()) as SyncResult;

    // Remove applied ops; ops the server rejected outright (bad payload)
    // are dropped after repeated attempts so one poison op can't wedge the
    // queue forever.
    const byOpId = new Map(result.results.map((r) => [r.opId, r]));
    const applied: number[] = [];
    const failed: number[] = [];
    for (const op of ops) {
      const r = byOpId.get(op.opId);
      if (!r || r.status === "applied") {
        applied.push(op.seq!);
      } else if (op.attempts >= 3) {
        console.warn("dropping poison sync op", op.entity, r.error);
        applied.push(op.seq!);
      } else {
        failed.push(op.seq!);
      }
    }
    await outboxRemove(applied);
    await outboxBumpAttempts(failed);

    retryDelayMs = 5_000; // healthy again — reset backoff
    const remaining = await outboxCount();
    setState({
      flushing: false,
      online: true,
      pending: remaining,
      lastError: failed.length > 0 ? "Some entries failed to sync" : null,
    });
    if (failed.length > 0) {
      scheduleRetry();
    } else if (remaining > 0) {
      // More than one batch, or ops enqueued while this flush was in
      // flight — keep draining without waiting for the next trigger.
      setTimeout(() => void flush(), 0);
    }
    flushListeners.forEach((l) => l());
  } catch (err) {
    setState({
      flushing: false,
      pending: await outboxCount(),
      lastError: err instanceof Error ? err.message : "sync failed",
    });
    if ((await outboxCount()) > 0) scheduleRetry();
  }
}

/** Wire global connectivity/visibility triggers. Call once at app boot. */
export function initSync(): void {
  window.addEventListener("online", () => {
    setState({ online: true });
    void flush();
  });
  window.addEventListener("offline", () => setState({ online: false }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void flush();
  });
  void outboxCount().then((pending) => setState({ pending }));
  void flush();
}

export { uuid as newId };
