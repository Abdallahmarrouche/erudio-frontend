// app/dashboard/page.tsx
"use client";

import { AppShell } from "@/components/app-shell";

export default function DashboardPage() {
  return (
    <AppShell>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">
        Backend is live. Use the navigation above to manage students and
        parents — the invoice flow lands here next.
      </p>
    </AppShell>
  );
}
