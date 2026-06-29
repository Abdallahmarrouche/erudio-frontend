// app/students/new/page.tsx
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { StudentForm } from "@/components/student-form";

export default function NewStudentPage() {
  const params = useSearchParams();
  const presetParent = params.get("parentId") ?? "";
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <Link href="/students" className="text-sm text-muted-foreground hover:underline">
          ← Back to students
        </Link>
        <h1 className="mt-3 mb-6 text-2xl font-bold">New student</h1>
      </div>
      <StudentForm mode="create" initial={{ parentId: presetParent }} />
    </AppShell>
  );
}
