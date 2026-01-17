
"use client";

import { BehaviorChart } from "@/components/BehaviorChart";
import { StatCard } from "@/components/StatCard";
import { useRealtimeEvents } from "@/hooks/useRealtimeEvents";
import { Activity, AlertTriangle, CheckCircle, Users } from "lucide-react";
import { useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Trash2 } from "lucide-react";

export default function Home() {
  const events = useRealtimeEvents();

  const handleReset = async () => {
    if (confirm("Are you sure you want to delete all session data?")) {
      const { error } = await supabase.from('classroom_events').delete().gt('id', 0);
      if (error) alert("Error: " + error.message);
      else window.location.reload();
    }
  };

  const stats = useMemo(() => {
    const total = events.length;
    // Count unique students (naive)
    const uniqueStudents = new Set(events.map(e => e.name)).size;
    // Count "Head Down" or "Turning" as alerts
    const alerts = events.filter(e => ["head down", "turning around"].includes(e.behavior)).length;

    return {
      capacity: uniqueStudents,
      revenue: total, // Using as "Total Logs"
      errors: alerts,
      followers: "+45K" // Static for now per design
    };
  }, [events]);

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <button
          onClick={handleReset}
          className="flex items-center px-3 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors text-sm font-medium"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Reset Data
        </button>
      </div>

      {/* Top Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Active Students"
          value={stats.capacity}
          icon={Users}
          color="orange"
          footer="Updated just now"
        />
        <StatCard
          title="Total Events"
          value={stats.revenue}
          icon={Activity}
          color="green"
          footer="Last 24 Hours"
        />
        <StatCard
          title="Behavior Alerts"
          value={stats.errors}
          icon={AlertTriangle}
          color="red"
          footer="Requires Attention"
        />
        <StatCard
          title="System Status"
          value="Online"
          icon={CheckCircle}
          color="blue"
          footer="Server Healthy"
        />
      </div>

      {/* Main Chart Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <BehaviorChart />
        </div>

        {/* Recent Logs / Side Panel */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Recent Activity</h3>
          <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
            {events.slice().reverse().slice(0, 10).map((e, i) => ( // Show newest first
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100">
                <div className="flex items-center">
                  <div className={`w-2 h-2 rounded-full mr-3 ${e.behavior === 'upright' ? 'bg-green-500' : 'bg-red-500'}`} />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{e.name}</p>
                    <p className="text-xs text-gray-500">{e.behavior}</p>
                  </div>
                </div>
                <span className="text-xs text-gray-400">
                  {new Date(e.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
            {events.length === 0 && (
              <p className="text-center text-gray-400 py-4">Waiting for data...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
