// app/layout.tsx
// If create-next-app generated a layout with font variables you want to keep,
// you only need to (1) import Providers and (2) wrap {children} with it.
import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/app/providers";

export const metadata: Metadata = {
  title: "Erudio",
  description: "Erudio — Nursery Management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
