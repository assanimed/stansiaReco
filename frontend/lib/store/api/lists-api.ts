import { baseApi } from "./base-api";

export interface MailList {
  id: string;
  name: string;
  code: string;
  mailbox_provider_id: string;
  mailbox_provider_name?: string;
  mailbox_provider_code?: string;
  country_id: string;
  country_name?: string;
  country_code?: string;
  vertical_id: string;
  vertical_name?: string;
  vertical_code?: string;
  description: string;
  status: "active" | "paused" | "archived";
  contact_count: number;
  last_imported_at?: string;
  storage_metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface MailListMetrics {
  total_contacts: number;
  eligible_contacts: number;
  clean_contacts: number;
  unsubscribed_contacts: number;
  optout_contacts: number;
  blacklisted_contacts: number;
  hard_bounces: number;
  openers: number;
  clickers: number;
  last_imported_at?: string;
  imported_jobs_count: number;
}

export interface MailboxProvider {
  id: string;
  name: string;
  code: string;
  domains: string[];
  is_active: boolean;
  description: string;
  lists_count?: number;
  created_at: string;
  updated_at: string;
}

export interface SendingESP {
  id: string;
  name: string;
  code: string;
  provider_type: string;
  is_active: boolean;
  description: string;
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface SendingIPPool {
  id: string;
  name: string;
  code: string;
  description: string;
  is_active: boolean;
  member_count?: number;
  created_at: string;
  updated_at: string;
}

export interface Country {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface Vertical {
  id: string;
  code: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
}

export interface Contact {
  id: string;
  list_id: string;
  list_name?: string;
  email: string;
  email_md5: string;
  first_name?: string;
  last_name?: string;
  verticals: string[];
  ip?: string;
  country_code?: string;
  country?: string;
  region?: string;
  city?: string;
  language?: string;
  device_type?: string;
  device_name?: string;
  os?: string;
  browser_name?: string;
  browser_version?: string;
  is_clean: boolean;
  is_unsub: boolean;
  is_optout: boolean;
  is_blacklisted: boolean;
  is_hard_bounced: boolean;
  is_opener: boolean;
  is_clicker: boolean;
  open_count: number;
  click_count: number;
  last_open_at?: string;
  last_click_at?: string;
  bounced_at?: string;
  unsubscribed_at?: string;
  attributes: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ImportJob {
  id: string;
  list_id: string;
  list_name?: string;
  filename: string;
  file_size_bytes: number;
  status: "pending" | "validating" | "queued" | "processing" | "completed" | "completed_with_errors" | "failed" | "cancelled";
  column_mapping: Record<string, number>;
  duplicate_strategy: "skip" | "update" | "replace";
  total_rows: number;
  processed_rows: number;
  accepted_rows: number;
  inserted_rows: number;
  updated_rows: number;
  duplicate_rows: number;
  invalid_rows: number;
  suppressed_rows: number;
  error_count: number;
  error_report?: Array<{ row_index: number; email?: string; reason: string }>;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Suppression {
  id: string;
  list_id?: string;
  list_name?: string;
  email: string;
  email_md5: string;
  reason: "unsubscribe" | "optout" | "hard_bounce" | "manual" | "spam_complaint";
  source?: string;
  created_at: string;
}

export interface ContactEvent {
  id: string;
  list_id: string;
  list_name?: string;
  event_type: string;
  email: string;
  ip_address?: string;
  user_agent?: string;
  metadata: Record<string, any>;
  created_at: string;
}

export interface DataQualityReport {
  total_contacts: number;
  clean_contacts: number;
  unsubscribed_contacts: number;
  optout_contacts: number;
  blacklisted_contacts: number;
  hard_bounces: number;
  missing_first_name: number;
  missing_country: number;
  missing_ip: number;
  duplicate_emails_in_system: number;
  total_suppressions: number;
}

export interface CSVPreviewResult {
  filename: string;
  total_rows_est: number;
  headers: string[];
  sample_rows: string[][];
  suggested_maps: Record<string, number>;
  available_slots: Array<{ key: string; label: string; required: boolean; description: string }>;
}

export interface GlobalListsSummary {
  total_lists: number;
  active_lists: number;
  total_contacts: number;
  imports_in_progress: number;
  failed_imports: number;
}

export const listsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Global Summary
    getGlobalSummary: builder.query<GlobalListsSummary, void>({
      query: () => "/lists/summary",
      providesTags: ["MailLists"],
    }),

    // Mail Lists
    getMailLists: builder.query<{ lists: MailList[]; total: number; page: number; per_page: number }, {
      search?: string;
      provider_id?: string;
      country_id?: string;
      vertical_id?: string;
      status?: string;
      min_contacts?: number;
      max_contacts?: number;
      page?: number;
      per_page?: number;
    }>({
      query: (params) => ({
        url: "/lists",
        params,
      }),
      providesTags: ["MailLists"],
    }),

    getMailList: builder.query<MailList, string>({
      query: (id) => `/lists/${id}`,
      providesTags: (_res, _err, id) => [{ type: "MailLists", id }],
    }),

    createMailList: builder.mutation<MailList, {
      name: string;
      code?: string;
      mailbox_provider_id: string;
      country_id: string;
      vertical_id: string;
      description?: string;
    }>({
      query: (body) => ({
        url: "/lists",
        method: "POST",
        body,
      }),
      invalidatesTags: ["MailLists"],
    }),

    updateMailList: builder.mutation<MailList, {
      id: string;
      name: string;
      description?: string;
    }>({
      query: ({ id, ...body }) => ({
        url: `/lists/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: ["MailLists"],
    }),

    setMailListStatus: builder.mutation<MailList, { id: string; status: "active" | "paused" | "archived" }>({
      query: ({ id, status }) => ({
        url: `/lists/${id}/status`,
        method: "PATCH",
        body: { status },
      }),
      invalidatesTags: ["MailLists"],
    }),

    getMailListMetrics: builder.query<MailListMetrics, string>({
      query: (id) => `/lists/${id}/metrics`,
      providesTags: (_res, _err, id) => [{ type: "MailLists", id }],
    }),

    // Mailbox Providers
    getMailboxProviders: builder.query<{ providers: MailboxProvider[] }, { active?: boolean } | void>({
      query: (params) => ({
        url: "/lists/mailbox-providers",
        params: params ? { active: params.active } : undefined,
      }),
      providesTags: ["MailboxProviders"],
    }),

    getMailboxProvider: builder.query<MailboxProvider, string>({
      query: (id) => `/lists/mailbox-providers/${id}`,
      providesTags: ["MailboxProviders"],
    }),

    createMailboxProvider: builder.mutation<MailboxProvider, {
      name: string;
      code: string;
      domains: string[];
      is_active: boolean;
      description?: string;
    }>({
      query: (body) => ({
        url: "/lists/mailbox-providers",
        method: "POST",
        body,
      }),
      invalidatesTags: ["MailboxProviders"],
    }),

    updateMailboxProvider: builder.mutation<MailboxProvider, {
      id: string;
      name?: string;
      domains?: string[];
      is_active?: boolean;
      description?: string;
    }>({
      query: ({ id, ...body }) => ({
        url: `/lists/mailbox-providers/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: ["MailboxProviders"],
    }),

    // Sending ESPs
    getSendingESPs: builder.query<{ esps: SendingESP[] }, { active?: boolean } | void>({
      query: (params) => ({
        url: "/lists/sending-esps",
        params: params ? { active: params.active } : undefined,
      }),
      providesTags: ["SendingESPs"],
    }),

    createSendingESP: builder.mutation<SendingESP, {
      name: string;
      code: string;
      provider_type: string;
      is_active: boolean;
      description?: string;
      config?: Record<string, any>;
    }>({
      query: (body) => ({
        url: "/lists/sending-esps",
        method: "POST",
        body,
      }),
      invalidatesTags: ["SendingESPs"],
    }),

    updateSendingESP: builder.mutation<SendingESP, {
      id: string;
      name?: string;
      provider_type?: string;
      is_active?: boolean;
      description?: string;
      config?: Record<string, any>;
    }>({
      query: ({ id, ...body }) => ({
        url: `/lists/sending-esps/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: ["SendingESPs"],
    }),

    // Sending IP Pools
    getSendingIPPools: builder.query<{ pools: SendingIPPool[] }, { active?: boolean } | void>({
      query: (params) => ({
        url: "/lists/ip-pools",
        params: params ? { active: params.active } : undefined,
      }),
      providesTags: ["IPPools"],
    }),

    createSendingIPPool: builder.mutation<SendingIPPool, {
      name: string;
      code: string;
      description?: string;
      is_active: boolean;
      initial_ip_ids?: string[];
    }>({
      query: (body) => ({
        url: "/lists/ip-pools",
        method: "POST",
        body,
      }),
      invalidatesTags: ["IPPools"],
    }),

    updateSendingIPPool: builder.mutation<SendingIPPool, {
      id: string;
      name?: string;
      description?: string;
      is_active?: boolean;
      ip_ids?: string[];
    }>({
      query: ({ id, ...body }) => ({
        url: `/lists/ip-pools/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: ["IPPools"],
    }),

    // Countries & Verticals Catalogs
    getCountries: builder.query<{ countries: Country[] }, { active?: boolean } | void>({
      query: (params) => ({
        url: "/lists/countries",
        params: params ? { active: params.active } : undefined,
      }),
      providesTags: ["Countries"],
    }),

    createCountry: builder.mutation<Country, { code: string; name: string; is_active: boolean }>({
      query: (body) => ({
        url: "/lists/countries",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Countries"],
    }),

    toggleCountry: builder.mutation<Country, string>({
      query: (code) => ({
        url: `/lists/countries/${code}/toggle`,
        method: "PUT",
      }),
      invalidatesTags: ["Countries"],
    }),

    getVerticals: builder.query<{ verticals: Vertical[] }, { active?: boolean } | void>({
      query: (params) => ({
        url: "/lists/verticals",
        params: params ? { active: params.active } : undefined,
      }),
      providesTags: ["Verticals"],
    }),

    createVertical: builder.mutation<Vertical, { code: string; name: string; description?: string; is_active: boolean }>({
      query: (body) => ({
        url: "/lists/verticals",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Verticals"],
    }),

    toggleVertical: builder.mutation<Vertical, string>({
      query: (code) => ({
        url: `/lists/verticals/${code}/toggle`,
        method: "PUT",
      }),
      invalidatesTags: ["Verticals"],
    }),

    // Contacts
    getContacts: builder.query<{ contacts: Contact[]; total: number; page: number; per_page: number }, {
      list_id?: string;
      search?: string;
      clean_only?: boolean;
      unsub_only?: boolean;
      optout_only?: boolean;
      blacklisted_only?: boolean;
      bounced_only?: boolean;
      openers_only?: boolean;
      clickers_only?: boolean;
      country_code?: string;
      vertical?: string;
      page?: number;
      per_page?: number;
    }>({
      query: (params) => ({
        url: "/lists/contacts",
        params,
      }),
      providesTags: ["Contacts"],
    }),

    getListContacts: builder.query<{ contacts: Contact[]; total: number; page: number; per_page: number }, {
      listId: string;
      search?: string;
      clean_only?: boolean;
      unsub_only?: boolean;
      optout_only?: boolean;
      blacklisted_only?: boolean;
      bounced_only?: boolean;
      openers_only?: boolean;
      clickers_only?: boolean;
      country_code?: string;
      vertical?: string;
      page?: number;
      per_page?: number;
    }>({
      query: ({ listId, ...params }) => ({
        url: `/lists/${listId}/contacts`,
        params,
      }),
      providesTags: ["Contacts"],
    }),

    createContact: builder.mutation<Contact, {
      list_id: string;
      email: string;
      first_name?: string;
      last_name?: string;
      verticals?: string[];
      ip?: string;
      country_code?: string;
      country?: string;
      region?: string;
      city?: string;
      language?: string;
      device_type?: string;
      device_name?: string;
      os?: string;
      browser_name?: string;
      browser_version?: string;
      attributes?: Record<string, any>;
    }>({
      query: (body) => ({
        url: "/lists/contacts",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Contacts", "MailLists"],
    }),

    updateContact: builder.mutation<Contact, {
      id: string;
      first_name?: string;
      last_name?: string;
      verticals?: string[];
      country_code?: string;
      country?: string;
      region?: string;
      city?: string;
      language?: string;
      is_clean?: boolean;
      is_unsub?: boolean;
      is_optout?: boolean;
      is_blacklisted?: boolean;
      is_hard_bounced?: boolean;
      attributes?: Record<string, any>;
    }>({
      query: ({ id, ...body }) => ({
        url: `/lists/contacts/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: ["Contacts", "MailLists"],
    }),

    deleteContact: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({
        url: `/lists/contacts/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Contacts", "MailLists"],
    }),

    // Import Jobs
    getImportJobs: builder.query<{ jobs: ImportJob[]; total: number; page: number; per_page: number }, {
      list_id?: string;
      status?: string;
      page?: number;
      per_page?: number;
    } | void>({
      query: (params) => ({
        url: "/lists/imports",
        params: params || undefined,
      }),
      providesTags: ["ImportJobs"],
    }),

    getImportJob: builder.query<ImportJob, string>({
      query: (id) => `/lists/imports/${id}`,
      providesTags: (_res, _err, id) => [{ type: "ImportJobs", id }],
    }),

    previewCSV: builder.mutation<CSVPreviewResult, FormData>({
      query: (formData) => ({
        url: "/lists/imports/preview",
        method: "POST",
        body: formData,
      }),
    }),

    createImportJob: builder.mutation<ImportJob, FormData>({
      query: (formData) => ({
        url: "/lists/imports",
        method: "POST",
        body: formData,
      }),
      invalidatesTags: ["ImportJobs", "MailLists"],
    }),

    cancelImportJob: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({
        url: `/lists/imports/${id}/cancel`,
        method: "POST",
      }),
      invalidatesTags: ["ImportJobs"],
    }),

    // Suppressions
    getSuppressions: builder.query<{ suppressions: Suppression[]; total: number; page: number; per_page: number }, {
      list_id?: string;
      reason?: string;
      search?: string;
      page?: number;
      per_page?: number;
    } | void>({
      query: (params) => ({
        url: "/lists/suppressions",
        params: params || undefined,
      }),
      providesTags: ["Suppressions"],
    }),

    createSuppression: builder.mutation<Suppression, {
      list_id?: string;
      email: string;
      reason: string;
      source?: string;
    }>({
      query: (body) => ({
        url: "/lists/suppressions",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Suppressions", "MailLists"],
    }),

    bulkCreateSuppressions: builder.mutation<{ count: number }, {
      list_id?: string;
      emails: string[];
      reason: string;
      source?: string;
    }>({
      query: (body) => ({
        url: "/lists/suppressions/bulk",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Suppressions", "MailLists"],
    }),

    deleteSuppression: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({
        url: `/lists/suppressions/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Suppressions", "MailLists"],
    }),

    // Data Quality
    getDataQualityReport: builder.query<DataQualityReport, { list_id?: string } | void>({
      query: (params) => ({
        url: "/lists/data-quality",
        params: params || undefined,
      }),
      providesTags: ["DataQuality"],
    }),

    // Contact Events
    getContactEvents: builder.query<{ events: ContactEvent[]; total: number; page: number; per_page: number }, {
      list_id?: string;
      event_type?: string;
      email?: string;
      page?: number;
      per_page?: number;
    } | void>({
      query: (params) => ({
        url: "/lists/activity",
        params: params || undefined,
      }),
      providesTags: ["ContactEvents"],
    }),

    // Data Settings
    getDataSettings: builder.query<{ settings: Record<string, any> }, void>({
      query: () => "/lists/settings",
      providesTags: ["DataSettings"],
    }),

    updateDataSettings: builder.mutation<{ success: boolean }, { key: string; value: any; description?: string }>({
      query: (body) => ({
        url: "/lists/settings",
        method: "PUT",
        body,
      }),
      invalidatesTags: ["DataSettings"],
    }),
  }),
});

export const {
  useGetGlobalSummaryQuery,
  useGetMailListsQuery,
  useGetMailListQuery,
  useCreateMailListMutation,
  useUpdateMailListMutation,
  useSetMailListStatusMutation,
  useGetMailListMetricsQuery,
  useGetMailboxProvidersQuery,
  useGetMailboxProviderQuery,
  useCreateMailboxProviderMutation,
  useUpdateMailboxProviderMutation,
  useGetSendingESPsQuery,
  useCreateSendingESPMutation,
  useUpdateSendingESPMutation,
  useGetSendingIPPoolsQuery,
  useCreateSendingIPPoolMutation,
  useUpdateSendingIPPoolMutation,
  useGetCountriesQuery,
  useCreateCountryMutation,
  useToggleCountryMutation,
  useGetVerticalsQuery,
  useCreateVerticalMutation,
  useToggleVerticalMutation,
  useGetContactsQuery,
  useGetListContactsQuery,
  useCreateContactMutation,
  useUpdateContactMutation,
  useDeleteContactMutation,
  useGetImportJobsQuery,
  useGetImportJobQuery,
  usePreviewCSVMutation,
  useCreateImportJobMutation,
  useCancelImportJobMutation,
  useGetSuppressionsQuery,
  useCreateSuppressionMutation,
  useBulkCreateSuppressionsMutation,
  useDeleteSuppressionMutation,
  useGetDataQualityReportQuery,
  useGetContactEventsQuery,
  useGetDataSettingsQuery,
  useUpdateDataSettingsMutation,
} = listsApi;
