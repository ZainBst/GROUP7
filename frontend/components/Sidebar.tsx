
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, BarChart3, Video, Settings, Atom } from "lucide-react";
import { clsx } from "clsx";

const navItems = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Students & Behavior", href: "/students", icon: Users },
    { name: "Analytics", href: "/analytics", icon: BarChart3 },
    { name: "Live Classroom", href: "/video", icon: Video },
];

export function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="fixed left-0 top-0 h-screen w-64 bg-[#1a1f33] text-white shadow-xl z-50 flex flex-col">
            {/* Brand */}
            <div className="h-20 flex items-center px-8 border-b border-gray-700/50">
                <Atom className="w-8 h-8 text-orange-500 mr-3 animate-pulse" />
                <span className="text-lg font-bold tracking-wider uppercase">ClassMonitor</span>
            </div>

            {/* Navigation */}
            <nav className="flex-1 py-6 px-4 space-y-2">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={clsx(
                                "flex items-center px-4 py-3 rounded-lg transition-all duration-300 group",
                                isActive
                                    ? "bg-orange-500 shadow-orange-500/20 shadow-lg translate-x-1"
                                    : "hover:bg-gray-800/50 hover:text-orange-400"
                            )}
                        >
                            <item.icon
                                className={clsx(
                                    "w-5 h-5 mr-3 transition-colors",
                                    isActive ? "text-white" : "text-gray-400 group-hover:text-orange-400"
                                )}
                            />
                            <span className={clsx("font-medium", isActive ? "text-white" : "text-gray-300")}>
                                {item.name}
                            </span>
                        </Link>
                    );
                })}
            </nav>

            {/* Bottom Profile / Settings */}
            <div className="p-4 border-t border-gray-700/50">
                <Link
                    href="/settings"
                    className="flex items-center px-4 py-3 rounded-lg hover:bg-gray-800/50 transition-colors text-gray-400 hover:text-white"
                >
                    <Settings className="w-5 h-5 mr-3" />
                    <span className="font-medium">Settings</span>
                </Link>
            </div>

            {/* Background Decor */}
            <div className="absolute bottom-0 right-0 p-4 opacity-5 pointer-events-none">
                <Atom className="w-40 h-40 text-white" />
            </div>
        </aside>
    );
}
