import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";
import { NavBar } from "@/components/NavBar";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
// Display face (headers, section titles, index-tab labels) and data face
// (every macro/nutrition figure, quantities, dates - tabular numerals via
// monospace) added for the MVP 1.3 visual-identity pass, see DECISIONS.md.
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  title: "Foodplanner",
  description: "Weekly meal planning: ask, generate, optimise, order.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#EDEEE6",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${bricolage.variable} ${plexMono.variable} font-sans`}>
        <div className="mx-auto flex min-h-screen max-w-3xl flex-col">
          <NavBar />
          <main className="flex-1 px-4 pb-24 pt-4 sm:px-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
