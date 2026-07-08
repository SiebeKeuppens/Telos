import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  useFonts,
} from "@expo-google-fonts/space-grotesk";
import { Inter_400Regular, Inter_500Medium } from "@expo-google-fonts/inter";
import { Ionicons } from "@expo/vector-icons";
import "../lib/i18n";
import { AuthProvider } from "../lib/auth";
import { ThemeProvider, useTheme } from "../lib/theme-context";
import { CrashGuard } from "../components/shell/CrashGuard";

// No expo-splash-screen involvement: preventAutoHideAsync + a conditional null
// can leave the (near-black #0a0f10) splash up forever if font loading or
// hideAsync misbehaves in Expo Go — which reads as a "black screen" hang.
// Instead the splash auto-hides on first frame and we render our own loader.
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    Inter_400Regular,
    Inter_500Medium,
    // Tab-bar icon font: Expo Go preloads this, a standalone build must —
    // without it the release APK renders label-only tabs.
    ...Ionicons.font,
  });

  // Fonts are cosmetic — Android falls back to the system face. Never let
  // them block the app for more than a moment.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 3000);
    return () => clearTimeout(t);
  }, []);

  const ready = fontsLoaded || Boolean(fontError) || timedOut;

  // CrashGuard is outermost: its error boundary + global fatal handler catch
  // what would otherwise blank the app, and its Reload remounts (key-bump)
  // every provider and screen beneath it.
  return (
    <CrashGuard>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <RootLayoutInner ready={ready} />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </CrashGuard>
  );
}

// Split out so it can call useTheme() below the providers above.
function RootLayoutInner({ ready }: { ready: boolean }) {
  const { colors, scheme } = useTheme();

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.surface,
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.surface },
          animation: "fade",
        }}
      />
    </>
  );
}
