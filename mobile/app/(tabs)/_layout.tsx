import type { ComponentProps } from "react";
import { View } from "react-native";
import { Tabs } from "expo-router";
import { PlatformPressable } from "@react-navigation/elements";
import type { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { fonts, type Palette } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

function tab(focused: IoniconName, unfocused: IoniconName) {
  return ({ color, focused: isFocused }: { color: string; size: number; focused: boolean }) => (
    <Ionicons name={isFocused ? focused : unfocused} size={22} color={color} />
  );
}

// Custom tabBarButton so the active tab gets web's absolute-top 32×2 primary
// indicator bar (React Navigation's bottom tabs have no built-in per-tab
// decoration slot). Wraps the default PlatformPressable with position:relative
// and pins the bar to the tab item itself, not the whole nav bar.
function makeTabBarButton(colors: Palette) {
  return function TabBarButton(props: BottomTabBarButtonProps) {
    const focused = props.accessibilityState?.selected;
    return (
      <PlatformPressable {...props} style={[props.style, { position: "relative" }]}>
        {focused && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              left: "50%",
              marginLeft: -16,
              width: 32,
              height: 2,
              borderRadius: 1,
              backgroundColor: colors.primary,
            }}
          />
        )}
        {props.children}
      </PlatformPressable>
    );
  };
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.onSurfaceVariant,
        tabBarStyle: {
          height: 64,
          backgroundColor: colors.surfaceContainer,
          borderTopColor: colors.outlineVariant,
        },
        tabBarItemStyle: { paddingTop: 8 },
        tabBarLabelStyle: {
          fontFamily: fonts.headMedium,
          fontSize: 10,
          letterSpacing: 0.8,
          textTransform: "uppercase",
        },
        tabBarButton: makeTabBarButton(colors),
        sceneStyle: { backgroundColor: colors.surface },
      }}
    >
      <Tabs.Screen
        name="today"
        options={{ title: t("common.nav.today"), tabBarIcon: tab("today", "today-outline") }}
      />
      <Tabs.Screen
        name="program"
        options={{ title: t("common.nav.program"), tabBarIcon: tab("calendar", "calendar-outline") }}
      />
      <Tabs.Screen
        name="log"
        options={{ title: t("common.nav.log"), tabBarIcon: tab("barbell", "barbell-outline") }}
      />
      <Tabs.Screen
        name="progress"
        options={{ title: t("common.nav.progress"), tabBarIcon: tab("stats-chart", "stats-chart-outline") }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t("common.nav.profile"), tabBarIcon: tab("person", "person-outline") }}
      />
    </Tabs>
  );
}
