import type { ComponentProps } from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { fonts } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

function tab(focused: IoniconName, unfocused: IoniconName) {
  return ({ color, size, focused: isFocused }: { color: string; size: number; focused: boolean }) => (
    <Ionicons name={isFocused ? focused : unfocused} size={size} color={color} />
  );
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
          backgroundColor: colors.surfaceContainer,
          borderTopColor: colors.outlineVariant,
        },
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 10 },
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
