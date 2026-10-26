import { apiClient } from "./client";

export interface ServerProvider {
  id: string;
  name: string;
  port_25_open: boolean;
  website?: string;
  description?: string;
  server_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreateProviderPayload {
  name: string;
  port_25_open: boolean;
  website?: string;
  description?: string;
}

export interface MTAServer {
  id: string;
  name: string;
  hostname_or_ip: string;
  ssh_port: number;
  os_info?: string;
  environment: string;
  tags: string[];
  description?: string;
  credential_id?: string;
  credential_name?: string;
  credential_type?: string;
  username?: string;
  provider_id?: string;
  provider_name?: string;
  provider_port_25_open: boolean;
  server_type: string;
  port_25_status: "open" | "closed" | "unknown";
  mta_installed: boolean;
  mta_software: "postfix" | "powermta";
  main_ip: string;
  is_active: boolean;
  allow_private_ip: boolean;
  last_tested_at?: string;
  last_test_status?: string;
  last_test_error?: string;
  ip_count: number;
  vmta_count: number;
  proxy_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateMTAServerPayload {
  name: string;
  hostname_or_ip: string;
  ssh_port?: number;
  provider_id?: string;
  server_type?: string;
  mta_software?: "postfix" | "powermta";
  environment?: string;
  description?: string;
  tags?: string[];
  allow_private_ip?: boolean;
  credential_id?: string;
  credential_name?: string;
  auth_type: "password" | "key" | "pem";
  username: string;
  password?: string;
  private_key?: string;
  passphrase?: string;
}

export interface BulkAddMTAPayload {
  raw_lines: string;
  provider_id?: string;
  mta_software?: "postfix" | "powermta";
  default_user?: string;
  default_port?: number;
}

export interface BulkAddResult {
  total_parsed: number;
  added_count: number;
  error_count: number;
  errors: string[];
  servers: MTAServer[];
}

export interface SSHTestResult {
  server_id: string;
  success: boolean;
  message: string;
  os_info?: string;
  port_25_status: string;
  error?: string;
  tested_at: string;
}

export interface ServerIP {
  id: string;
  server_id: string;
  server_name?: string;
  ip_address: string;
  subnet_cidr: number;
  gateway?: string;
  interface_name: string;
  is_main: boolean;
  is_configured: boolean;
  rdns_hostname?: string;
  created_at: string;
  updated_at: string;
}

export interface AddServerIPPayload {
  ip_address: string;
  subnet_cidr?: number;
  gateway?: string;
  interface_name?: string;
  rdns_hostname?: string;
  apply_to_server?: boolean;
}

export interface VMTA {
  id: string;
  server_id: string;
  server_name?: string;
  server_ip_id?: string;
  vmta_name: string;
  ip_address: string;
  domain_name?: string;
  host_name?: string;
  status: "active" | "paused" | "disabled";
  created_at: string;
  updated_at: string;
}

export interface CreateVMTAPayload {
  vmta_name?: string;
  ip_address: string;
  domain_name?: string;
  host_name?: string;
}

export interface ProxyServer {
  id: string;
  server_id: string;
  server_name?: string;
  server_ip?: string;
  http_proxy_enabled: boolean;
  http_proxy_port: number;
  socks_proxy_enabled: boolean;
  socks_proxy_port: number;
  auth_user: string;
  auth_password: string;
  status: string;
  last_checked_at?: string;
  created_at: string;
  updated_at: string;
}

export interface UpdateProxyPayload {
  http_proxy_enabled: boolean;
  http_proxy_port: number;
  socks_proxy_enabled: boolean;
  socks_proxy_port: number;
  auth_user: string;
  auth_password: string;
}

export interface ServerAction {
  id: string;
  name: string;
  description: string;
  command: string;
  is_dangerous: boolean;
}

export interface InstallMTAPayload {
  software: "postfix" | "powermta";
  hostname?: string;
  domain?: string;
  enable_tls?: boolean;
  setup_opendkim?: boolean;
  disable_ipv6?: boolean;
}

export const serversApi = {
  // Providers
  getProviders: async (): Promise<ServerProvider[]> => {
    const res = await apiClient<{ providers: ServerProvider[] }>("/servers/providers");
    return res.providers;
  },
  createProvider: async (data: CreateProviderPayload): Promise<ServerProvider> => {
    const res = await apiClient<{ provider: ServerProvider }>("/servers/providers", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return res.provider;
  },
  updateProvider: async (id: string, data: Partial<CreateProviderPayload>): Promise<ServerProvider> => {
    const res = await apiClient<{ provider: ServerProvider }>(`/servers/providers/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    return res.provider;
  },
  deleteProvider: async (id: string): Promise<void> => {
    await apiClient(`/servers/providers/${id}`, { method: "DELETE" });
  },

  // MTA Servers
  getMTAServers: async (params?: { provider_id?: string; port_25_status?: string; search?: string }): Promise<MTAServer[]> => {
    const query = new URLSearchParams();
    if (params?.provider_id) query.set("provider_id", params.provider_id);
    if (params?.port_25_status) query.set("port_25_status", params.port_25_status);
    if (params?.search) query.set("search", params.search);
    const qs = query.toString() ? `?${query.toString()}` : "";
    const res = await apiClient<{ servers: MTAServer[] }>(`/servers/mta${qs}`);
    return res.servers;
  },
  getMTAServer: async (id: string): Promise<MTAServer> => {
    const res = await apiClient<{ server: MTAServer }>(`/servers/mta/${id}`);
    return res.server;
  },
  createMTAServer: async (data: CreateMTAServerPayload): Promise<MTAServer> => {
    const res = await apiClient<{ server: MTAServer }>("/servers/mta", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return res.server;
  },
  bulkAddMTAServers: async (data: BulkAddMTAPayload): Promise<BulkAddResult> => {
    return apiClient<BulkAddResult>("/servers/mta/bulk", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  updateMTAServer: async (id: string, data: Partial<MTAServer>): Promise<MTAServer> => {
    const res = await apiClient<{ server: MTAServer }>(`/servers/mta/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    return res.server;
  },
  deleteMTAServer: async (id: string): Promise<void> => {
    await apiClient(`/servers/mta/${id}`, { method: "DELETE" });
  },
  testSSHConnection: async (id: string): Promise<SSHTestResult> => {
    return apiClient<SSHTestResult>(`/servers/mta/${id}/test-connection`, {
      method: "POST",
    });
  },

  // IPs
  getServerIPs: async (serverId: string): Promise<ServerIP[]> => {
    const res = await apiClient<{ ips: ServerIP[] }>(`/servers/mta/${serverId}/ips`);
    return res.ips;
  },
  addServerIP: async (serverId: string, data: AddServerIPPayload): Promise<ServerIP> => {
    const res = await apiClient<{ ip: ServerIP }>(`/servers/mta/${serverId}/ips`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    return res.ip;
  },
  bulkAddServerIPs: async (serverId: string, data: { raw_lines: string; subnet_cidr?: number; gateway?: string; interface_name?: string }): Promise<{ ips: ServerIP[]; count: number }> => {
    return apiClient<{ ips: ServerIP[]; count: number }>(`/servers/mta/${serverId}/ips/bulk`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  deleteServerIP: async (serverId: string, ipId: string): Promise<void> => {
    await apiClient(`/servers/mta/${serverId}/ips/${ipId}`, { method: "DELETE" });
  },
  markIPConfigured: async (serverId: string, ipId: string, configured: boolean): Promise<void> => {
    await apiClient(`/servers/mta/${serverId}/ips/${ipId}/mark-configured`, {
      method: "POST",
      body: JSON.stringify({ configured }),
    });
  },
  getNmcliScript: async (serverId: string): Promise<string> => {
    const res = await apiClient<{ script: string }>(`/servers/mta/${serverId}/nmcli-script`);
    return res.script;
  },

  // VMTAs
  getVMTAs: async (serverId?: string): Promise<VMTA[]> => {
    const qs = serverId ? `?server_id=${serverId}` : "";
    const res = await apiClient<{ vmtas: VMTA[] }>(`/servers/vmtas${qs}`);
    return res.vmtas;
  },
  createVMTA: async (serverId: string, data: CreateVMTAPayload): Promise<VMTA> => {
    const res = await apiClient<{ vmta: VMTA }>(`/servers/mta/${serverId}/vmtas`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    return res.vmta;
  },
  bulkCreateVMTAs: async (serverId: string, rawLines: string): Promise<{ vmtas: VMTA[]; count: number }> => {
    return apiClient<{ vmtas: VMTA[]; count: number }>(`/servers/mta/${serverId}/vmtas/bulk`, {
      method: "POST",
      body: JSON.stringify({ raw_lines: rawLines }),
    });
  },
  deleteVMTA: async (vmtaId: string): Promise<void> => {
    await apiClient(`/servers/vmtas/${vmtaId}`, { method: "DELETE" });
  },
  getVMTAConfig: async (serverId: string, type: "postfix" | "powermta" = "postfix"): Promise<string> => {
    const res = await apiClient<{ config: string; mta_type: string }>(`/servers/mta/${serverId}/vmta-config?type=${type}`);
    return res.config;
  },

  // Proxies
  getProxies: async (): Promise<ProxyServer[]> => {
    const res = await apiClient<{ proxies: ProxyServer[] }>("/servers/proxies");
    return res.proxies;
  },
  getProxy: async (serverId: string): Promise<ProxyServer> => {
    const res = await apiClient<{ proxy: ProxyServer }>(`/servers/mta/${serverId}/proxy`);
    return res.proxy;
  },
  updateProxy: async (serverId: string, data: UpdateProxyPayload): Promise<ProxyServer> => {
    const res = await apiClient<{ proxy: ProxyServer }>(`/servers/mta/${serverId}/proxy`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    return res.proxy;
  },
  getProxyInstallScript: async (serverId: string): Promise<string> => {
    const res = await apiClient<{ script: string }>(`/servers/mta/${serverId}/proxy/install-script`);
    return res.script;
  },

  // Actions & Install
  getServerActions: async (): Promise<ServerAction[]> => {
    const res = await apiClient<{ actions: ServerAction[] }>("/servers/actions");
    return res.actions;
  },
  installMTA: async (serverId: string, opts: InstallMTAPayload): Promise<{ script: string; software: string; message: string }> => {
    return apiClient<{ script: string; software: string; message: string }>(`/servers/mta/${serverId}/install`, {
      method: "POST",
      body: JSON.stringify(opts),
    });
  },
};
