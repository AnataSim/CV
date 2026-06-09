import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "CrunchyVerse | The Stage is Set 🎪",
  description: "Selamat datang di panggung utama CrunchyVerse! Sebuah server Discord interaktif dan spektakuler tempat berkumpulnya para Anomaly, Kerupuk, dan Keripik. Saksikan pertunjukan kami sekarang!",
  keywords: ["CrunchyVerse", "Discord Server", "Portfolio", "Teater Discord", "Kerupuk", "Keripik", "Discord Bot"],
  robots: { index: false, follow: false }, // Private stage — jangan index
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="h-full antialiased dark">
      <head>
        {/* DNS Prefetch untuk resource penting */}
        <link rel="dns-prefetch" href="https://api.dicebear.com" />
        <link rel="dns-prefetch" href="https://cdn.discordapp.com" />
        <link rel="preconnect" href="https://fonts.googleapis.com" crossOrigin="anonymous" />
      </head>
      <body className="h-full bg-theater-black text-foreground antialiased selection:bg-theater-red-light selection:text-white">
        {children}

        {/* Service Worker Registration */}
        <Script
          id="sw-register"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js', { scope: '/' })
                    .then(function(reg) {
                      console.log('[SW] CrunchyVerse Service Worker registered, scope:', reg.scope);
                    })
                    .catch(function(err) {
                      console.warn('[SW] Service Worker registration failed:', err);
                    });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
