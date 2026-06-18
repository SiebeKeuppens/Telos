import type { ComponentProps } from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../../lib/theme";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

function tab(focused: IoniconName, unfocused: IoniconName) {
  return ({ color, size, focused: isFocused }: { color: string; size: number; focused: boolean }) => (
    <Ionicons name={isFocused ? focused : unfocused} size={size} color={color} />
  );
}

export default function TabsLayout() {
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
        options={{ title: "Today", tabBarIcon: tab("today", "today-outline") }}
      />
      <Tabs.Screen
        name="program"
        options={{ title: "Program", tabBarIcon: tab("calendar", "calendar-outline") }}
      />
      <Tabs.Screen
        name="log"
        options={{ title: "Log", tabBarIcon: tab("barbell", "barbell-outline") }}
      />
      <Tabs.Screen
        name="progress"
        options={{ title: "Progress", tabBarIcon: tab("stats-chart", "stats-chart-outline") }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Profile", tabBarIcon: tab("person", "person-outline") }}
      />
    </Tabs>
  );
}
