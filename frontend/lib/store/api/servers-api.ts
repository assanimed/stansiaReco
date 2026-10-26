import { baseApi } from "./base-api";
import {
  ServerProvider,
  CreateProviderPayload,
  MTAServer,
  CreateMTAServerPayload,
  BulkAddMTAPayload,
  BulkAddResult,
  SSHTestResult,
  ServerIP,
  AddServerIPPayload,
  VMTA,
  CreateVMTAPayload,
  ProxyServer,
  UpdateProxyPayload,
  ServerAction,
  InstallMTAPayload,
} from "@/lib/api/servers";

export const serversApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    // Providers
    getProviders: builder.query<ServerProvider[], void>({
      query: () => "/servers/providers",
      transformResponse: (res: { providers: ServerProvider[] }) => res.providers || [],
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: "Providers" as const, id })),
              { type: "Providers", id: "LIST" },
            ]
          : [{ type: "Providers", id: "LIST" }],
    }),

    getProviderById: builder.query<ServerProvider, string>({
      query: (id) => `/servers/providers/${id}`,
      transformResponse: (res: { provider: ServerProvider }) => res.provider,
      providesTags: (result, error, id) => [{ type: "Providers", id }],
    }),

    createProvider: builder.mutation<ServerProvider, CreateProviderPayload>({
      query: (body) => ({
        url: "/servers/providers",
        method: "POST",
        body,
      }),
      transformResponse: (res: { provider: ServerProvider }) => res.provider,
      invalidatesTags: [{ type: "Providers", id: "LIST" }],
    }),

    updateProvider: builder.mutation<ServerProvider, { id: string; payload: Partial<CreateProviderPayload> }>({
      query: ({ id, payload }) => ({
        url: `/servers/providers/${id}`,
        method: "PUT",
        body: payload,
      }),
      transformResponse: (res: { provider: ServerProvider }) => res.provider,
      invalidatesTags: (result, error, { id }) => [
        { type: "Providers", id },
        { type: "Providers", id: "LIST" },
      ],
    }),

    deleteProvider: builder.mutation<void, string>({
      query: (id) => ({
        url: `/servers/providers/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: (result, error, id) => [
        { type: "Providers", id },
        { type: "Providers", id: "LIST" },
      ],
    }),

    // Actions
    getActions: builder.query<ServerAction[], void>({
      query: () => "/servers/actions",
      transformResponse: (res: { actions: ServerAction[] }) => res.actions || [],
    }),

    // MTA Servers
    getServers: builder.query<MTAServer[], void>({
      query: () => "/servers/mta",
      transformResponse: (res: { servers: MTAServer[] }) => res.servers || [],
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: "Servers" as const, id })),
              { type: "Servers", id: "LIST" },
            ]
          : [{ type: "Servers", id: "LIST" }],
    }),

    getServerById: builder.query<MTAServer, string>({
      query: (id) => `/servers/mta/${id}`,
      transformResponse: (res: { server: MTAServer }) => res.server,
      providesTags: (result, error, id) => [{ type: "Servers", id }],
    }),

    createServer: builder.mutation<MTAServer, CreateMTAServerPayload>({
      query: (body) => ({
        url: "/servers/mta",
        method: "POST",
        body,
      }),
      transformResponse: (res: { server: MTAServer }) => res.server,
      invalidatesTags: [
        { type: "Servers", id: "LIST" },
        { type: "Providers", id: "LIST" },
      ],
    }),

    bulkCreateServers: builder.mutation<BulkAddResult, BulkAddMTAPayload>({
      query: (body) => ({
        url: "/servers/mta/bulk",
        method: "POST",
        body,
      }),
      invalidatesTags: [
        { type: "Servers", id: "LIST" },
        { type: "Providers", id: "LIST" },
      ],
    }),

    updateServer: builder.mutation<MTAServer, { id: string; payload: Partial<CreateMTAServerPayload> }>({
      query: ({ id, payload }) => ({
        url: `/servers/mta/${id}`,
        method: "PUT",
        body: payload,
      }),
      transformResponse: (res: { server: MTAServer }) => res.server,
      invalidatesTags: (result, error, { id }) => [
        { type: "Servers", id },
        { type: "Servers", id: "LIST" },
      ],
    }),

    deleteServer: builder.mutation<void, string>({
      query: (id) => ({
        url: `/servers/mta/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: (result, error, id) => [
        { type: "Servers", id },
        { type: "Servers", id: "LIST" },
        { type: "Providers", id: "LIST" },
      ],
    }),

    testSSHConnection: builder.mutation<SSHTestResult, string>({
      query: (id) => ({
        url: `/servers/mta/${id}/test-connection`,
        method: "POST",
      }),
      invalidatesTags: (result, error, id) => [{ type: "Servers", id }],
    }),

    // Additional IPs
    getAllServerIPs: builder.query<ServerIP[], string | void>({
      query: (serverId) => (serverId ? `/servers/mta/ips?server_id=${serverId}` : `/servers/mta/ips`),
      transformResponse: (res: { ips: ServerIP[] }) => res.ips || [],
      providesTags: (result) => [
        { type: "ServerIPs", id: "ALL" },
        { type: "ServerIPs", id: "LIST" },
      ],
    }),

    getServerIPs: builder.query<ServerIP[], string>({
      query: (serverId) => `/servers/mta/${serverId}/ips`,
      transformResponse: (res: { ips: ServerIP[] }) => res.ips || [],
      providesTags: (result, error, serverId) => [
        { type: "ServerIPs", id: serverId },
        { type: "ServerIPs", id: "LIST" },
      ],
    }),

    addServerIP: builder.mutation<ServerIP, { serverId: string; payload: AddServerIPPayload }>({
      query: ({ serverId, payload }) => ({
        url: `/servers/mta/${serverId}/ips`,
        method: "POST",
        body: payload,
      }),
      transformResponse: (res: { ip: ServerIP }) => res.ip,
      invalidatesTags: (result, error, { serverId }) => [
        { type: "ServerIPs", id: serverId },
        { type: "ServerIPs", id: "ALL" },
        { type: "ServerIPs", id: "LIST" },
        { type: "Servers", id: serverId },
      ],
    }),

    bulkAddServerIPs: builder.mutation<
      { ips: ServerIP[]; count: number },
      { serverId: string; payload: { raw_lines?: string; raw_ips?: string; subnet_cidr?: number; interface_name?: string; apply_to_server?: boolean } }
    >({
      query: ({ serverId, payload }) => ({
        url: `/servers/mta/${serverId}/ips/bulk`,
        method: "POST",
        body: payload,
      }),
      invalidatesTags: (result, error, { serverId }) => [
        { type: "ServerIPs", id: serverId },
        { type: "ServerIPs", id: "ALL" },
        { type: "ServerIPs", id: "LIST" },
        { type: "Servers", id: serverId },
      ],
    }),

    applyIPsToServer: builder.mutation<
      { success: boolean; result: any; output: string; message: string; count: number; error?: string },
      { serverId: string; ipIds?: string[] }
    >({
      query: ({ serverId, ipIds }) => ({
        url: `/servers/mta/${serverId}/ips/apply`,
        method: "POST",
        body: { ip_ids: ipIds },
      }),
      invalidatesTags: (result, error, { serverId }) => [
        { type: "ServerIPs", id: serverId },
        { type: "ServerIPs", id: "ALL" },
        { type: "ServerIPs", id: "LIST" },
        { type: "Servers", id: serverId },
      ],
    }),

    deleteServerIP: builder.mutation<void, { serverId: string; ipId: string }>({
      query: ({ serverId, ipId }) => ({
        url: `/servers/mta/${serverId}/ips/${ipId}`,
        method: "DELETE",
      }),
      invalidatesTags: (result, error, { serverId }) => [
        { type: "ServerIPs", id: serverId },
        { type: "Servers", id: serverId },
      ],
    }),

    markIPConfigured: builder.mutation<void, { serverId: string; ipId: string; is_configured: boolean }>({
      query: ({ serverId, ipId, is_configured }) => ({
        url: `/servers/mta/${serverId}/ips/${ipId}/mark-configured`,
        method: "POST",
        body: { is_configured },
      }),
      invalidatesTags: (result, error, { serverId }) => [{ type: "ServerIPs", id: serverId }],
    }),

    getNmcliScript: builder.query<{ script: string }, string>({
      query: (serverId) => `/servers/mta/${serverId}/nmcli-script`,
    }),

    // VMTAs
    getVmtas: builder.query<VMTA[], void>({
      query: () => "/servers/vmtas",
      transformResponse: (res: { vmtas: VMTA[] }) => res.vmtas || [],
      providesTags: [{ type: "VMTAs", id: "LIST" }],
    }),

    createVmta: builder.mutation<VMTA, { serverId: string; payload: CreateVMTAPayload }>({
      query: ({ serverId, payload }) => ({
        url: `/servers/mta/${serverId}/vmtas`,
        method: "POST",
        body: payload,
      }),
      transformResponse: (res: { vmta: VMTA }) => res.vmta,
      invalidatesTags: (result, error, { serverId }) => [
        { type: "VMTAs", id: "LIST" },
        { type: "Servers", id: serverId },
      ],
    }),

    bulkCreateVmtas: builder.mutation<{ added_count: number }, { serverId: string; payload: { raw_lines: string; default_domain?: string } }>({
      query: ({ serverId, payload }) => ({
        url: `/servers/mta/${serverId}/vmtas/bulk`,
        method: "POST",
        body: payload,
      }),
      invalidatesTags: (result, error, { serverId }) => [
        { type: "VMTAs", id: "LIST" },
        { type: "Servers", id: serverId },
      ],
    }),

    deleteVmta: builder.mutation<void, string>({
      query: (vmtaId) => ({
        url: `/servers/vmtas/${vmtaId}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "VMTAs", id: "LIST" }, { type: "Servers", id: "LIST" }],
    }),

    getVmtaConfig: builder.query<{ config: string }, { serverId: string; type?: string } | string>({
      query: (arg) => {
        const serverId = typeof arg === "string" ? arg : arg.serverId;
        const type = typeof arg === "object" && arg.type ? `?type=${arg.type}` : "";
        return `/servers/mta/${serverId}/vmta-config${type}`;
      },
    }),

    // Proxies
    getProxies: builder.query<ProxyServer[], void>({
      query: () => "/servers/proxies",
      transformResponse: (res: { proxies: ProxyServer[] }) => res.proxies || [],
      providesTags: [{ type: "Proxies", id: "LIST" }],
    }),

    getServerProxy: builder.query<ProxyServer, string>({
      query: (serverId) => `/servers/mta/${serverId}/proxy`,
      transformResponse: (res: { proxy: ProxyServer }) => res.proxy,
      providesTags: (result, error, serverId) => [{ type: "Proxies", id: serverId }],
    }),

    updateServerProxy: builder.mutation<ProxyServer, { serverId: string; payload: UpdateProxyPayload }>({
      query: ({ serverId, payload }) => ({
        url: `/servers/mta/${serverId}/proxy`,
        method: "PUT",
        body: payload,
      }),
      transformResponse: (res: { proxy: ProxyServer }) => res.proxy,
      invalidatesTags: (result, error, { serverId }) => [
        { type: "Proxies", id: serverId },
        { type: "Proxies", id: "LIST" },
        { type: "Servers", id: serverId },
      ],
    }),

    getProxyInstallScript: builder.query<{ script: string }, string>({
      query: (serverId) => `/servers/mta/${serverId}/proxy/install-script`,
    }),

    // MTA Installation
    installMTA: builder.mutation<{ message: string; install_script: string }, { serverId: string; payload: InstallMTAPayload }>({
      query: ({ serverId, payload }) => ({
        url: `/servers/mta/${serverId}/install`,
        method: "POST",
        body: payload,
      }),
      invalidatesTags: (result, error, { serverId }) => [{ type: "Servers", id: serverId }],
    }),
  }),
});

export const {
  useGetProvidersQuery,
  useGetProviderByIdQuery,
  useCreateProviderMutation,
  useUpdateProviderMutation,
  useDeleteProviderMutation,
  useGetActionsQuery,
  useGetServersQuery,
  useGetServerByIdQuery,
  useCreateServerMutation,
  useBulkCreateServersMutation,
  useUpdateServerMutation,
  useDeleteServerMutation,
  useTestSSHConnectionMutation,
  useGetServerIPsQuery,
  useGetAllServerIPsQuery,
  useAddServerIPMutation,
  useBulkAddServerIPsMutation,
  useApplyIPsToServerMutation,
  useDeleteServerIPMutation,
  useMarkIPConfiguredMutation,
  useGetNmcliScriptQuery,
  useLazyGetNmcliScriptQuery,
  useGetVmtasQuery,
  useCreateVmtaMutation,
  useBulkCreateVmtasMutation,
  useDeleteVmtaMutation,
  useGetVmtaConfigQuery,
  useLazyGetVmtaConfigQuery,
  useGetProxiesQuery,
  useGetServerProxyQuery,
  useUpdateServerProxyMutation,
  useGetProxyInstallScriptQuery,
  useLazyGetProxyInstallScriptQuery,
  useInstallMTAMutation,
} = serversApi;
