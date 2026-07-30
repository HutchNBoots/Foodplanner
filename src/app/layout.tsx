import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { NavBar } from "@/components/NavBar";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Foodplanner",
  description: "Weekly meal planning: ask, generate, optimise, order.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#16a34f",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans`}>
        <div className="mx-auto flex min-h-screen max-w-3xl flex-col">
          <NavBar />
          <main className="flex-1 px-4 pb-24 pt-4 sm:px-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
