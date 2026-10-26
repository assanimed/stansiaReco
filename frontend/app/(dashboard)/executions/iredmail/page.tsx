"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Mail,
  Server,
  Globe,
  ShieldCheck,
  Terminal,
  Plus,
  RefreshCw,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  Copy,
  Check,
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  Play,
  Sparkles,
  Search,
  ChevronRight,
  ChevronDown,
  Code2,
  Layers,
  Cpu,
  Wand2,
} from "lucide-react";
import {
  useGetIRedMailServersQuery,
  useCheckServerUbuntuOSMutation,
  useCreateIRedMailServerMutation,
  useRetryIRedMailServerMutation,
  useSyncIRedMailDNSMutation,
  useDeleteIRedMailServerMutation,
  IRedMailServer,
  IRedMailOSCheckResult,
} from "@/lib/store/api/executions-api";
import {
  useGetServersQuery,
  useCreateServerMutation,
  useGetProvidersQuery,
} from "@/lib/store/api/servers-api";
import { useGetDomainsQuery } from "@/lib/store/api/domains-api";
import { notify } from "@/lib/notifications/notification-store";

function generateStrongPassword(length = 20): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  const array = new Uint32Array(length);
  if (typeof window !== "undefined" && window.crypto) {
    window.crypto.getRandomValues(array);
    return Array.from(array, (x) => chars[x % chars.length]).join("");
  }
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export default function IRedMailServersPage() {
  // Queries & polling
  const [hasRunningPipeline, setHasRunningPipeline] = useState(false);
  const {
    data: iredmailServers = [],
    isLoading,
    isFetching,
    refetch,
  } = useGetIRedMailServersQuery(undefined, {
    pollingInterval: hasRunningPipeline ? 2000 : 0,
  });

  const { data: mtaServers = [], refetch: refetchMTAServers } = useGetServersQuery();
  const { data: serverProviders = [] } = useGetProvidersQuery();
  const { data: domains = [] } = useGetDomainsQuery();

  // Mutations
  const [checkServerUbuntuOS, { isLoading: isCheckingOS }] = useCheckServerUbuntuOSMutation();
  const [createIRedMailServer, { isLoading: isCreatingIRedMail }] = useCreateIRedMailServerMutation();
  const [retryIRedMailServer, { isLoading: isRetrying }] = useRetryIRedMailServerMutation();
  const [syncIRedMailDNS, { isLoading: isSyncingDNS }] = useSyncIRedMailDNSMutation();
  const [deleteIRedMailServer, { isLoading: isDeleting }] = useDeleteIRedMailServerMutation();
  const [createMTAServer, { isLoading: isCreatingMTAServer }] = useCreateServerMutation();

  // Update polling state whenever any server is running/pending
  useEffect(() => {
    const anyActive = iredmailServers.some(
      (srv) => srv.status === "running" || srv.status === "pending"
    );
    setHasRunningPipeline(anyActive);
  }, [iredmailServers]);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "running" | "failed">("all");

  // Password reveal & copy state
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Active Pipeline Modal state
  const [inspectingServerId, setInspectingServerId] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  // DKIM Inspector Modal state
  const [dkimModalServer, setDkimModalServer] = useState<IRedMailServer | null>(null);

  // Delete Confirm Modal state
  const [deletingServer, setDeletingServer] = useState<IRedMailServer | null>(null);
  const [removeContainerOnDelete, setRemoveContainerOnDelete] = useState(false);

  // Add / Deploy iRedMail Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [serverMode, setServerMode] = useState<"existing" | "new">("existing");
  const [selectedServerId, setSelectedServerId] = useState<string>("");
  const [selectedDomainId, setSelectedDomainId] = useState<string>("");
  const [hostnameInput, setHostnameInput] = useState<string>("");
  const [adminPasswordInput, setAdminPasswordInput] = useState<string>(() => generateStrongPassword(18));
  const [showScriptPreview, setShowScriptPreview] = useState(false);

  // OS Check state inside wizard
  const [osCheckResult, setOsCheckResult] = useState<IRedMailOSCheckResult | null>(null);
  const [osCheckError, setOsCheckError] = useState<string | null>(null);

  // Quick Add New MTA Server inline state
  const [newServerName, setNewServerName] = useState("");
  const [newServerIP, setNewServerIP] = useState("");
  const [newServerPort, setNewServerPort] = useState(22);
  const [newServerProviderId, setNewServerProviderId] = useState("");
  const [newServerUser, setNewServerUser] = useState("root");
  const [newServerAuthType, setNewServerAuthType] = useState<"password" | "key">("password");
  const [newServerPassword, setNewServerPassword] = useState("");
  const [newServerPrivateKey, setNewServerPrivateKey] = useState("");

  // Selected Domain object
  const selectedDomain = useMemo(
    () => domains.find((d) => d.id === selectedDomainId),
    [domains, selectedDomainId]
  );

  // Selected MTA Server object
  const selectedMTAServer = useMemo(
    () => mtaServers.find((s) => s.id === selectedServerId),
    [mtaServers, selectedServerId]
  );

  // Auto-update hostname when domain changes
  useEffect(() => {
    if (selectedDomain) {
      setHostnameInput(`mail.${selectedDomain.domain_name}`);
    }
  }, [selectedDomain]);

  // Live inspected server from query list
  const inspectingServer = useMemo(
    () => iredmailServers.find((s) => s.id === inspectingServerId) || null,
    [iredmailServers, inspectingServerId]
  );

  // Auto-select current running step or first step when inspecting a server
  useEffect(() => {
    if (inspectingServer && inspectingServer.pipeline_steps?.length > 0) {
      if (!selectedStepId) {
        const activeOrFailed =
          inspectingServer.pipeline_steps.find((st) => st.status === "running" || st.status === "failed") ||
          inspectingServer.pipeline_steps[inspectingServer.pipeline_steps.length - 1];
        setSelectedStepId(activeOrFailed.id);
      }
    }
  }, [inspectingServer, selectedStepId]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(label);
    notify.success(`${label} copied`, { title: "Copied to clipboard" });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const extractApiErrorMessage = (err: any, fallback: string): string => {
    if (!err) return fallback;
    if (err?.originalStatus === 404 || (typeof err?.data === "string" && err.data.includes("404 page not found"))) {
      return "Endpoint /api/v1/executions/iredmail returned 404 — the running Go API server needs to be restarted to load the new iRedMail routes.";
    }
    if (typeof err?.data?.error?.message === "string") return err.data.error.message;
    if (typeof err?.data?.error === "string") return err.data.error;
    if (typeof err?.data?.message === "string") return err.data.message;
    if (typeof err?.data === "string" && err.data.trim()) return err.data.trim();
    if (typeof err?.error === "string") return err.error;
    if (typeof err?.message === "string") return err.message;
    return fallback;
  };

  // Trigger OS check when a server is selected
  const handleCheckOS = async (serverIdToVerify: string) => {
    if (!serverIdToVerify) return;
    setOsCheckResult(null);
    setOsCheckError(null);
    try {
      const res = await checkServerUbuntuOS(serverIdToVerify).unwrap();
      setOsCheckResult(res);
      if (!res.reachable) {
        notify.warning(res.message || "Could not connect to server over SSH.", {
          title: "SSH Connection Failed",
        });
      } else if (res.supported) {
        notify.success(
          `${res.server_name} is running ${res.os_pretty_name} (${res.os_version}).`,
          { title: "Ubuntu 22.04+ Verified" }
        );
      } else {
        notify.warning(
          res.message || `Detected ${res.os_pretty_name || "Unknown OS"} — Ubuntu 22.04 or higher is required.`,
          { title: "OS Version Requirement Not Met" }
        );
      }
    } catch (err: any) {
      const msg = extractApiErrorMessage(err, "Failed to check remote server OS via SSH");
      setOsCheckError(msg);
      notify.error(err, { title: "SSH / OS Check Failed", fallbackMessage: msg });
    }
  };

  const handleSelectServer = (srvId: string) => {
    setSelectedServerId(srvId);
    if (srvId) {
      handleCheckOS(srvId);
    } else {
      setOsCheckResult(null);
      setOsCheckError(null);
    }
  };

  // Create new MTA server inline & immediately select + check Ubuntu 22.04+
  const handleCreateNewMTAServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newServerName.trim() || !newServerIP.trim()) {
      notify.warning("Server name and IP address are required.", { title: "Validation Error" });
      return;
    }
    if (newServerAuthType === "password" && !newServerPassword) {
      notify.warning("SSH password is required.", { title: "Validation Error" });
      return;
    }
    if (newServerAuthType === "key" && !newServerPrivateKey.trim()) {
      notify.warning("SSH private key is required.", { title: "Validation Error" });
      return;
    }

    try {
      const created = await createMTAServer({
        name: newServerName.trim(),
        hostname_or_ip: newServerIP.trim(),
        ssh_port: Number(newServerPort) || 22,
        provider_id: newServerProviderId || undefined,
        server_type: "vps",
        mta_software: "postfix",
        environment: "production",
        auth_type: newServerAuthType,
        username: newServerUser.trim() || "root",
        password: newServerAuthType === "password" ? newServerPassword : undefined,
        private_key: newServerAuthType === "key" ? newServerPrivateKey : undefined,
      }).unwrap();

      await refetchMTAServers();
      notify.success(
        `${created.name} (${created.main_ip}) created. Verifying Ubuntu 22.04+...`,
        { title: "MTA Server Added" }
      );
      setServerMode("existing");
      setSelectedServerId(created.id);
      setNewServerName("");
      setNewServerIP("");
      setNewServerPassword("");
      setNewServerPrivateKey("");
      handleCheckOS(created.id);
    } catch (err: any) {
      notify.error(err, {
        title: "Failed to Add MTA Server",
        fallbackMessage: err?.data?.error || err?.message || "Could not create MTA server",
      });
    }
  };

  // Launch iRedMail Deployment Pipeline
  const handleDeployIRedMail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedServerId) {
      notify.warning("Please select an MTA server first.", { title: "Select a Server" });
      return;
    }
    if (osCheckResult && !osCheckResult.supported) {
      notify.warning(
        "The selected server does not meet the Ubuntu 22.04 or higher requirement.",
        { title: "Ubuntu 22.04+ Required" }
      );
      return;
    }
    if (!selectedDomainId) {
      notify.warning("Please select a domain from the Domains list.", { title: "Select a Domain" });
      return;
    }
    if (!adminPasswordInput.trim()) {
      notify.warning("Please provide an admin password for postmaster.", {
        title: "Admin Password Required",
      });
      return;
    }

    try {
      const res = await createIRedMailServer({
        server_id: selectedServerId,
        domain_id: selectedDomainId,
        hostname: hostnameInput.trim() || undefined,
        admin_password: adminPasswordInput.trim(),
      }).unwrap();

      const deployment = res.iredmail_server;
      notify.success(
        `Provisioning ${deployment.hostname} (${deployment.mail_domain}) on ${deployment.server_name || "remote server"}.`,
        { title: "iRedMail Pipeline Started" }
      );
      setShowAddModal(false);
      setHasRunningPipeline(true);
      setSelectedStepId("os_check");
      setInspectingServerId(deployment.id);
    } catch (err: any) {
      notify.error(err, {
        title: "Failed to Start Deployment",
        fallbackMessage: err?.data?.error || err?.message || "Could not start iRedMail provisioning pipeline",
      });
    }
  };

  const handleRetryPipeline = async (srv: IRedMailServer) => {
    try {
      await retryIRedMailServer(srv.id).unwrap();
      notify.success(`Retrying iRedMail deployment for ${srv.mail_domain}.`, {
        title: "Pipeline Restarted",
      });
      setHasRunningPipeline(true);
      setSelectedStepId("os_check");
      setInspectingServerId(srv.id);
    } catch (err: any) {
      notify.error(err, {
        title: "Retry Failed",
        fallbackMessage: err?.data?.error || err?.message || "Failed to retry pipeline",
      });
    }
  };

  const handleSyncDNSAndDKIM = async (srv: IRedMailServer) => {
    try {
      const res = await syncIRedMailDNS(srv.id).unwrap();
      const updated = res.iredmail_server;
      notify.success(
        `Extracted DKIM via amavisd-new showkeys and pushed records for ${updated.mail_domain}.`,
        { title: "DNS & DKIM Synchronized" }
      );
      if (dkimModalServer?.id === srv.id) {
        setDkimModalServer(updated);
      }
    } catch (err: any) {
      notify.error(err, {
        title: "DNS & DKIM Sync Failed",
        fallbackMessage: err?.data?.error || err?.message || "Could not sync DKIM & DNS",
      });
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingServer) return;
    try {
      await deleteIRedMailServer({
        id: deletingServer.id,
        removeContainer: removeContainerOnDelete,
      }).unwrap();
      notify.success(`Deleted ${deletingServer.hostname} record.`, {
        title: "iRedMail Server Removed",
      });
      if (inspectingServerId === deletingServer.id) {
        setInspectingServerId(null);
      }
      setDeletingServer(null);
      setRemoveContainerOnDelete(false);
    } catch (err: any) {
      notify.error(err, {
        title: "Delete Failed",
        fallbackMessage: err?.data?.error || err?.message || "Failed to delete iRedMail server",
      });
    }
  };

  // Filtered list
  const filteredServers = useMemo(() => {
    return iredmailServers.filter((srv) => {
      if (statusFilter !== "all" && srv.status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        srv.hostname.toLowerCase().includes(q) ||
        srv.mail_domain.toLowerCase().includes(q) ||
        (srv.server_name || "").toLowerCase().includes(q) ||
        (srv.server_ip || "").toLowerCase().includes(q) ||
        srv.admin_email.toLowerCase().includes(q)
      );
    });
  }, [iredmailServers, statusFilter, searchQuery]);

  // KPI metrics
  const kpis = useMemo(() => {
    const total = iredmailServers.length;
    const completed = iredmailServers.filter((s) => s.status === "completed").length;
    const running = iredmailServers.filter((s) => s.status === "running" || s.status === "pending").length;
    const fullDns = iredmailServers.filter(
      (s) =>
        s.dns_a_configured &&
        s.dns_mx_configured &&
        s.dns_spf_configured &&
        s.dns_dmarc_configured &&
        s.dns_dkim_configured
    ).length;
    return { total, completed, running, fullDns };
  }, [iredmailServers]);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-blue-400 mb-1">
            <Terminal className="h-3.5 w-3.5" />
            <span>Remote Executions / Automated Mail Server Stack</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
            <Mail className="h-6 w-6 text-blue-400" />
            iRedMail Servers
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Deploy containerized iRedMail (`iredmail/mariadb:stable`) on Ubuntu 22.04+ servers and automatically provision A (`mail`), MX, SPF, DMARC, and `amavisd-new showkeys` DKIM DNS records.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="px-3.5 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-2 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin text-blue-400" : ""}`} />
            Refresh
          </button>

          <button
            onClick={() => {
              setAdminPasswordInput(generateStrongPassword(18));
              setShowAddModal(true);
            }}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-blue-600/25 transition-all"
          >
            <Plus className="h-4 w-4" />
            Add iRedMail Server
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Total iRedMail Servers</p>
            <p className="text-2xl font-bold text-slate-100 mt-1">{kpis.total}</p>
            <p className="text-[11px] text-slate-500 mt-1">Containerized MariaDB + Postfix + Dovecot</p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Mail className="h-5 w-5" />
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Active & Healthy</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{kpis.completed}</p>
            <p className="text-[11px] text-slate-500 mt-1">All 6 pipeline stages completed</p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Running Pipelines</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">{kpis.running}</p>
            <p className="text-[11px] text-slate-500 mt-1">
              {kpis.running > 0 ? "Live polling every 2s..." : "No active deployments"}
            </p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Cpu className={`h-5 w-5 ${kpis.running > 0 ? "animate-pulse" : ""}`} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Full DNS & DKIM Verified</p>
            <p className="text-2xl font-bold text-indigo-400 mt-1">{kpis.fullDns}</p>
            <p className="text-[11px] text-slate-500 mt-1">A, MX, SPF, DMARC + 2048-bit DKIM</p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <ShieldCheck className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Filters & Search Bar */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by domain, hostname, server name, or IP..."
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
          {(["all", "completed", "running", "failed"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
                statusFilter === st
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Main iRedMail Servers List */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="h-7 w-7 animate-spin text-blue-400" />
            <p className="text-sm">Loading iRedMail servers...</p>
          </div>
        ) : filteredServers.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="h-12 w-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mx-auto">
              <Mail className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-200">No iRedMail Servers Found</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Click <strong>Add iRedMail Server</strong> to verify an Ubuntu 22.04+ MTA server, bind a domain, run the `iredmail/mariadb:stable` container, and configure A, MX, SPF, DMARC, and DKIM DNS records automatically.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Deploy First iRedMail Server
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="py-3.5 px-4">Server & Ubuntu OS</th>
                  <th className="py-3.5 px-4">Mail Domain & Hostname</th>
                  <th className="py-3.5 px-4">Admin Credentials & Webmail</th>
                  <th className="py-3.5 px-4">DNS & DKIM Records</th>
                  <th className="py-3.5 px-4">Pipeline Progress</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-xs">
                {filteredServers.map((srv) => {
                  const completedSteps = (srv.pipeline_steps || []).filter(
                    (st) => st.status === "completed"
                  ).length;
                  const totalSteps = (srv.pipeline_steps || []).length || 8;
                  const isPwRevealed = !!revealedPasswords[srv.id];

                  return (
                    <tr key={srv.id} className="hover:bg-slate-800/30 transition-colors">
                      {/* Server & OS */}
                      <td className="py-4 px-4 align-top">
                        <div className="flex items-start gap-2.5">
                          <div className="h-8 w-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-blue-400 shrink-0 mt-0.5">
                            <Server className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                              {srv.server_name || "MTA Server"}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                              {srv.server_ip || "—"}
                            </div>
                            <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-medium text-emerald-300">
                              <CheckCircle2 className="h-3 w-3" />
                              {srv.os_name || `Ubuntu ${srv.os_version || "22.04+"}`}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Domain & Hostname */}
                      <td className="py-4 px-4 align-top">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 font-semibold text-slate-100">
                            <Globe className="h-3.5 w-3.5 text-blue-400" />
                            <span>{srv.mail_domain}</span>
                            {srv.provider_name && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-normal">
                                {srv.provider_name}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-blue-300">
                            HOSTNAME={srv.hostname}
                          </div>
                          {srv.container_id && (
                            <div className="text-[10px] font-mono text-slate-500">
                              Container: {srv.container_name} ({srv.container_id.slice(0, 12)})
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Admin Credentials & Webmail Links */}
                      <td className="py-4 px-4 align-top">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5 text-slate-200 font-mono text-[11px]">
                            <span>{srv.admin_email}</span>
                            <button
                              onClick={() => copyToClipboard(srv.admin_email, `Admin Email (${srv.mail_domain})`)}
                              className="text-slate-500 hover:text-slate-300"
                              title="Copy Admin Email"
                            >
                              {copiedId === `Admin Email (${srv.mail_domain})` ? (
                                <Check className="h-3 w-3 text-emerald-400" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </div>

                          {srv.admin_password && (
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                                {isPwRevealed ? srv.admin_password : "••••••••••••"}
                              </span>
                              <button
                                onClick={() =>
                                  setRevealedPasswords((prev) => ({
                                    ...prev,
                                    [srv.id]: !prev[srv.id],
                                  }))
                                }
                                className="text-slate-400 hover:text-slate-200 p-1"
                                title={isPwRevealed ? "Hide password" : "Show password"}
                              >
                                {isPwRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                              </button>
                              <button
                                onClick={() =>
                                  copyToClipboard(srv.admin_password || "", `Password (${srv.mail_domain})`)
                                }
                                className="text-slate-400 hover:text-slate-200 p-1"
                                title="Copy Admin Password"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}

                          <div className="flex items-center gap-2 pt-0.5">
                            <a
                              href={srv.webmail_url || `https://${srv.hostname}/mail/`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 underline underline-offset-2"
                            >
                              Roundcube <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                            <span className="text-slate-700">•</span>
                            <a
                              href={srv.admin_panel_url || `https://${srv.hostname}/iredadmin/`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
                            >
                              iRedAdmin <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          </div>
                        </div>
                      </td>

                      {/* DNS & DKIM Status Badges */}
                      <td className="py-4 px-4 align-top">
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-1">
                            {[
                              { label: "A (mail)", ok: srv.dns_a_configured },
                              { label: "MX", ok: srv.dns_mx_configured },
                              { label: "SPF", ok: srv.dns_spf_configured },
                              { label: "DMARC", ok: srv.dns_dmarc_configured },
                              { label: "DKIM", ok: srv.dns_dkim_configured },
                            ].map((badge) => (
                              <span
                                key={badge.label}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                  badge.ok
                                    ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/25"
                                    : "bg-slate-800/80 text-slate-400 border-slate-700"
                                }`}
                              >
                                {badge.ok ? (
                                  <Check className="h-2.5 w-2.5 text-emerald-400" />
                                ) : (
                                  <Clock className="h-2.5 w-2.5 text-slate-500" />
                                )}
                                {badge.label}
                              </span>
                            ))}
                          </div>

                          <div className="flex items-center gap-2">
                            {srv.dkim_value ? (
                              <button
                                onClick={() => setDkimModalServer(srv)}
                                className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-medium"
                              >
                                <KeyRound className="h-3 w-3" />
                                Inspect DKIM ({srv.dkim_host})
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-500">DKIM pending extraction</span>
                            )}
                            {srv.domain_id && (
                              <Link
                                href={`/domains/dns?domain=${srv.domain_id}`}
                                className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300"
                              >
                                DNS Records <ExternalLink className="h-2.5 w-2.5" />
                              </Link>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Pipeline Progress */}
                      <td className="py-4 px-4 align-top">
                        <div className="space-y-2 min-w-[200px]">
                          <div className="flex items-center justify-between">
                            {srv.status === "completed" ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Completed ({completedSteps}/{totalSteps})
                              </span>
                            ) : srv.status === "running" || srv.status === "pending" ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Step {Math.min(completedSteps + 1, totalSteps)} of {totalSteps}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                                <XCircle className="h-3.5 w-3.5" />
                                Failed ({completedSteps}/{totalSteps})
                              </span>
                            )}

                            <button
                              onClick={() => {
                                setSelectedStepId(null);
                                setInspectingServerId(srv.id);
                              }}
                              className="text-[11px] text-blue-400 hover:text-blue-300 font-medium underline underline-offset-2"
                            >
                              View Pipeline
                            </button>
                          </div>

                          {/* 8-Step Segmented Bar */}
                          <div className="flex items-center gap-1">
                            {(srv.pipeline_steps || []).map((st) => {
                              let barColor = "bg-slate-800";
                              if (st.status === "completed") barColor = "bg-emerald-500";
                              else if (st.status === "running") barColor = "bg-blue-500 animate-pulse";
                              else if (st.status === "failed") barColor = "bg-rose-500";
                              return (
                                <div
                                  key={st.id}
                                  title={`${st.title}: ${st.status}`}
                                  className={`h-1.5 flex-1 rounded-full ${barColor}`}
                                />
                              );
                            })}
                          </div>

                          {srv.error_message && (
                            <p className="text-[11px] text-rose-400 line-clamp-1" title={srv.error_message}>
                              {srv.error_message}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 align-top text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedStepId(null);
                              setInspectingServerId(srv.id);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-medium inline-flex items-center gap-1.5"
                            title="Inspect Pipeline Steps & Logs"
                          >
                            <Layers className="h-3.5 w-3.5 text-blue-400" />
                            Steps
                          </button>

                          <button
                            onClick={() => handleSyncDNSAndDKIM(srv)}
                            disabled={isSyncingDNS || srv.status === "running"}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                            title="Run docker exec iredmail amavisd-new showkeys & sync DNS records"
                          >
                            <KeyRound className="h-3.5 w-3.5 text-emerald-400" />
                            Sync DKIM
                          </button>

                          {srv.status === "failed" && (
                            <button
                              onClick={() => handleRetryPipeline(srv)}
                              disabled={isRetrying}
                              className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[11px] font-medium inline-flex items-center gap-1"
                              title="Retry Provisioning Pipeline"
                            >
                              <Play className="h-3.5 w-3.5" />
                              Retry
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setDeletingServer(srv);
                              setRemoveContainerOnDelete(false);
                            }}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20"
                            title="Delete iRedMail Server"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* =====================================================================
          MODAL 1: ADD / DEPLOY NEW IREDMAIL SERVER WIZARD
      ===================================================================== */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden my-8">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <Mail className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-100">
                    Deploy New iRedMail Server
                  </h2>
                  <p className="text-xs text-slate-400">
                    Select or add an Ubuntu 22.04+ MTA server, pick a domain, deploy `iredmail/mariadb:stable`, and configure DNS + DKIM.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-200 text-sm px-2 py-1"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              {/* STEP 1: SELECT OR ADD MTA SERVER */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-blue-400 flex items-center gap-2">
                    <span className="h-5 w-5 rounded-full bg-blue-600 text-white text-[11px] flex items-center justify-center font-bold">
                      1
                    </span>
                    Select Target MTA Server (Ubuntu 22.04+ Required)
                  </label>

                  <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setServerMode("existing")}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                        serverMode === "existing"
                          ? "bg-blue-600 text-white"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Existing MTA Server
                    </button>
                    <button
                      type="button"
                      onClick={() => setServerMode("new")}
                      className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1 transition-colors ${
                        serverMode === "new"
                          ? "bg-blue-600 text-white"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <Plus className="h-3 w-3" />
                      Add New MTA Server
                    </button>
                  </div>
                </div>

                {serverMode === "existing" ? (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <select
                        value={selectedServerId}
                        onChange={(e) => handleSelectServer(e.target.value)}
                        className="flex-1 rounded-lg bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                      >
                        <option value="">-- Choose an MTA Server --</option>
                        {mtaServers.map((srv) => (
                          <option key={srv.id} value={srv.id}>
                            {srv.name} — {srv.main_ip || srv.hostname_or_ip} (SSH :{srv.ssh_port || 22})
                            {srv.os_info ? ` [${srv.os_info}]` : ""}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        disabled={!selectedServerId || isCheckingOS}
                        onClick={() => handleCheckOS(selectedServerId)}
                        className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 shrink-0"
                      >
                        {isCheckingOS ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5 text-blue-400" />
                        )}
                        Verify Ubuntu 22.04+
                      </button>
                    </div>

                    {/* OS Verification Banner */}
                    {isCheckingOS && (
                      <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3.5 flex items-center gap-3 text-xs text-blue-200">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-400 shrink-0" />
                        <div>
                          <span className="font-semibold">Checking Remote Server OS via SSH...</span>
                          <p className="text-[11px] text-blue-300/80 mt-0.5">
                            Inspecting `/etc/os-release` for Ubuntu 22.04 or higher and checking Docker installation.
                          </p>
                        </div>
                      </div>
                    )}

                    {!isCheckingOS && osCheckResult && (
                      <div
                        className={`rounded-xl border p-3.5 flex items-start gap-3 text-xs ${
                          osCheckResult.supported
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                            : "border-rose-500/30 bg-rose-500/10 text-rose-200"
                        }`}
                      >
                        {osCheckResult.supported ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold">
                              {!osCheckResult.reachable
                                ? `SSH Connection Error (${osCheckResult.server_name})`
                                : osCheckResult.supported
                                ? `Ubuntu 22.04+ Requirement Verified (${osCheckResult.os_pretty_name})`
                                : `Incompatible OS Detected (${osCheckResult.os_pretty_name || "Unknown"})`}
                            </span>
                            {osCheckResult.reachable && (
                              <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-950/60">
                                Docker: {osCheckResult.docker_installed ? "Installed" : "Will Auto-Install"}
                              </span>
                            )}
                          </div>
                          {osCheckResult.message && (
                            <p className="text-[11px] opacity-90">{osCheckResult.message}</p>
                          )}
                        </div>
                      </div>
                    )}

                    {!isCheckingOS && osCheckError && (
                      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 flex items-start gap-3 text-xs text-rose-200">
                        <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold">SSH Connection / OS Check Error</span>
                          <p className="text-[11px] text-rose-300 mt-0.5">{osCheckError}</p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Inline Add New MTA Server Form */
                  <form
                    onSubmit={handleCreateNewMTAServer}
                    className="rounded-xl border border-blue-500/30 bg-slate-950/80 p-4 space-y-4"
                  >
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                      <span className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                        <Server className="h-4 w-4 text-blue-400" />
                        Register New Ubuntu 22.04+ MTA Server
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Saves to MTA Servers List & verifies OS immediately
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">
                          Server Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={newServerName}
                          onChange={(e) => setNewServerName(e.target.value)}
                          placeholder="e.g. iredmail-us-east-1"
                          className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-slate-100"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">
                          Main IPv4 Address *
                        </label>
                        <input
                          type="text"
                          required
                          value={newServerIP}
                          onChange={(e) => setNewServerIP(e.target.value)}
                          placeholder="e.g. 203.0.113.50"
                          className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-slate-100 font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">
                          Hosting Provider
                        </label>
                        <select
                          value={newServerProviderId}
                          onChange={(e) => setNewServerProviderId(e.target.value)}
                          className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-slate-100"
                        >
                          <option value="">-- Optional Provider --</option>
                          {serverProviders.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">
                          SSH Username *
                        </label>
                        <input
                          type="text"
                          required
                          value={newServerUser}
                          onChange={(e) => setNewServerUser(e.target.value)}
                          className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-slate-100 font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">
                          SSH Port *
                        </label>
                        <input
                          type="number"
                          required
                          value={newServerPort}
                          onChange={(e) => setNewServerPort(Number(e.target.value))}
                          className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-slate-100 font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">
                          Auth Method
                        </label>
                        <select
                          value={newServerAuthType}
                          onChange={(e) => setNewServerAuthType(e.target.value as "password" | "key")}
                          className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-slate-100"
                        >
                          <option value="password">SSH Password</option>
                          <option value="key">SSH Private Key</option>
                        </select>
                      </div>
                    </div>

                    {newServerAuthType === "password" ? (
                      <div>
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">
                          Root / Sudo SSH Password *
                        </label>
                        <input
                          type="password"
                          required
                          value={newServerPassword}
                          onChange={(e) => setNewServerPassword(e.target.value)}
                          placeholder="Enter SSH password"
                          className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-slate-100 font-mono"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">
                          SSH Private Key (PEM / OpenSSH) *
                        </label>
                        <textarea
                          rows={3}
                          required
                          value={newServerPrivateKey}
                          onChange={(e) => setNewServerPrivateKey(e.target.value)}
                          placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                          className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-slate-100 font-mono"
                        />
                      </div>
                    )}

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setServerMode("existing")}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isCreatingMTAServer}
                        className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5"
                      >
                        {isCreatingMTAServer ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                        Save MTA Server & Check Ubuntu 22.04+
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* STEP 2: PICK A DOMAIN & CONFIGURE IREDMAIL */}
              <form onSubmit={handleDeployIRedMail} className="space-y-5 border-t border-slate-800 pt-5">
                <label className="text-xs font-semibold uppercase tracking-wider text-blue-400 flex items-center gap-2">
                  <span className="h-5 w-5 rounded-full bg-blue-600 text-white text-[11px] flex items-center justify-center font-bold">
                    2
                  </span>
                  Select Domain & Configure `iredmail-docker.conf`
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      First Mail Domain (`FIRST_MAIL_DOMAIN`) *
                    </label>
                    <select
                      required
                      value={selectedDomainId}
                      onChange={(e) => setSelectedDomainId(e.target.value)}
                      className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                    >
                      <option value="">-- Select Domain from Domains List --</option>
                      {domains.map((dom) => (
                        <option key={dom.id} value={dom.id}>
                          {dom.domain_name} {dom.provider_name ? `(${dom.provider_name})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Mail Server Hostname (`HOSTNAME`) *
                    </label>
                    <input
                      type="text"
                      required
                      value={hostnameInput}
                      onChange={(e) => setHostnameInput(e.target.value)}
                      placeholder="mail.example.com"
                      className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Postmaster Admin Password (`FIRST_MAIL_DOMAIN_ADMIN_PASSWORD`) *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      value={adminPasswordInput}
                      onChange={(e) => setAdminPasswordInput(e.target.value)}
                      className="flex-1 rounded-lg bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setAdminPasswordInput(generateStrongPassword(18))}
                      className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5"
                    >
                      <Wand2 className="h-3.5 w-3.5 text-blue-400" />
                      Generate
                    </button>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(adminPasswordInput, "Admin Password")}
                      className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copy
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Admin login will be{" "}
                    <span className="text-slate-300 font-mono">
                      postmaster@{selectedDomain?.domain_name || "example.com"}
                    </span>
                    . `MLMMJADMIN_API_TOKEN` and `ROUNDCUBE_DES_KEY` are generated via `openssl rand` on the server.
                  </p>
                </div>

                {/* Script & Automated DNS Preview Accordion */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowScriptPreview(!showScriptPreview)}
                    className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold text-slate-300 hover:bg-slate-900/60"
                  >
                    <span className="flex items-center gap-2">
                      <Code2 className="h-4 w-4 text-blue-400" />
                      View Provisioning Script & Automated DNS Records Plan
                    </span>
                    {showScriptPreview ? (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    )}
                  </button>

                  {showScriptPreview && (
                    <div className="p-4 border-t border-slate-800 space-y-3 text-[11px]">
                      <div className="font-mono bg-slate-950 p-3 rounded-lg border border-slate-800 text-slate-300 overflow-x-auto whitespace-pre leading-relaxed">
{`# 1. Enable internet DNS resolution:
sudo tee -a /etc/systemd/resolved.conf <<EOF
[Resolve]
DNS=8.8.8.8 1.1.1.1
FallbackDNS=8.8.4.4 1.0.0.1
EOF
sudo systemctl restart systemd-resolved

# 2. Set up Docker's official apt repository & install Docker CE:
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "\${UBUNTU_CODENAME:-\$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl status docker --no-pager

# 3. Configure & launch iRedMail container:
mkdir -p /iredmail && cd /iredmail
touch iredmail-docker.conf
echo HOSTNAME=${hostnameInput || "mail.example.com"} >> iredmail-docker.conf
echo FIRST_MAIL_DOMAIN=${selectedDomain?.domain_name || "example.com"} >> iredmail-docker.conf
echo FIRST_MAIL_DOMAIN_ADMIN_PASSWORD=${adminPasswordInput} >> iredmail-docker.conf
echo MLMMJADMIN_API_TOKEN=$(openssl rand -base64 32) >> iredmail-docker.conf
echo ROUNDCUBE_DES_KEY=$(openssl rand -base64 24) >> iredmail-docker.conf

sudo docker run -d --rm --name iredmail \\
  --env-file iredmail-docker.conf \\
  --hostname ${hostnameInput || "mail.example.com"} \\
  -p 80:80 -p 443:443 -p 110:110 -p 995:995 \\
  -p 143:143 -p 993:993 -p 25:25 -p 465:465 -p 587:587 \\
  -v /iredmail/data/backup-mysql:/var/vmail/backup/mysql \\
  -v /iredmail/data/mailboxes:/var/vmail/vmail1 \\
  -v /iredmail/data/mlmmj:/var/vmail/mlmmj \\
  -v /iredmail/data/mlmmj-archive:/var/vmail/mlmmj-archive \\
  -v /iredmail/data/imapsieve_copy:/var/vmail/imapsieve_copy \\
  -v /iredmail/data/custom:/opt/iredmail/custom \\
  -v /iredmail/data/ssl:/opt/iredmail/ssl \\
  -v /iredmail/data/mysql:/var/lib/mysql \\
  -v /iredmail/data/clamav:/var/lib/clamav \\
  -v /iredmail/data/sa_rules:/var/lib/spamassassin \\
  -v /iredmail/data/postfix_queue:/var/spool/postfix \\
  iredmail/mariadb:stable

# 4. Extract DKIM public key & push to DNS:
sudo docker exec iredmail amavisd-new showkeys`}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-400">
                        <div className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800">
                          <span className="font-semibold text-slate-200 block mb-1">
                            Automated DNS Records Created:
                          </span>
                          <ul className="space-y-0.5 font-mono text-[10px]">
                            <li>• A (mail) → {selectedMTAServer?.main_ip || "<Server IP>"}</li>
                            <li>• MX (@) → {hostnameInput || "mail.example.com"} (Priority 10)</li>
                            <li>• TXT (@) → v=spf1 mx a ip4:{selectedMTAServer?.main_ip || "<IP>"} ~all</li>
                            <li>• TXT (_dmarc) → v=DMARC1; p=quarantine; rua=mailto:postmaster@...</li>
                            <li>• TXT (dkim._domainkey) → v=DKIM1; p=... (from amavisd-new)</li>
                          </ul>
                        </div>
                        <div className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800">
                          <span className="font-semibold text-slate-200 block mb-1">
                            8-Step Pipeline Execution:
                          </span>
                          <ol className="space-y-0.5 text-[10px] list-decimal list-inside">
                            <li>Verify Ubuntu 22.04+ OS via SSH</li>
                            <li>Configure `/etc/systemd/resolved.conf` (8.8.8.8 / 1.1.1.1)</li>
                            <li>Set up Docker Apt repo & install `docker-ce` packages</li>
                            <li>Write `/iredmail/iredmail-docker.conf`</li>
                            <li>Start `iredmail/mariadb:stable` container</li>
                            <li>Configure A (`mail`), MX, SPF & DMARC records</li>
                            <li>Run `docker exec iredmail amavisd-new showkeys`</li>
                            <li>Save DKIM record & sync with registrar DNS</li>
                          </ol>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      isCreatingIRedMail ||
                      !selectedServerId ||
                      !selectedDomainId ||
                      (osCheckResult !== null && !osCheckResult.supported)
                    }
                    className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-blue-600/25"
                  >
                    {isCreatingIRedMail ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Launch iRedMail Provisioning Pipeline
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: LIVE 6-STEP PIPELINE PROGRESS & TERMINAL LOGS
      ===================================================================== */}
      {inspectingServer && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden my-8">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-100">
                      Provisioning Pipeline — {inspectingServer.hostname}
                    </h2>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                      {inspectingServer.server_name} ({inspectingServer.server_ip})
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Domain: <span className="text-slate-200 font-medium">{inspectingServer.mail_domain}</span> • OS:{" "}
                    <span className="text-emerald-400">{inspectingServer.os_name || "Ubuntu 22.04+"}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {inspectingServer.status === "failed" && (
                  <button
                    onClick={() => handleRetryPipeline(inspectingServer)}
                    disabled={isRetrying}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Retry Pipeline
                  </button>
                )}
                <button
                  onClick={() => handleSyncDNSAndDKIM(inspectingServer)}
                  disabled={isSyncingDNS || inspectingServer.status === "running"}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
                >
                  <KeyRound className="h-3.5 w-3.5 text-emerald-400" />
                  Re-Sync DKIM & DNS
                </button>
                <button
                  onClick={() => setInspectingServerId(null)}
                  className="text-slate-400 hover:text-slate-200 text-sm px-2.5 py-1"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Body: Left Stepper + Right Terminal Output */}
            <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[480px] max-h-[75vh]">
              {/* Left Column: 6 Pipeline Steps */}
              <div className="lg:col-span-5 border-r border-slate-800 p-4 space-y-2 overflow-y-auto bg-slate-950/40">
                {(inspectingServer.pipeline_steps || []).map((step, idx) => {
                  const isSelected = selectedStepId === step.id;
                  return (
                    <button
                      key={step.id}
                      onClick={() => setSelectedStepId(step.id)}
                      className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-start gap-3 ${
                        isSelected
                          ? "bg-blue-600/15 border-blue-500/40 shadow-sm"
                          : "bg-slate-900/60 border-slate-800/80 hover:bg-slate-800/50"
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {step.status === "completed" ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        ) : step.status === "running" ? (
                          <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
                        ) : step.status === "failed" ? (
                          <XCircle className="h-5 w-5 text-rose-400" />
                        ) : (
                          <div className="h-5 w-5 rounded-full border border-slate-700 text-[10px] font-mono text-slate-500 flex items-center justify-center">
                            {idx + 1}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-100 truncate">
                            {idx + 1}. {step.title}
                          </span>
                          {step.duration_ms ? (
                            <span className="text-[10px] font-mono text-slate-400 shrink-0">
                              {(step.duration_ms / 1000).toFixed(1)}s
                            </span>
                          ) : null}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">
                          {step.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Right Column: Active Step Terminal Output */}
              <div className="lg:col-span-7 flex flex-col bg-slate-950 p-5 overflow-y-auto">
                {(() => {
                  const activeStep =
                    (inspectingServer.pipeline_steps || []).find((s) => s.id === selectedStepId) ||
                    (inspectingServer.pipeline_steps || [])[0];

                  if (!activeStep) {
                    return <div className="text-xs text-slate-500">Select a pipeline step to view logs.</div>;
                  }

                  return (
                    <div className="flex-1 flex flex-col space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <div>
                          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                            <Terminal className="h-4 w-4 text-blue-400" />
                            {activeStep.title}
                          </h3>
                          <p className="text-xs text-slate-400 mt-0.5">{activeStep.description}</p>
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider ${
                            activeStep.status === "completed"
                              ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                              : activeStep.status === "running"
                              ? "bg-blue-500/15 text-blue-300 border border-blue-500/30"
                              : activeStep.status === "failed"
                              ? "bg-rose-500/15 text-rose-300 border border-rose-500/30"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {activeStep.status}
                        </span>
                      </div>

                      {inspectingServer.error_message && activeStep.status === "failed" && (
                        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200 font-mono">
                          <strong>Error:</strong> {inspectingServer.error_message}
                        </div>
                      )}

                      <div className="flex-1 rounded-xl border border-slate-800 bg-black/70 p-4 font-mono text-xs text-slate-200 overflow-x-auto whitespace-pre-wrap leading-relaxed min-h-[260px]">
                        {activeStep.logs ? (
                          activeStep.logs
                        ) : activeStep.status === "running" ? (
                          <span className="text-blue-400 flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Executing step on remote server via SSH...
                          </span>
                        ) : (
                          <span className="text-slate-600">Step waiting in pipeline queue...</span>
                        )}
                      </div>

                      {/* DNS Summary Footer inside Pipeline Modal */}
                      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="text-slate-400 font-medium">DNS Provisioning Status:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            { label: "A (mail)", ok: inspectingServer.dns_a_configured },
                            { label: "MX (@)", ok: inspectingServer.dns_mx_configured },
                            { label: "SPF", ok: inspectingServer.dns_spf_configured },
                            { label: "DMARC", ok: inspectingServer.dns_dmarc_configured },
                            { label: "DKIM (amavisd-new)", ok: inspectingServer.dns_dkim_configured },
                          ].map((b) => (
                            <span
                              key={b.label}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                b.ok
                                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/25"
                                  : "bg-slate-800 text-slate-400 border-slate-700"
                              }`}
                            >
                              {b.ok ? "✓ " : "• "}
                              {b.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 3: DKIM PUBLIC KEY & AMAVISD-NEW SHOWKEYS INSPECTOR
      ===================================================================== */}
      {dkimModalServer && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2.5">
                <KeyRound className="h-5 w-5 text-emerald-400" />
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    DKIM Key Inspector — {dkimModalServer.mail_domain}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Extracted via `docker exec iredmail amavisd-new showkeys`
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDkimModalServer(null)}
                className="text-slate-400 hover:text-slate-200 text-sm px-2 py-1"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-[10px] uppercase text-slate-500 block">DNS Host / Name</span>
                  <span className="font-mono text-emerald-300 font-semibold mt-0.5 block">
                    {dkimModalServer.dkim_host}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-[10px] uppercase text-slate-500 block">DKIM Selector</span>
                  <span className="font-mono text-slate-200 font-semibold mt-0.5 block">
                    {dkimModalServer.dkim_selector}
                  </span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-slate-300">Parsed TXT Record Value</span>
                  <button
                    onClick={() =>
                      copyToClipboard(dkimModalServer.dkim_value || "", "DKIM TXT Value")
                    }
                    className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 text-[11px]"
                  >
                    <Copy className="h-3 w-3" /> Copy TXT Value
                  </button>
                </div>
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] text-emerald-300 break-all">
                  {dkimModalServer.dkim_value || "Not extracted yet"}
                </div>
              </div>

              {dkimModalServer.dkim_raw_output && (
                <div>
                  <span className="font-semibold text-slate-300 block mb-1.5">
                    Raw `amavisd-new showkeys` Output
                  </span>
                  <pre className="p-3 rounded-lg bg-black/70 border border-slate-800 font-mono text-[11px] text-slate-300 overflow-x-auto whitespace-pre-wrap max-h-48">
                    {dkimModalServer.dkim_raw_output}
                  </pre>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => handleSyncDNSAndDKIM(dkimModalServer)}
                  disabled={isSyncingDNS}
                  className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  {isSyncingDNS ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Re-Extract & Push to DNS
                </button>
                <button
                  onClick={() => setDkimModalServer(null)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-200 text-xs font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 4: DELETE CONFIRMATION
      ===================================================================== */}
      {deletingServer && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">Delete iRedMail Deployment?</h3>
                <p className="text-xs text-slate-400">
                  {deletingServer.hostname} ({deletingServer.mail_domain})
                </p>
              </div>
            </div>

            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer text-xs text-slate-300">
              <input
                type="checkbox"
                checked={removeContainerOnDelete}
                onChange={(e) => setRemoveContainerOnDelete(e.target.checked)}
                className="mt-0.5 rounded border-slate-700"
              />
              <span>
                Also stop and remove the running <code className="text-rose-300">iredmail</code> Docker container on{" "}
                <strong>{deletingServer.server_name || deletingServer.server_ip}</strong> via SSH
              </span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeletingServer(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5"
              >
                {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Delete iRedMail Server
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
