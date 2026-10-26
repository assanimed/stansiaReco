import { baseApi } from "./base-api";

export interface AudienceFilter {
  only_clean: boolean;
  only_openers: boolean;
  only_clickers: boolean;
  only_seeds: boolean;
  exclude_unsubs: boolean;
  country_codes?: string[];
  verticals?: string[];
}

export type CampaignStatus = 
  | "draft"
  | "scheduled"
  | "queued"
  | "processing"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type RoutingType = 
  | "file_spool"
  | "ip_pool"
  | "sending_esp"
  | "custom_vmta";

export interface Campaign {
  id: string;
  name: string;
  subject: string;
  from_name: string;
  from_email: string;
  reply_to?: string;
  mail_list_id: string;
  mail_list_name?: string;
  mail_list_code?: string;
  audience_filter: AudienceFilter;
  routing_type: RoutingType;
  sending_ip_pool_id?: string;
  sending_ip_pool_name?: string;
  sending_esp_id?: string;
  sending_esp_name?: string;
  custom_vmta?: string;
  html_content: string;
  plain_content: string;
  custom_headers?: Record<string, string>;
  track_opens: boolean;
  track_clicks: boolean;
  list_unsubscribe_header: boolean;
  scheduled_at?: string;
  hourly_limit: number;
  batch_size: number;
  status: CampaignStatus;
  total_recipients: number;
  processed_count: number;
  sent_count: number;
  suppressed_count: number;
  failed_count: number;
  spool_path?: string;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
  created_by?: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface CampaignSummaryKPIs {
  total_campaigns: number;
  active_sending: number;
  total_spooled: number;
  completed_count: number;
  average_hourly_rate: number;
}

export interface CreateCampaignRequest {
  name: string;
  subject: string;
  from_name: string;
  from_email: string;
  reply_to?: string;
  mail_list_id: string;
  audience_filter: AudienceFilter;
  routing_type: RoutingType;
  sending_ip_pool_id?: string;
  sending_esp_id?: string;
  custom_vmta?: string;
  html_content: string;
  plain_content: string;
  custom_headers?: Record<string, string>;
  track_opens: boolean;
  track_clicks: boolean;
  list_unsubscribe_header: boolean;
  scheduled_at?: string;
  hourly_limit: number;
  batch_size: number;
}

export interface UpdateCampaignRequest extends Partial<CreateCampaignRequest> {}

export interface CampaignLog {
  id: string;
  campaign_id: string;
  contact_id?: string;
  email: string;
  status: "spooled" | "suppressed" | "failed";
  message_id?: string;
  file_path?: string;
  details?: string;
  created_at: string;
}

export interface AudienceEstimate {
  total_in_list: number;
  matching_filter: number;
  suppressed_count: number;
  eligible_to_send: number;
}

export interface PreviewRequest {
  subject: string;
  html_content: string;
  plain_content: string;
  custom_headers?: Record<string, string>;
  sample_contact: {
    first_name: string;
    last_name: string;
    email: string;
    city: string;
    country: string;
    country_code: string;
  };
}

export interface PreviewResponse {
  rendered_subject: string;
  rendered_html: string;
  rendered_plain: string;
  rendered_headers: Record<string, string>;
  raw_mime_sample: string;
}

export interface TestSendRequest {
  recipient_email: string;
  sample_contact: {
    first_name: string;
    last_name: string;
    email: string;
    city: string;
    country: string;
    country_code: string;
  };
}

export interface SpoolFileInfo {
  file_name: string;
  file_path: string;
  size_bytes: number;
  recipient: string;
  generated_at: string;
}

export const campaignsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getCampaignsSummary: builder.query<CampaignSummaryKPIs, void>({
      query: () => "/campaigns/summary",
      providesTags: ["Campaigns"],
    }),

    getCampaigns: builder.query<
      { campaigns: Campaign[]; total: number; page: number; page_size: number },
      { page?: number; page_size?: number; status?: string; search?: string; mail_list_id?: string }
    >({
      query: (params) => {
        const queryParams = new URLSearchParams();
        if (params.page) queryParams.set("page", params.page.toString());
        if (params.page_size) queryParams.set("page_size", params.page_size.toString());
        if (params.status && params.status !== "all") queryParams.set("status", params.status);
        if (params.search) queryParams.set("search", params.search);
        if (params.mail_list_id) queryParams.set("mail_list_id", params.mail_list_id);
        return `/campaigns?${queryParams.toString()}`;
      },
      providesTags: ["Campaigns"],
    }),

