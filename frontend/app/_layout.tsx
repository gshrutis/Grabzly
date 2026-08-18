import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider } from "@/src/context/auth";
import { LocationProvider } from "@/src/context/location";

LogBox.ignoreAllLogs(true);

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <LocationProvider>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#FFFDFB" } }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="onboarding-categories" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="sign-in" options={{ presentation: "modal" }} />
              <Stack.Screen name="sign-up" options={{ presentation: "modal" }} />
              <Stack.Screen name="deal/[id]" />
              <Stack.Screen name="store/[id]" />
              <Stack.Screen name="claim/[id]" options={{ presentation: "modal", gestureEnabled: false }} />
              <Stack.Screen name="search" />
              <Stack.Screen name="reset-password" options={{ presentation: "modal" }} />
              <Stack.Screen name="merchant" />
            </Stack>
          </LocationProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
