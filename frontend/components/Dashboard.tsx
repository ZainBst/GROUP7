import { ControlPanel } from "./ControlPanel";
import { LivePreview } from "./LivePreview";
import { TerminalLogs } from "./TerminalLogs";
import { Statistics } from "./Statistics";
import { BehaviorChart } from "./BehaviorChart";
import { StudentTable } from "./StudentTable";
import { PositiveNegativeBar } from "./PositiveNegativeBar";
import { PositiveNegativeLineChart } from "./PositiveNegativeLineChart";

export function Dashboard() {
    return (
        <div className="w-full max-w-7xl mx-auto flex flex-col gap-6 p-6">
            {/* Page Title */}
            <div className="text-center py-6 px-4">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-2 font-mono">
                    BehaviorNet: A Multi-Modal Computer Vision Framework for Educational Attentiveness Quantification
                </h1>
            </div>

            {/* Main Dashboard Panel */}
            <div className="bg-background border border-border rounded-xl p-8 shadow-sm flex flex-col gap-8">

                {/* Top Section: Controls */}
                <div className="flex items-center justify-between">
                    <ControlPanel />
                    {/* Decorative Corner Element */}
                    <div className="text-foreground/60 font-mono text-xs hidden md:block">
                        <span className="opacity-50">[SYSTEM]</span> ready
                    </div>
                </div>

                {/* Middle Section: Video & Logs */}
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-6 min-h-[350px] min-w-0">
                    <LivePreview />
                    <TerminalLogs />
                </div>

                {/* Bottom Section: Stats, Chart, & Table */}
                <div className="grid grid-cols-1 lg:grid-cols-[0.8fr_1.2fr] gap-x-8 gap-y-8 pt-4 border-t border-border/50">

                    <div className="flex flex-col gap-8 pr-4 lg:border-r border-border/50">
                        <Statistics />
                        <PositiveNegativeBar />
                        <BehaviorChart />
                        <PositiveNegativeLineChart />
                    </div>

                    <div className="pl-4">
                        <StudentTable />
                    </div>

                </div>

            </div>
        </div>
    );
}
