// Exercise detail: form cues + common mistakes from the library (parity with
// the web's ExerciseDetail). Reached by tapping an exercise name mid-workout.
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { fonts, radius, space, withAlpha, type Palette } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";
import type { Exercise } from "../../lib/types";

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---- substitute / progression callouts (PARITY_SPEC §3.9) ------------------

function SubstituteCallout({
  sub,
  styles,
  type,
  t,
  onNavigate,
}: {
  sub: Exercise;
  styles: ReturnType<typeof makeStyles>;
  type: ReturnType<typeof useTheme>["type"];
  t: (key: string, opts?: Record<string, unknown>) => string;
  onNavigate: () => void;
}) {
  return (
    <View style={styles.calloutAccent}>
      <Text style={styles.calloutLabelAccent}>{t("exercise.substitute.title")}</Text>
      <Text style={type.data}>{sub.name}</Text>
      {sub.formCues[0] && (
        <Text style={[type.bodyVariant, { marginTop: 2 }]}>{sub.formCues[0]}</Text>
      )}
      <Text style={[type.bodyVariant, { marginTop: space(1) }]}>
        {t("exercise.substitute.blurb")}
      </Text>
      <Pressable onPress={onNavigate} style={styles.calloutLink}>
        <Text style={styles.calloutLinkTextAccent}>
          {t("exercise.viewExercise", { name: sub.name })}
        </Text>
      </Pressable>
    </View>
  );
}

function ProgressionCallout({
  progression,
  styles,
  type,
  t,
  onNavigate,
}: {
  progression: Exercise;
  styles: ReturnType<typeof makeStyles>;
  type: ReturnType<typeof useTheme>["type"];
  t: (key: string, opts?: Record<string, unknown>) => string;
  onNavigate: () => void;
}) {
  return (
    <View style={styles.calloutPlain}>
      <Text style={styles.calloutLabel}>{t("exercise.progression.title")}</Text>
      <Text style={type.data}>{progression.name}</Text>
      <Pressable onPress={onNavigate} style={styles.calloutLink}>
        <Text style={styles.calloutLinkText}>
          {t("exercise.viewExercise", { name: progression.name })}
        </Text>
      </Pressable>
    </View>
  );
}

