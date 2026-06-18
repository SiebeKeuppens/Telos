// Minimal offline outbox for the mobile slice. Same protocol as the web
// (idempotent, client-stamped ops → POST /sync), persisted to AsyncStorage so
// a workout logged offline survives an app restart and flushes when the
// network returns. A fuller engine (backoff, focus/reconnect triggers, a sync
// chip) can grow from here, matching web/src/lib/sync.ts.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { config } from "./config";
import { getToken } from "./auth";
import type { SyncEntity, SyncOp, SyncResult } from "./types";

const KEY = "telos-outbox";
const MAX_ATTEMPTS = 3;

/** Client-side id for ops and records (sufficient for idempotency keys). */
export function newId(): string {
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rand()}-${rand()}`;
}

type StoredOp = SyncOp & { attempts: number };

async function readQueue(): Promise<StoredOp[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as StoredOp[];
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
  void flush();
}

let flushing = false;

/** Flush the outbox in order. Concurrent calls coalesce. */
export async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const ops = await readQueue();
    if (ops.length === 0) return;

    const token = await getToken();
    if (!token) return; // signed out — keep the queue for later

    const res = await fetch(`${config.apiV1}/sync`, {
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
  } catch {
    // Network down or server unreachable — the queue stays put; the next
    // enqueue() or an explicit flush() retries.
  } finally {
    flushing = false;
  }
}

export async function pendingCount(): Promise<number> {
  return (await readQueue()).length;
}
