import "./globals.css";
import { auth } from "@/auth";
import { ServiceWorkerRegistrar } from "./components/service-worker-registrar";
import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk, Geist_Mono } from "next/font/google";

/* Neon Ultra design tokens (D1), aligned with UI/NEON_ULTRA_CLAUDE_DESIGN_SYSTEM.md.
   Single source of truth — components consume these, never hardcoded hex. */

const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Without an absolute metadataBase, Next.js infers relative metadata URLs (like a share page's
// OpenGraph image) from the request's own host — which resolves to the internal
// "http://localhost:4110" reverse-proxy target in production, not the public domain a social
// crawler can actually reach. AUTH_URL is already the established env var for "this app's real
// public URL" (used the same way in the QR code route).
export async function generateMetadata(): Promise<Metadata> {
  // Streak v23 sweep: the browser tab named the platform's demo league for EVERY tenant. The session carries the user's
  // own league now, so the title is theirs; an anonymous visitor (or a user with no league) gets the platform name.
  const session = await auth();
  const league = session?.user?.organizationName ?? null;
  return {
    metadataBase: new URL(process.env.AUTH_URL ?? "http://localhost:3000"),
    // Anonymous visitors get the PLATFORM's name, not a league's (streak v24 sweep). "Neon Ultra Tournament Management
    // System" was the pre-multi-tenant title and it leaked onto every sign-in page.
    title: league ? `${league} · UltraOS` : "UltraLeagueOS · Tournament management system",
    description: league ? `${league} on UltraLeagueOS - fixtures, live scoring and league operations.` : "Tournament administration and game-day operations.",
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "UltraOS" },
  };
}

export const viewport: Viewport = {
  themeColor: "#0b100e",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}
