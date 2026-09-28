import React from "react";
import { View, Image } from "react-native";
import { DetailScreen, Section, KV, StatusBadge } from "@/src/components/AdminDetail";
import { colors } from "@/src/theme";

export default function DealDetail() {
  return (
    <DetailScreen
      entityKind="deal"
      fetchEndpoint={(id) => `/api/admin/deals/${id}`}
      statusEndpoint={(id) => `/api/admin/deals/${id}/status`}
      actions={[
        { key: "approved", label: "Approve",  color: "#0A7F3F" },
        { key: "rejected", label: "Reject",   color: colors.error, requireReason: true },
        { key: "paused",   label: "Pause",    color: "#B25200" },
        { key: "resumed",  label: "Resume",   color: "#0A7F3F" },
        { key: "featured", label: "Feature",  color: "#8B4FEF" },
        { key: "unfeatured", label: "Unfeature", color: "#606770" },
        { key: "archived", label: "Archive",  color: "#606770" },
      ]}
      render={(d: any) => (
        <>
          <Section title={d.deal?.title || "Deal"}>
            <View style={{ marginBottom: 8, flexDirection: "row", gap: 8 }}>
              <StatusBadge status={d.deal?.status || "active"} />
              {d.deal?.featured ? <StatusBadge status="approved" /> : null}
            </View>
            {d.deal?.image_url ? (
              <Image source={{ uri: d.deal.image_url }} style={{ width: "100%", height: 240, borderRadius: 8, marginBottom: 8 }} resizeMode="cover" />
            ) : null}
            <KV k="Description" v={d.deal?.description} />
            <KV k="Category" v={d.deal?.category} />
            <KV k="Original price" v={d.deal?.before_price != null ? `₹${d.deal.before_price}` : null} />
            <KV k="Deal price" v={d.deal?.after_price != null ? `₹${d.deal.after_price}` : null} />
            <KV k="Discount" v={d.deal?.discount_pct != null ? `${d.deal.discount_pct}%` : null} />
            <KV k="Expires" v={(d.deal?.expires_at || "").slice(0, 19).replace("T", " ")} />
            <KV k="Terms" v={d.deal?.terms} />
          </Section>
          <Section title="Merchant">
            <KV k="Name" v={d.merchant?.name} />
            <KV k="Phone" v={d.merchant?.phone} />
            <KV k="City" v={d.merchant?.city} />
          </Section>
          <Section title="Engagement">
            <KV k="Claims" v={d.engagement?.claims} />
            <KV k="Redemptions" v={d.engagement?.redemptions} />
          </Section>
        </>
      )}
    />
  );
}
