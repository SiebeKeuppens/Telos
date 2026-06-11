import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Arc } from "../components/ui/Arc";
import { Button } from "../components/ui/Button";
import { Input, Field } from "../components/ui/Input";
import { signInWithGoogle, signInWithEmail, registerWithEmail } from "../lib/firebase";

type Mode = "signin" | "register";

export default function SignIn() {
  const { t } = useTranslation("signin");
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleGoogle() {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch {
      setError(t("errors.google"));
    } finally {
      setLoading(false);
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "signin") {
        await signInWithEmail(email, password);
      } else {
        await registerWithEmail(email, password);
      }
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      if (
        code === "auth/wrong-password" ||
        code === "auth/invalid-credential" ||
        code === "auth/user-not-found"
      ) {
        setError(t("errors.wrongPassword"));
      } else if (code === "auth/email-already-in-use") {
        setError(t("errors.emailInUse"));
      } else if (code === "auth/weak-password") {
        setError(t("errors.weakPassword"));
      } else if (code === "auth/invalid-email") {
        setError(t("errors.invalidEmail"));
      } else {
        setError(t("errors.generic"));
      }
    } finally {
      setLoading(false);
    }
  }

  function toggleMode() {
    setMode((m) => (m === "signin" ? "register" : "signin"));
    setError(null);
  }

  return (
    <div className="min-h-dvh bg-surface flex flex-col items-center justify-center px-4 safe-top safe-bottom">
      <div className="w-full max-w-[400px] flex flex-col items-center gap-8 animate-fade">
        {/* Brand block */}
        <div className="flex flex-col items-center gap-4">
          <Arc value={0.75} size={120} />
          <div className="text-center space-y-1.5">
            <h1 className="type-headline-lg text-on-surface">
              {t("appName", { ns: "common" })}
            </h1>
            <p className="type-body-md text-on-surface-variant">
              {t("tagline", { ns: "common" })}
            </p>
          </div>
        </div>

        {/* Auth card */}
        <div className="w-full space-y-4">
          {/* Google */}
          <Button
            type="button"
            variant="secondary"
            onClick={handleGoogle}
            disabled={loading}
            aria-label={t("continueWithGoogle")}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
                fill="var(--primary)"
              />
              <path
                d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
                fill="var(--secondary)"
              />
              <path
                d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
                fill="var(--warning)"
              />
              <path
                d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
                fill="var(--error)"
              />
            </svg>
            {t("continueWithGoogle")}
          </Button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-outline-variant" />
            <span className="type-label text-on-surface-variant">{t("or")}</span>
            <div className="flex-1 h-px bg-outline-variant" />
          </div>

          {/* Email + password */}
          <form onSubmit={handleEmail} className="space-y-3" noValidate>
            <Field label={t("email")}>
              <Input
                type="email"
                autoComplete="email"
                placeholder={t("emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </Field>

            <Field label={t("password")}>
              <Input
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                placeholder={
                  mode === "signin"
                    ? t("passwordPlaceholder")
                    : t("createPasswordPlaceholder")
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </Field>

            {error && (
              <p role="alert" className="type-body-sm text-error">
                {error}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              disabled={loading || !email || !password}
            >
              {loading
                ? t("signingIn")
                : mode === "signin"
                  ? t("signIn")
                  : t("createAccount")}
            </Button>
          </form>

          {/* Mode toggle */}
          <button
            type="button"
            onClick={toggleMode}
            className="w-full text-center type-body-sm text-on-surface-variant active:text-on-surface transition-colors py-2"
          >
            {mode === "signin" ? t("noAccount") : t("haveAccount")}
          </button>
        </div>
      </div>
    </div>
  );
}
