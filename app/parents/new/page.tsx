// app/parents/new/page.tsx
"use client";

import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ParentForm } from "@/components/parent-form";

export default function NewParentPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <Link href="/parents" className="text-sm text-muted-foreground hover:underline">
          ← Back to parents
        </Link>
        <h1 className="mt-3 mb-6 text-2xl font-bold">New parent</h1>
      </div>
      <ParentForm mode="create" />
    </AppShell>
  );
}
