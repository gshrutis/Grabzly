import React from "react";
import { View } from "react-native";
import { DetailScreen, Section, KV, StatusBadge } from "@/src/components/AdminDetail";
import { colors } from "@/src/theme";

export default function MerchantDetail() {
  return (
    <DetailScreen
      entityKind="merchant"
      fetchEndpoint={(id) => `/api/admin/merchants/${id}`}
      statusEndpoint={(id) => `/api/admin/merchants/${id}/status`}
      actions={[
        { key: "active",    label: "Approve",   color: "#0A7F3F" },
        { key: "rejected",  label: "Reject",    color: colors.error, requireReason: true },
        { key: "suspended", label: "Suspend",   color: "#B00020",    requireReason: true },
        { key: "inactive",  label: "Deactivate",color: "#606770" },
      ]}
      render={(d: any) => (
        <>
          <Section title={d.merchant?.name || "Merchant"}>
            <View style={{ marginBottom: 8 }}><StatusBadge status={d.merchant?.status || d.merchant?.verification_status} /></View>
            <KV k="Category" v={d.merchant?.category} />
            <KV k="Description" v={d.merchant?.description} />
            <KV k="Phone" v={d.merchant?.phone} />
            <KV k="Email" v={d.merchant?.email} />
            <KV k="Address" v={d.merchant?.address} />
            <KV k="City" v={d.merchant?.city} />
            <KV k="Location" v={d.merchant?.location ? `${d.merchant.location.lat}, ${d.merchant.location.lng}` : null} />
            <KV k="Business hours" v={d.merchant?.hours} />
          </Section>
          <Section title="Owner">
            <KV k="Name" v={d.owner?.name} />
            <KV k="Phone" v={d.owner?.phone} />
            <KV k="Email" v={d.owner?.email} />
            <KV k="Created" v={(d.owner?.created_at || "").slice(0, 10)} />
          </Section>
          <Section title="Deals">
            <KV k="Total" v={d.deal_counts?.total ?? 0} />
            <KV k="Active" v={d.deal_counts?.active ?? 0} />
            <KV k="Pending" v={d.deal_counts?.pending ?? 0} />
            <KV k="Expired" v={d.deal_counts?.expired ?? 0} />
          </Section>
        </>
      )}
    />
  );
}
