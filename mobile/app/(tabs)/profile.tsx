import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/Button";
import { Segmented } from "../../components/ui/Segmented";
import { Sheet } from "../../components/ui/Sheet";
import { SyncChip } from "../../components/shell/SyncChip";
import { api } from "../../lib/api";
import { signOutUser, useAuth } from "../../lib/auth";
import { getLanguage, setLanguage, type AppLanguage } from "../../lib/i18n";
import { fonts, radius, space, withAlpha, type Palette } from "../../lib/theme";
import { useTheme, type ThemePreference } from "../../lib/theme-context";
import type { Equipment, Experience, TrainingProfile, Unit, User } from "../../lib/types";

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Which splits work at a given weekly frequency — mirrors the server (and
 * web/src/lib/types.ts's splitCompatible), duplicated locally since
 * lib/types.ts isn't in this screen's file list. */
type SplitStyle = "full_body" | "upper_lower" | "push_pull_legs" | "body_part";
type SplitChoice = "auto" | SplitStyle;
const SPLIT_OPTIONS: SplitChoice[] = ["auto", "full_body", "upper_lower", "push_pull_legs", "body_part"];

function splitCompatible(s: SplitStyle, days: number): boolean {
  switch (s) {
    case "full_body":
      return days >= 1 && days <= 4;
    case "upper_lower":
      return days >= 2 && days <= 5;
    case "push_pull_legs":
      return days === 3 || days === 5 || days === 6;
    case "body_part":
      return days >= 4 && days <= 6;
  }
}

const EXPERIENCE_OPTIONS: Experience[] = ["beginner", "intermediate", "advanced"];

const EQUIPMENT_OPTIONS: Equipment[] = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "kettlebell",
  "band",
  "bench",
  "pullup_bar",
  "dip_bar",
  "rowing_machine",
];

