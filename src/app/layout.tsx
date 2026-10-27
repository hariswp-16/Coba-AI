import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "AI Video Studio — Generator Video Cerita Animasi",
  description:
    "Platform full-stack untuk membuat video cerita animasi vertikal otomatis dengan gaya dari video referensi, voice-over Bahasa Indonesia, subtitle sinkron, dan render MP4.",
};

export const viewport: Viewport = {
  themeColor: "#07070b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-ink-950">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
