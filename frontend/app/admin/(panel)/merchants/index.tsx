import React from "react";
import { Text, View } from "react-native";
import { AdminList, Cell, StatusBadge } from "@/src/components/AdminList";
import type { FilterField } from "@/src/components/FilterPanel";

const FILTERS: FilterField[] = [
  { key: "category", type: "select", label: "Category", options: [] },  // dynamic
  { key: "city",     type: "select", label: "City",     options: [] },  // dynamic
  { key: "since",    type: "date",   label: "Registered on or after" },
  { key: "until",    type: "date",   label: "Registered on or before" },
];

export default function MerchantsPage() {
  return (
    <AdminList
      title="Merchants"
      endpoint="/api/admin/merchants"
      searchPlaceholder="Search by name, phone, email or address"
      filterFields={FILTERS}
      loadDynamicFilterOptions
      statuses={[
        { key: "pending", label: "Pending" },
        { key: "active", label: "Active" },
        { key: "approved", label: "Approved" },
        { key: "rejected", label: "Rejected" },
        { key: "suspended", label: "Suspended" },
      ]}
      detailRoute={(id) => `/admin/(panel)/merchants/${id}`}
      columns={[
        { header: "Business", render: (r: any) => (
          <View>
            <Cell>{r.name}</Cell>
            <Cell secondary>{r.phone || r.category || "—"}</Cell>
          </View>
        )},
        { header: "Category", render: (r: any) => <Cell>{r.category || "—"}</Cell>, width: 130 },
        { header: "City",     render: (r: any) => <Cell>{r.city || "—"}</Cell>, width: 140 },
        { header: "Status",   render: (r: any) => <StatusBadge status={r.status || r.verification_status} />, width: 110 },
        { header: "Deals",    render: (r: any) => <Cell>{r.active_deals ?? 0} / {r.total_deals ?? 0}</Cell>, width: 90 },
        { header: "Created",  render: (r: any) => <Cell secondary>{(r.created_at || "").slice(0, 10)}</Cell>, width: 110 },
      ]}
    />
  );
}
