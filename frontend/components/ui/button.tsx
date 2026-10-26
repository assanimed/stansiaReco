import React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "destructive" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  disabled,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-50 select-none rounded-lg";

  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-500 shadow-sm shadow-blue-600/30",
    secondary: "bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700/60",
    destructive: "bg-rose-600 text-white hover:bg-rose-500 shadow-sm shadow-rose-600/30",
    outline: "border border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800",
    ghost: "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60",
  };

  const sizes = {
    sm: "h-8 px-3 text-xs gap-1.5",
    md: "h-9 px-4 text-sm gap-2",
    lg: "h-11 px-6 text-base gap-2.5",
  };

  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled}
      {...props}
    />
  );
}
