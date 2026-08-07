import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import DashboardShell from "@/components/dashboard/DashboardShell";
import VaultSetup from "@/components/vault/VaultSetup";
import { Toaster } from "@/components/ui/sonner";
import { VaultError } from "@/lib/errors";
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

/*
 * The vault is read from disk on every render, so nothing here can be
 * prerendered at build time — a build-time snapshot is exactly what this spec
 * exists to stop. Declared on the root layout, so it also covers any route
 * added later.
 */
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Derived on the server: the sidebar is a client component and must never
  // reach into the vault itself.
  let nav: SidebarNav;

  try {
    nav = {
      primary: await getPrimaryNav(),
      types: await getTypeNav(),
      collections: await getCollectionNav(),
    };
  } catch (error) {
    // The layout is the first thing to touch the vault, so it is where a
    // missing one surfaces. Returning the setup screen here means `children`
    // never render and no page gets a second chance to throw the same error.
    if (error instanceof VaultError) {
      return (
        <html
          lang="en"
          className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
        >
          <body className="min-h-full">
            <VaultSetup message={error.message} />
          </body>
        </html>
      );
    }

    throw error;
  }

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
