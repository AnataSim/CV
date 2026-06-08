import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CrunchyVerse | The Stage is Set 🎪",
  description: "Selamat datang di panggung utama CrunchyVerse! Sebuah server Discord interaktif dan spektakuler tempat berkumpulnya para Anomaly, Kerupuk, dan Keripik. Saksikan pertunjukan kami sekarang!",
  keywords: ["CrunchyVerse", "Discord Server", "Portfolio", "Teater Discord", "Kerupuk", "Keripik", "Discord Bot"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="h-full antialiased dark">
      <body className="h-full bg-theater-black text-foreground antialiased selection:bg-theater-red-light selection:text-white">
        {children}
      </body>
    </html>
  );
}
