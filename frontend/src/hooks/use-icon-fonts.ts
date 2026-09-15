// Icon font loader for Expo apps using `@react-native-vector-icons/*`.
// Under Expo Go (StoreClient), the shipped .ttf assets can come back as 0 bytes
// from Metro's asset resolver on Android; we sideload them from a public CDN.
// For native dev/prod builds and web, the config plugin/autolinking handles it,
// so we pass an empty map and useFonts resolves immediately.
// Usage: const [loaded, error] = useIconFonts();

import Constants, { ExecutionEnvironment } from "expo-constants";
import { useFonts } from "expo-font";

// Bump this whenever @react-native-vector-icons/ionicons is upgraded.
const RNVI_IONICONS_VERSION = "13.1.4";

const ICON_FAMILIES: Record<string, string> = {
  // font family name registered by the library → CDN filename (no extension)
  Ionicons: "Ionicons",
};

const cdnUrl = (file: string): string =>
  `https://cdn.jsdelivr.net/npm/@react-native-vector-icons/ionicons@${RNVI_IONICONS_VERSION}/fonts/${file}.ttf`;

const iconFontMap = (): Record<string, string> =>
  Object.fromEntries(
    Object.entries(ICON_FAMILIES).map(([key, file]) => [key, cdnUrl(file)]),
  );

export const useIconFonts = (): readonly [boolean, Error | null] =>
  useFonts(
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient
      ? iconFontMap()
      : {},
  );
