
"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useRealtimeEvents, Event } from '@/hooks/useRealtimeEvents';
import { useMemo } from 'react';

export function BehaviorChart() {
    const events = useRealtimeEvents();

    // Transform events into time-series data
    // Group by "minute" or arbitrary chunks for the graph
    const data = useMemo(() => {
        // Determine frequencies per time bucket
        // For simplicity with "last 100 events", let's just create a moving window
        // of the distribution

        if (events.length === 0) return [];

        // Simple moving average / count logic
        // We map every 5th event to a data point to smooth it
        return events.map((e, i) => ({
            time: new Date(e.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            value: 1, // Dummy value, in reality we'd aggregate
            // Mocking some "stacked" data for visual appeal based on the actual event
            HeadDown: e.behavior === 'head down' ? 1 : 0,
            Writing: e.behavior === 'writing' ? 1 : 0,
            Upright: e.behavior === 'upright' ? 1 : 0,
        }));
    }, [events]);

    return (
        <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="mb-6">
                <h3 className="text-lg font-bold text-gray-800">Real-time Behavior Trends</h3>
                <p className="text-sm text-gray-400">Live stream of classified actions</p>
            </div>

            <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data}>
                        <defs>
                            <linearGradient id="colorWriting" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                                <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorHead" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.8} />
                                <stop offset="95%" stopColor="#82ca9d" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis dataKey="time" hide />
                        <YAxis hide />
                        <Tooltip
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        />
                        <Area type="monotone" dataKey="Writing" stackId="1" stroke="#8884d8" fill="url(#colorWriting)" />
                        <Area type="monotone" dataKey="HeadDown" stackId="1" stroke="#82ca9d" fill="url(#colorHead)" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
