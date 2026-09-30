import React from "react";
import { View } from "react-native";
import { AdminList, Cell, StatusBadge } from "@/src/components/AdminList";
import type { FilterField } from "@/src/components/FilterPanel";

const FILTERS: FilterField[] = [
  { key: "category",  type: "select", label: "Category", options: [] },   // dynamic
  { key: "city",      type: "select", label: "City",     options: [] },   // dynamic
  { key: "deal_type", type: "select", label: "Deal type", options: [
      { value: "flash", label: "Flash" },
      { value: "regular", label: "Regular" },
      { value: "video", label: "Video" },
  ] },
  { key: "since",  type: "date", label: "Created on or after" },
  { key: "until",  type: "date", label: "Created on or before" },
];

export default function DealsPage() {
  return (
    <AdminList
      title="Deals"
      endpoint="/api/admin/deals"
      searchPlaceholder="Search title, description or merchant"
      filterFields={FILTERS}
      loadDynamicFilterOptions
      statuses={[
        { key: "active", label: "Active/Live" },
        { key: "pending", label: "Pending" },
        { key: "approved", label: "Approved" },
        { key: "paused", label: "Paused" },
        { key: "expired", label: "Expired" },
        { key: "draft", label: "Draft" },
        { key: "archived", label: "Archived" },
      ]}
      detailRoute={(id) => `/admin/(panel)/deals/${id}`}
      columns={[
        { header: "Title",     render: (r: any) => <Cell>{r.title}</Cell> },
        { header: "Merchant",  render: (r: any) => <Cell secondary>{r.merchant_name || "—"}</Cell>, width: 160 },
        { header: "Category",  render: (r: any) => <Cell>{r.category || "—"}</Cell>, width: 120 },
        { header: "Price",     render: (r: any) => <Cell>₹{r.discounted_price ?? r.after_price ?? "—"}</Cell>, width: 90 },
        { header: "Expires",   render: (r: any) => <Cell secondary>{(r.expires_at || "").slice(0, 10)}</Cell>, width: 110 },
        { header: "Status",    render: (r: any) => <StatusBadge status={r.computed_status || r.status || "—"} />, width: 110 },
      ]}
    />
  );
}
