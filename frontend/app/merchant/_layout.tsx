import { Stack } from "expo-router";

export default function MerchantLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="sign-in" options={{ presentation: "modal" }} />
      <Stack.Screen name="sign-up" options={{ presentation: "modal" }} />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="deal-form" options={{ presentation: "modal" }} />
      <Stack.Screen name="promo-codes" options={{ presentation: "modal" }} />
      <Stack.Screen name="threads" />
      <Stack.Screen name="thread/[userId]" />
    </Stack>
  );
}
