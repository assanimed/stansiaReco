"use client";

import React, { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !user) {
      const callback = pathname && pathname !== "/dashboard" ? `?callbackUrl=${encodeURIComponent(pathname)}` : "";
      router.push(`/login${callback}`);
    }
  }, [isLoading, user, router, pathname]);

  if (isLoading && !user) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-950 text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
          <span className="text-xs font-mono">Verifying authorization...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
