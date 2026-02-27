import { ListVideo, Waypoints, BrainCircuit, Activity } from "lucide-react";

export function HowItWorks() {
    return (
        <div className="w-full max-w-4xl mx-auto flex flex-col gap-12 py-12 px-6 flex-1 text-foreground">

            <section className="text-center space-y-4">
                <h2 className="text-3xl font-bold font-mono text-foreground tracking-tight drop-shadow-sm">
                    How It Works
                </h2>
                <p className="text-foreground/80 max-w-2xl mx-auto">
                    BehaviorNet processes live or recorded visual data through a continuous, multi-staged computer vision pipeline.
                </p>
            </section>

            <div className="space-y-6">

                {/* Step 1 */}
                <div className="flex gap-6 border border-border bg-background p-6 rounded-xl hover:bg-border/20 transition-colors shadow-sm">
                    <div className="flex-shrink-0 mt-1">
                        <div className="w-10 h-10 rounded-full border border-border bg-border/30 flex items-center justify-center text-foreground font-bold font-mono">
                            01
                        </div>
                    </div>
                    <div className="space-y-2 pt-2">
                        <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                            <ListVideo className="w-5 h-5 text-accent" /> Connect Stream
                        </h3>
                        <p className="text-foreground/70 font-mono text-sm leading-relaxed">
                            Upload a video or start a live camera stream via the dashboard controls.
                        </p>
                    </div>
                </div>

                {/* Step 2 */}
                <div className="flex gap-6 border border-border bg-background p-6 rounded-xl hover:bg-border/20 transition-colors shadow-sm">
                    <div className="flex-shrink-0 mt-1">
                        <div className="w-10 h-10 rounded-full border border-border bg-border/30 flex items-center justify-center text-foreground font-bold font-mono">
                            02
                        </div>
                    </div>
                    <div className="space-y-2 pt-2">
                        <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                            <Waypoints className="w-5 h-5 text-accent" /> Detect & Track
                        </h3>
                        <p className="text-foreground/70 font-mono text-sm leading-relaxed">
                            The backend detects faces and tracks students frame by frame.
                        </p>
                    </div>
                </div>

                {/* Step 3 */}
                <div className="flex gap-6 border border-border bg-background p-6 rounded-xl hover:bg-border/20 transition-colors shadow-sm">
                    <div className="flex-shrink-0 mt-1">
                        <div className="w-10 h-10 rounded-full border border-border bg-border/30 flex items-center justify-center text-foreground font-bold font-mono">
                            03
                        </div>
                    </div>
                    <div className="space-y-2 pt-2">
                        <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                            <BrainCircuit className="w-5 h-5 text-accent" /> Identity & Behavior Modeling
                        </h3>
                        <p className="text-foreground/70 font-mono text-sm leading-relaxed">
                            Recognition and behavior models classify each active track continuously.
                        </p>
                    </div>
                </div>

                {/* Step 4 */}
                <div className="flex gap-6 border border-border bg-background p-6 rounded-xl hover:bg-border/20 transition-colors shadow-sm">
                    <div className="flex-shrink-0 mt-1">
                        <div className="w-10 h-10 rounded-full border border-border bg-border/30 flex items-center justify-center text-foreground font-bold font-mono">
                            04
                        </div>
                    </div>
                    <div className="space-y-2 pt-2">
                        <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                            <Activity className="w-5 h-5 text-accent" /> Analytics Visualization
                        </h3>
                        <p className="text-foreground/70 font-mono text-sm leading-relaxed">
                            Events are logged and visualized in the dashboard in real time.
                        </p>
                    </div>
                </div>

            </div>
        </div>
    );
}
