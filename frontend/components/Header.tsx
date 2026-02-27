import { Beaker } from "lucide-react";

interface HeaderProps {
    currentView: "landing" | "dashboard" | "how-it-works";
    setView: (view: "landing" | "dashboard" | "how-it-works") => void;
}

export function Header({ currentView, setView }: HeaderProps) {
    return (
        <header className="w-full flex items-center justify-between px-12 py-8 border-b border-border/40 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
            {/* Brand logo */}
            <div
                className="flex items-center gap-2 max-w-[50%] cursor-pointer"
                onClick={() => setView("landing")}
            >
                <span className="font-bold text-lg tracking-tight text-foreground truncate hover:opacity-80 transition-opacity" title="BehaviorNet: A Multi-Modal Computer Vision Framework for Educational Attentiveness Quantification">
                    BehaviorNet
                </span>
            </div>

            {/* Navigation */}
            <nav className="hidden md:flex items-center gap-8 font-medium">
                <button
                    onClick={() => setView("landing")}
                    className={`transition-colors duration-200 ${currentView === "landing" ? "text-foreground font-bold" : "text-foreground/70 hover:text-foreground"}`}
                >
                    Landing Page
                </button>
                <button
                    onClick={() => setView("how-it-works")}
                    className={`transition-colors duration-200 ${currentView === "how-it-works" ? "text-foreground font-bold" : "text-foreground/70 hover:text-foreground"}`}
                >
                    How It Works
                </button>
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-4">
                <button
                    onClick={() => setView("dashboard")}
                    className={`flex items-center gap-2 border border-border px-5 py-2 rounded-md transition-all duration-200 font-medium tracking-wide ${currentView === "dashboard"
                        ? "bg-foreground text-background shadow-md"
                        : "bg-accent hover:opacity-90 text-background"
                        }`}
                >
                    <Beaker className="w-4 h-4 text-background" />
                    Dashboard
                </button>
            </div>
        </header>
    );
}