    getCampaignById: builder.query<{ campaign: Campaign }, string>({
      query: (id) => `/campaigns/${id}`,
      providesTags: (result, error, id) => [{ type: "Campaigns", id }],
    }),

    createCampaign: builder.mutation<{ campaign: Campaign }, CreateCampaignRequest>({
      query: (body) => ({
        url: "/campaigns",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Campaigns"],
    }),

    updateCampaign: builder.mutation<{ campaign: Campaign }, { id: string; data: UpdateCampaignRequest }>({
      query: ({ id, data }) => ({
        url: `/campaigns/${id}`,
        method: "PUT",
        body: data,
      }),
      invalidatesTags: (result, error, { id }) => [{ type: "Campaigns", id }, "Campaigns"],
    }),

    deleteCampaign: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({
        url: `/campaigns/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Campaigns"],
    }),

    launchCampaign: builder.mutation<{ message: string; campaign: Campaign }, string>({
      query: (id) => ({
        url: `/campaigns/${id}/launch`,
        method: "POST",
      }),
      invalidatesTags: (result, error, id) => [{ type: "Campaigns", id }, "Campaigns"],
    }),

    pauseCampaign: builder.mutation<{ message: string; campaign: Campaign }, string>({
      query: (id) => ({
        url: `/campaigns/${id}/pause`,
        method: "POST",
      }),
      invalidatesTags: (result, error, id) => [{ type: "Campaigns", id }, "Campaigns"],
    }),

    resumeCampaign: builder.mutation<{ message: string; campaign: Campaign }, string>({
      query: (id) => ({
        url: `/campaigns/${id}/resume`,
        method: "POST",
      }),
      invalidatesTags: (result, error, id) => [{ type: "Campaigns", id }, "Campaigns"],
    }),

    cancelCampaign: builder.mutation<{ message: string; campaign: Campaign }, string>({
      query: (id) => ({
        url: `/campaigns/${id}/cancel`,
        method: "POST",
      }),
      invalidatesTags: (result, error, id) => [{ type: "Campaigns", id }, "Campaigns"],
    }),

    getCampaignLogs: builder.query<
      { logs: CampaignLog[]; total: number; page: number; page_size: number },
      { campaignId: string; page?: number; page_size?: number }
    >({
      query: ({ campaignId, page = 1, page_size = 50 }) =>
        `/campaigns/${campaignId}/logs?page=${page}&page_size=${page_size}`,
      providesTags: ["CampaignLogs"],
    }),

    previewCampaign: builder.mutation<PreviewResponse, PreviewRequest>({
      query: (body) => ({
        url: "/campaigns/preview",
        method: "POST",
        body,
      }),
    }),

    testSendCampaign: builder.mutation<{ message: string; log: CampaignLog }, { id: string; data: TestSendRequest }>({
      query: ({ id, data }) => ({
        url: `/campaigns/${id}/test-send`,
        method: "POST",
        body: data,
      }),
      invalidatesTags: ["CampaignLogs"],
    }),

    estimateAudience: builder.mutation<
      AudienceEstimate,
      { mail_list_id: string; audience_filter: AudienceFilter }
    >({
      query: (body) => ({
        url: "/campaigns/estimate-audience",
        method: "POST",
        body,
      }),
    }),

    getSpoolFiles: builder.query<{ files: SpoolFileInfo[] }, string>({
      query: (campaignId) => `/campaigns/${campaignId}/spool/files`,
    }),

    readSpoolFile: builder.query<string, { campaignId: string; fileName: string }>({
      query: ({ campaignId, fileName }) => ({
        url: `/campaigns/${campaignId}/spool/view?file=${encodeURIComponent(fileName)}`,
        responseHandler: (response) => response.text(),
      }),
    }),
  }),
});

export const {
  useGetCampaignsSummaryQuery,
  useGetCampaignsQuery,
  useGetCampaignByIdQuery,
  useCreateCampaignMutation,
  useUpdateCampaignMutation,
  useDeleteCampaignMutation,
  useLaunchCampaignMutation,
  usePauseCampaignMutation,
  useResumeCampaignMutation,
  useCancelCampaignMutation,
  useGetCampaignLogsQuery,
  usePreviewCampaignMutation,
  useTestSendCampaignMutation,
  useEstimateAudienceMutation,
  useGetSpoolFilesQuery,
  useReadSpoolFileQuery,
} = campaignsApi;
