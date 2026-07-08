// Whole-app crash recovery. Two layers, because they catch different things:
//   1. A class error boundary (componentDidCatch) for render/lifecycle throws.
//   2. A global ErrorUtils fatal handler for throws OUTSIDE React entirely —
//      e.g. RN's whatwg-fetch polyfill synchronously constructing an invalid
//      Response (xhr.status 0 → RangeError) inside an XHR callback. That
//      throw happens outside any promise chain and outside React's render
//      phase, so no error boundary can ever see it; without this handler it
//      kills the JS context and leaves a permanently blank screen.
//
// This component must be impossible to crash itself: it sits OUTSIDE every
// provider (theme/auth/i18n may be dead when it renders), so no hooks, no
// context — static palettes via Appearance + darkColors/lightColors, and
// i18n via the singleton with hardcoded English fallbacks.
import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";
import { Appearance, Pressable, StyleSheet, Text, View } from "react-native";
import { darkColors, fonts, lightColors, radius, space } from "../../lib/theme";
import i18n from "../../lib/i18n";

// ---------------------------------------------------------------------------
// Global fatal-error handler, wired to the mounted CrashGuard instance via a
// module-level slot (registered on mount, restored on unmount). Module scope
// rather than instance scope so install/uninstall stays idempotent even if
// React double-mounts in dev.
// ---------------------------------------------------------------------------

let activeGuard: CrashGuard | null = null;
let previousHandler: ReturnType<typeof ErrorUtils.getGlobalHandler> | null = null;
let handlerInstalled = false;

function installGlobalHandler(): void {
  if (handlerInstalled || typeof ErrorUtils === "undefined") return;
  handlerInstalled = true;
  previousHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    // Fatal in production with a mounted guard: take over instead of letting
    // RN tear the context down blank. Everything else (non-fatal errors, all
    // of dev) chains to the original handler so redbox/LogBox and the default
    // logging keep working.
    if (isFatal && !__DEV__ && activeGuard) {
      activeGuard.showFallback(error);
      return;
    }
    previousHandler?.(error, isFatal);
  });
}

function uninstallGlobalHandler(): void {
  if (!handlerInstalled) return;
  handlerInstalled = false;
  if (previousHandler) ErrorUtils.setGlobalHandler(previousHandler);
  previousHandler = null;
}

// ---------------------------------------------------------------------------
// CrashGuard
// ---------------------------------------------------------------------------

type CrashGuardProps = { children: ReactNode };
type CrashGuardState = { hasError: boolean; resetKey: number };

export class CrashGuard extends Component<CrashGuardProps, CrashGuardState> {
  state: CrashGuardState = { hasError: false, resetKey: 0 };

  // Layer 1: render/lifecycle throws below us.
  static getDerivedStateFromError(): Partial<CrashGuardState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    try {
      console.error("CrashGuard: render error", error, errorInfo.componentStack);
    } catch {
      // logging must never make things worse
    }
  }

  componentDidMount(): void {
    activeGuard = this;
    installGlobalHandler();
  }

  componentWillUnmount(): void {
    // Only tear down if we still own the slot (a newer instance may have
    // mounted first during a dev-mode remount).
    if (activeGuard === this) {
      activeGuard = null;
      uninstallGlobalHandler();
    }
  }

  /** Layer 2 entry point, called by the global fatal handler. The throw
   * happened in some event/XHR callback, not during render, so a plain
   * setState is a legal re-entry — but after a fatal error the RN context
   * isn't guaranteed usable, hence the try/catch. */
  showFallback(error: unknown): void {
    try {
      console.error("CrashGuard: fatal JS error", error);
    } catch {
      // ignore
    }
    try {
      this.setState({ hasError: true });
    } catch {
      // Context too broken even for setState — nothing more we can do.
    }
  }

  /** Remount-based recovery (expo-updates isn't installed, so no full JS
   * reload): clear the error and bump the key so everything beneath —
   * providers, navigation, screens — remounts from scratch. Works for the
   * common case where the throw came from an event callback and React itself
   * is fine; if the context is truly dead the tap simply no-ops. */
  private reset = (): void => {
    this.setState((s) => ({ hasError: false, resetKey: s.resetKey + 1 }));
  };

  render(): ReactNode {
    if (this.state.hasError) return <CrashFallback onReload={this.reset} />;
    return <Fragment key={this.state.resetKey}>{this.props.children}</Fragment>;
  }
}

// ---------------------------------------------------------------------------
// Fallback UI — dependency-light and unable to throw. i18n via the singleton
// (no hooks; init may not have completed → hardcoded English fallbacks),
// theme via the OS scheme + static palettes.
// ---------------------------------------------------------------------------

function tSafe(key: string, fallback: string): string {
  try {
    const v = i18n.t(key, { defaultValue: fallback });
    return typeof v === "string" && v.length > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

function CrashFallback({ onReload }: { onReload: () => void }) {
  let c = darkColors; // worst case: hardcoded strings on #0a0f10
  try {
    if (Appearance.getColorScheme() === "light") c = lightColors;
  } catch {
    // keep dark
  }
  return (
    <View style={[styles.root, { backgroundColor: c.surface }]}>
      <Text style={[styles.glyph, { color: c.warning }]}>⚠</Text>
      <Text style={[styles.title, { color: c.onSurface }]}>
        {tSafe("common.crash.title", "Something went wrong")}
      </Text>
      <Text style={[styles.message, { color: c.onSurfaceVariant }]}>
        {tSafe(
          "common.crash.message",
          "The app hit an unexpected error. Your data is safe — reload to continue.",
        )}
      </Text>
      <Pressable
        onPress={onReload}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: c.primary, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={[styles.buttonText, { color: c.onPrimary }]}>
          {tSafe("common.crash.reload", "Reload")}
        </Text>
      </Pressable>
    </View>
  );
}

// Colors are applied inline (scheme is resolved per render); only layout and
// typography live here. Custom fonts fall back to the system face if the
// crash beat font loading.
const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space(6),
  },
  glyph: { fontSize: 40, lineHeight: 48, marginBottom: space(4) },
  title: {
    fontFamily: fonts.head,
    fontSize: 22,
    lineHeight: 30,
    textAlign: "center",
    marginBottom: space(2),
  },
  message: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 24,
    textAlign: "center",
    marginBottom: space(6),
  },
  button: {
    paddingHorizontal: space(6),
    paddingVertical: space(3),
    borderRadius: radius.pill,
  },
  buttonText: { fontFamily: fonts.headMedium, fontSize: 15, lineHeight: 20 },
});
