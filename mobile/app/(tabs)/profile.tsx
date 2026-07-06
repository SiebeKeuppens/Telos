import { useCallback, useState } from "react";
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
import { Button } from "../../components/ui/Button";
import { Segmented } from "../../components/ui/Segmented";
import { api } from "../../lib/api";
import { signOutUser, useAuth } from "../../lib/auth";
import { colors, fonts, radius, space, type } from "../../lib/theme";
import type { Unit, User } from "../../lib/types";

const GOAL_LABELS: Record<string, string> = {
  stay_fit: "Stay Fit",
  build_muscle: "Build Muscle",
  strength: "Strength",
  bodybuilding: "Bodybuilding",
};

const EQUIP_LABELS: Record<string, string> = {
  barbell: "Barbell",
  dumbbell: "Dumbbell",
  machine: "Machine",
  cable: "Cable",
  kettlebell: "Kettlebell",
  band: "Band",
  bench: "Bench",
  pullup_bar: "Pull-up bar",
  dip_bar: "Dip bar",
  rowing_machine: "Rowing machine",
};

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function Profile() {
  const router = useRouter();
  const auth = useAuth();
  const [me, setMe] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingUnit, setSavingUnit] = useState(false);
  // Body details draft (strings while typing; parsed on save)
  const [height, setHeight] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [sex, setSex] = useState<"" | "male" | "female">("");
  const [savingBody, setSavingBody] = useState(false);
  const [bodySaved, setBodySaved] = useState(false);

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
        <Text style={type.title}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {loading && !me ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : me ? (
          <>
            <View style={styles.card}>
              <Text style={styles.kicker}>ACCOUNT</Text>
              <Text style={[type.bodyLg, styles.mt1]}>
                {me.displayName || auth.email?.split("@")[0] || "Athlete"}
              </Text>
              {auth.email && <Text style={type.bodyVariant}>{auth.email}</Text>}
            </View>

            <View style={styles.card}>
              <Text style={styles.kicker}>YOUR PLAN</Text>
              <Row label="Goal" value={GOAL_LABELS[me.goal] ?? me.goal} />
              <Row label="Experience" value={cap(me.experience)} />
              <Row label="Days / week" value={String(me.daysPerWeek)} />
              <Row
                label="Equipment"
                value={
                  equipment.length
                    ? equipment.map((e) => EQUIP_LABELS[e] ?? e).join(", ")
                    : "Bodyweight only"
                }
              />
            </View>

            <View style={styles.card}>
              <View style={styles.unitHead}>
                <Text style={styles.kicker}>UNITS</Text>
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
              <Text style={styles.kicker}>BODY DETAILS</Text>
              <Text style={[type.bodyVariant, styles.mt1]}>
                Powers the daily-energy estimate. Optional.
              </Text>
              <View style={styles.bodyRow}>
                <View style={{ flex: 1, gap: space(1) }}>
                  <Text style={styles.fieldLabel}>Height (cm)</Text>
                  <TextInput
                    value={height}
                    onChangeText={setHeight}
                    keyboardType="number-pad"
                    placeholder="180"
                    placeholderTextColor={colors.onSurfaceVariant}
                    style={styles.input}
                  />
                </View>
                <View style={{ flex: 1, gap: space(1) }}>
                  <Text style={styles.fieldLabel}>Birth year</Text>
                  <TextInput
                    value={birthYear}
                    onChangeText={setBirthYear}
                    keyboardType="number-pad"
                    placeholder="1995"
                    placeholderTextColor={colors.onSurfaceVariant}
                    style={styles.input}
                  />
                </View>
              </View>
              <View style={[styles.mt2, { gap: space(1) }]}>
                <Text style={styles.fieldLabel}>Sex (for the BMR formula)</Text>
                <Segmented
                  options={[
                    { value: "male", label: "Male" },
                    { value: "female", label: "Female" },
                  ]}
                  value={sex as "male" | "female"}
                  onChange={(v) => setSex(v)}
                />
              </View>
              <Button
                label={bodySaved ? "Saved ✓" : "Save body details"}
                variant="secondary"
                loading={savingBody}
                onPress={() => void saveBody()}
                style={styles.mt2}
              />
            </View>

            <Button
              label="Redo setup"
              variant="secondary"
              onPress={() => router.push("/onboarding")}
              style={styles.mt2}
            />
            <Button label="Sign out" variant="ghost" onPress={onSignOut} style={styles.mt2} />
          </>
        ) : (
          <Text style={type.bodyVariant}>Couldn't load your profile.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={[type.bodyVariant, { width: 110 }]}>{label}</Text>
      <Text style={[type.body, { flex: 1 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
