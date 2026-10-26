"use client";

import React, { useState } from "react";
import { UserCheck, Shield, LogOut, ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";

export function Header() {
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/40 backdrop-blur px-8 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-xs font-mono text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded border border-slate-700/60">
          Environment: development
        </span>
      </div>

      <div className="flex items-center gap-4">
        {/* Role Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/60 border border-slate-700/60 text-xs">
          <Shield className="h-3.5 w-3.5 text-blue-400" />
          <span className="text-slate-300 font-medium capitalize">
            Role: {user?.role || "Administrator"}
          </span>
        </div>

        {/* User Profile & Logout Popover */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2.5 p-1 rounded-lg hover:bg-slate-800/60 transition-colors focus:outline-none"
          >
            <div className="h-8 w-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-xs">
              {user?.full_name ? user.full_name.substring(0, 2).toUpperCase() : <UserCheck className="h-4 w-4" />}
            </div>
            <div className="hidden sm:block text-left text-xs">
              <span className="font-semibold text-slate-200 block leading-tight">
                {user?.full_name || "System Admin"}
              </span>
              <span className="text-[11px] text-slate-400 font-mono block leading-tight">
                {user?.email || "admin@stansiareco.local"}
              </span>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-slate-500 hidden sm:block" />
          </button>

          {dropdownOpen && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setDropdownOpen(false)} 
              />
              <div className="absolute right-0 mt-2 w-56 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-2 border-b border-slate-800/80 mb-1">
                  <span className="text-xs font-semibold text-slate-200 block truncate">
                    {user?.full_name || "System Administrator"}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono block truncate">
                    {user?.email || "admin@stansiareco.local"}
                  </span>
                </div>

                <button
                  onClick={async () => {
                    setDropdownOpen(false);
                    await logout();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
