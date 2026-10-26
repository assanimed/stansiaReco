import React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "success" | "destructive" | "outline" | "warning";
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variantStyles = {
    default: "bg-blue-600/20 text-blue-400 border-blue-500/30",
    secondary: "bg-slate-800 text-slate-300 border-slate-700",
    success: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    destructive: "bg-rose-500/20 text-rose-400 border-rose-500/30",
    warning: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    outline: "bg-transparent text-slate-300 border-slate-700",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold tracking-wide transition-colors focus:outline-none",
        variantStyles[variant],
        className
      )}
      {...props}
    />
  );
}
