// The quiet, persistent sync indicator (design.md: never a blocking spinner).
import { useSyncExternalStore } from "react";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { getSyncState, subscribeSync } from "../../lib/sync";

export function SyncChip() {
  const state = useSyncExternalStore(subscribeSync, getSyncState);

  if (!state.online) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-surface-container-high border border-outline-variant type-label text-on-surface-variant">
        <CloudOff size={12} strokeWidth={1.5} />
        Offline
        {state.pending > 0 && <span>· {state.pending}</span>}
      </span>
    );
  }
  if (state.flushing || state.pending > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full tint-primary-14 type-label text-primary">
        <RefreshCw size={12} strokeWidth={1.5} className="animate-spin" />
        Syncing
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full type-label text-on-surface-variant"
      title="All changes saved"
    >
      <Cloud size={12} strokeWidth={1.5} />
      Synced
    </span>
  );
}
