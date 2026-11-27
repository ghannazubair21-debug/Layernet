import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";
import ThemeProvider from "@/components/ThemeProvider";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import { cn } from "@/lib/utils";
import { THEME_INIT_SCRIPT } from "@/lib/themeInitScript";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", axes: ["opsz"] });

export const metadata: Metadata = {
  title: "LayerNet | Financial Intelligence",
  description:
    "Fraud investigation and financial intelligence with a transparent rules baseline and ULB benchmark replay.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="light"
      className={cn(geistSans.variable, geistMono.variable, fraunces.variable)}
      suppressHydrationWarning
    >
      <head>
        {/* Apply the saved layernet-settings theme before first paint (no light flash). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="layernet-shell min-h-screen font-sans">
        <ThemeProvider />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
