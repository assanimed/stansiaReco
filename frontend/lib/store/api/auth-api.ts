import { baseApi } from "./base-api";
import { setCredentials, logoutState } from "../slices/auth-slice";
import { 
  AuthenticatedUser, 
  PermissionRule, 
  LoginPayload, 
  LoginResponse, 
  MeResponse 
} from "@/lib/api/auth";

export const authApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    getMe: builder.query<MeResponse, void>({
      query: () => "/auth/me",
      providesTags: ["Auth"],
      async onQueryStarted(_, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(
            setCredentials({
              user: data.user,
              permissions: data.permissions || [],
            })
          );
          if (typeof window !== "undefined") {
            localStorage.setItem("sr_user", JSON.stringify(data.user));
            document.cookie = "sr_auth=true; path=/; max-age=86400; SameSite=Lax";
          }
        } catch {
          dispatch(logoutState());
          if (typeof window !== "undefined") {
            localStorage.removeItem("sr_token");
            localStorage.removeItem("sr_user");
            document.cookie = "sr_auth=; path=/; max-age=0; SameSite=Lax";
          }
        }
      },
    }),

    login: builder.mutation<LoginResponse, LoginPayload>({
      query: (credentials) => ({
        url: "/auth/login",
        method: "POST",
        body: credentials,
      }),
      invalidatesTags: ["Auth"],
      async onQueryStarted(_, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(
            setCredentials({
              user: data.user,
              permissions: data.permissions || [],
              token: data.token,
            })
          );
          if (typeof window !== "undefined") {
            if (data.token) {
              localStorage.setItem("sr_token", data.token);
            }
            if (data.user) {
              localStorage.setItem("sr_user", JSON.stringify(data.user));
            }
            document.cookie = "sr_auth=true; path=/; max-age=86400; SameSite=Lax";
          }
        } catch {
          // Handled by calling mutation hook
        }
      },
    }),

    logout: builder.mutation<void, void>({
      query: () => ({
        url: "/auth/logout",
        method: "POST",
      }),
      invalidatesTags: ["Auth"],
      async onQueryStarted(_, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
        } catch {
          // Ignore network errors on logout
        } finally {
          dispatch(logoutState());
          if (typeof window !== "undefined") {
            localStorage.removeItem("sr_token");
            localStorage.removeItem("sr_user");
            document.cookie = "sr_auth=; path=/; max-age=0; SameSite=Lax";
            window.location.href = "/login";
          }
        }
      },
    }),
  }),
});

export const {
  useGetMeQuery,
  useLazyGetMeQuery,
  useLoginMutation,
  useLogoutMutation,
} = authApi;
