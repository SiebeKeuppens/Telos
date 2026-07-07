import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { statusCodes } from "@react-native-google-signin/google-signin";
import Svg, { Path } from "react-native-svg";
import { Button } from "../components/ui/Button";
import { registerWithEmail, signInWithEmail } from "../lib/auth";
import { isGoogleSignInAvailable, signInWithGoogleNative } from "../lib/google";
import { ApiError } from "../lib/api";
import { fonts, radius, space, type Palette } from "../lib/theme";
import { useTheme } from "../lib/theme-context";

type Mode = "signin" | "register";

// Decorative brand mark on sign-in — a static (non-animated, value=0.75)
// rendering of the same 270°-arc geometry as web's Arc.tsx, inlined here
// since the shared Arc component hasn't landed yet (see PARITY_SPEC §5.7).
// Purely decorative: no label/metric, so it's hidden from accessibility.
function BrandArc({ size, colors }: { size: number; colors: Palette }) {
  const strokeWidth = 3.5;
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const startAngle = 135;
  const sweep = 270;
  const value = 0.75;

  function point(angleDeg: number) {
    const a = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  }

  function arcPath(fromDeg: number, toDeg: number) {
    const from = point(fromDeg);
    const to = point(toDeg);
    const large = toDeg - fromDeg > 180 ? 1 : 0;
    return `M ${from.x} ${from.y} A ${r} ${r} 0 ${large} 1 ${to.x} ${to.y}`;
  }

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={size} height={size}>
        <Path
          d={arcPath(startAngle, startAngle + sweep)}
          stroke={colors.outlineVariant}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d={arcPath(startAngle, startAngle + sweep * value)}
          stroke={colors.primary}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}

// Real 4-colour Google "G" mark (viewBox 0 0 18 18), re-themed via palette
// colors instead of web's literal hexes, per PARITY_SPEC §3.1.
function GoogleG({ colors }: { colors: Palette }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18">
      <Path
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
        fill={colors.primary}
      />
      <Path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
        fill={colors.secondary}
      />
      <Path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
        fill={colors.warning}
      />
      <Path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
        fill={colors.error}
      />
    </Svg>
  );
}

