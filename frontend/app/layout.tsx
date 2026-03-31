import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "BehaviorNet - Behavior Monitor",
  description: "Real-time AI behavior analysis",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased font-mono min-h-screen text-sm text-ink-text bg-ink-bg">
        <Providers>
          <main className="flex flex-col min-h-screen relative z-10">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
