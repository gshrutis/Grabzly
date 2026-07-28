import React, { useEffect, useState } from "react";
import { Text, TextStyle, StyleProp } from "react-native";

type Props = {
  expiresAt: string; // ISO
  style?: StyleProp<TextStyle>;
  prefix?: string;
  expiredLabel?: string;
  testID?: string;
};

function formatDelta(ms: number): string {
  if (ms <= 0) return "0m";
  const totalMinutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  return `${seconds}s`;
}

export default function Countdown({ expiresAt, style, prefix = "", expiredLabel = "Expired", testID }: Props) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const expiry = new Date(expiresAt).getTime();
  const delta = expiry - now;

  if (delta <= 0) {
    return <Text style={style} testID={testID}>{expiredLabel}</Text>;
  }
  return (
    <Text style={style} testID={testID}>
      {prefix}{formatDelta(delta)}
    </Text>
  );
}
