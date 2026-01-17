
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Classroom Behavior Monitor",
  description: "Real-time AI behavior analysis",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-[#f5f7f8] text-gray-800 antialiased`}>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 ml-64 p-8 transition-all duration-300">
            {/* Navbar Placeholder */}
            <div className="mb-8 flex justify-between items-center">
              <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
              <div className="flex items-center space-x-4">
                {/* Search/Notifs could go here */}
                <span className="text-sm text-gray-500">v1.0.0</span>
              </div>
            </div>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
