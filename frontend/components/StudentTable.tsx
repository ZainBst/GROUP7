"use client";

import { useRealtimeEvents } from "@/hooks/useRealtimeEvents";
import { useMemo } from "react";

type StudentRow = {
    id: string;
    name: string;
    behavior: string;
    confidence: number;
    createdAt: string;
};

export function StudentTable() {
    const events = useRealtimeEvents();

    const students = useMemo<StudentRow[]>(() => {
        const latestByName = new Map<string, StudentRow>();
        events.forEach((event, index) => {
            const syntheticId = `S${String(index + 1).padStart(3, "0")}`;
            latestByName.set(event.name, {
                id: syntheticId,
                name: event.name,
                behavior: event.behavior,
                confidence: event.confidence,
                createdAt: event.created_at,
            });
        });

        return Array.from(latestByName.values()).sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    }, [events]);

    const handleDownloadCsv = () => {
        const headers = ["Student ID", "Student Name", "Behaviour", "Confidence", "Timestamp"];
        const rows = students.map((student) => [
            student.id,
            student.name,
            student.behavior,
            `${(student.confidence * 100).toFixed(0)}%`,
            new Date(student.createdAt).toISOString(),
        ]);

        const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "students.csv";
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-left text-xs text-foreground/80">
                    <thead className="bg-border/30 text-foreground font-bold border-b border-border">
                        <tr>
                            <th className="px-4 py-3">Student ID</th>
                            <th className="px-4 py-3">Student Name</th>
                            <th className="px-4 py-3">Behaviour</th>
                        </tr>
                    </thead>
                    <tbody>
                        {students.length === 0 && (
                            <tr>
                                <td colSpan={3} className="px-4 py-8 text-center text-foreground/60 font-mono">
                                    No student events yet.
                                </td>
                            </tr>
                        )}
                        {students.map((student) => (
                            <tr key={student.name} className="border-b border-border hover:bg-border/10 transition-colors">
                                <td className="px-4 py-3">{student.id}</td>
                                <td className="px-4 py-3">{student.name}</td>
                                <td className="px-4 py-3 font-medium text-foreground">{student.behavior}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="flex justify-end mt-2">
                <button
                    onClick={handleDownloadCsv}
                    className="px-4 py-2 bg-transparent border border-border hover:bg-border/30 text-foreground rounded-md transition-colors text-xs font-bold font-mono"
                >
                    Download CSV
                </button>
            </div>
        </div>
    );
}
