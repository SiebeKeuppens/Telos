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
import { api } from "../../lib/api";
import { fonts, radius, space, type Palette } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";
import type { Exercise } from "../../lib/types";

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function ExerciseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { colors, type } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [ex, setEx] = useState<Exercise | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .getExercises()
      .then((all) => !cancelled && setEx(all.find((e) => e.id === id) ?? null))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={{ width: 56 }}>
          <Text style={styles.back}>‹ {t("common.back")}</Text>
        </Pressable>
        <Text style={[type.title, { flex: 1, textAlign: "center" }]} numberOfLines={1}>
          {ex?.name ?? t("exercise.title")}
        </Text>
        <View style={{ width: 56 }} />
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
          <View style={styles.chips}>
            {ex.equipment.map((eq) => (
              <View key={eq} style={styles.chip}>
                <Text style={styles.chipText}>{t(`common.equipment.${eq}`, { defaultValue: eq })}</Text>
              </View>
            ))}
            {ex.primaryMuscles.map((m) => (
              <View key={m} style={[styles.chip, styles.chipMuscle]}>
                <Text style={[styles.chipText, styles.chipMuscleText]}>
                  {t(`common.muscles.${m}`, { defaultValue: cap(m) })}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.kicker}>{t("exercise.form")}</Text>
            {ex.formCues.map((cue, i) => (
              <View key={i} style={styles.cueRow}>
                <Text style={styles.cueNum}>{i + 1}.</Text>
                <Text style={[type.body, { flex: 1 }]}>{cue}</Text>
              </View>
            ))}
          </View>

          {ex.commonMistakes.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.kicker}>{t("exercise.commonMistakes")}</Text>
              {ex.commonMistakes.map((m, i) => (
                <View key={i} style={styles.cueRow}>
                  <Text style={[styles.cueNum, { color: colors.warning }]}>!</Text>
                  <Text style={[type.bodyVariant, { flex: 1 }]}>{m}</Text>
                </View>
              ))}
            </View>
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
      paddingHorizontal: space(4),
      flexDirection: "row",
      alignItems: "center",
      gap: space(2),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.outlineVariant,
    },
    back: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.onSurfaceVariant },
    scroll: { padding: space(4), gap: space(5) },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: space(2) },
    chip: {
      paddingHorizontal: space(3),
      paddingVertical: space(1.5),
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceContainerHigh,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    chipText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.onSurfaceVariant },
    chipMuscle: { backgroundColor: colors.primaryContainer, borderColor: colors.primary },
    chipMuscleText: { color: colors.onPrimaryContainer },
    section: { gap: space(2) },
    kicker: {
      fontFamily: fonts.bodyMedium,
      fontSize: 11,
      letterSpacing: 1,
      color: colors.onSurfaceVariant,
    },
    cueRow: { flexDirection: "row", gap: space(2), alignItems: "flex-start" },
    cueNum: { fontFamily: fonts.headMedium, fontSize: 14, color: colors.primary, width: 18 },
  });
