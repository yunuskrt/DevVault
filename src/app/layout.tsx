import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { Toaster } from "@/components/ui/sonner";
import {
  getCollectionNav,
  getPrimaryNav,
  getTypeNav,
} from "@/lib/dashboard-nav";
import type { SidebarNav } from "@/types/dashboard";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DevVault",
  description: "Your developer knowledge, versioned.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Derived on the server: the sidebar is a client component and must never
  // reach into the vault itself.
  const nav: SidebarNav = {
    primary: getPrimaryNav(),
    types: getTypeNav(),
    collections: getCollectionNav(),
  };

  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <DashboardShell nav={nav}>{children}</DashboardShell>
        <Toaster />
      </body>
    </html>
  );
}
