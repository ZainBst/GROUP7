
"use client";

import { useRealtimeEvents } from "@/hooks/useRealtimeEvents";
import { useMemo, useState } from "react";
import { User, Activity, Clock } from "lucide-react";

export default function StudentsPage() {
    const events = useRealtimeEvents();

    const [filter, setFilter] = useState("All");

    // Aggregate latest state per student
    const studentStates = useMemo(() => {
        const map = new Map();
        // Process oldest to newest to get latest state
        events.slice().reverse().forEach(e => {
            map.set(e.name, e);
        });

        const allStudents = Array.from(map.values());

        if (filter === "All") return allStudents;
        return allStudents.filter(s => s.behavior === filter);
    }, [events, filter]);

    const behaviors = ["All", "head down", "turning around", "writing", "upright"];

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-gray-800">Classroom Roster</h2>

                <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-500 font-medium">Filter by:</span>
                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="bg-white border border-gray-300 text-gray-700 text-sm rounded-lg focus:ring-orange-500 focus:border-orange-500 block p-2.5 shadow-sm outline-none transition-all"
                    >
                        {behaviors.map(b => (
                            <option key={b} value={b} className="capitalize">{b}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {studentStates.map((student, i) => (
                    <div key={i} className="bg-white rounded-xl shadow-lg p-6 flex items-center space-x-4 border-l-4 border-l-orange-500">
                        <div className="bg-gray-100 p-4 rounded-full">
                            <User className="w-8 h-8 text-gray-600" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-xl font-bold text-gray-800">{student.name}</h3>
                            <div className="flex items-center mt-1 text-sm text-gray-500">
                                <Activity className="w-4 h-4 mr-1 text-orange-500" />
                                <span className="capitalize">{student.behavior}</span>
                                <span className="mx-2">•</span>
                                <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{(student.confidence * 100).toFixed(0)}% Conf</span>
                            </div>
                            <div className="flex items-center mt-2 text-xs text-gray-400">
                                <Clock className="w-3 h-3 mr-1" />
                                {new Date(student.created_at).toLocaleTimeString()}
                            </div>
                        </div>
                    </div>
                ))}

                {studentStates.length === 0 && (
                    <div className="col-span-full text-center py-20 text-gray-400 bg-white rounded-xl shadow-sm border border-dashed border-gray-200">
                        <User className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                        <p>{filter === "All" ? "No active students detected yet." : `No students found with behavior: ${filter}`}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
