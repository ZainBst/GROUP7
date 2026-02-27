import { Shield, Activity, BrainCircuit, Users, Video, Gauge, ShieldCheck, CheckCircle2, LucideIcon } from "lucide-react";

export function LandingPage() {
    return (
        <div className="w-full max-w-5xl mx-auto flex flex-col gap-16 py-12 px-6 flex-1 drop-shadow-xl text-foreground">

            {/* Hero Section */}
            <section className="text-center space-y-6 animate-in fade-in duration-700">
                <h1 className="text-4xl md:text-5xl font-bold font-mono text-foreground tracking-tight drop-shadow-sm">
                    Real-Time Educational Attentiveness Quantification
                </h1>

                {/* Value Strip */}
                <div className="flex flex-wrap justify-center gap-4 text-sm md:text-base text-foreground/80 font-medium py-4">
                    <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-accent" /> Face Detection + Tracking</span>
                    <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-accent" /> Continuous Behavior Classification</span>
                    <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-accent" /> Smart Event Logging & Analytics</span>
                    <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-accent" /> Built for Live & Recorded Sessions</span>
                </div>
            </section>

            {/* Problem & Solution Block */}
            <section className="grid md:grid-cols-2 gap-8">
                <div className="bg-background border border-border p-8 rounded-xl flex flex-col gap-4 shadow-sm">
                    <h2 className="text-2xl font-bold text-foreground font-mono">Classroom attention is hard to measure manually</h2>
                    <p className="text-foreground/80 leading-relaxed">
                        Manual observation misses patterns, takes time, and does not scale. Teachers and administrators need instant, reliable visibility into attendance, engagement, and behavior trends.
                    </p>
                </div>
                <div className="bg-background border border-border p-8 rounded-xl flex flex-col gap-4 shadow-sm">
                    <h2 className="text-2xl font-bold text-foreground font-mono">AI-powered monitoring designed for classroom reality</h2>
                    <p className="text-foreground/80 leading-relaxed">
                        Group 7&apos;s system combines face identification, behavior classification, and live analytics to provide continuous, actionable insights without interrupting teaching flow.
                    </p>
                </div>
            </section>

            {/* Features Grid */}
            <section className="space-y-8">
                <h2 className="text-3xl font-bold text-center text-foreground font-mono">Core Features</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <FeatureCard icon={Users} title="Live Student Tracking" desc="Detects and tracks every visible student with stable IDs." />
                    <FeatureCard icon={Shield} title="Face Identification" desc="Matches detected students against your enrolled face database." />
                    <FeatureCard icon={BrainCircuit} title="Behavior Intelligence" desc="Classifies behaviors like writing, upright, head down, and turning around." />
                    <FeatureCard icon={Activity} title="Realtime Dashboard" desc="View active students, alerts, logs, and behavior trends instantly." />
                    <FeatureCard icon={Video} title="Session Controls" desc="Start, stop, and switch between live camera and uploaded video." />
                    <FeatureCard icon={ShieldCheck} title="Deployment Ready" desc="Configurable for local setup and cloud-hosted environments." />
                </div>
            </section>

            <div className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent" />

            {/* Use Cases & Trust Section */}
            <section className="grid md:grid-cols-2 gap-12">
                <div className="space-y-6">
                    <h2 className="text-2xl font-bold text-foreground font-mono flex items-center gap-2">
                        Target Scenarios
                    </h2>
                    <ul className="space-y-3">
                        {["Classroom engagement monitoring", "Attendance assistance", "Behavior trend analysis", "Training and proctoring environments"].map((item, i) => (
                            <li key={i} className="flex items-center gap-3 text-foreground/80">
                                <CheckCircle2 className="w-5 h-5 text-accent flex-shrink-0" />
                                {item}
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="space-y-6">
                    <h2 className="text-2xl font-bold text-foreground font-mono flex items-center gap-2">
                        Built for reliability under real workload
                    </h2>
                    <ul className="space-y-3 text-sm">
                        {[
                            "Fair scheduling to avoid student classification starvation",
                            "Identity stabilization to reduce label flicker",
                            "Configurable thresholds and intervals for different hardware capacities",
                            "Stop/resume controls with safe stream session handling"
                        ].map((item, i) => (
                            <li key={i} className="flex items-start gap-3 text-foreground/80">
                                <Gauge className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                                <span className="leading-relaxed">{item}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </section>

            <div className="pb-12" />
        </div>
    );
}

function FeatureCard({ icon: Icon, title, desc }: { icon: LucideIcon, title: string, desc: string }) {
    return (
        <div className="bg-background border border-border p-6 rounded-xl flex flex-col gap-3 hover:bg-border/20 transition-colors group shadow-sm">
            <div className="p-2.5 bg-border/40 rounded-lg w-fit group-hover:bg-border/60 transition-colors border border-border">
                <Icon className="w-5 h-5 text-foreground group-hover:text-accent transition-colors" />
            </div>
            <h3 className="text-lg font-bold text-foreground font-mono">{title}</h3>
            <p className="text-sm text-foreground/70 leading-relaxed">{desc}</p>
        </div>
    );
}