export default function Profile() {
  const router = useRouter();
  const auth = useAuth();
  const { colors, type, preference, setPreference } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const [me, setMe] = useState<User | null>(null);
  const [profiles, setProfiles] = useState<TrainingProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingBody, setSavingBody] = useState(false);
  const [bodySaved, setBodySaved] = useState(false);

  // Body details draft (strings while typing; parsed on save)
  const [height, setHeight] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [sex, setSex] = useState<"" | "male" | "female">("");

  const [goalSheetOpen, setGoalSheetOpen] = useState(false);
  const [experienceSheetOpen, setExperienceSheetOpen] = useState(false);
  const [splitSheetOpen, setSplitSheetOpen] = useState(false);

  // Local optimistic equipment state (revert-on-failure).
  const [localEquipment, setLocalEquipment] = useState<Equipment[] | null>(null);

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
      Promise.all([api.getMe(), api.getProfiles().catch(() => [])])
        .then(([u, profs]) => {
          if (cancelled) return;
          setMe(u);
          setProfiles(profs);
          setHeight(u.heightCm ? String(u.heightCm) : "");
          setBirthYear(u.birthYear ? String(u.birthYear) : "");
          setSex(u.sex ?? "");
          setLocalEquipment(null);
        })
        .catch(() => {})
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const equipment = localEquipment ?? me?.equipment ?? [];

  const selectedProfile = profiles.find((p) => p.goal === me?.goal);
  const freqMin = selectedProfile?.frequencyMin ?? 2;
  const freqMax = selectedProfile?.frequencyMax ?? 6;
  const daysOptions = Array.from({ length: Math.max(0, freqMax - freqMin + 1) }, (_, i) => ({
    value: String(freqMin + i),
    label: String(freqMin + i),
  }));

  /** Whole-object upsert on the server. */
  async function save(patch: Partial<User>): Promise<User | null> {
    if (!me) return null;
    const prev = me;
    const optimistic = { ...me, ...patch };
    setMe(optimistic);
    try {
      const updated = await api.putMe({ ...me, ...patch });
      setMe(updated);
      return updated;
    } catch {
      setMe(prev);
      return null;
    }
  }

  async function handleGoalChange(newGoal: string) {
    const prof = profiles.find((p) => p.goal === newGoal);
    const clampedDays = prof
      ? Math.min(prof.frequencyMax, Math.max(prof.frequencyMin, me?.daysPerWeek ?? prof.frequencyMin))
      : me?.daysPerWeek;
    await save({ goal: newGoal as User["goal"], daysPerWeek: clampedDays });
    setGoalSheetOpen(false);
  }

  async function handleExperienceChange(exp: Experience) {
    await save({ experience: exp });
    setExperienceSheetOpen(false);
  }

  async function handleDaysChange(v: string) {
    await save({ daysPerWeek: Number(v) });
  }

  async function handleSplitChange(value: SplitChoice) {
    await save({ splitPreference: value === "auto" ? undefined : value });
    setSplitSheetOpen(false);
  }

  function toggleEquipment(item: Equipment) {
    if (item === "bodyweight" || !me) return;
    const current = new Set(equipment);
    if (current.has(item)) current.delete(item);
    else current.add(item);
    const next = [...current];
    setLocalEquipment(next);
    void api
      .putMe({ ...me, equipment: next })
      .then((updated) => {
        setMe(updated);
        setLocalEquipment(null);
      })
      .catch(() => {
        setLocalEquipment(null); // revert to me.equipment
      });
  }

  async function setUnit(unit: Unit) {
    if (!me || unit === me.unit) return;
    await save({ unit });
  }

  async function saveBody() {
    if (!me) return;
    setSavingBody(true);
    setBodySaved(false);
    try {
      const h = parseInt(height, 10);
      const y = parseInt(birthYear, 10);
      const updated = await save({
        heightCm: Number.isFinite(h) && h > 0 ? h : undefined,
        birthYear: Number.isFinite(y) && y > 0 ? y : undefined,
        sex: sex || undefined,
      });
      if (updated) setBodySaved(true);
    } finally {
      setSavingBody(false);
    }
  }

  async function onSignOut() {
    await signOutUser();
    router.replace("/sign-in");
  }

  if (loading && !me) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.topbar}>
          <Text style={type.title}>{t("profile.title")}</Text>
          <SyncChip />
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!me) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.topbar}>
          <Text style={type.title}>{t("profile.title")}</Text>
          <SyncChip />
        </View>
        <Text style={[type.bodyVariant, styles.scroll]}>{t("profile.loadError")}</Text>
      </SafeAreaView>
    );
  }

  const goalDisplayName = GOAL_LABELS[me.goal] ?? me.goal;
  const experienceDisplay = t(`onboarding.experience.${me.experience}.title`, { defaultValue: cap(me.experience) });
  const splitDisplay = t(`common.splits.${me.splitPreference ?? "auto"}`, { defaultValue: me.splitPreference ?? "auto" });
  const clampedDays = daysOptions.length ? Math.min(freqMax, Math.max(freqMin, me.daysPerWeek)) : me.daysPerWeek;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topbar}>
        <Text style={type.title}>{t("profile.title")}</Text>
        <SyncChip />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Training */}
        <Text style={[type.label, styles.sectionLabel]}>{t("profile.sections.training")}</Text>
        <View style={styles.card}>
          <Pressable style={styles.rowButton} onPress={() => setGoalSheetOpen(true)}>
            <Text style={type.bodyMd}>{t("profile.goal")}</Text>
            <Text style={type.bodyVariant}>{goalDisplayName}</Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable style={styles.rowButton} onPress={() => setExperienceSheetOpen(true)}>
            <Text style={type.bodyMd}>{t("profile.experience")}</Text>
            <Text style={type.bodyVariant}>{experienceDisplay}</Text>
          </Pressable>
          <View style={styles.divider} />
          <View style={styles.rowStack}>
            <Text style={type.bodyMd}>{t("profile.daysPerWeek")}</Text>
            {daysOptions.length > 0 ? (
              <Segmented options={daysOptions} value={String(clampedDays)} onChange={(v) => void handleDaysChange(v)} />
            ) : (
              <Text style={type.bodyVariant}>{t("profile.selectGoalFirst")}</Text>
            )}
          </View>
          <View style={styles.divider} />
          <Pressable style={styles.rowButton} onPress={() => setSplitSheetOpen(true)}>
            <Text style={type.bodyMd}>{t("profile.split.label")}</Text>
            <Text style={type.bodyVariant}>{splitDisplay}</Text>
          </Pressable>
        </View>

        {/* Equipment */}
        <Text style={[type.label, styles.sectionLabel]}>{t("profile.sections.equipment")}</Text>
        <View style={styles.chipRow}>
          {EQUIPMENT_OPTIONS.map((value) => {
            const selected = equipment.includes(value);
            return (
              <Pressable
                key={value}
                onPress={() => toggleEquipment(value)}
                style={[
                  styles.equipChip,
                  selected
                    ? { backgroundColor: withAlpha(colors.primary, 0.14), borderColor: withAlpha(colors.primary, 0.4) }
                    : { backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant },
                ]}
              >
                <Text style={[type.body, { color: selected ? colors.primary : colors.onSurfaceVariant }]}>
                  {EQUIP_LABELS[value] ?? value}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[type.bodyVariant, styles.px1, styles.mb2]}>{t("profile.bodyweightAlways")}</Text>

        {/* Redo setup */}
        <Button label={t("profile.redoSetup")} variant="secondary" onPress={() => router.push("/onboarding")} style={styles.mt2} />
        <Text style={[type.bodyVariant, styles.px1, styles.mt2, styles.mb6]}>{t("profile.redoSetupHint")}</Text>

        {/* Body */}
        <Text style={[type.label, styles.sectionLabel]}>{t("profile.sections.body")}</Text>
        <View style={styles.card}>
          <View style={styles.rowStack}>
            <Text style={type.bodyMd}>{t("profile.heightCm")}</Text>
            <TextInput
              value={height}
              onChangeText={setHeight}
              keyboardType="number-pad"
              placeholder={t("profile.heightPlaceholder")}
              placeholderTextColor={colors.onSurfaceVariant}
              style={styles.input}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.rowStack}>
            <Text style={type.bodyMd}>{t("profile.birthYear")}</Text>
            <TextInput
              value={birthYear}
              onChangeText={setBirthYear}
              keyboardType="number-pad"
              placeholder={t("profile.birthYearPlaceholder")}
              placeholderTextColor={colors.onSurfaceVariant}
              style={styles.input}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.rowStack}>
            <Text style={type.bodyMd}>{t("profile.sex")}</Text>
            <Segmented
              options={[
                { value: "male", label: t("profile.sexOptions.male") },
                { value: "female", label: t("profile.sexOptions.female") },
              ]}
              value={sex as "male" | "female"}
              onChange={(v) => setSex(v)}
            />
          </View>
        </View>
        <Button
          label={bodySaved ? t("profile.saved") : t("profile.saveBodyDetails")}
          variant="secondary"
          loading={savingBody}
          onPress={() => void saveBody()}
          style={styles.mt2}
        />
        <Text style={[type.bodyVariant, styles.px1, styles.mt2, styles.mb6]}>{t("profile.bodyHint")}</Text>

        {/* Preferences */}
        <Text style={[type.label, styles.sectionLabel]}>{t("profile.sections.preferences")}</Text>
        <View style={styles.card}>
          <View style={styles.rowStack}>
            <Text style={type.bodyMd}>{t("profile.weightUnit")}</Text>
            <Segmented
              options={[
                { value: "kg", label: "kg" },
                { value: "lb", label: "lb" },
              ]}
              value={me.unit}
              onChange={(v) => void setUnit(v as Unit)}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.rowStack}>
            <Text style={type.bodyMd}>{t("profile.theme")}</Text>
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
          <View style={styles.divider} />
          <View style={styles.rowStack}>
            <Text style={type.bodyMd}>{t("profile.language")}</Text>
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

        {/* Account */}
        <Text style={[type.label, styles.sectionLabel]}>{t("profile.sections.account")}</Text>
        <View style={styles.card}>
          {auth.email && (
            <View style={styles.rowButton}>
              <Text style={type.bodyMd}>{t("profile.email")}</Text>
              <Text style={type.bodyVariant}>{auth.email}</Text>
            </View>
          )}
          <View style={styles.divider} />
          <Button label={t("profile.signOut")} variant="ghost" onPress={onSignOut} />
        </View>
      </ScrollView>

      {/* Goal sheet */}
      <Sheet open={goalSheetOpen} onClose={() => setGoalSheetOpen(false)} title={t("profile.goalSheetTitle")}>
        <View style={{ gap: space(3), paddingTop: space(1) }}>
          {profiles.map((p) => {
            const selected = me.goal === p.goal;
            return (
              <Pressable
                key={p.goal}
                onPress={() => void handleGoalChange(p.goal)}
                style={[
                  styles.goalCard,
                  selected
                    ? { backgroundColor: withAlpha(colors.primary, 0.08), borderColor: withAlpha(colors.primary, 0.5) }
                    : { backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant },
                ]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={type.title}>{t(`common.goals.${p.goal}.name`, { defaultValue: p.displayName })}</Text>
                  <Text style={[type.bodyVariant, styles.mt1]}>
                    {t(`common.goals.${p.goal}.summary`, { defaultValue: p.summary })}
                  </Text>
                </View>
                <View
                  style={[
                    styles.freqBadge,
                    selected
                      ? { backgroundColor: withAlpha(colors.primary, 0.12), borderColor: withAlpha(colors.primary, 0.4) }
                      : { backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outlineVariant },
                  ]}
                >
                  <Text style={[type.label, { color: selected ? colors.primary : colors.onSurfaceVariant }]}>
                    {t("profile.freqRange", { min: p.frequencyMin, max: p.frequencyMax })}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </Sheet>

      {/* Experience sheet */}
      <Sheet open={experienceSheetOpen} onClose={() => setExperienceSheetOpen(false)} title={t("profile.experienceSheetTitle")}>
        <View style={{ gap: space(3), paddingTop: space(1) }}>
          {EXPERIENCE_OPTIONS.map((value) => {
            const selected = me.experience === value;
            return (
              <Pressable
                key={value}
                onPress={() => void handleExperienceChange(value)}
                style={[
                  styles.goalCard,
                  selected
                    ? { backgroundColor: withAlpha(colors.primary, 0.08), borderColor: withAlpha(colors.primary, 0.5) }
                    : { backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant },
                ]}
              >
                <Text style={type.title}>{t(`onboarding.experience.${value}.title`, { defaultValue: cap(value) })}</Text>
                <Text style={[type.bodyVariant, styles.mt1]}>{t(`onboarding.experience.${value}.description`)}</Text>
              </Pressable>
            );
          })}
        </View>
      </Sheet>

      {/* Split sheet */}
      <Sheet open={splitSheetOpen} onClose={() => setSplitSheetOpen(false)} title={t("profile.split.title")}>
        <View style={{ gap: space(3), paddingTop: space(1) }}>
          {SPLIT_OPTIONS.map((value) => {
            const selected = (me.splitPreference ?? "auto") === value;
            const compatible = value === "auto" || splitCompatible(value, me.daysPerWeek);
            return (
              <Pressable
                key={value}
                disabled={!compatible}
                onPress={() => void handleSplitChange(value)}
                style={[
                  styles.goalCard,
                  selected
                    ? { backgroundColor: withAlpha(colors.primary, 0.08), borderColor: withAlpha(colors.primary, 0.5) }
                    : { backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant },
                  !compatible && styles.disabledCard,
                ]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={type.title}>{t(`common.splits.${value}`)}</Text>
                  <Text style={[type.bodyVariant, styles.mt1]}>{t(`profile.split.desc.${value}`)}</Text>
                </View>
                {!compatible && (
                  <View style={[styles.freqBadge, { backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outlineVariant }]}>
                    <Text style={[type.label, { color: colors.onSurfaceVariant }]}>
                      {t("profile.split.needsDays", { range: t(`profile.split.range.${value}`) })}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </SafeAreaView>
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
      justifyContent: "space-between",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.outlineVariant,
    },
    scroll: { padding: space(4) },
    center: { paddingVertical: space(16), alignItems: "center" },
    sectionLabel: { marginBottom: space(2), marginTop: space(2), paddingHorizontal: space(1) },
    card: {
      backgroundColor: colors.surfaceContainer,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      overflow: "hidden",
    },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.outlineVariant },
    rowButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: space(4),
      paddingVertical: space(3.5),
      gap: space(2),
    },
    rowStack: { paddingHorizontal: space(4), paddingVertical: space(3.5), gap: space(3) },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space(2), marginBottom: space(2) },
    equipChip: {
      minHeight: 44,
      paddingHorizontal: space(4),
      borderRadius: radius.pill,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    input: {
      height: 48,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      paddingHorizontal: space(3),
      fontFamily: fonts.body,
      fontSize: 16,
      color: colors.onSurface,
    },
    goalCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: space(3),
      borderRadius: radius.xl,
      borderWidth: 1,
      padding: space(4),
    },
    disabledCard: { opacity: 0.5 },
    freqBadge: {
      borderRadius: radius.pill,
      borderWidth: 1,
      paddingHorizontal: space(2),
      paddingVertical: 2,
      marginTop: 2,
    },
    px1: { paddingHorizontal: space(1) },
    mt1: { marginTop: space(1) },
    mt2: { marginTop: space(2) },
    mb2: { marginBottom: space(2) },
    mb6: { marginBottom: space(6) },
  });