export default function SignIn() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors, type } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim().length > 3 && password.length >= 6 && !busy;
  const googleAvailable = isGoogleSignInAvailable();

  function toggleMode() {
    setMode((m) => (m === "signin" ? "register" : "signin"));
    setError(null);
  }

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      if (mode === "signin") {
        await signInWithEmail(email, password);
      } else {
        await registerWithEmail(email, password);
      }
      router.replace("/today");
    } catch (e) {
      const code =
        e instanceof ApiError
          ? undefined
          : ((e as { code?: string } | null)?.code ?? "");
      let msg: string;
      if (e instanceof ApiError) {
        msg = e.message;
      } else if (
        code === "auth/wrong-password" ||
        code === "auth/invalid-credential" ||
        code === "auth/user-not-found"
      ) {
        msg = t("signin.errors.wrongPassword");
      } else if (code === "auth/email-already-in-use") {
        msg = t("signin.errors.emailInUse");
      } else if (code === "auth/weak-password") {
        msg = t("signin.errors.weakPassword");
      } else if (code === "auth/invalid-email") {
        msg = t("signin.errors.invalidEmail");
      } else {
        msg = t("signin.errors.generic");
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function onGoogleSignIn() {
    setGoogleBusy(true);
    setError(null);
    try {
      await signInWithGoogleNative();
      router.replace("/today");
    } catch (e) {
      const code = (e as { code?: string } | null)?.code;
      if (code === statusCodes.SIGN_IN_CANCELLED) {
        // Silent — the user backed out of the account picker on purpose.
      } else {
        setError(t("signin.errors.google"));
      }
    } finally {
      setGoogleBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <View style={styles.body}>
          <View style={styles.header}>
            <BrandArc size={120} colors={colors} />
            <Text style={[type.display, { marginTop: space(4), textAlign: "center" }]}>
              {t("common.appName")}
            </Text>
            <Text style={[type.bodyVariant, { marginTop: space(1), textAlign: "center" }]}>
              {t("common.tagline")}
            </Text>
          </View>

          <View style={styles.form}>
            {googleAvailable && (
              <>
                <Pressable
                  onPress={onGoogleSignIn}
                  disabled={googleBusy}
                  style={({ pressed }) => [
                    styles.googleBtn,
                    pressed && !googleBusy && styles.googleBtnPressed,
                    googleBusy && styles.googleBtnDisabled,
                  ]}
                >
                  {googleBusy ? (
                    <ActivityIndicator color={colors.onSurface} />
                  ) : (
                    <>
                      <GoogleG colors={colors} />
                      <Text style={styles.googleBtnLabel}>
                        {t("signin.continueWithGoogle")}
                      </Text>
                    </>
                  )}
                </Pressable>
                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerLabel}>{t("signin.or")}</Text>
                  <View style={styles.dividerLine} />
                </View>
              </>
            )}

            <View style={styles.field}>
              <Text style={type.label}>{t("signin.email")}</Text>
              <TextInput
                placeholder={t("signin.emailPlaceholder")}
                placeholderTextColor={colors.onSurfaceVariant}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
                style={styles.input}
              />
            </View>

            <View style={styles.field}>
              <Text style={type.label}>{t("signin.password")}</Text>
              <TextInput
                placeholder={
                  mode === "signin"
                    ? t("signin.passwordPlaceholder")
                    : t("signin.createPasswordPlaceholder")
                }
                placeholderTextColor={colors.onSurfaceVariant}
                secureTextEntry
                autoComplete={mode === "signin" ? "current-password" : "password-new"}
                textContentType={mode === "signin" ? "password" : "newPassword"}
                value={password}
                onChangeText={setPassword}
                style={styles.input}
              />
            </View>

            {error && <Text style={styles.error}>{error}</Text>}

            <Button
              label={mode === "signin" ? t("signin.signIn") : t("signin.createAccount")}
              onPress={onSubmit}
              loading={busy}
              disabled={!canSubmit}
            />

            <Text
              accessibilityRole="button"
              onPress={toggleMode}
              style={styles.modeToggle}
            >
              {mode === "signin" ? t("signin.noAccount") : t("signin.haveAccount")}
            </Text>

            <Text style={styles.hint}>
              {t("signin.sameAccountHint")}
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    flex: { flex: 1 },
    body: { flex: 1, justifyContent: "center", paddingHorizontal: space(5) },
    header: { marginBottom: space(8), alignItems: "center" },
    form: { gap: space(3) },
    field: { gap: space(1.5) },
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
    error: { fontFamily: fonts.body, fontSize: 13, color: colors.error },
    googleBtn: {
      height: 48,
      borderRadius: radius.base,
      backgroundColor: colors.surfaceContainerHigh,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: space(2),
      paddingHorizontal: space(5),
    },
    googleBtnPressed: { opacity: 0.85 },
    googleBtnDisabled: { opacity: 0.45 },
    googleBtnLabel: { fontFamily: fonts.headMedium, fontSize: 15, color: colors.onSurface },
    divider: {
      flexDirection: "row",
      alignItems: "center",
      gap: space(3),
      marginVertical: space(1),
    },
    dividerLine: { flex: 1, height: 1, backgroundColor: colors.outlineVariant },
    dividerLabel: {
      fontFamily: fonts.headMedium,
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: 0.96,
      color: colors.onSurfaceVariant,
    },
    modeToggle: {
      fontFamily: fonts.body,
      fontSize: 14,
      color: colors.onSurfaceVariant,
      textAlign: "center",
      paddingVertical: space(2),
    },
    hint: {
      fontFamily: fonts.body,
      fontSize: 12,
      color: colors.onSurfaceVariant,
      textAlign: "center",
      marginTop: space(1),
    },
  });
