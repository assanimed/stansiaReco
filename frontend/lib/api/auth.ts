import { apiClient } from "./client";

export interface AuthenticatedUser {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "operator" | "viewer" | string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PermissionRule {
  resource: string;
  can_view: boolean;
  can_insert: boolean;
  can_update: boolean;
  can_delete: boolean;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: AuthenticatedUser;
  permissions: PermissionRule[];
}

export interface MeResponse {
  user: AuthenticatedUser;
  permissions: PermissionRule[];
}

export const authApi = {
  login: async (payload: LoginPayload): Promise<LoginResponse> => {
    const res = await apiClient<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (typeof window !== "undefined") {
      // Store token and user
      if (res.token) {
        localStorage.setItem("sr_token", res.token);
      }
      if (res.user) {
        localStorage.setItem("sr_user", JSON.stringify(res.user));
      }
      // Set auth indicator cookie for Next.js Edge Middleware
      document.cookie = "sr_auth=true; path=/; max-age=86400; SameSite=Lax";
    }

    return res;
  },

  logout: async (): Promise<void> => {
    try {
      await apiClient("/auth/logout", {
        method: "POST",
      });
    } catch {
      // Even if network fails, purge local tokens
    } finally {
      if (typeof window !== "undefined") {
        localStorage.removeItem("sr_token");
        localStorage.removeItem("sr_user");
        document.cookie = "sr_auth=; path=/; max-age=0; SameSite=Lax";
        window.location.href = "/login";
      }
    }
  },

  me: async (): Promise<MeResponse> => {
    return apiClient<MeResponse>("/auth/me");
  },
};
