import React from "react";
import { AdminList, Cell, StatusBadge } from "@/src/components/AdminList";

export default function CustomersPage() {
  return (
    <AdminList
      title="Customers"
      endpoint="/api/admin/customers"
      searchPlaceholder="Search by name, phone or email"
      statuses={[
        { key: "active", label: "Active" },
        { key: "blocked", label: "Blocked" },
        { key: "deactivated", label: "Deactivated" },
      ]}
      detailRoute={(id) => `/admin/(panel)/customers/${id}`}
      columns={[
        { header: "Name",    render: (r: any) => <Cell>{r.name || "—"}</Cell> },
        { header: "Phone",   render: (r: any) => <Cell secondary>{r.phone || "—"}</Cell>, width: 150 },
        { header: "City",    render: (r: any) => <Cell>{r.city || "—"}</Cell>, width: 140 },
        { header: "Points",  render: (r: any) => <Cell>{r.points ?? 0}</Cell>, width: 80 },
        { header: "Status",  render: (r: any) => <StatusBadge status={r.status || "active"} />, width: 110 },
        { header: "Joined",  render: (r: any) => <Cell secondary>{(r.created_at || "").slice(0, 10)}</Cell>, width: 110 },
      ]}
    />
  );
}
