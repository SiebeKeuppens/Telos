import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../lib/auth";
import { colors } from "../lib/theme";

// Auth gate: route to the app or to sign-in once the auth state resolves.
export default function Index() {
  const auth = useAuth();

  if (auth.status === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return <Redirect href={auth.status === "signed_in" ? "/today" : "/sign-in"} />;
}
