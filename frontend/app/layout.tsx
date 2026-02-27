import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "antigravitt - Behavior Monitor",
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
        <main className="flex flex-col min-h-screen relative z-10">
          {children}
        </main>
      </body>
    </html>
  );
}
