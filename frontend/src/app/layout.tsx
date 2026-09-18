import type { Metadata } from "next";
import { Barlow_Semi_Condensed, Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/shell/AppShell";
import { AuthProvider } from "@/hooks/useAuth";
import { PreferencesProvider } from "@/hooks/usePreferences";
import { ToastProvider } from "@/components/shared/Toast";

const heading = Barlow_Semi_Condensed({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Vortec Management",
  description: "Sistem manajemen internal Vortec.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${heading.variable} ${inter.variable} ${mono.variable}`} suppressHydrationWarning>
      <body>
        <AuthProvider>
          <PreferencesProvider>
            <ToastProvider>
              <AppShell>{children}</AppShell>
            </ToastProvider>
          </PreferencesProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
