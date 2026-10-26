"use client";

import React, { useCallback } from "react";
import { useAppSelector } from "@/lib/store";
import { useLoginMutation, useLogoutMutation } from "@/lib/store/api/auth-api";
import { AuthenticatedUser, PermissionRule, LoginPayload, LoginResponse } from "@/lib/api/auth";

export interface UseAuthReturn {
  user: AuthenticatedUser | null;
  permissions: PermissionRule[];
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginPayload) => Promise<LoginResponse>;
  logout: () => Promise<void>;
  hasPermission: (resource: string, action: "view" | "insert" | "update" | "delete") => boolean;
}

/**
 * useAuth hook powered entirely by Redux Toolkit & RTK Query.
 * Zero React Context dependencies to prevent SSR hydration errors.
 */
export function useAuth(): UseAuthReturn {
  const auth = useAppSelector((state) => state.auth);
  const [loginMutation] = useLoginMutation();
  const [logoutMutation] = useLogoutMutation();

  const user = auth?.user ?? null;
  const permissions = auth?.permissions ?? [];
  const isAuthenticated = auth?.isAuthenticated ?? false;
  const isLoading = auth?.isLoading ?? false;

  const login = useCallback(
    async (credentials: LoginPayload): Promise<LoginResponse> => {
      return await loginMutation(credentials).unwrap();
    },
    [loginMutation]
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await logoutMutation().unwrap();
    } catch {
      // Ignored: slice and storage are cleared by mutation lifecycle
    }
  }, [logoutMutation]);

  const hasPermission = useCallback(
    (resource: string, action: "view" | "insert" | "update" | "delete") => {
      if (!user) return false;
      if (user.role === "admin") return true;

      const rule = permissions.find((p) => p.resource === resource);
      if (!rule) return false;

      switch (action) {
        case "view":
          return rule.can_view;
        case "insert":
          return rule.can_insert;
        case "update":
          return rule.can_update;
        case "delete":
          return rule.can_delete;
        default:
          return false;
      }
    },
    [user, permissions]
  );

  return {
    user,
    permissions,
    isLoading,
    isAuthenticated,
    login,
    logout,
    hasPermission,
  };
}

/**
 * Transparent pass-through provider for backward compatibility.
 * ReduxProvider at the root manages all state.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
