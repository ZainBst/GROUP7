
import { LucideIcon } from "lucide-react";
import { clsx } from "clsx";

interface StatCardProps {
    title: string;
    value: string | number;
    icon: LucideIcon;
    footer?: string;
    color?: "orange" | "green" | "blue" | "red";
}

export function StatCard({ title, value, icon: Icon, footer, color = "orange" }: StatCardProps) {
    const colorClasses = {
        orange: "text-orange-500",
        green: "text-green-500",
        blue: "text-blue-500",
        red: "text-red-500",
    };

    return (
        <div className="bg-white rounded-xl shadow-lg p-6 relative overflow-hidden group hover:-translate-y-1 transition-transform duration-300">
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">{title}</p>
                    <h3 className="text-3xl font-bold mt-2 text-gray-800">{value}</h3>
                </div>
                <div className={clsx("p-3 rounded-full bg-opacity-10", `bg-${color}-100`)}>
                    <Icon className={clsx("w-8 h-8", colorClasses[color])} />
                </div>
            </div>
            {footer && (
                <div className="mt-4 pt-4 border-t border-gray-100 flex items-center text-sm text-gray-400">
                    <span className="mr-2">⏱</span>
                    {footer}
                </div>
            )}
        </div>
    );
}
