import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Button } from "../components/ui/Button";
import { Segmented } from "../components/ui/Segmented";
import { api } from "../lib/api";
import { fonts, radius, space, type Palette } from "../lib/theme";
import { useTheme } from "../lib/theme-context";
import type { Equipment, Experience, Goal, TrainingProfile, Unit, User } from "../lib/types";

const TOTAL_STEPS = 6;

const EQUIPMENT: Equipment[] = [
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

const EXPERIENCE: Experience[] = ["beginner", "intermediate", "advanced"];

function Dots({
  total,
  current,
  styles,
}: {
  total: number;
  current: number;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.dots}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i === current && styles.dotActive,
            i < current && styles.dotDone,
          ]}
        />
      ))}
    </View>
  );
}

function SelectCard({
  title,
  subtitle,
  badge,
  selected,
  onPress,
  styles,
  type,
}: {
  title: string;
  subtitle: string;
  badge?: string;
  selected: boolean;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
  type: ReturnType<typeof useTheme>["type"];
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, selected && styles.cardSelected]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <View style={{ flex: 1, gap: space(1) }}>
        <Text style={type.title}>{title}</Text>
        <Text style={type.bodyVariant}>{subtitle}</Text>
      </View>
      {badge ? (
        <View style={[styles.badge, selected && styles.badgeSelected]}>
          <Text style={[styles.badgeText, selected && styles.badgeTextSelected]}>
            {badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function Onboarding() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors, type } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState<Goal>("build_muscle");
  const [experience, setExperience] = useState<Experience>("intermediate");
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [equipment, setEquipment] = useState<Set<Equipment>>(
    new Set<Equipment>(["barbell", "bench"]),
  );
  const [unit, setUnit] = useState<Unit>("kg");
  const [limitations, setLimitations] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [profiles, setProfiles] = useState<TrainingProfile[]>([]);
  const [profilesError, setProfilesError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getProfiles()
      .then((p) => !cancelled && setProfiles(p))
      .catch(() => !cancelled && setProfilesError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // Revisit mode: re-running the wizard from Profile ("Redo setup"). The user
  // already exists, so prefill every step from their current answers instead
  // of a blank slate. A first-run account has no onboardedAt and keeps
  // defaults (getMe() may also 404/error here — ignored either way).
  const [me, setMe] = useState<User | null>(null);
  const seeded = useRef(false);
  useEffect(() => {
    let cancelled = false;
    api
      .getMe()
      .then((u) => !cancelled && setMe(u))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const revisit = Boolean(me?.onboardedAt);
  useEffect(() => {
    if (seeded.current || !me?.onboardedAt) return;
    seeded.current = true;
    setName(me.displayName ?? "");
    setGoal(me.goal);
    setExperience(me.experience);
    setDaysPerWeek(me.daysPerWeek);
    setEquipment(new Set(me.equipment.filter((e) => e !== "bodyweight")));
    setUnit(me.unit);
    setLimitations(me.limitations ?? "");
  }, [me]);

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.goal === goal),
    [profiles, goal],
  );
  const freqMin = selectedProfile?.frequencyMin ?? 2;
  const freqMax = selectedProfile?.frequencyMax ?? 6;

  // Keep days within the selected goal's range as profiles load / goal changes.
  useEffect(() => {
    if (!selectedProfile) return;
    setDaysPerWeek((d) => Math.min(freqMax, Math.max(freqMin, d)));
  }, [selectedProfile, freqMin, freqMax]);

  function toggleEquipment(item: Equipment) {
    setEquipment((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  }

  const dayOptions = useMemo(
    () =>
      Array.from({ length: freqMax - freqMin + 1 }, (_, i) => ({
        value: String(freqMin + i),
        label: String(freqMin + i),
      })),
    [freqMin, freqMax],
  );

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await api.putMe({
        displayName: name.trim() || undefined,
        goal,
        experience,
        daysPerWeek,
        equipment: [...equipment, "bodyweight"],
        unit,
        limitations: limitations.trim() || undefined,
        // The wizard doesn't collect these — carry the existing values
        // through so a revisit doesn't clear them (whole-object upsert).
        heightCm: me?.heightCm,
        birthYear: me?.birthYear,
        sex: me?.sex,
        splitPreference: me?.splitPreference,
      });
      if (revisit && router.canGoBack()) {
        router.back();
      } else {
        router.replace("/today");
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("onboarding.errors.saveFailed"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  const canContinue =
    step !== 1 || (profiles.length > 0 && !!selectedProfile);

  function next() {
    if (step < TOTAL_STEPS - 1) setStep((s) => s + 1);
    else void submit();
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.dotsWrap}>
        <Dots total={TOTAL_STEPS} current={step} styles={styles} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {step === 0 && (
          <View style={styles.stepGap}>
            <Text style={type.display}>{t("common.appName")}</Text>
            <Text style={type.bodyVariant}>
              {t("onboarding.welcome.introNew")}
            </Text>
            <View style={{ gap: space(2), marginTop: space(2) }}>
              <Text style={type.label}>{t("onboarding.welcome.nameLabel")}</Text>
              <TextInput
                placeholder={t("onboarding.welcome.namePlaceholder")}
                placeholderTextColor={colors.onSurfaceVariant}
                value={name}
                onChangeText={setName}
                style={styles.input}
              />
            </View>
          </View>
        )}

        {step === 1 && (
          <View style={styles.stepGap}>
            <Text style={type.title}>{t("onboarding.goal.heading")}</Text>
            <Text style={type.bodyVariant}>{t("onboarding.goal.sub")}</Text>
            {profilesError && (
              <Text style={styles.err}>{t("onboarding.goal.loadError")}</Text>
            )}
            {profiles.length === 0 && !profilesError && (
              <ActivityIndicator color={colors.primary} style={{ marginTop: space(4) }} />
            )}
            <View style={{ gap: space(3), marginTop: space(2) }}>
              {profiles.map((p) => (
                <SelectCard
                  key={p.goal}
                  title={p.displayName}
                  subtitle={p.summary}
                  badge={t("onboarding.goal.frequency", {
                    min: p.frequencyMin,
                    max: p.frequencyMax,
                  })}
                  selected={goal === p.goal}
                  onPress={() => setGoal(p.goal)}
                  styles={styles}
                  type={type}
                />
              ))}
            </View>
          </View>
        )}

        {step === 2 && (
          <View style={styles.stepGap}>
            <Text style={type.title}>{t("onboarding.experience.heading")}</Text>
            <Text style={type.bodyVariant}>{t("onboarding.experience.sub")}</Text>
            <View style={{ gap: space(3), marginTop: space(2) }}>
              {EXPERIENCE.map((e) => (
                <SelectCard
                  key={e}
                  title={t(`onboarding.experience.${e}.title`)}
                  subtitle={t(`onboarding.experience.${e}.description`)}
                  selected={experience === e}
                  onPress={() => setExperience(e)}
                  styles={styles}
                  type={type}
                />
              ))}
            </View>
          </View>
        )}

        {step === 3 && (
          <View style={styles.stepGap}>
            <Text style={type.title}>{t("onboarding.days.heading")}</Text>
            <Text style={type.bodyVariant}>
              {selectedProfile
                ? t("onboarding.days.sub", {
                    goal: selectedProfile.displayName,
                    min: freqMin,
                    max: freqMax,
                  })
                : ""}
            </Text>
            <View style={{ marginTop: space(2) }}>
              <Segmented
                options={dayOptions}
                value={String(daysPerWeek)}
                onChange={(v) => setDaysPerWeek(Number(v))}
              />
            </View>
            <Text style={type.bodyVariant}>
              {t("onboarding.days.perWeek", { count: daysPerWeek })}
            </Text>
          </View>
        )}

        {step === 4 && (
          <View style={styles.stepGap}>
            <Text style={type.title}>{t("onboarding.equipment.heading")}</Text>
            <Text style={type.bodyVariant}>{t("onboarding.equipment.sub")}</Text>
            <View style={styles.chips}>
              {EQUIPMENT.map((eq) => {
                const on = equipment.has(eq);
                return (
                  <Pressable
                    key={eq}
                    onPress={() => toggleEquipment(eq)}
                    style={[styles.chip, on && styles.chipOn]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>
                      {t(`common.equipment.${eq}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={type.bodyVariant}>
              {t("onboarding.equipment.bodyweightNote")}
            </Text>
          </View>
        )}

        {step === 5 && (
          <View style={styles.stepGap}>
            <Text style={type.title}>{t("onboarding.extras.heading")}</Text>
            <View style={{ gap: space(2), marginTop: space(2) }}>
              <Text style={type.label}>{t("onboarding.extras.unitLabel")}</Text>
              <Segmented
                options={[
                  { value: "kg", label: "kg" },
                  { value: "lb", label: "lb" },
                ]}
                value={unit}
                onChange={(v) => setUnit(v as Unit)}
              />
            </View>
            <View style={{ gap: space(2), marginTop: space(4) }}>
              <Text style={type.label}>{t("onboarding.extras.limitationsLabel")}</Text>
              <TextInput
                placeholder={t("onboarding.extras.limitationsPlaceholder")}
                placeholderTextColor={colors.onSurfaceVariant}
                value={limitations}
                onChangeText={setLimitations}
                multiline
                style={[styles.input, styles.textarea]}
              />
            </View>
            {error && <Text style={styles.err}>{error}</Text>}
          </View>
        )}
      </ScrollView>

      <View style={styles.bottom}>
        {step > 0 ? (
          <Button
            label={t("common.back")}
            variant="ghost"
            onPress={() => setStep((s) => s - 1)}
            style={{ flexBasis: 96 }}
          />
        ) : null}
        <Button
          label={
            submitting
              ? revisit
                ? t("onboarding.cta.updating")
                : t("onboarding.cta.building")
              : step === TOTAL_STEPS - 1
                ? revisit
                  ? t("onboarding.cta.updatePlan")
                  : t("onboarding.cta.buildPlan")
                : t("common.continue")
          }
          onPress={next}
          loading={submitting}
          disabled={!canContinue}
          style={{ flex: 1 }}
        />
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    dotsWrap: { paddingTop: space(3), paddingBottom: space(1) },
    dots: { flexDirection: "row", gap: space(1.5), justifyContent: "center" },
    dot: { height: 6, width: 6, borderRadius: 3, backgroundColor: colors.outlineVariant },
    dotActive: { width: 20, backgroundColor: colors.primary },
    dotDone: { backgroundColor: colors.primary, opacity: 0.4 },

    scroll: { padding: space(4), paddingBottom: space(8) },
    stepGap: { gap: space(2) },

    input: {
      minHeight: 48,
      borderRadius: radius.base,
      backgroundColor: colors.surfaceContainer,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      paddingHorizontal: space(4),
      paddingVertical: space(3),
      fontFamily: fonts.body,
      fontSize: 16,
      color: colors.onSurface,
    },
    textarea: { minHeight: 96, textAlignVertical: "top" },

    card: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: space(3),
      backgroundColor: colors.surfaceContainer,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      borderRadius: radius.xl,
      padding: space(4),
    },
    cardSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryContainer,
    },
    badge: {
      paddingHorizontal: space(2),
      paddingVertical: space(1),
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceContainerHigh,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    badgeSelected: { borderColor: colors.primary, backgroundColor: "transparent" },
    badgeText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.onSurfaceVariant },
    badgeTextSelected: { color: colors.onPrimaryContainer },

    chips: { flexDirection: "row", flexWrap: "wrap", gap: space(2), marginTop: space(2) },
    chip: {
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: space(4),
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceContainer,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    chipOn: { borderColor: colors.primary, backgroundColor: colors.primaryContainer },
    chipText: { fontFamily: fonts.body, fontSize: 14, color: colors.onSurfaceVariant },
    chipTextOn: { color: colors.onPrimaryContainer },

    err: { fontFamily: fonts.body, fontSize: 13, color: colors.error },

    bottom: {
      flexDirection: "row",
      gap: space(3),
      paddingHorizontal: space(4),
      paddingTop: space(3),
      paddingBottom: space(2),
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.outlineVariant,
    },
  });
