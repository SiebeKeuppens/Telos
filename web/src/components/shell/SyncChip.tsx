// The quiet, persistent sync indicator (design.md: never a blocking spinner).
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { getSyncState, subscribeSync } from "../../lib/sync";

export function SyncChip() {
  const { t } = useTranslation();
  const state = useSyncExternalStore(subscribeSync, getSyncState);

  if (!state.online) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-surface-container-high border border-outline-variant type-label text-on-surface-variant">
        <CloudOff size={12} strokeWidth={1.5} />
        {t("sync.offline")}
        {state.pending > 0 && <span>· {state.pending}</span>}
      </span>
    );
  }
  if (state.pending > 0 && state.lastError && !state.flushing) {
    // Writes are safe in the queue; the server just isn't reachable yet.
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-surface-container-high border border-outline-variant type-label text-on-surface-variant">
        <CloudOff size={12} strokeWidth={1.5} />
        {t("sync.savedQueued", { count: state.pending })}
      </span>
    );
  }
  if (state.flushing || state.pending > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full tint-primary-14 type-label text-primary">
        <RefreshCw size={12} strokeWidth={1.5} className="animate-spin" />
        {t("sync.syncing")}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full type-label text-on-surface-variant"
      title={t("sync.allSaved")}
    >
      <Cloud size={12} strokeWidth={1.5} />
      {t("sync.synced")}
    </span>
  );
}
