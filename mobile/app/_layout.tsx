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
import { AuthProvider } from "../lib/auth";
import { colors } from "../lib/theme";

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
  });

  // Fonts are cosmetic — Android falls back to the system face. Never let
  // them block the app for more than a moment.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 3000);
    return () => clearTimeout(t);
  }, []);

  const ready = fontsLoaded || Boolean(fontError) || timedOut;

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
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.surface },
            animation: "fade",
          }}
        />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
