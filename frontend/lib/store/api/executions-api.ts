import { baseApi } from "./base-api";

export interface RegisteredScript {
  id: string;
  slug: string;
  name: string;
  category: "mta" | "network" | "system" | "security" | "general" | string;
  os_target: string;
  description: string;
  script_content: string;
  allowed_parameters: string[];
  timeout_seconds: number;
  is_dangerous: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateScriptPayload {
  slug?: string;
  name: string;
  category: string;
  os_target?: string;
  description?: string;
  script_content: string;
  timeout_seconds: number;
  is_dangerous: boolean;
}

export interface UpdateScriptPayload {
  id: string;
  name?: string;
  category?: string;
  os_target?: string;
  description?: string;
  script_content?: string;
  timeout_seconds?: number;
  is_dangerous?: boolean;
}

export interface ExecutionJob {
  id: string;
  server_id?: string;
  server_name: string;
  server_host: string;
  requested_by_user_id: string;
  requested_by_email?: string;
  execution_type: "command" | "script" | string;
  script_slug: string;
  script_name: string;
  command_text: string;
  status: "running" | "success" | "failed" | string;
  exit_code?: number;
  stdout: string;
  stderr: string;
  error_message?: string;
  duration_ms: number;
  queued_at: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

export interface ExecuteCommandPayload {
  server_ids: string[];
  use_localhost: boolean;
  execution_type: "command" | "script";
  script_id?: string;
  command: string;
  timeout_seconds: number;
}

export interface StreamLogEvent {
  type: "start" | "log" | "done" | "complete" | "error";
  job_id?: string;
  server_id?: string;
  server_name?: string;
  server_host?: string;
  stream?: "stdout" | "stderr" | "system";
  chunk?: string;
  exit_code?: number;
  status?: "running" | "success" | "failed" | string;
  duration_ms?: number;
  error?: string;
  jobs?: ExecutionJob[];
}

export async function streamExecution(
  payload: ExecuteCommandPayload,
  onEvent: (event: StreamLogEvent) => void,
  signal?: AbortSignal
): Promise<ExecutionJob[]> {
  const token = typeof window !== "undefined" ? localStorage.getItem("sr_token") : null;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch("/api/v1/executions/stream", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    let errorMsg = `Server returned status ${res.status}`;
    try {
      const errJson = await res.json();
      if (errJson?.error && typeof errJson.error === "object") {
        errorMsg = errJson.error.message || errJson.error.code || errorMsg;
      } else if (typeof errJson?.error === "string") {
        errorMsg = errJson.error;
      } else if (typeof errJson?.message === "string") {
        errorMsg = errJson.message;
      }
    } catch {
      if (res.statusText) {
        errorMsg = `${res.status} ${res.statusText}`;
      }
    }
    throw new Error(String(errorMsg));
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("Response body is not readable");
  }

  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let finalJobs: ExecutionJob[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() || "";

    for (const block of blocks) {
      const trimmed = block.trim();
      if (!trimmed.startsWith("data:")) continue;
      const jsonStr = trimmed.slice(5).trim();
      try {
        const ev = JSON.parse(jsonStr) as StreamLogEvent;
        onEvent(ev);
        if (ev.type === "complete" && ev.jobs) {
          finalJobs = ev.jobs;
        } else if (ev.type === "error" && ev.error) {
          throw new Error(ev.error);
        }
      } catch (err: any) {
        if (jsonStr.includes(`"type":"error"`)) {
          throw err;
        }
      }
    }
  }

  return finalJobs;
}


export interface TerminalSessionInfo {
  session_id: string;
  server_id?: string;
  server_name: string;
  server_host: string;
  username: string;
  is_local: boolean;
  cols: number;
  rows: number;
  status: "connected" | "closed" | "error" | string;
  created_at: string;
  last_active_at: string;
  bytes_read: number;
  bytes_written: number;
}

export interface CreateTerminalSessionPayload {
  server_id?: string;
  is_local: boolean;
  cols: number;
  rows: number;
}

export interface TerminalOutputChunk {
  session_id: string;
  data: string;
  next_offset: number;
  status: string;
}

export interface IRedMailPipelineStep {
  id: string;
  title: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed" | string;
  logs: string;
  started_at?: string;
  completed_at?: string;
  duration_ms: number;
}

export interface IRedMailServer {
  id: string;
  server_id: string;
  server_name: string;
  server_ip: string;
  domain_id: string;
  domain_name: string;
  provider_name: string;
  hostname: string;
  mail_domain: string;
  admin_email: string;
  admin_password?: string;
  os_name: string;
  os_version: string;
  container_name: string;
  container_id: string;
  dkim_selector: string;
  dkim_host: string;
  dkim_value: string;
  dkim_raw_output: string;
  dns_a_configured: boolean;
  dns_mx_configured: boolean;
  dns_spf_configured: boolean;
  dns_dmarc_configured: boolean;
  dns_dkim_configured: boolean;
  status: "pending" | "running" | "completed" | "failed" | string;
  current_step: string;
  pipeline_steps: IRedMailPipelineStep[];
  error_message?: string;
  webmail_url: string;
  admin_panel_url: string;
  created_by?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateIRedMailServerPayload {
  server_id: string;
  domain_id: string;
  hostname?: string;
  admin_password?: string;
}

export interface IRedMailOSCheckResult {
  server_id: string;
  server_name: string;
  server_ip: string;
  reachable: boolean;
  os_id: string;
  os_version: string;
  os_pretty_name: string;
  supported: boolean;
  docker_installed: boolean;
  docker_version: string;
  message: string;
}

export const executionsApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    // -------------------------------------------------------------------------
    // Pre-configured Scripts Registry
    // -------------------------------------------------------------------------
    getScripts: builder.query<RegisteredScript[], string | void>({
      query: (category) => {
        if (category && category !== "ALL") {
          return `/executions/scripts?category=${encodeURIComponent(category)}`;
        }
        return "/executions/scripts";
      },
      transformResponse: (res: { scripts: RegisteredScript[] }) => res.scripts || [],
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: "Scripts" as const, id })),
              { type: "Scripts", id: "LIST" },
            ]
          : [{ type: "Scripts", id: "LIST" }],
    }),

    createScript: builder.mutation<{ script: RegisteredScript; message: string }, CreateScriptPayload>({
      query: (payload) => ({
        url: "/executions/scripts",
        method: "POST",
        body: payload,
      }),
      invalidatesTags: [{ type: "Scripts", id: "LIST" }],
    }),

    updateScript: builder.mutation<{ script: RegisteredScript; message: string }, UpdateScriptPayload>({
      query: ({ id, ...body }) => ({
        url: `/executions/scripts/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: "Scripts", id },
        { type: "Scripts", id: "LIST" },
      ],
    }),

    deleteScript: builder.mutation<{ message: string }, string>({
      query: (id) => ({
        url: `/executions/scripts/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "Scripts", id: "LIST" }],
    }),

    // -------------------------------------------------------------------------
    // Remote Commands & Script Execution Jobs
    // -------------------------------------------------------------------------
    getExecutions: builder.query<ExecutionJob[], number | void>({
      query: (limit = 50) => `/executions/jobs?limit=${limit}`,
      transformResponse: (res: { executions: ExecutionJob[] }) => res.executions || [],
      providesTags: [{ type: "Executions", id: "LIST" }],
    }),

    runExecution: builder.mutation<{ executions: ExecutionJob[]; message: string }, ExecuteCommandPayload>({
      query: (payload) => ({
        url: "/executions/run",
        method: "POST",
        body: payload,
      }),
      invalidatesTags: [{ type: "Executions", id: "LIST" }],
    }),

    // -------------------------------------------------------------------------
    // Live SSH Terminal TTY Sessions
    // -------------------------------------------------------------------------
    getTerminalSessions: builder.query<TerminalSessionInfo[], void>({
      query: () => "/executions/terminal/sessions",
      transformResponse: (res: { sessions: TerminalSessionInfo[] }) => res.sessions || [],
      providesTags: [{ type: "Terminals", id: "LIST" }],
    }),

    createTerminalSession: builder.mutation<{ session: TerminalSessionInfo }, CreateTerminalSessionPayload>({
      query: (payload) => ({
        url: "/executions/terminal/sessions",
        method: "POST",
        body: payload,
      }),
      invalidatesTags: [{ type: "Terminals", id: "LIST" }],
    }),

    writeTerminalInput: builder.mutation<{ status: string }, { session_id: string; data: string }>({
      query: ({ session_id, data }) => ({
        url: `/executions/terminal/sessions/${session_id}/input`,
        method: "POST",
        body: { data },
      }),
    }),

    readTerminalOutput: builder.query<TerminalOutputChunk, { session_id: string; offset: number }>({
      query: ({ session_id, offset }) =>
        `/executions/terminal/sessions/${session_id}/output?offset=${offset}`,
    }),

    resizeTerminalSession: builder.mutation<{ status: string }, { session_id: string; cols: number; rows: number }>({
      query: ({ session_id, cols, rows }) => ({
        url: `/executions/terminal/sessions/${session_id}/resize`,
        method: "POST",
        body: { cols, rows },
      }),
    }),

    closeTerminalSession: builder.mutation<{ message: string }, string>({
      query: (session_id) => ({
        url: `/executions/terminal/sessions/${session_id}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "Terminals", id: "LIST" }],
    }),

    // -------------------------------------------------------------------------
    // iRedMail Server Deployments & Automated DNS Pipeline
    // -------------------------------------------------------------------------
    getIRedMailServers: builder.query<IRedMailServer[], void>({
      query: () => "/executions/iredmail",
      transformResponse: (res: { iredmail_servers: IRedMailServer[] }) => res.iredmail_servers || [],
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: "IRedMail" as const, id })),
              { type: "IRedMail", id: "LIST" },
            ]
          : [{ type: "IRedMail", id: "LIST" }],
    }),

    getIRedMailServerById: builder.query<IRedMailServer, string>({
      query: (id) => `/executions/iredmail/${id}`,
      transformResponse: (res: { iredmail_server: IRedMailServer }) => res.iredmail_server,
      providesTags: (result, error, id) => [{ type: "IRedMail", id }],
    }),

    checkServerUbuntuOS: builder.mutation<IRedMailOSCheckResult, string>({
      query: (server_id) => ({
        url: "/executions/iredmail/check-os",
        method: "POST",
        body: { server_id },
      }),
    }),

    createIRedMailServer: builder.mutation<{ iredmail_server: IRedMailServer; message: string }, CreateIRedMailServerPayload>({
      query: (payload) => ({
        url: "/executions/iredmail",
        method: "POST",
        body: payload,
      }),
      invalidatesTags: [
        { type: "IRedMail", id: "LIST" },
        { type: "Domains", id: "LIST" },
        { type: "DNS", id: "LIST" },
        { type: "Servers", id: "LIST" },
      ],
    }),

    retryIRedMailServer: builder.mutation<{ iredmail_server: IRedMailServer; message: string }, string>({
      query: (id) => ({
        url: `/executions/iredmail/${id}/retry`,
        method: "POST",
      }),
      invalidatesTags: (result, error, id) => [
        { type: "IRedMail", id },
        { type: "IRedMail", id: "LIST" },
      ],
    }),

    syncIRedMailDNS: builder.mutation<{ iredmail_server: IRedMailServer; message: string }, string>({
      query: (id) => ({
        url: `/executions/iredmail/${id}/sync-dns`,
        method: "POST",
      }),
      invalidatesTags: (result, error, id) => [
        { type: "IRedMail", id },
        { type: "IRedMail", id: "LIST" },
        { type: "DNS", id: "LIST" },
      ],
    }),

    deleteIRedMailServer: builder.mutation<{ message: string }, { id: string; removeContainer?: boolean }>({
      query: ({ id, removeContainer }) => ({
        url: `/executions/iredmail/${id}${removeContainer ? "?remove_container=true" : ""}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "IRedMail", id: "LIST" }],
    }),
  }),
});

export const {
  useGetScriptsQuery,
  useCreateScriptMutation,
  useUpdateScriptMutation,
  useDeleteScriptMutation,

  useGetExecutionsQuery,
  useRunExecutionMutation,

  useGetTerminalSessionsQuery,
  useCreateTerminalSessionMutation,
  useWriteTerminalInputMutation,
  useLazyReadTerminalOutputQuery,
  useResizeTerminalSessionMutation,
  useCloseTerminalSessionMutation,

  useGetIRedMailServersQuery,
  useGetIRedMailServerByIdQuery,
  useCheckServerUbuntuOSMutation,
  useCreateIRedMailServerMutation,
  useRetryIRedMailServerMutation,
  useSyncIRedMailDNSMutation,
  useDeleteIRedMailServerMutation,
} = executionsApi;
