import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { statusCodes } from "@react-native-google-signin/google-signin";
import { Button } from "../components/ui/Button";
import { signInWithEmail } from "../lib/auth";
import { isGoogleSignInAvailable, signInWithGoogleNative } from "../lib/google";
import { ApiError } from "../lib/api";
import { fonts, radius, space, type Palette } from "../lib/theme";
import { useTheme } from "../lib/theme-context";

export default function SignIn() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors, type } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim().length > 3 && password.length >= 6 && !busy;
  const googleAvailable = isGoogleSignInAvailable();

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      await signInWithEmail(email, password);
      router.replace("/today");
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error && /auth\//.test(e.message)
            ? t("signin.errors.wrongPassword")
            : t("signin.errors.generic");
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
            <Text style={type.display}>{t("common.appName")}</Text>
            <Text style={[type.bodyVariant, { marginTop: space(1) }]}>
              {t("common.tagline")}
            </Text>
          </View>

          <View style={styles.form}>
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
            <TextInput
              placeholder={t("signin.passwordPlaceholder")}
              placeholderTextColor={colors.onSurfaceVariant}
              secureTextEntry
              autoComplete="password"
              value={password}
              onChangeText={setPassword}
              style={styles.input}
            />
            {error && <Text style={styles.error}>{error}</Text>}
            <Button
              label={t("signin.signIn")}
              onPress={onSubmit}
              loading={busy}
              disabled={!canSubmit}
            />
            {googleAvailable && (
              <>
                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerLabel}>{t("signin.or")}</Text>
                  <View style={styles.dividerLine} />
                </View>
                <Button
                  label={t("signin.continueWithGoogle")}
                  variant="secondary"
                  onPress={onGoogleSignIn}
                  loading={googleBusy}
                  disabled={googleBusy}
                />
              </>
            )}
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
    header: { marginBottom: space(8), alignItems: "flex-start" },
    form: { gap: space(3) },
    input: {
      height: 48,
      borderRadius: radius.base,
      backgroundColor: colors.surfaceContainer,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      paddingHorizontal: space(4),
      fontFamily: fonts.body,
      fontSize: 16,
      color: colors.onSurface,
    },
    error: { fontFamily: fonts.body, fontSize: 13, color: colors.error },
    divider: {
      flexDirection: "row",
      alignItems: "center",
      gap: space(3),
      marginVertical: space(1),
    },
    dividerLine: { flex: 1, height: 1, backgroundColor: colors.outlineVariant },
    dividerLabel: {
      fontFamily: fonts.body,
      fontSize: 12,
      color: colors.onSurfaceVariant,
    },
    hint: {
      fontFamily: fonts.body,
      fontSize: 12,
      color: colors.onSurfaceVariant,
      textAlign: "center",
      marginTop: space(1),
    },
  });
