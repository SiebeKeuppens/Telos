import { useEffect, useMemo, useState } from "react";
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
import { Button } from "../components/ui/Button";
import { Segmented } from "../components/ui/Segmented";
import { api } from "../lib/api";
import { colors, fonts, radius, space, type } from "../lib/theme";
import type { Equipment, Experience, Goal, TrainingProfile, Unit } from "../lib/types";

const TOTAL_STEPS = 6;

const EQUIPMENT: { value: Equipment; label: string }[] = [
  { value: "barbell", label: "Barbell" },
  { value: "dumbbell", label: "Dumbbell" },
  { value: "machine", label: "Machine" },
  { value: "cable", label: "Cable" },
  { value: "kettlebell", label: "Kettlebell" },
  { value: "band", label: "Band" },
  { value: "bench", label: "Bench" },
  { value: "pullup_bar", label: "Pull-up bar" },
  { value: "dip_bar", label: "Dip bar" },
  { value: "rowing_machine", label: "Rowing machine" },
];

const EXPERIENCE: { value: Experience; title: string; desc: string }[] = [
  {
    value: "beginner",
    title: "Beginner",
    desc: "New to lifting, or back after a long break — under ~6 months consistent.",
  },
  {
    value: "intermediate",
    title: "Intermediate",
    desc: "Comfortable with the main lifts and progressing steadily — a year or two in.",
  },
  {
    value: "advanced",
    title: "Advanced",
    desc: "Years of consistent training, working close to your potential.",
  },
];

function Dots({ total, current }: { total: number; current: number }) {
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
}: {
  title: string;
  subtitle: string;
  badge?: string;
  selected: boolean;
  onPress: () => void;
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
      });
      router.replace("/today");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Couldn't save. Check your connection.",
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
        <Dots total={TOTAL_STEPS} current={step} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {step === 0 && (
          <View style={styles.stepGap}>
            <Text style={type.display}>Telos</Text>
            <Text style={type.bodyVariant}>
              A few questions and we'll program your training. Takes a minute.
            </Text>
            <View style={{ gap: space(2), marginTop: space(2) }}>
              <Text style={type.label}>YOUR NAME (OPTIONAL)</Text>
              <TextInput
                placeholder="What should we call you?"
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
            <Text style={type.title}>What's your goal?</Text>
            <Text style={type.bodyVariant}>This shapes everything that follows.</Text>
            {profilesError && (
              <Text style={styles.err}>Couldn't load goals. Pull back and retry.</Text>
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
                  badge={`${p.frequencyMin}–${p.frequencyMax}×/wk`}
                  selected={goal === p.goal}
                  onPress={() => setGoal(p.goal)}
                />
              ))}
            </View>
          </View>
        )}

        {step === 2 && (
          <View style={styles.stepGap}>
            <Text style={type.title}>How experienced are you?</Text>
            <Text style={type.bodyVariant}>We'll set starting intensity from this.</Text>
            <View style={{ gap: space(3), marginTop: space(2) }}>
              {EXPERIENCE.map((e) => (
                <SelectCard
                  key={e.value}
                  title={e.title}
                  subtitle={e.desc}
                  selected={experience === e.value}
                  onPress={() => setExperience(e.value)}
                />
              ))}
            </View>
          </View>
        )}

        {step === 3 && (
          <View style={styles.stepGap}>
            <Text style={type.title}>How many days a week?</Text>
            <Text style={type.bodyVariant}>
              {selectedProfile
                ? `${selectedProfile.displayName} works best at ${freqMin}–${freqMax} sessions a week.`
                : ""}
            </Text>
            <View style={{ marginTop: space(2) }}>
              <Segmented
                options={dayOptions}
                value={String(daysPerWeek)}
                onChange={(v) => setDaysPerWeek(Number(v))}
              />
            </View>
            <Text style={type.bodyVariant}>{daysPerWeek} days per week.</Text>
          </View>
        )}

        {step === 4 && (
          <View style={styles.stepGap}>
            <Text style={type.title}>What can you train with?</Text>
            <Text style={type.bodyVariant}>Pick everything you have access to.</Text>
            <View style={styles.chips}>
              {EQUIPMENT.map((eq) => {
                const on = equipment.has(eq.value);
                return (
                  <Pressable
                    key={eq.value}
                    onPress={() => toggleEquipment(eq.value)}
                    style={[styles.chip, on && styles.chipOn]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>
                      {eq.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={type.bodyVariant}>
              Bodyweight is always available — no need to pick it.
            </Text>
          </View>
        )}

        {step === 5 && (
          <View style={styles.stepGap}>
            <Text style={type.title}>Last bit</Text>
            <View style={{ gap: space(2), marginTop: space(2) }}>
              <Text style={type.label}>UNITS</Text>
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
              <Text style={type.label}>INJURIES / LIMITATIONS (OPTIONAL)</Text>
              <TextInput
                placeholder="Anything we should train around?"
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
            label="Back"
            variant="ghost"
            onPress={() => setStep((s) => s - 1)}
            style={{ flexBasis: 96 }}
          />
        ) : null}
        <Button
          label={
            submitting
              ? "Building…"
              : step === TOTAL_STEPS - 1
                ? "Build my plan"
                : "Continue"
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

const styles = StyleSheet.create({
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
