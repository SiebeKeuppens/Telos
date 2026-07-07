import { useState } from "react";
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
import { statusCodes } from "@react-native-google-signin/google-signin";
import { Button } from "../components/ui/Button";
import { signInWithEmail } from "../lib/auth";
import { isGoogleSignInAvailable, signInWithGoogleNative } from "../lib/google";
import { ApiError } from "../lib/api";
import { colors, fonts, radius, space, type } from "../lib/theme";

export default function SignIn() {
  const router = useRouter();
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
            ? "Wrong email or password."
            : "Couldn't sign in. Check your connection and try again.";
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
        setError("Couldn't sign in with Google. Please try again.");
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
            <Text style={type.display}>Telos</Text>
            <Text style={[type.bodyVariant, { marginTop: space(1) }]}>
              Training programmed around your goal.
            </Text>
          </View>

          <View style={styles.form}>
            <TextInput
              placeholder="Email"
              placeholderTextColor={colors.onSurfaceVariant}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
              style={styles.input}
            />
            <TextInput
              placeholder="Password"
              placeholderTextColor={colors.onSurfaceVariant}
              secureTextEntry
              autoComplete="password"
              value={password}
              onChangeText={setPassword}
              style={styles.input}
            />
            {error && <Text style={styles.error}>{error}</Text>}
            <Button
              label="Sign in"
              onPress={onSubmit}
              loading={busy}
              disabled={!canSubmit}
            />
            {googleAvailable && (
              <>
                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerLabel}>or</Text>
                  <View style={styles.dividerLine} />
                </View>
                <Button
                  label="Continue with Google"
                  variant="secondary"
                  onPress={onGoogleSignIn}
                  loading={googleBusy}
                  disabled={googleBusy}
                />
              </>
            )}
            <Text style={styles.hint}>
              Use the same account as the Telos web app.
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
