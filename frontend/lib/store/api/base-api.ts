import { createApi, fetchBaseQuery, BaseQueryFn, FetchArgs, FetchBaseQueryError } from "@reduxjs/toolkit/query/react";
import { logoutState } from "../slices/auth-slice";

const getBaseUrl = (): string => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return `${process.env.NEXT_PUBLIC_API_URL}/api/v1`;
  }
  return "/api/v1";
};

const rawBaseQuery = fetchBaseQuery({
  baseUrl: getBaseUrl(),
  credentials: "include",
  prepareHeaders: (headers, { getState }) => {
    // If token exists in Redux state or localStorage, attach Bearer auth
    const state = getState() as any;
    const token = state?.auth?.token || (typeof window !== "undefined" ? localStorage.getItem("sr_token") : null);

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    return headers;
  },
});

const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions
) => {
  const result = await rawBaseQuery(args, api, extraOptions);

  if (result.error && result.error.status === 401) {
    // Session expired or invalid
    api.dispatch(logoutState());

    if (typeof window !== "undefined") {
      localStorage.removeItem("sr_token");
      localStorage.removeItem("sr_user");
      document.cookie = "sr_auth=; path=/; max-age=0; SameSite=Lax";

      const currentPath = window.location.pathname;
      if (currentPath !== "/login") {
        window.location.href = `/login?callbackUrl=${encodeURIComponent(currentPath)}`;
      }
    }
  }

  return result;
};

export const baseApi = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithReauth,
  tagTypes: [
    "Auth",
    "Users",
    "Providers",
    "Servers",
    "ServerIPs",
    "VMTAs",
    "Proxies",
    "Domains",
    "DNS",
    "Scripts",
    "Executions",
    "Terminals",
    "Audit",
    "Credentials",
    "MailLists",
    "Contacts",
    "MailboxProviders",
    "SendingESPs",
    "IPPools",
    "Countries",
    "Verticals",
    "ImportJobs",
    "Suppressions",
    "DataQuality",
    "DataSettings",
    "ContactEvents",
    "Campaigns",
    "CampaignLogs",
    "IRedMail",
  ],
  endpoints: () => ({}),
});
