import React from "react";
import { View } from "react-native";
import { AdminList, Cell, StatusBadge } from "@/src/components/AdminList";

export default function DealsPage() {
  return (
    <AdminList
      title="Deals"
      endpoint="/api/admin/deals"
      searchPlaceholder="Search by title"
      statuses={[
        { key: "active", label: "Active/Live" },
        { key: "pending", label: "Pending" },
        { key: "approved", label: "Approved" },
        { key: "paused", label: "Paused" },
        { key: "expired", label: "Expired" },
        { key: "archived", label: "Archived" },
      ]}
      detailRoute={(id) => `/admin/(panel)/deals/${id}`}
      columns={[
        { header: "Title",     render: (r: any) => <Cell>{r.title}</Cell> },
        { header: "Merchant",  render: (r: any) => <Cell secondary>{r.merchant_name || "—"}</Cell>, width: 160 },
        { header: "Category",  render: (r: any) => <Cell>{r.category || "—"}</Cell>, width: 120 },
        { header: "Price",     render: (r: any) => <Cell>₹{r.discounted_price ?? r.after_price ?? "—"}</Cell>, width: 90 },
        { header: "Expires",   render: (r: any) => <Cell secondary>{(r.expires_at || "").slice(0, 10)}</Cell>, width: 110 },
        { header: "Status",    render: (r: any) => <StatusBadge status={r.status || "—"} />, width: 110 },
      ]}
    />
  );
}
