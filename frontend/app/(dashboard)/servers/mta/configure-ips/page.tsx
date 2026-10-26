"use client";

import React, { useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { 
  useGetServersQuery, 
  useGetAllServerIPsQuery, 
  useAddServerIPMutation, 
  useBulkAddServerIPsMutation, 
  useApplyIPsToServerMutation,
  useDeleteServerIPMutation, 
  useMarkIPConfiguredMutation, 
  useLazyGetNmcliScriptQuery 
} from "@/lib/store/api/servers-api";
import { 
  Cpu, 
  Plus, 
  Layers, 
  Terminal, 
  CheckCircle2, 
  Clock, 
  Trash2, 
  Copy, 
  Check, 
  RefreshCw, 
  AlertCircle, 
  Server,
  Network,
  Search,
  Filter,
  CheckCircle,
  Play,
  ExternalLink,
  ShieldAlert,
  HelpCircle
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ServerIP } from "@/lib/api/servers";
import { notify } from "@/lib/notifications/notification-store";
import { confirmAction } from "@/lib/dialogs/confirm-dialog-service";

function ConfigureAdditionalIPsContent() {
  const searchParams = useSearchParams();
  const initialServerId = searchParams.get("server_id") || "all";

  const [selectedServerId, setSelectedServerId] = useState<string>(initialServerId);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState<"all" | "main" | "secondary">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "configured" | "pending">("all");

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addMode, setAddMode] = useState<"single" | "bulk">("single");
  const [modalServerId, setModalServerId] = useState("");
  const [applyImmediately, setApplyImmediately] = useState(true);

  // Script & SSH execution modals
  const [isScriptModalOpen, setIsScriptModalOpen] = useState(false);
  const [generatedScript, setGeneratedScript] = useState("");
  const [copied, setCopied] = useState(false);

  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [applyOutput, setApplyOutput] = useState("");
  const [applyStatus, setApplyStatus] = useState<"running" | "success" | "error">("running");
  const [applyTargetServerName, setApplyTargetServerName] = useState("");

  // Form states
  const [ipAddress, setIpAddress] = useState("");
  const [subnetCIDR, setSubnetCIDR] = useState(32);
  const [interfaceName, setInterfaceName] = useState("eth0");
  const [rdnsHostname, setRdnsHostname] = useState("");
  const [bulkLines, setBulkLines] = useState("");
  const [formError, setFormError] = useState("");

  const { data: servers = [], isLoading: isLoadingServers } = useGetServersQuery();

  // Query all IPs or filtered by server
  const activeServerFilter = selectedServerId === "all" ? undefined : selectedServerId;
  const { 
    data: allIPs = [], 
    isLoading: isLoadingIPs, 
    isError, 
    refetch 
  } = useGetAllServerIPsQuery(activeServerFilter);

  const [addIP, { isLoading: isAddingIP }] = useAddServerIPMutation();
  const [bulkAddIPs, { isLoading: isBulkAdding }] = useBulkAddServerIPsMutation();
  const [applyIPsToServer, { isLoading: isApplyingIPs }] = useApplyIPsToServerMutation();
  const [deleteIP] = useDeleteServerIPMutation();
  const [markIPConfigured] = useMarkIPConfiguredMutation();
  const [getNmcliScript] = useLazyGetNmcliScriptQuery();

  // Parse bulk lines for preview and validation
  // Format: ip,hostname(ptr) where hostname can be left empty
  const parsedBulkIPs = useMemo(() => {
    const lines = bulkLines.split("\n");
    const results: Array<{ raw: string; ip: string; ptr: string; cidr: number; isValid: boolean }> = [];
    const ipv4Regex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9]?)$/;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      let ipPart = "";
      let ptrPart = "";

      if (trimmed.includes(",")) {
        const parts = trimmed.split(",");
        ipPart = parts[0].trim();
        ptrPart = parts.slice(1).join(",").trim();
      } else {
        const parts = trimmed.split(/\s+/);
        ipPart = parts[0].trim();
        ptrPart = parts.slice(1).join(" ").trim();
      }

      let ipClean = ipPart;
      let cidr = Number(subnetCIDR) || 32;
      if (ipClean.includes("/")) {
        const slashParts = ipClean.split("/");
        ipClean = slashParts[0].trim();
        const parsedCIDR = parseInt(slashParts[1], 10);
        if (!isNaN(parsedCIDR) && parsedCIDR > 0 && parsedCIDR <= 32) {
          cidr = parsedCIDR;
        }
      }

      const isValid = ipv4Regex.test(ipClean);
      results.push({
        raw: trimmed,
        ip: ipClean,
        ptr: ptrPart,
        cidr,
        isValid,
      });
    }
    return results;
  }, [bulkLines, subnetCIDR]);

  const validBulkIPs = parsedBulkIPs.filter((p) => p.isValid);
  const invalidBulkIPs = parsedBulkIPs.filter((p) => !p.isValid);

  // Filtered IPs according to search query, role filter, status filter
  const filteredIPs = useMemo(() => {
    return allIPs.filter((ip) => {
      // Role filter
      if (filterRole === "main" && !ip.is_main) return false;
      if (filterRole === "secondary" && ip.is_main) return false;

      // Status filter
      if (filterStatus === "configured" && !ip.is_configured) return false;
      if (filterStatus === "pending" && ip.is_configured) return false;

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchIP = ip.ip_address.toLowerCase().includes(query);
        const matchServer = (ip.server_name || "").toLowerCase().includes(query);
        const matchPTR = (ip.rdns_hostname || "").toLowerCase().includes(query);
        const matchInterface = ip.interface_name.toLowerCase().includes(query);
        if (!matchIP && !matchServer && !matchPTR && !matchInterface) {
          return false;
        }
      }

      return true;
    });
  }, [allIPs, filterRole, filterStatus, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const totalIPs = allIPs.length;
    const secondaryIPs = allIPs.filter((ip) => !ip.is_main);
    const configuredIPs = allIPs.filter((ip) => ip.is_configured);
    const pendingIPs = allIPs.filter((ip) => !ip.is_main && !ip.is_configured);
    const uniqueServers = new Set(allIPs.map((ip) => ip.server_id)).size;
    return { totalIPs, secondaryIPs: secondaryIPs.length, configuredIPs: configuredIPs.length, pendingIPs: pendingIPs.length, uniqueServers };
  }, [allIPs]);

  const closeModals = () => {
    setIsAddModalOpen(false);
    setIsScriptModalOpen(false);
    setIsApplyModalOpen(false);
    setIpAddress("");
    setSubnetCIDR(32);
    setInterfaceName("eth0");
    setRdnsHostname("");
    setBulkLines("");
    setFormError("");
    setCopied(false);
  };

  const openAddModal = (mode: "single" | "bulk" = "single", preferredServerId?: string) => {
    closeModals();
    setAddMode(mode);
    const defaultSrv = preferredServerId || (selectedServerId !== "all" ? selectedServerId : servers[0]?.id || "");
    setModalServerId(defaultSrv);
    setApplyImmediately(true);
    setIsAddModalOpen(true);
  };

  // SSH Execution of nmcli
  const handleApplyToServer = async (targetServerIdOverride?: string) => {
    const targetId = targetServerIdOverride || (selectedServerId !== "all" ? selectedServerId : servers[0]?.id);
    if (!targetId) {
      notify.error("Please select a target server to configure.");
      return;
    }
    const targetServer = servers.find((s) => s.id === targetId);
    const srvDisplayName = targetServer ? `${targetServer.name} (${targetServer.main_ip})` : "Server";

    const confirmed = await confirmAction({
      title: "Apply NetworkManager Configuration via SSH",
      message: `Connect via SSH to "${srvDisplayName}" and execute nmcli to configure and activate secondary IP addresses? This modifies NetworkManager and verifies active addresses with "ip a".`,
      confirmLabel: "Run nmcli via SSH",
      variant: "default",
    });
    if (!confirmed) return;

    setApplyTargetServerName(srvDisplayName);
    setIsApplyModalOpen(true);
    setApplyStatus("running");
    setApplyOutput(`Connecting to ${srvDisplayName} over SSH...\nExecuting NetworkManager nmcli modify & connection up...\n`);

    try {
      const res = await applyIPsToServer({ serverId: targetId }).unwrap();
      setApplyStatus(res.success ? "success" : "error");
      setApplyOutput(res.output || res.message || "nmcli configuration completed.");
      if (res.success) {
        notify.success(res.message || `Successfully applied ${res.count} secondary IP(s) to ${srvDisplayName}.`);
      } else {
        notify.error(res.error || "Execution completed with warnings.", { title: "nmcli Execution Warning" });
      }
    } catch (err: any) {
      setApplyStatus("error");
      const errOut = err?.data?.output || err?.data?.error || err?.message || "SSH command failed";
      setApplyOutput(`ERROR: ${errOut}`);
      notify.error(err, { title: "Failed to apply NetworkManager configuration" });
    }
  };

  const handleAddIPSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalServerId) {
      setFormError("Please select a target server");
      return;
    }
    if (!ipAddress.trim()) {
      setFormError("IP address is required");
      return;
    }

    try {
      await addIP({
        serverId: modalServerId,
        payload: {
          ip_address: ipAddress.trim(),
          subnet_cidr: Number(subnetCIDR) || 32,
          interface_name: interfaceName.trim() || "eth0",
          rdns_hostname: rdnsHostname.trim() || undefined,
          apply_to_server: applyImmediately,
        },
      }).unwrap();

      notify.success(
        applyImmediately
          ? `IP address "${ipAddress.trim()}" added and applied to server via nmcli.`
          : `IP address "${ipAddress.trim()}" registered successfully.`
      );
      closeModals();
    } catch (err: any) {
      setFormError(err?.data?.error?.message || err?.message || "Failed to add IP");
      notify.error(err, { title: "Failed to add IP address" });
    }
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalServerId) {
      setFormError("Please select a target server");
      return;
    }
    if (!bulkLines.trim()) {
      setFormError("Please enter IP lines to add");
      return;
    }
    if (validBulkIPs.length === 0) {
      setFormError("No valid IPv4 addresses detected. Format: ip,hostname(ptr)");
      return;
    }

    try {
      const res = await bulkAddIPs({
        serverId: modalServerId,
        payload: {
          raw_lines: bulkLines.trim(),
          raw_ips: bulkLines.trim(),
          subnet_cidr: Number(subnetCIDR) || 32,
          interface_name: interfaceName.trim() || "eth0",
          apply_to_server: applyImmediately,
        },
      }).unwrap();

      const count = res?.count ?? res?.ips?.length ?? validBulkIPs.length;
      notify.success(
        applyImmediately
          ? `Added and applied ${count} secondary IP(s) to server via NetworkManager (nmcli).`
          : `Added ${count} secondary IP address${count === 1 ? "" : "es"} to inventory.`
      );
      closeModals();
    } catch (err: any) {
      setFormError(err?.data?.error?.message || err?.message || "Failed to bulk add IPs");
      notify.error(err, { title: "Bulk IP Addition Failed" });
    }
  };

  const handleDeleteIP = async (serverId: string, ipId: string, ipAddr: string) => {
    const confirmed = await confirmAction({
      title: "Remove IP Address",
      message: `Remove IP address "${ipAddr}" from server? Network routing and VMTA bindings will be revoked.`,
      confirmLabel: "Remove IP",
      variant: "destructive",
    });
    if (!confirmed) return;

    try {
      await deleteIP({ serverId, ipId }).unwrap();
      notify.success(`IP address "${ipAddr}" removed successfully.`);
    } catch (err: any) {
      notify.error(err, { title: "Failed to delete IP" });
    }
  };

  const handleToggleConfigured = async (serverId: string, ipId: string, isConfigured: boolean) => {
    try {
      await markIPConfigured({
        serverId,
        ipId,
        is_configured: isConfigured,
      }).unwrap();
      notify.success(`IP marked as ${isConfigured ? "configured" : "unconfigured"}.`);
    } catch (err: any) {
      notify.error(err, { title: "Failed to update configuration status" });
    }
  };

  const handleGenerateScript = async (targetId?: string) => {
    const srvId = targetId || (selectedServerId !== "all" ? selectedServerId : servers[0]?.id);
    if (!srvId) {
      notify.error("Please select a server first.");
      return;
    }
    const loadingId = notify.loading("Generating nmcli configuration script...");
    try {
      const res = await getNmcliScript(srvId).unwrap();
      setGeneratedScript(res.script);
      setIsScriptModalOpen(true);
      notify.update(loadingId, {
        type: "success",
        message: "nmcli script generated successfully.",
      });
    } catch (err: any) {
      notify.dismiss(loadingId);
      notify.error(err, { title: "Failed to generate nmcli script" });
    }
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(generatedScript);
    setCopied(true);
    notify.info("nmcli script copied to clipboard.", { duration: 2000 });
    setTimeout(() => setCopied(false), 2000);
  };

  const currentServer = servers.find((s) => s.id === selectedServerId);

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-bold tracking-tight text-slate-100">
              {selectedServerId === "all" ? "All Server IP Addresses" : "Configure Additional IPs"}
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
              NetworkManager nmcli
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Manage, configure, and activate secondary IP addresses across your servers directly via <code className="text-blue-400 font-mono text-xs">sudo nmcli connection modify &quot;System eth0&quot; +ipv4.addresses</code> and verify live with <code className="text-blue-400 font-mono text-xs">ip a</code>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()}
            className="border-slate-800 text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>

          {/* Apply to Server (nmcli) Action Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleApplyToServer()}
            disabled={isApplyingIPs || (selectedServerId === "all" && servers.length === 0)}
            className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
            title="Connect via SSH and run nmcli connection modify + connection up"
          >
            <Play className="h-3.5 w-3.5 mr-1.5 text-emerald-400" />
            Apply to Server (nmcli)
          </Button>

          {/* Script generator */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleGenerateScript()}
            className="border-blue-500/30 text-blue-400 hover:bg-blue-600/10"
          >
            <Terminal className="h-3.5 w-3.5 mr-1.5" />
            View Bash Script
          </Button>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => openAddModal("bulk")}
            className="border-slate-800 text-slate-300 hover:bg-slate-800"
          >
            <Layers className="h-3.5 w-3.5 mr-1.5" />
            Bulk Add IPs
          </Button>

          <Button 
            size="sm" 
            onClick={() => openAddModal("single")}
            className="bg-blue-600 hover:bg-blue-500 text-white"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Secondary IP
          </Button>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-400">Total Servers</span>
            <Server className="h-4 w-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 mt-2">{servers.length}</div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {stats.uniqueServers} server(s) with registered IPs
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-400">Total IP Addresses</span>
            <Network className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 mt-2">{stats.totalIPs}</div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {stats.secondaryIPs} secondary additional IP(s)
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-400">Configured on Server</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 mt-2">{stats.configuredIPs}</div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Active via NetworkManager
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-400">Pending nmcli Run</span>
            <Clock className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400 mt-2">{stats.pendingIPs}</div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Need SSH nmcli activation
          </p>
        </div>
      </div>

      {/* Filter & Target Server Bar */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Server Selector Dropdown */}
          <div className="flex items-center gap-3">
            <Server className="h-5 w-5 text-blue-400 shrink-0" />
            <div>
              <span className="text-xs text-slate-400 block font-semibold uppercase">View Filter:</span>
              <select
                value={selectedServerId}
                onChange={(e) => setSelectedServerId(e.target.value)}
                className="mt-0.5 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-sm font-semibold text-slate-100 focus:outline-none focus:border-blue-500 min-w-[260px]"
              >
                <option value="all">🌐 All Servers — Fleet Overview ({allIPs.length} total IPs)</option>
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    🖥️ {s.name} ({s.main_ip})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="h-4 w-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by IP, server name, PTR, interface..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Quick Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/60 text-xs">
          <span className="text-slate-500 font-semibold uppercase">Filter by:</span>
          
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-md border border-slate-800">
            <button
              onClick={() => setFilterRole("all")}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${filterRole === "all" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
            >
              All Roles
            </button>
            <button
              onClick={() => setFilterRole("main")}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${filterRole === "main" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
            >
              Primary Only
            </button>
            <button
              onClick={() => setFilterRole("secondary")}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${filterRole === "secondary" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
            >
              Secondary Only
            </button>
          </div>

          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-md border border-slate-800">
            <button
              onClick={() => setFilterStatus("all")}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${filterStatus === "all" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
            >
              All Statuses
            </button>
            <button
              onClick={() => setFilterStatus("configured")}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${filterStatus === "configured" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
            >
              Configured ({stats.configuredIPs})
            </button>
            <button
              onClick={() => setFilterStatus("pending")}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${filterStatus === "pending" ? "bg-amber-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
            >
              Pending ({stats.pendingIPs})
            </button>
          </div>

          <div className="ml-auto text-slate-400">
            Showing <span className="font-bold text-slate-200">{filteredIPs.length}</span> of {allIPs.length} IP(s)
          </div>
        </div>
      </div>

      {/* IPs Table */}
      <Card className="border-slate-800 bg-slate-900/60 shadow-xl backdrop-blur">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/80 text-xs font-semibold text-slate-400 border-b border-slate-800 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Server</th>
                  <th className="px-6 py-4">IP Address</th>
                  <th className="px-6 py-4">Subnet CIDR</th>
                  <th className="px-6 py-4">Interface</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">nmcli Status</th>
                  <th className="px-6 py-4">Reverse DNS (PTR Hostname)</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {isLoadingIPs || isLoadingServers ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
                      Loading IP addresses...
                    </td>
                  </tr>
                ) : isError ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-rose-400">
                      <AlertCircle className="h-6 w-6 mx-auto mb-2" />
                      Failed to load server IP addresses.
                    </td>
                  </tr>
                ) : filteredIPs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                      <Network className="h-8 w-8 mx-auto mb-2 text-slate-600" />
                      <p className="text-sm font-medium text-slate-300">No IP addresses found</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {searchQuery ? "Try refining your search filter" : "Add secondary IPs or configure them for your servers."}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredIPs.map((ip) => (
                    <tr key={ip.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Server className="h-4 w-4 text-blue-400 shrink-0" />
                          <div>
                            <span className="font-semibold text-slate-200 block text-xs">
                              {ip.server_name || "Server"}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span className="font-mono font-bold text-slate-100">{ip.ip_address}</span>
                      </td>

                      <td className="px-6 py-4 font-mono text-xs text-slate-400">
                        /{ip.subnet_cidr}
                      </td>

                      <td className="px-6 py-4 font-mono text-xs text-slate-300">
                        {ip.interface_name}
                      </td>

                      <td className="px-6 py-4">
                        {ip.is_main ? (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            Primary Main IP
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-800 text-slate-300">
                            Secondary IP
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        {ip.is_configured ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Active on Server
                          </span>
                        ) : (
                          <button
                            onClick={() => handleToggleConfigured(ip.server_id, ip.id, ip.is_configured)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
                            title="Click to toggle configured status"
                          >
                            <Clock className="h-3.5 w-3.5" />
                            Pending nmcli
                          </button>
                        )}
                      </td>

                      <td className="px-6 py-4 font-mono text-xs text-slate-400">
                        {ip.rdns_hostname ? (
                          <span className="text-slate-300">{ip.rdns_hostname}</span>
                        ) : (
                          <span className="text-slate-600 italic">—</span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!ip.is_main && (
                            <>
                              <button
                                onClick={() => handleApplyToServer(ip.server_id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-colors"
                                title="Run nmcli over SSH on this server"
                              >
                                <Play className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteIP(ip.server_id, ip.id, ip.ip_address)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                                title="Delete IP"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      </div>

      {/* Add Additional IPs Modal (Supports both "Just One" and "Add by bulk") */}
      {isAddModalOpen && (
        <div className="fixed inset-0 !m-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                {addMode === "single" ? (
                  <Cpu className="h-5 w-5 text-blue-400" />
                ) : (
                  <Layers className="h-5 w-5 text-blue-400" />
                )}
                <div>
                  <h3 className="font-semibold text-slate-100">
                    {addMode === "single" ? "Add Secondary IP Address" : "Bulk Add Secondary IPs"}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Configure secondary IP addresses for NetworkManager on this server.
                  </p>
                </div>
              </div>
              <button onClick={closeModals} className="text-slate-400 hover:text-slate-200 text-lg">✕</button>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => { setAddMode("single"); setFormError(""); }}
                className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 ${
                  addMode === "single"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Cpu className="h-3.5 w-3.5" />
                Just One IP
              </button>
              <button
                type="button"
                onClick={() => { setAddMode("bulk"); setFormError(""); }}
                className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 ${
                  addMode === "bulk"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                Add by Bulk
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                {formError}
              </div>
            )}

            {/* Server Selector inside modal */}
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                Target Server *
              </label>
              <select
                value={modalServerId}
                onChange={(e) => setModalServerId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500 font-medium"
              >
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {s.main_ip}
                  </option>
                ))}
              </select>
            </div>

            {addMode === "single" ? (
              /* Single IP Form */
              <form onSubmit={handleAddIPSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                    IPv4 Address *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 198.51.100.26"
                    value={ipAddress}
                    onChange={(e) => setIpAddress(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                      Subnet CIDR
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={32}
                      value={subnetCIDR}
                      onChange={(e) => setSubnetCIDR(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                      Interface Name
                    </label>
                    <input
                      type="text"
                      value={interfaceName}
                      onChange={(e) => setInterfaceName(e.target.value)}
                      placeholder="eth0 or ens3"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                    Reverse DNS (PTR Hostname) <span className="text-slate-500 font-normal lowercase">(optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. mail2.example.com"
                    value={rdnsHostname}
                    onChange={(e) => setRdnsHostname(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Apply directly via SSH toggle */}
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    id="applyImmediatelySingle"
                    checked={applyImmediately}
                    onChange={(e) => setApplyImmediately(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer"
                  />
                  <label htmlFor="applyImmediatelySingle" className="text-xs text-slate-300 cursor-pointer">
                    <span className="font-semibold block text-slate-200">Apply to server via SSH immediately</span>
                    Executes <code className="text-blue-400 font-mono">sudo nmcli connection modify &quot;System eth0&quot; +ipv4.addresses</code> on the server so <code className="text-blue-400 font-mono">ip a</code> displays it right away.
                  </label>
                </div>

                <div className="pt-2 flex justify-end gap-3 border-t border-slate-800">
                  <Button type="button" variant="outline" size="sm" onClick={closeModals} className="border-slate-800 text-slate-400">
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={isAddingIP} className="bg-blue-600 hover:bg-blue-500 text-white">
                    {isAddingIP ? "Adding & Configuring..." : "Add IP"}
                  </Button>
                </div>
              </form>
            ) : (
              /* Bulk IP Form */
              <form onSubmit={handleBulkSubmit} className="space-y-4">
                <div className="p-3 rounded-lg bg-blue-950/20 border border-blue-800/40 text-xs text-slate-300 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-blue-400 flex items-center gap-1.5">
                      <Network className="h-3.5 w-3.5 text-blue-400" />
                      Format: ip,hostname(ptr)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setBulkLines("198.51.100.26,mail2.example.com\n198.51.100.27,\n198.51.100.28");
                      }}
                      className="text-[11px] text-blue-400 hover:text-blue-300 underline"
                    >
                      Insert Example
                    </button>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    One entry per line. Hostname is optional and can be left empty (e.g. <code className="text-blue-300">198.51.100.27,</code> or <code className="text-blue-300">198.51.100.28</code>).
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold uppercase text-slate-400">
                      IP Lines *
                    </label>
                    {validBulkIPs.length > 0 && (
                      <span className="text-[11px] font-mono text-emerald-400 font-medium">
                        {validBulkIPs.length} IP{validBulkIPs.length === 1 ? "" : "s"} detected
                      </span>
                    )}
                  </div>
                  <textarea
                    rows={6}
                    required
                    placeholder={"198.51.100.26,mail2.example.com\n198.51.100.27,\n198.51.100.28"}
                    value={bulkLines}
                    onChange={(e) => setBulkLines(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
                  />
                </div>

                {/* Live parsed preview */}
                {parsedBulkIPs.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-400">
                        Parsed Preview ({validBulkIPs.length} valid
                        {invalidBulkIPs.length > 0 ? `, ${invalidBulkIPs.length} invalid` : ""}):
                      </span>
                      {validBulkIPs.length > 0 && (
                        <span className="text-emerald-400 text-[11px] flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Ready to configure
                        </span>
                      )}
                    </div>
                    <div className="max-h-28 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/60 p-2 space-y-1 font-mono text-xs">
                      {parsedBulkIPs.slice(0, 6).map((p, idx) => (
                        <div
                          key={idx}
                          className={`flex items-center justify-between px-2 py-1 rounded text-[11px] ${
                            p.isValid
                              ? "bg-slate-900/80 text-slate-300"
                              : "bg-rose-950/30 text-rose-400 border border-rose-900/50"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={p.isValid ? "text-slate-100 font-bold" : "text-rose-400"}>
                              {p.ip || "(invalid)"}
                            </span>
                            <span className="text-slate-500">/{p.cidr}</span>
                          </div>
                          <span className="text-slate-400 truncate max-w-[200px]">
                            {p.ptr ? `➔ ${p.ptr}` : <span className="italic text-slate-600">(no PTR)</span>}
                          </span>
                        </div>
                      ))}
                      {parsedBulkIPs.length > 6 && (
                        <p className="text-[10px] text-slate-500 text-center pt-0.5">
                          + {parsedBulkIPs.length - 6} more IP addresses
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                      Subnet CIDR
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={32}
                      value={subnetCIDR}
                      onChange={(e) => setSubnetCIDR(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                      Interface Name
                    </label>
                    <input
                      type="text"
                      value={interfaceName}
                      onChange={(e) => setInterfaceName(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Apply directly via SSH toggle */}
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    id="applyImmediatelyBulk"
                    checked={applyImmediately}
                    onChange={(e) => setApplyImmediately(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer"
                  />
                  <label htmlFor="applyImmediatelyBulk" className="text-xs text-slate-300 cursor-pointer">
                    <span className="font-semibold block text-slate-200">Apply to server via SSH immediately</span>
                    Runs bulk <code className="text-blue-400 font-mono">+ipv4.addresses &quot;ip1/24,ip2/24...&quot;</code> over SSH so <code className="text-blue-400 font-mono">ip a</code> displays them right away.
                  </label>
                </div>

                <div className="pt-2 flex justify-end gap-3 border-t border-slate-800">
                  <Button type="button" variant="outline" size="sm" onClick={closeModals} className="border-slate-800 text-slate-400">
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isBulkAdding || validBulkIPs.length === 0}
                    className="bg-blue-600 hover:bg-blue-500 text-white"
                  >
                    {isBulkAdding
                      ? "Applying to Server..."
                      : validBulkIPs.length > 0
                      ? `Add & Configure ${validBulkIPs.length} IP${validBulkIPs.length === 1 ? "" : "s"}`
                      : "Add All IPs"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* SSH nmcli Execution Output Modal */}
      {isApplyModalOpen && (
        <div className="fixed inset-0 !m-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="h-5 w-5 text-emerald-400" />
                <div>
                  <h3 className="font-semibold text-slate-100">
                    NetworkManager (nmcli) Execution — {applyTargetServerName || "Server"}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Real-time execution log from remote host over SSH
                  </p>
                </div>
              </div>
              <button onClick={closeModals} className="text-slate-400 hover:text-slate-200">✕</button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {applyStatus === "running" ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    Executing nmcli & checking ip a...
                  </span>
                ) : applyStatus === "success" ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    NetworkManager Configuration Complete
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Execution Failed
                  </span>
                )}
              </div>
            </div>

            <pre className="p-4 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-300 max-h-96 overflow-y-auto whitespace-pre">
              {applyOutput}
            </pre>

            <div className="pt-2 flex items-center justify-between border-t border-slate-800">
              <span className="text-[11px] text-slate-500">
                Verified with live <code className="text-slate-400 font-mono">ip -4 addr show</code> on remote interface.
              </span>
              <Button size="sm" onClick={closeModals} className="bg-blue-600 hover:bg-blue-500 text-white">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* nmcli Script Modal */}
      {isScriptModalOpen && (
        <div className="fixed inset-0 !m-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="h-5 w-5 text-emerald-400" />
                <h3 className="font-semibold text-slate-100">NetworkManager (nmcli) Configuration Script</h3>
              </div>
              <button onClick={closeModals} className="text-slate-400 hover:text-slate-200">✕</button>
            </div>

            <p className="text-xs text-slate-400">
              Bash script for manually binding additional secondary IPs to NetworkManager:
            </p>

            <div className="flex justify-end">
              <Button size="sm" onClick={handleCopyScript} className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs">
                {copied ? <Check className="h-3.5 w-3.5 mr-1 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                {copied ? "Copied!" : "Copy Bash Script"}
              </Button>
            </div>

            <pre className="p-4 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-300 max-h-80 overflow-y-auto whitespace-pre">
              {generatedScript}
            </pre>

            <div className="pt-2 flex items-center justify-between border-t border-slate-800">
              <span className="text-[11px] text-slate-500">
                Idempotent & safe: adds IPs to connection profile and brings up connection.
              </span>
              <Button size="sm" onClick={closeModals} className="bg-blue-600 hover:bg-blue-500 text-white">
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function ConfigureAdditionalIPsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading IPs...</div>}>
      <ConfigureAdditionalIPsContent />
    </Suspense>
  );
}
