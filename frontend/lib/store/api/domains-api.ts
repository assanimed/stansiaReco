import { baseApi } from "./base-api";

export interface DomainProvider {
  id: string;
  provider_type: "namecheap" | "name.com" | "godaddy" | string;
  name: string;
  api_user: string;
  account_user: string;
  has_api_key: boolean;
  has_api_secret: boolean;
  client_ip: string;
  environment: "production" | "sandbox" | "ote" | string;
  is_active: boolean;
  domain_count: number;
  last_synced_at?: string;
  last_error?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateProviderPayload {
  name: string;
  provider_type: string;
  api_user: string;
  account_user?: string;
  api_key: string;
  api_secret?: string;
  client_ip?: string;
  environment?: string;
  notes?: string;
}

export interface UpdateProviderPayload {
  id: string;
  name?: string;
  api_user?: string;
  account_user?: string;
  api_key?: string;
  api_secret?: string;
  client_ip?: string;
  environment?: string;
  is_active?: boolean;
  notes?: string;
}

export interface DomainItem {
  id: string;
  integration_id?: string;
  provider_name?: string;
  provider_type?: string;
  domain_name: string;
  provider_domain_id?: string;
  is_locked: boolean;
  auto_renew: boolean;
  uses_namecheap_dns: boolean;
  nameservers: string[];
  status: "active" | "expired" | "pending" | "sync_error" | string;
  expires_at?: string;
  provider_created_at?: string;
  record_count: number;
  notes?: string;
  last_synced_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateDomainPayload {
  domain_name: string;
  integration_id?: string;
  status: string;
  auto_renew: boolean;
  is_locked: boolean;
  nameservers?: string[];
  expires_at?: string;
  notes?: string;
}

export interface CreateBulkDomainsPayload {
  domains: string[];
  integration_id?: string;
  status?: string;
  auto_renew?: boolean;
  is_locked?: boolean;
  nameservers?: string[];
  notes?: string;
}

export interface BulkDomainItemResult {
  domain_name: string;
  id?: string;
  status: "created" | "skipped" | "error";
  error?: string;
}

export interface CreateBulkDomainsResponse {
  total_created: number;
  total_skipped: number;
  total_errors: number;
  results: BulkDomainItemResult[];
  message: string;
}

export interface UpdateDomainPayload {
  id: string;
  integration_id?: string;
  status?: string;
  auto_renew?: boolean;
  is_locked?: boolean;
  nameservers?: string[];
  expires_at?: string;
  notes?: string;
}

export interface DNSRecord {
  id: string;
  domain_id: string;
  domain_name?: string;
  record_type: "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS" | "SPF" | string;
  host_name: string;
  record_value: string;
  ttl: number;
  mx_priority?: number;
  is_managed: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateDNSRecordPayload {
  domain_id: string;
  record_type: string;
  host_name: string;
  record_value: string;
  ttl: number;
  mx_priority?: number;
}

export interface UpdateDNSRecordPayload {
  id: string;
  domain_id?: string;
  record_type?: string;
  host_name?: string;
  record_value?: string;
  ttl?: number;
  mx_priority?: number;
}

export interface IPReplacementPair {
  old_ip: string;
  new_ip: string;
}

export interface IPReplacementRequest {
  domain_id?: string;
  pairs: IPReplacementPair[];
}

export interface IPReplacementChange {
  record_id: string;
  domain_id: string;
  domain_name: string;
  host_name: string;
  record_type: string;
  old_value: string;
  new_value: string;
}

export interface IPReplacementResult {
  total_matches: number;
  total_updated: number;
  changes: IPReplacementChange[];
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  latency: string;
}

export interface DeployCustomRecordPayload {
  domain_ids?: string[];
  record_type: string;
  host_name: string;
  record_value: string;
  ttl?: number;
  mx_priority?: number;
  overwrite: boolean;
}

export interface DeployCustomRecordResult {
  total_targeted: number;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  affected_names: string[];
  errors: string[];
}

export interface DeploySPFPayload {
  domain_ids?: string[];
  spf_record: string;
  mode: "replace" | "merge";
  ttl?: number;
}

export interface DeploySPFResult {
  total_targeted: number;
  updated_count: number;
  created_count: number;
  affected_names: string[];
  errors: string[];
}

export interface DomainSPFStatus {
  domain_id: string;
  domain_name: string;
  has_spf: boolean;
  spf_record?: string;
  lookup_count: number;
  is_valid: boolean;
}

export const domainsApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    // -------------------------------------------------------------------------
    // Providers Endpoints
    // -------------------------------------------------------------------------
    getDomainProviders: builder.query<DomainProvider[], void>({
      query: () => "/domains/providers",
      transformResponse: (res: { providers: DomainProvider[] }) => res.providers || [],
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: "Providers" as const, id })),
              { type: "Providers", id: "DOMAINS_LIST" },
            ]
          : [{ type: "Providers", id: "DOMAINS_LIST" }],
    }),

    getDomainProvider: builder.query<DomainProvider, string>({
      query: (id) => `/domains/providers/${id}`,
      transformResponse: (res: { provider: DomainProvider }) => res.provider,
      providesTags: (result, error, id) => [{ type: "Providers", id }],
    }),

    createDomainProvider: builder.mutation<DomainProvider, CreateProviderPayload>({
      query: (payload) => ({
        url: "/domains/providers",
        method: "POST",
        body: payload,
      }),
      invalidatesTags: [{ type: "Providers", id: "DOMAINS_LIST" }],
    }),

    updateDomainProvider: builder.mutation<DomainProvider, UpdateProviderPayload>({
      query: ({ id, ...body }) => ({
        url: `/domains/providers/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: "Providers", id },
        { type: "Providers", id: "DOMAINS_LIST" },
      ],
    }),

    deleteDomainProvider: builder.mutation<{ message: string }, string>({
      query: (id) => ({
        url: `/domains/providers/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "Providers", id: "DOMAINS_LIST" }],
    }),

    testDomainProvider: builder.mutation<TestConnectionResult, string>({
      query: (id) => ({
        url: `/domains/providers/${id}/test`,
        method: "POST",
      }),
    }),

    syncDomainProvider: builder.mutation<{ synced_count: number; message: string }, string>({
      query: (id) => ({
        url: `/domains/providers/${id}/sync`,
        method: "POST",
      }),
      invalidatesTags: [
        { type: "Domains", id: "LIST" },
        { type: "Providers", id: "DOMAINS_LIST" },
      ],
    }),

    // -------------------------------------------------------------------------
    // Domains Endpoints
    // -------------------------------------------------------------------------
    getDomains: builder.query<DomainItem[], { search?: string; status?: string; provider_id?: string } | void>({
      query: (params) => {
        let url = "/domains";
        const queryParams = new URLSearchParams();
        if (params?.search) queryParams.set("search", params.search);
        if (params?.status) queryParams.set("status", params.status);
        if (params?.provider_id) queryParams.set("provider_id", params.provider_id);
        const qs = queryParams.toString();
        if (qs) url += `?${qs}`;
        return url;
      },
      transformResponse: (res: { domains: DomainItem[] }) => res.domains || [],
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: "Domains" as const, id })),
              { type: "Domains", id: "LIST" },
            ]
          : [{ type: "Domains", id: "LIST" }],
    }),

    getDomain: builder.query<DomainItem, string>({
      query: (id) => `/domains/${id}`,
      transformResponse: (res: { domain: DomainItem }) => res.domain,
      providesTags: (result, error, id) => [{ type: "Domains", id }],
    }),

    createDomain: builder.mutation<DomainItem, CreateDomainPayload>({
      query: (payload) => ({
        url: "/domains",
        method: "POST",
        body: payload,
      }),
      invalidatesTags: [
        { type: "Domains", id: "LIST" },
        { type: "Providers", id: "DOMAINS_LIST" },
      ],
    }),

    createBulkDomains: builder.mutation<CreateBulkDomainsResponse, CreateBulkDomainsPayload>({
      query: (payload) => ({
        url: "/domains/bulk",
        method: "POST",
        body: payload,
      }),
      invalidatesTags: [
        { type: "Domains", id: "LIST" },
        { type: "Providers", id: "DOMAINS_LIST" },
      ],
    }),

    updateDomain: builder.mutation<DomainItem, UpdateDomainPayload>({
      query: ({ id, ...body }) => ({
        url: `/domains/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: "Domains", id },
        { type: "Domains", id: "LIST" },
      ],
    }),

    deleteDomain: builder.mutation<{ message: string }, string>({
      query: (id) => ({
        url: `/domains/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: [
        { type: "Domains", id: "LIST" },
        { type: "Providers", id: "DOMAINS_LIST" },
      ],
    }),

    syncAllDomains: builder.mutation<{ message: string; total_synced: number }, void>({
      query: () => ({
        url: "/domains/sync",
        method: "POST",
      }),
      invalidatesTags: [
        { type: "Domains", id: "LIST" },
        { type: "Providers", id: "DOMAINS_LIST" },
      ],
    }),

    syncDomain: builder.mutation<
      {
        domain_id: string;
        domain_name: string;
        source: string;
        records_synced: number;
        message: string;
        warnings?: string[];
      },
      string
    >({
      query: (domainId) => ({
        url: `/domains/${domainId}/sync`,
        method: "POST",
      }),
      invalidatesTags: (result, error, domainId) => [
        { type: "Domains", id: domainId },
        { type: "Domains", id: "LIST" },
        { type: "DNS", id: domainId },
      ],
    }),

    getOutboundIP: builder.query<{ outbound_ip: string }, void>({
      query: () => "/domains/outbound-ip",
    }),

    // -------------------------------------------------------------------------
    // DNS Records Endpoints
    // -------------------------------------------------------------------------
    getDNSRecords: builder.query<DNSRecord[], string>({
      query: (domainId) => `/domains/${domainId}/records`,
      transformResponse: (res: { records: DNSRecord[] }) => res.records || [],
      providesTags: (result, error, domainId) => [
        { type: "DNS", id: domainId },
        { type: "DNS", id: "ALL" },
      ],
    }),

    createDNSRecord: builder.mutation<DNSRecord, CreateDNSRecordPayload>({
      query: ({ domain_id, ...body }) => ({
        url: `/domains/${domain_id}/records`,
        method: "POST",
        body,
      }),
      invalidatesTags: (result, error, { domain_id }) => [
        { type: "DNS", id: domain_id },
        { type: "Domains", id: domain_id },
        { type: "Domains", id: "LIST" },
      ],
    }),

    updateDNSRecord: builder.mutation<DNSRecord, UpdateDNSRecordPayload>({
      query: ({ id, ...body }) => ({
        url: `/dns/records/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (result, error, { domain_id }) => [
        { type: "DNS", id: domain_id || "ALL" },
        { type: "Domains", id: "LIST" },
      ],
    }),

    deleteDNSRecord: builder.mutation<{ message: string }, { id: string; domain_id: string }>({
      query: ({ id }) => ({
        url: `/dns/records/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: (result, error, { domain_id }) => [
        { type: "DNS", id: domain_id },
        { type: "Domains", id: domain_id },
        { type: "Domains", id: "LIST" },
      ],
    }),

    bulkDeleteDNSRecords: builder.mutation<
      { message: string; deleted_count: number },
      { record_ids: string[]; domain_id?: string }
    >({
      query: ({ record_ids }) => ({
        url: "/dns/records/bulk-delete",
        method: "POST",
        body: { record_ids },
      }),
      invalidatesTags: (result, error, { domain_id }) => [
        { type: "DNS", id: domain_id || "ALL" },
        { type: "Domains", id: domain_id || "LIST" },
        { type: "Domains", id: "LIST" },
      ],
    }),

    flushDomainDNSRecords: builder.mutation<
      { message: string; deleted_records_count: number; domains_count: number },
      { domain_ids: string[] }
    >({
      query: ({ domain_ids }) => ({
        url: "/dns/flush",
        method: "POST",
        body: { domain_ids },
      }),
      invalidatesTags: [
        { type: "DNS", id: "ALL" },
        { type: "Domains", id: "LIST" },
      ],
    }),

    // -------------------------------------------------------------------------
    // Bulk DNS IP Replacement Endpoints
    // -------------------------------------------------------------------------
    previewIPReplacement: builder.mutation<IPReplacementResult, IPReplacementRequest>({
      query: (payload) => ({
        url: "/dns/ip-replace/preview",
        method: "POST",
        body: payload,
      }),
    }),

    executeIPReplacement: builder.mutation<IPReplacementResult, IPReplacementRequest>({
      query: (payload) => ({
        url: "/dns/ip-replace",
        method: "POST",
        body: payload,
      }),
      invalidatesTags: [
        { type: "DNS", id: "ALL" },
        { type: "Domains", id: "LIST" },
      ],
    }),

    // -------------------------------------------------------------------------
    // Custom Record & SPF Deployments
    // -------------------------------------------------------------------------
    deployCustomRecord: builder.mutation<DeployCustomRecordResult, DeployCustomRecordPayload>({
      query: (body) => ({
        url: "/dns/records/custom-deploy",
        method: "POST",
        body,
      }),
      invalidatesTags: [
        { type: "DNS", id: "ALL" },
        { type: "Domains", id: "LIST" },
      ],
    }),

    deploySPF: builder.mutation<DeploySPFResult, DeploySPFPayload>({
      query: (body) => ({
        url: "/dns/spf/deploy",
        method: "POST",
        body,
      }),
      invalidatesTags: [
        { type: "DNS", id: "ALL" },
        { type: "Domains", id: "LIST" },
      ],
    }),

    getDomainsSPFStatus: builder.query<DomainSPFStatus[], void>({
      query: () => "/dns/spf/status",
      transformResponse: (res: { domains: DomainSPFStatus[] }) => res.domains || [],
      providesTags: [{ type: "DNS", id: "ALL" }],
    }),
  }),
});

export const {
  useGetDomainProvidersQuery,
  useGetDomainProviderQuery,
  useCreateDomainProviderMutation,
  useUpdateDomainProviderMutation,
  useDeleteDomainProviderMutation,
  useTestDomainProviderMutation,
  useSyncDomainProviderMutation,

  useGetDomainsQuery,
  useGetDomainQuery,
  useCreateDomainMutation,
  useCreateBulkDomainsMutation,
  useUpdateDomainMutation,
  useDeleteDomainMutation,
  useSyncAllDomainsMutation,
  useSyncDomainMutation,

  useGetDNSRecordsQuery,
  useCreateDNSRecordMutation,
  useUpdateDNSRecordMutation,
  useDeleteDNSRecordMutation,
  useBulkDeleteDNSRecordsMutation,
  useFlushDomainDNSRecordsMutation,

  usePreviewIPReplacementMutation,
  useExecuteIPReplacementMutation,
  useGetOutboundIPQuery,

  useDeployCustomRecordMutation,
  useDeploySPFMutation,
  useGetDomainsSPFStatusQuery,
} = domainsApi;