export default function ExerciseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { colors, type } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [all, setAll] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .getExercises()
      .then((list) => !cancelled && setAll(list))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const ex = useMemo(() => all.find((e) => e.id === id) ?? null, [all, id]);
  const substitute = useMemo(
    () => (ex?.substituteId ? all.find((e) => e.id === ex.substituteId) : undefined),
    [ex, all],
  );
  const progression = useMemo(
    () => (ex?.progressionId ? all.find((e) => e.id === ex.progressionId) : undefined),
    [ex, all],
  );

  // Truncate long names to ~28 chars for the top bar (web parity) — RN's
  // numberOfLines ellipsis already achieves the same visual outcome.
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topbar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityLabel={t("common.back")}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={22} color={colors.onSurfaceVariant} />
        </Pressable>
        <Text style={[type.title, { flex: 1, textAlign: "center" }]} numberOfLines={1}>
          {ex?.name ?? t("exercise.title")}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !ex ? (
        <View style={styles.center}>
          <Text style={type.bodyVariant}>{t("exercise.notFound")}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {ex.equipment.length > 0 && (
            <View style={styles.chips}>
              {ex.equipment.map((eq) => (
                <View key={eq} style={styles.badgeNeutral}>
                  <Text style={styles.badgeNeutralText}>
                    {t(`common.equipment.${eq}`, { defaultValue: eq })}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {ex.primaryMuscles.length > 0 && (
            <View style={styles.chips}>
              {ex.primaryMuscles.map((m) => (
                <View key={m} style={styles.badgeAccent}>
                  <Text style={styles.badgeAccentText}>
                    {t(`common.muscles.${m}`, { defaultValue: cap(m) })}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {ex.secondaryMuscles.length > 0 && (
            <View style={[styles.chips, { opacity: 0.7 }]}>
              {ex.secondaryMuscles.map((m) => (
                <View key={m} style={styles.badgeNeutral}>
                  <Text style={styles.badgeNeutralText}>
                    {t(`common.muscles.${m}`, { defaultValue: cap(m) })}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {ex.formCues.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.kicker}>{t("exercise.form")}</Text>
              {ex.formCues.map((cue, i) => (
                <View key={i} style={styles.cueRow}>
                  <View style={styles.cueNumBadge}>
                    <Text style={styles.cueNumBadgeText}>{i + 1}</Text>
                  </View>
                  <Text style={[type.body, { flex: 1 }]}>{cue}</Text>
                </View>
              ))}
            </View>
          )}

          {ex.commonMistakes.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.kicker}>{t("exercise.commonMistakes")}</Text>
              {ex.commonMistakes.map((m, i) => (
                <View key={i} style={styles.cueRow}>
                  <View style={styles.mistakeIconWrap}>
                    <Ionicons name="warning-outline" size={14} color={colors.warning} />
                  </View>
                  <Text style={[type.bodyVariant, { flex: 1 }]}>{m}</Text>
                </View>
              ))}
            </View>
          )}

          {substitute && (
            <SubstituteCallout
              sub={substitute}
              styles={styles}
              type={type}
              t={t}
              onNavigate={() => router.push(`/exercise/${substitute.id}`)}
            />
          )}

          {progression && (
            <ProgressionCallout
              progression={progression}
              styles={styles}
              type={type}
              t={t}
              onNavigate={() => router.push(`/exercise/${progression.id}`)}
            />
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    topbar: {
      height: 56,
      paddingHorizontal: space(2),
      flexDirection: "row",
      alignItems: "center",
      gap: space(2),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.outlineVariant,
    },
    backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
    scroll: { padding: space(4), gap: space(5) },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: space(1.5) },

    badgeNeutral: {
      paddingHorizontal: space(2),
      paddingVertical: 2,
      borderRadius: radius.base,
      backgroundColor: colors.surfaceContainerHigh,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    badgeNeutralText: {
      fontFamily: fonts.headMedium,
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: 0.96,
      color: colors.onSurfaceVariant,
    },
    badgeAccent: {
      paddingHorizontal: space(2),
      paddingVertical: 2,
      borderRadius: radius.base,
      backgroundColor: withAlpha(colors.primary, 0.14),
      borderWidth: 1,
      borderColor: withAlpha(colors.primary, 0.3),
    },
    badgeAccentText: {
      fontFamily: fonts.headMedium,
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: 0.96,
      color: colors.primary,
    },

    section: { gap: space(2) },
    kicker: {
      fontFamily: fonts.headMedium,
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: 0.96,
      color: colors.onSurfaceVariant,
    },
    cueRow: { flexDirection: "row", gap: space(2), alignItems: "flex-start" },
    cueNumBadge: {
      width: 24,
      height: 24,
      borderRadius: radius.pill,
      backgroundColor: withAlpha(colors.primary, 0.14),
      alignItems: "center",
      justifyContent: "center",
      marginTop: 1,
    },
    cueNumBadgeText: {
      fontFamily: fonts.headMedium,
      fontSize: 12,
      color: colors.primary,
      fontVariant: ["tabular-nums"],
    },
    mistakeIconWrap: { width: 24, alignItems: "center", justifyContent: "center", marginTop: 3 },

    calloutAccent: {
      borderRadius: radius.lg,
      padding: space(4),
      backgroundColor: withAlpha(colors.primary, 0.08),
      borderWidth: 1,
      borderColor: withAlpha(colors.primary, 0.3),
      gap: space(2),
    },
    calloutPlain: {
      borderRadius: radius.lg,
      padding: space(4),
      backgroundColor: colors.surfaceContainer,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      gap: space(2),
    },
    calloutLabelAccent: {
      fontFamily: fonts.headMedium,
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: 0.96,
      color: colors.primary,
    },
    calloutLabel: {
      fontFamily: fonts.headMedium,
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: 0.96,
      color: colors.onSurfaceVariant,
    },
    calloutLink: { minHeight: 40, justifyContent: "center" },
    calloutLinkTextAccent: { fontFamily: fonts.headMedium, fontSize: 14, color: colors.primary },
    calloutLinkText: { fontFamily: fonts.headMedium, fontSize: 14, color: colors.onSurfaceVariant },
  });
