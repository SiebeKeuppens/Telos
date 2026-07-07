// The quiet, persistent sync indicator (design.md: never a blocking spinner).
// Ported from web/src/components/shell/SyncChip.tsx. Mobile's SyncState
// doesn't (yet) carry an explicit `online` flag, so "offline" is inferred
// from a queued op plus a live lastError (the same signal the outbox already
// surfaces) — if a future sync.ts adds `online`, this reads it directly and
// takes precedence, no change needed here.
import { useMemo, useSyncExternalStore } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { fonts, space, withAlpha, type Palette } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";
import { getSyncState, subscribeSync, type SyncState } from "../../lib/sync";

type ExtendedSyncState = SyncState & { online?: boolean };

export function SyncChip() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const state = useSyncExternalStore(subscribeSync, getSyncState) as ExtendedSyncState;

  const isOffline = state.online === false || (state.online === undefined && !!state.lastError && state.pending > 0);

  if (isOffline) {
    return (
      <View style={[styles.base, styles.neutral]}>
        <Ionicons name="cloud-offline-outline" size={12} color={colors.onSurfaceVariant} style={styles.icon} />
        <Text style={styles.neutralText}>
          {t("common.sync.offline")}
          {state.pending > 0 ? ` · ${state.pending}` : ""}
        </Text>
      </View>
    );
  }

  if (state.flushing || state.pending > 0) {
    return (
      <View style={[styles.base, styles.syncing]}>
        <Ionicons name="sync-outline" size={12} color={colors.primary} style={styles.icon} />
        <Text style={styles.syncingText}>{t("common.sync.syncing")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.base}>
      <Ionicons name="cloud-outline" size={12} color={colors.onSurfaceVariant} style={styles.icon} />
      <Text style={styles.neutralText}>{t("common.sync.synced")}</Text>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    base: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 999,
      paddingHorizontal: space(2),
      paddingVertical: space(1),
    },
    icon: { marginRight: 6 },
    neutral: {
      backgroundColor: colors.surfaceContainerHigh,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    neutralText: {
      fontFamily: fonts.headMedium,
      fontSize: 12,
      lineHeight: 16,
      letterSpacing: 0.96,
      textTransform: "uppercase",
      color: colors.onSurfaceVariant,
    },
    syncing: {
      backgroundColor: withAlpha(colors.primary, 0.14),
    },
    syncingText: {
      fontFamily: fonts.headMedium,
      fontSize: 12,
      lineHeight: 16,
      letterSpacing: 0.96,
      textTransform: "uppercase",
      color: colors.primary,
    },
  });
