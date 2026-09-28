import React from "react";
import { DetailScreen, Section, KV, StatusBadge } from "@/src/components/AdminDetail";
import { colors } from "@/src/theme";
import { View } from "react-native";

export default function CustomerDetail() {
  return (
    <DetailScreen
      entityKind="customer"
      fetchEndpoint={(id) => `/api/admin/customers/${id}`}
      statusEndpoint={(id) => `/api/admin/customers/${id}/status`}
      actions={[
        { key: "active",       label: "Activate",   color: "#0A7F3F" },
        { key: "blocked",      label: "Block",      color: colors.error, requireReason: true },
        { key: "deactivated",  label: "Deactivate", color: "#606770" },
      ]}
      render={(d: any) => (
        <>
          <Section title={d.customer?.name || "Customer"}>
            <View style={{ marginBottom: 8 }}><StatusBadge status={d.customer?.status || "active"} /></View>
            <KV k="Phone" v={d.customer?.phone} />
            <KV k="Email" v={d.customer?.email} />
            <KV k="City" v={d.customer?.city} />
            <KV k="Referral code" v={d.customer?.referral_code} />
            <KV k="Points" v={d.stats?.points} />
            <KV k="Joined" v={(d.customer?.created_at || "").slice(0, 10)} />
          </Section>
          <Section title="Activity">
            <KV k="Total claims" v={d.stats?.claims} />
            <KV k="Redemptions" v={d.stats?.redemptions} />
          </Section>
        </>
      )}
    />
  );
}
