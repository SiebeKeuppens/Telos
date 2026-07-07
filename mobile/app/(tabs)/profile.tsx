import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/Button";
import { Segmented } from "../../components/ui/Segmented";
import { api } from "../../lib/api";
import { signOutUser, useAuth } from "../../lib/auth";
import { getLanguage, setLanguage, type AppLanguage } from "../../lib/i18n";
import { fonts, radius, space, type Palette, type TypeScale } from "../../lib/theme";
import { useTheme, type ThemePreference } from "../../lib/theme-context";
import type { Unit, User } from "../../lib/types";

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function Profile() {
  const router = useRouter();
  const auth = useAuth();
  const { colors, type, preference, setPreference } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const [me, setMe] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingUnit, setSavingUnit] = useState(false);
  // Body details draft (strings while typing; parsed on save)
  const [height, setHeight] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [sex, setSex] = useState<"" | "male" | "female">("");
  const [savingBody, setSavingBody] = useState(false);
  const [bodySaved, setBodySaved] = useState(false);

  const GOAL_LABELS: Record<string, string> = {
    stay_fit: t("common.goals.stay_fit.name"),
    build_muscle: t("common.goals.build_muscle.name"),
    strength: t("common.goals.strength.name"),
    bodybuilding: t("common.goals.bodybuilding.name"),
  };

  const EQUIP_LABELS: Record<string, string> = {
    barbell: t("common.equipment.barbell"),
    dumbbell: t("common.equipment.dumbbell"),
    machine: t("common.equipment.machine"),
    cable: t("common.equipment.cable"),
    kettlebell: t("common.equipment.kettlebell"),
    band: t("common.equipment.band"),
    bench: t("common.equipment.bench"),
    pullup_bar: t("common.equipment.pullup_bar"),
    dip_bar: t("common.equipment.dip_bar"),
    rowing_machine: t("common.equipment.rowing_machine"),
  };

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      api
        .getMe()
        .then((u) => {
          if (cancelled) return;
          setMe(u);
          setHeight(u.heightCm ? String(u.heightCm) : "");
          setBirthYear(u.birthYear ? String(u.birthYear) : "");
          setSex(u.sex ?? "");
        })
        .catch(() => {})
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, []),
  );

  // Whole-object upsert on the server, so send the full user with the change.
  async function setUnit(unit: Unit) {
    if (!me || unit === me.unit) return;
    const prev = me;
    setMe({ ...me, unit });
    setSavingUnit(true);
    try {
      const updated = await api.putMe({ ...me, unit });
      setMe(updated);
    } catch {
      setMe(prev); // revert on failure
    } finally {
      setSavingUnit(false);
    }
  }

  // Powers the daily-energy estimate. Whole-object upsert, like the unit.
  async function saveBody() {
    if (!me) return;
    setSavingBody(true);
    setBodySaved(false);
    try {
      const h = parseInt(height, 10);
      const y = parseInt(birthYear, 10);
      const updated = await api.putMe({
        ...me,
        heightCm: Number.isFinite(h) && h > 0 ? h : undefined,
        birthYear: Number.isFinite(y) && y > 0 ? y : undefined,
        sex: sex || undefined,
      });
      setMe(updated);
      setBodySaved(true);
    } catch {
      // keep the draft; the user can retry
    } finally {
      setSavingBody(false);
    }
  }

  async function onSignOut() {
    await signOutUser();
    router.replace("/sign-in");
  }

  const equipment = (me?.equipment ?? []).filter((e) => e !== "bodyweight");

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topbar}>
        <Text style={type.title}>{t("profile.title")}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {loading && !me ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : me ? (
          <>
            <View style={styles.card}>
              <Text style={styles.kicker}>{t("profile.sections.account")}</Text>
              <Text style={[type.bodyLg, styles.mt1]}>
                {me.displayName || auth.email?.split("@")[0] || t("profile.athleteFallback")}
              </Text>
              {auth.email && <Text style={type.bodyVariant}>{auth.email}</Text>}
            </View>

            <View style={styles.card}>
              <Text style={styles.kicker}>{t("profile.sections.yourPlan")}</Text>
              <Row label={t("profile.goal")} value={GOAL_LABELS[me.goal] ?? me.goal} styles={styles} type={type} />
              <Row
                label={t("profile.experience")}
                value={t(`onboarding.experience.${me.experience}.title`, {
                  defaultValue: cap(me.experience),
                })}
                styles={styles}
                type={type}
              />
              <Row label={t("profile.daysPerWeek")} value={String(me.daysPerWeek)} styles={styles} type={type} />
              <Row
                label={t("profile.equipmentLabel")}
                value={
                  equipment.length
                    ? equipment.map((e) => EQUIP_LABELS[e] ?? e).join(", ")
                    : t("profile.bodyweightOnly")
                }
                styles={styles}
                type={type}
              />
            </View>

            <View style={styles.card}>
              <View style={styles.unitHead}>
                <Text style={styles.kicker}>{t("profile.sections.units")}</Text>
                {savingUnit && <ActivityIndicator size="small" color={colors.primary} />}
              </View>
              <View style={styles.mt2}>
                <Segmented
                  options={[
                    { value: "kg", label: "kg" },
                    { value: "lb", label: "lb" },
                  ]}
                  value={me.unit}
                  onChange={(v) => void setUnit(v as Unit)}
                />
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.kicker}>{t("profile.language")}</Text>
              <View style={styles.mt2}>
                <Segmented
                  options={[
                    { value: "en", label: "EN" },
                    { value: "nl", label: "Nederlands" },
                  ]}
                  value={getLanguage()}
                  onChange={(v) => setLanguage(v as AppLanguage)}
                />
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.kicker}>{t("profile.theme")}</Text>
              <View style={styles.mt2}>
                <Segmented
                  options={[
                    { value: "system", label: t("profile.themeOptions.system") },
                    { value: "light", label: t("profile.themeOptions.light") },
                    { value: "dark", label: t("profile.themeOptions.dark") },
                  ]}
                  value={preference}
                  onChange={(v) => setPreference(v as ThemePreference)}
                />
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.kicker}>{t("profile.sections.bodyDetails")}</Text>
              <Text style={[type.bodyVariant, styles.mt1]}>
                {t("profile.bodyDetailsHint")}
              </Text>
              <View style={styles.bodyRow}>
                <View style={{ flex: 1, gap: space(1) }}>
                  <Text style={styles.fieldLabel}>{t("profile.heightCm")}</Text>
                  <TextInput
                    value={height}
                    onChangeText={setHeight}
                    keyboardType="number-pad"
                    placeholder={t("profile.heightPlaceholder")}
                    placeholderTextColor={colors.onSurfaceVariant}
                    style={styles.input}
                  />
                </View>
                <View style={{ flex: 1, gap: space(1) }}>
                  <Text style={styles.fieldLabel}>{t("profile.birthYear")}</Text>
                  <TextInput
                    value={birthYear}
                    onChangeText={setBirthYear}
                    keyboardType="number-pad"
                    placeholder={t("profile.birthYearPlaceholder")}
                    placeholderTextColor={colors.onSurfaceVariant}
                    style={styles.input}
                  />
                </View>
              </View>
              <View style={[styles.mt2, { gap: space(1) }]}>
                <Text style={styles.fieldLabel}>{t("profile.sex")}</Text>
                <Segmented
                  options={[
                    { value: "male", label: t("profile.sexOptions.male") },
                    { value: "female", label: t("profile.sexOptions.female") },
                  ]}
                  value={sex as "male" | "female"}
                  onChange={(v) => setSex(v)}
                />
              </View>
              <Button
                label={bodySaved ? t("profile.saved") : t("profile.saveBodyDetails")}
                variant="secondary"
                loading={savingBody}
                onPress={() => void saveBody()}
                style={styles.mt2}
              />
            </View>

            <Button
              label={t("profile.redoSetup")}
              variant="secondary"
              onPress={() => router.push("/onboarding")}
              style={styles.mt2}
            />
            <Button label={t("profile.signOut")} variant="ghost" onPress={onSignOut} style={styles.mt2} />
          </>
        ) : (
          <Text style={type.bodyVariant}>{t("profile.loadError")}</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  label,
  value,
  styles,
  type,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof makeStyles>;
  type: TypeScale;
}) {
  return (
    <View style={styles.row}>
      <Text style={[type.bodyVariant, { width: 110 }]}>{label}</Text>
      <Text style={[type.body, { flex: 1 }]}>{value}</Text>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    topbar: {
      height: 56,
      paddingHorizontal: space(4),
      flexDirection: "row",
      alignItems: "center",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.outlineVariant,
    },
    scroll: { padding: space(4), gap: space(3) },
    center: { paddingVertical: space(16), alignItems: "center" },
    card: {
      backgroundColor: colors.surfaceContainer,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      padding: space(4),
      gap: space(1),
    },
    kicker: { fontFamily: fonts.bodyMedium, fontSize: 11, letterSpacing: 1, color: colors.onSurfaceVariant },
    unitHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    row: { flexDirection: "row", alignItems: "flex-start", gap: space(2), marginTop: space(1) },
    bodyRow: { flexDirection: "row", gap: space(3), marginTop: space(2) },
    fieldLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.onSurfaceVariant },
    input: {
      height: 44,
      borderRadius: radius.base,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      paddingHorizontal: space(3),
      fontFamily: fonts.body,
      fontSize: 15,
      color: colors.onSurface,
    },
    mt1: { marginTop: space(1) },
    mt2: { marginTop: space(2) },
  });
