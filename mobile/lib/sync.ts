// Minimal offline outbox for the mobile slice. Same protocol as the web
// (idempotent, client-stamped ops → POST /sync), persisted to AsyncStorage so
// a workout logged offline survives an app restart and flushes when the
// network returns. A fuller engine (backoff, focus/reconnect triggers, a sync
// chip) can grow from here, matching web/src/lib/sync.ts.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { config } from "./config";
import { getToken } from "./auth";
import { safeFetch } from "./api";
import type { SyncEntity, SyncOp, SyncResult } from "./types";

const KEY = "telos-outbox";
const MAX_ATTEMPTS = 3;

/** Observable sync state for UI (e.g. a sync chip). Mutated in place and
 * broadcast to subscribers — read via getSyncState(), never mutate directly. */
export interface SyncState {
  pending: number;
  flushing: boolean;
  lastError: string | null;
}

// Replaced (never mutated) on every update so getSyncState() can hand out a
// STABLE reference — useSyncExternalStore compares snapshots by identity, and
// a fresh object per read spins React into an infinite re-render.
let state: SyncState = {
  pending: 0,
  flushing: false,
  lastError: null,
};

const listeners = new Set<() => void>();

function setState(patch: Partial<SyncState>): void {
  state = { ...state, ...patch };
  for (const cb of listeners) cb();
}

/** Current sync state snapshot (stable reference between changes). */
export function getSyncState(): SyncState {
  return state;
}

/** Subscribe to sync state changes. Returns an unsubscribe function. */
export function subscribeSync(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

async function refreshPending(): Promise<void> {
  const ops = await readQueue();
  setState({ pending: ops.length });
}

/** RFC-4122 v4 UUID. The server stores record ids in Postgres `uuid` columns,
 * so anything non-UUID is rejected — and one bad op wedges the whole queue.
 * Math.random is fine here: these are idempotency keys, not secrets. */
export function newId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type StoredOp = SyncOp & { attempts: number };

async function readQueue(): Promise<StoredOp[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const ops = JSON.parse(raw) as StoredOp[];
    // Sanitize: an op whose record id isn't a UUID can never apply (uuid
    // columns server-side) and would wedge the queue forever — drop it.
    return ops.filter((op) => {
      const id = (op.data as { id?: string } | null)?.id;
      return id === undefined || UUID_RE.test(id);
    });
  } catch {
    return [];
  }
}

async function writeQueue(ops: StoredOp[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(ops));
}

/** Queue a mutation and try to flush immediately. */
export async function enqueue(
  entity: SyncEntity,
  action: "upsert" | "delete",
  data: unknown,
): Promise<void> {
  const ops = await readQueue();
  ops.push({
    opId: newId(),
    entity,
    action,
    clientTs: new Date().toISOString(),
    data,
    attempts: 0,
  });
  await writeQueue(ops);
  await refreshPending();
  void flush();
}

let flushPromise: Promise<void> | null = null;

/** Flush the outbox in order. Concurrent calls coalesce onto the in-flight
 * run and resolve when IT completes — early-returning instead would let
 * `await flush()` (or `flush().then(load)`) refetch before the POST lands,
 * so freshly saved data never appeared without a restart. */
export function flush(): Promise<void> {
  if (flushPromise) return flushPromise;
  flushPromise = (async () => {
    setState({ flushing: true });
    try {
      await doFlush();
      setState({ lastError: null });
    } catch (err) {
      // Network down or server unreachable — the queue stays put; the next
      // enqueue() or an explicit flush() retries.
      setState({ lastError: err instanceof Error ? err.message : String(err) });
    } finally {
      flushPromise = null;
      setState({ flushing: false });
      await refreshPending();
    }
  })();
  return flushPromise;
}

async function doFlush(): Promise<void> {
  const ops = await readQueue();
  if (ops.length === 0) return;

  const token = await getToken();
  if (!token) return; // signed out — keep the queue for later

  // safeFetch: transport failures (including odd non-Error throws from the
  // fetch polyfill) become a normal ApiError(0) rejection, which flush()'s
  // catch turns into lastError instead of anything escaping.
  const res = await safeFetch(`${config.apiV1}/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      ops: ops.map(({ attempts: _attempts, ...op }) => op),
    }),
  });
  if (!res.ok) throw new Error(`sync failed: HTTP ${res.status}`);

  const result = (await res.json()) as SyncResult;
  const byId = new Map(result.results.map((r) => [r.opId, r]));

  // Drop applied ops; retry the rest until they poison out.
  const remaining = ops.filter((op) => {
    const r = byId.get(op.opId);
    if (!r || r.status === "applied") return false;
    op.attempts += 1;
    return op.attempts < MAX_ATTEMPTS;
  });
  await writeQueue(remaining);
}

export async function pendingCount(): Promise<number> {
  return (await readQueue()).length;
}
