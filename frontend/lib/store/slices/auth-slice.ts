import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { AuthenticatedUser, PermissionRule } from "@/lib/api/auth";

export interface AuthState {
  user: AuthenticatedUser | null;
  permissions: PermissionRule[];
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
}

const initialState: AuthState = {
  user: null,
  permissions: [],
  token: null,
  isAuthenticated: false,
  isLoading: true,
  isInitialized: false,
};

export const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials: (
      state,
      action: PayloadAction<{
        user: AuthenticatedUser;
        permissions: PermissionRule[];
        token?: string;
      }>
    ) => {
      const { user, permissions, token } = action.payload;
      state.user = user;
      state.permissions = permissions;
      if (token) {
        state.token = token;
      }
      state.isAuthenticated = true;
      state.isLoading = false;
      state.isInitialized = true;
    },
    logoutState: (state) => {
      state.user = null;
      state.permissions = [];
      state.token = null;
      state.isAuthenticated = false;
      state.isLoading = false;
      state.isInitialized = true;
    },
    setAuthLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    hydrateAuth: (state) => {
      if (typeof window !== "undefined") {
        try {
          const cachedUser = localStorage.getItem("sr_user");
          const cachedToken = localStorage.getItem("sr_token");
          if (cachedUser) {
            state.user = JSON.parse(cachedUser);
            state.isAuthenticated = true;
          }
          if (cachedToken) {
            state.token = cachedToken;
          }
        } catch {
          // ignore corrupted local storage
        }
      }
      state.isInitialized = true;
    },
  },
});

export const { setCredentials, logoutState, setAuthLoading, hydrateAuth } = authSlice.actions;

export default authSlice.reducer;
