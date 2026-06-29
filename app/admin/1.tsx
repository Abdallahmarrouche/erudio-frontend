// app/admin/page.tsx
"use client";

import Link from "next/link";
import { AppShell } from "@/components/app-shell";

interface Tool {
  title: string;
  description: string;
  href?: string; // present = built and clickable; absent = planned
}

const TOOLS: Tool[] = [
  {
    title: "Accounting Periods",
    description: "Open, close, or lock months for posting.",
    href: "/admin/periods",
  },
  {
    title: "Academic Years & Terms",
    description: "Create years, set the current year, and edit term dates.",
    href: "/admin/years",
  },
  {
    title: "Billing Plans",
    description:
      "Installment rules and payment due dates (this is what sets the term payment dates).",
  },
  {
    title: "Fee Pricing",
    description: "Set per-mode tuition (yearly / termly / monthly) per class level.",
    href: "/admin/fee-templates",
  },
  {
    title: "Bank Accounts",
    description: "Accounts used for receipts and payments.",
  },
  {
    title: "Class Levels",
    description: "Reference data for class levels and sections.",
  },
  {
    title: "Chart of Accounts",
    description: "Ledger account structure (backend pending).",
  },
  {
    title: "System Settings",
    description:
      "Configurable rules — student age limits, ID-validation mode, and more.",
  },
  {
    title: "Opening Balances",
    description: "Import parent AR opening balances from Illumine.",
  },
];

export default function AdminPage() {
  return (
    <AppShell>
      <h1 className="text-2xl font-bold">Admin</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Configuration and administrative tools, separate from day-to-day operations.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => {
          const inner = (
            <>
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">{tool.title}</h2>
                {!tool.href && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    Soon
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{tool.description}</p>
            </>
          );

          return tool.href ? (
            <Link
              key={tool.title}
              href={tool.href}
              className="rounded-md border p-4 transition-colors hover:bg-muted/40"
            >
              {inner}
            </Link>
          ) : (
            <div
              key={tool.title}
              className="rounded-md border border-dashed p-4 opacity-70"
            >
              {inner}
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
