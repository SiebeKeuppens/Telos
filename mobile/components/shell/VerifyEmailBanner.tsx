// Persistent "verify your email" nudge shown on the tab screens until the
// user verifies or dismisses it for the session. Registering with
// email/password and later signing in with Google on the same (unverified)
// email makes Firebase silently drop the password provider — this closes that
// gap by nudging the user to verify right away. Rendered by (tabs)/_layout as
// a snackbar floating above the tab bar, so the base is opaque
// (surfaceContainerHigh) with the warning border/left-accent on top.
import { useEffect, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { radius, space, withAlpha } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";
import {
  refreshEmailVerification,
  resendVerificationEmail,
  useAuth,
} from "../../lib/auth";

export function VerifyEmailBanner() {
  const auth = useAuth();
  const { colors, type } = useTheme();
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const visible =
    auth.status === "signed_in" && !auth.emailVerified && !dismissed;

  // Firebase caches emailVerified on the User object — poke it when the
  // banner shows and whenever the app foregrounds (the user verifies in the
  // mail app and switches back), so the banner clears without a re-login.
  useEffect(() => {
    if (!visible) return;
    void refreshEmailVerification().catch(() => {});
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refreshEmailVerification().catch(() => {});
      }
    });
    return () => sub.remove();
  }, [visible]);

  if (!visible) {
    return null;
  }

  async function handleResend() {
    setSending(true);
    try {
      await resendVerificationEmail();
      setSent(true);
      setTimeout(() => setSent(false), 2000);
    } catch (err) {
      console.warn("resendVerificationEmail failed", err);
    } finally {
      setSending(false);
    }
  }

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: withAlpha(colors.warning, 0.4),
        backgroundColor: colors.surfaceContainerHigh,
        borderLeftWidth: 3,
        borderLeftColor: colors.warning,
        paddingVertical: space(2),
        paddingHorizontal: space(3),
      }}
    >
      <Text style={[type.body, { color: colors.warning, flex: 1 }]}>
        {t("common.verifyEmail.message")}
      </Text>

      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Pressable onPress={handleResend} disabled={sending} hitSlop={8}>
          <Text
            style={[
              type.label,
              {
                color: colors.warning,
                marginLeft: space(3),
                opacity: sending ? 0.6 : 1,
              },
            ]}
          >
            {sent
              ? t("common.verifyEmail.sent")
              : t("common.verifyEmail.resend")}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setDismissed(true)}
          hitSlop={8}
          accessibilityLabel={t("common.verifyEmail.dismiss")}
          style={{ marginLeft: space(3) }}
        >
          <Text style={[type.label, { color: colors.onSurfaceVariant }]}>
            ×
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
