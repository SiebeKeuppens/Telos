// IndexedDB layer: the offline backbone. Two stores:
//  - "cache": last-known-good server payloads keyed by endpoint, so every
//    screen renders offline from its previous data.
//  - "outbox": the write queue. All mutations (online or not) are enqueued
//    here and flushed to POST /api/v1/sync in order — one code path for
//    online and offline writes, which is what makes sync trustworthy.
import { openDB, type IDBPDatabase } from "idb";
import type { SyncOp } from "./types";

interface TelosDB {
  cache: { key: string; value: { key: string; data: unknown; storedAt: number } };
  outbox: { key: number; value: QueuedOp; indexes: { byOpId: string } };
}

export interface QueuedOp extends SyncOp {
  seq?: number; // autoincrement key, assigned by IDB
  attempts: number;
}

let dbPromise: Promise<IDBPDatabase<TelosDB>> | null = null;

function db(): Promise<IDBPDatabase<TelosDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TelosDB>("telos", 1, {
      upgrade(database) {
        database.createObjectStore("cache", { keyPath: "key" });
        const outbox = database.createObjectStore("outbox", {
          keyPath: "seq",
          autoIncrement: true,
        });
        outbox.createIndex("byOpId", "opId");
      },
    });
  }
  return dbPromise;
}

// ---- cache ----

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  const row = await (await db()).get("cache", key);
  return row?.data as T | undefined;
}

export async function cachePut(key: string, data: unknown): Promise<void> {
  await (await db()).put("cache", { key, data, storedAt: Date.now() });
}

export async function cacheDelete(key: string): Promise<void> {
  await (await db()).delete("cache", key);
}

// ---- outbox ----

export async function outboxAdd(op: SyncOp): Promise<void> {
  await (await db()).add("outbox", { ...op, attempts: 0 });
}

export async function outboxAll(): Promise<QueuedOp[]> {
  return (await db()).getAll("outbox");
}

export async function outboxCount(): Promise<number> {
  return (await db()).count("outbox");
}

export async function outboxRemove(seqs: number[]): Promise<void> {
  const tx = (await db()).transaction("outbox", "readwrite");
  for (const seq of seqs) {
    await tx.store.delete(seq);
  }
  await tx.done;
}

export async function outboxBumpAttempts(seqs: number[]): Promise<void> {
  const tx = (await db()).transaction("outbox", "readwrite");
  for (const seq of seqs) {
    const row = await tx.store.get(seq);
    if (row) {
      row.attempts += 1;
      await tx.store.put(row);
    }
  }
  await tx.done;
}
