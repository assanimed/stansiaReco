"use client";

import React, { useState, useEffect } from "react";
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Info, 
  Loader2, 
  X 
} from "lucide-react";
import { NotificationItem as NotificationItemType } from "@/lib/notifications/notification-types";
import { notificationStore } from "@/lib/notifications/notification-store";
import { cn } from "@/lib/utils";

interface NotificationItemProps {
  item: NotificationItemType;
}

export function NotificationItem({ item }: NotificationItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [remainingPercent, setRemainingPercent] = useState(100);

  const duration = item.duration || 0;
  const isAutoDismissing = duration > 0;

  useEffect(() => {
    if (!isAutoDismissing || isHovered) return;

    const interval = 50; // update every 50ms
    const step = (interval / duration) * 100;

    const timer = setInterval(() => {
      setRemainingPercent((prev) => {
        if (prev <= step) {
          clearInterval(timer);
          return 0;
        }
        return prev - step;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [duration, isAutoDismissing, isHovered]);

  const handleMouseEnter = () => {
    setIsHovered(true);
    notificationStore.pause(item.id);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    notificationStore.resume(item.id);
  };

  const getTheme = () => {
    switch (item.type) {
      case "success":
        return {
          border: "border-emerald-500/30",
          bg: "bg-slate-900/95",
          iconBg: "bg-emerald-500/10 text-emerald-400",
          progressBar: "bg-emerald-500",
          icon: <CheckCircle2 className="h-5 w-5 shrink-0" />,
        };
      case "error":
        return {
          border: "border-rose-500/30",
          bg: "bg-slate-900/95",
          iconBg: "bg-rose-500/10 text-rose-400",
          progressBar: "bg-rose-500",
          icon: <XCircle className="h-5 w-5 shrink-0" />,
        };
      case "warning":
        return {
          border: "border-amber-500/30",
          bg: "bg-slate-900/95",
          iconBg: "bg-amber-500/10 text-amber-400",
          progressBar: "bg-amber-500",
          icon: <AlertTriangle className="h-5 w-5 shrink-0" />,
        };
      case "loading":
        return {
          border: "border-blue-500/30",
          bg: "bg-slate-900/95",
          iconBg: "bg-blue-500/10 text-blue-400",
          progressBar: "bg-blue-500",
          icon: <Loader2 className="h-5 w-5 shrink-0 animate-spin" />,
        };
      case "info":
      default:
        return {
          border: "border-blue-500/30",
          bg: "bg-slate-900/95",
          iconBg: "bg-blue-500/10 text-blue-400",
          progressBar: "bg-blue-500",
          icon: <Info className="h-5 w-5 shrink-0" />,
        };
    }
  };

  const theme = getTheme();
  const isAlert = item.type === "error" || item.type === "warning";

  return (
    <div
      role={isAlert ? "alert" : "status"}
      aria-live={isAlert ? "assertive" : "polite"}
      aria-atomic="true"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
      className={cn(
        "relative group flex flex-col w-full max-w-md rounded-xl border shadow-xl backdrop-blur-md overflow-hidden transition-all duration-200 animate-in fade-in slide-in-from-bottom-2",
        theme.bg,
        theme.border
      )}
    >
      <div className="p-3.5 flex items-start gap-3">
        <div className={cn("p-2 rounded-lg mt-0.5", theme.iconBg)}>
          {theme.icon}
        </div>

        <div className="flex-1 min-w-0 pr-1">
          {item.title && (
            <h4 className="text-xs font-bold text-slate-100 tracking-tight leading-snug mb-0.5">
              {item.title}
            </h4>
          )}
          <p className="text-xs text-slate-300 leading-relaxed break-words">
            {item.message}
          </p>

          {item.suggestedAction && (
            <p className="text-[11px] text-slate-400 mt-1 leading-normal italic">
              {item.suggestedAction}
            </p>
          )}

          {/* Action buttons (e.g. View details, Retry) */}
          {item.action && (
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => item.action?.onClick(item.id)}
                className="px-2.5 py-1 text-xs font-semibold rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 transition-colors"
              >
                {item.action.label}
              </button>
            </div>
          )}
        </div>

        {/* Dismiss Button */}
        {item.dismissible && (
          <button
            type="button"
            onClick={() => notificationStore.dismiss(item.id)}
            aria-label="Dismiss notification"
            className="text-slate-500 hover:text-slate-300 p-1 rounded-md hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Auto-dismiss timer progress bar */}
      {isAutoDismissing && (
        <div className="w-full bg-slate-800/40 h-0.5">
          <div
            className={cn("h-full transition-all duration-75 ease-linear", theme.progressBar)}
            style={{ width: `${remainingPercent}%` }}
          />
        </div>
      )}
    </div>
  );
}
