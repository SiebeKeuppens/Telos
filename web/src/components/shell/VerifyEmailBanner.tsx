// Persistent nudge to verify the email on a password account. Unverified
// password accounts silently lose the password provider if the user later
// signs in with Google using the same email — verifying early prevents that.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../lib/auth";
import {
  refreshEmailVerification,
  resendVerificationEmail,
} from "../../lib/firebase";
import { useToast } from "../ui/Toast";

export function VerifyEmailBanner() {
  const { t } = useTranslation("common");
  const auth = useAuth();
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);

  const visible = auth.status === "signed_in" && !auth.emailVerified && !dismissed;

  // Firebase caches emailVerified on the User object — poke it when the
  // banner shows and whenever the tab regains focus (the user verifies in
  // another tab and comes back), so the banner clears without a re-login.
  useEffect(() => {
    if (!visible) return;
    const refresh = () => void refreshEmailVerification().catch(() => {});
    refresh();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [visible]);

  if (!visible) {
    return null;
  }

  const handleResend = async () => {
    setSending(true);
    try {
      await resendVerificationEmail();
      toast(t("verifyEmail.sent"));
    } catch (err) {
      console.warn("resendVerificationEmail failed", err);
      toast(t("verifyEmail.error"), "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mb-4 rounded-lg px-4 py-3 border border-[color-mix(in_srgb,var(--warning)_40%,var(--outline-variant))] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] text-warning flex items-start gap-3">
      <p className="type-body-sm flex-1">{t("verifyEmail.message")}</p>
      <button
        type="button"
        onClick={handleResend}
        disabled={sending}
        className="type-body-sm underline shrink-0 disabled:opacity-50"
      >
        {t("verifyEmail.resend")}
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label={t("verifyEmail.dismiss")}
        className="type-body-sm shrink-0"
      >
        ×
      </button>
    </div>
  );
}
