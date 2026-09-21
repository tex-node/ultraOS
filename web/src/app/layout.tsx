import "./globals.css";
import type { Metadata } from "next";
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
export const metadata: Metadata = {
  metadataBase: new URL(process.env.AUTH_URL ?? "http://localhost:3000"),
  title: "Neon Ultra Tournament Management System",
  description: "Tournament administration and game-day operations.",
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
