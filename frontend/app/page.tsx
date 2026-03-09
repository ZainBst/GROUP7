"use client";

import { useState } from "react";
import { Header } from "@/components/Header";
import { Dashboard } from "@/components/Dashboard";
import { LandingPage } from "@/components/LandingPage";
import { HowItWorks } from "@/components/HowItWorks";
import { StudentAggregatesProvider } from "@/contexts/StudentAggregatesContext";

export default function Home() {
  const [currentView, setCurrentView] = useState<"landing" | "dashboard" | "how-it-works">("landing");

  return (
    <StudentAggregatesProvider>
    <div className="min-h-screen flex flex-col items-center selection:bg-accent selection:text-background pb-16">
      <Header currentView={currentView} setView={setCurrentView} />
      <main className="flex-1 w-full mt-4 max-w-screen-2xl mx-auto px-4 md:px-8">
        {currentView === "landing" && <LandingPage />}
        {currentView === "dashboard" && <Dashboard />}
        {currentView === "how-it-works" && <HowItWorks />}
      </main>
    </div>
    </StudentAggregatesProvider>
  );
}
