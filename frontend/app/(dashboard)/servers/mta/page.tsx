"use client";

import React, { useState } from "react";
import Link from "next/link";
import { 
  useGetServersQuery, 
  useGetProvidersQuery, 
  useTestSSHConnectionMutation, 
  useDeleteServerMutation 
} from "@/lib/store/api/servers-api";
import { 
  Server, 
  Plus, 
  Layers, 
  Search, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Play, 
  Cpu, 
  Network, 
  Radio, 
  Trash2, 
  ShieldCheck, 
  Clock,
  ChevronRight
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MTAServer, SSHTestResult } from "@/lib/api/servers";
import { notify } from "@/lib/notifications/notification-store";
import { confirmAction } from "@/lib/dialogs/confirm-dialog-service";

export default function MTAServersListPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [port25Filter, setPort25Filter] = useState("");

  const [activeTestingId, setActiveTestingId] = useState<string | null>(null);
  const [testResultModal, setTestResultModal] = useState<SSHTestResult | null>(null);

  const { data: servers = [], isLoading, isError, refetch } = useGetServersQuery();
  const { data: providers = [] } = useGetProvidersQuery();
  const [testSSH] = useTestSSHConnectionMutation();
  const [deleteServer] = useDeleteServerMutation();

  const handleTestConnection = async (id: string, name?: string) => {
    setActiveTestingId(id);
    const loadingId = notify.loading(`Testing SSH connection to ${name || "server"}...`);
    try {
      const result = await testSSH(id).unwrap();
      setTestResultModal(result);
      if (result.success) {
        notify.update(loadingId, {
          type: "success",
          title: "SSH Connection Established",
          message: result.message || "Connected successfully.",
        });
      } else {
        notify.dismiss(loadingId);
        notify.warning(result.message || "SSH authentication failed.", {
          title: "SSH Connection Notice",
        });
      }
    } catch (err: any) {
      notify.dismiss(loadingId);
      notify.error(err, { title: "SSH Connection Test Failed", openDialog: true });
    } finally {
      setActiveTestingId(null);
    }
  };

  const handleDelete = async (srv: MTAServer) => {
    const confirmed = await confirmAction({
      title: "Delete MTA Server",
      message: `Delete MTA server "${srv.name}"? This cascades to secondary IPs, VMTAs, and proxy configuration.`,
      confirmLabel: "Delete Server",
      variant: "destructive",
      verificationText: srv.name,
    });
    if (!confirmed) return;

    try {
      await deleteServer(srv.id).unwrap();
      notify.success(`MTA server "${srv.name}" deleted successfully.`);
      refetch();
    } catch (err: any) {
      notify.error(err, { title: "Failed to delete server" });
    }
  };

  const filteredServers = servers.filter((s) => {
    const term = searchTerm.toLowerCase();
    return (
      s.name.toLowerCase().includes(term) ||
      s.hostname_or_ip.toLowerCase().includes(term) ||
      s.main_ip.toLowerCase().includes(term) ||
      (s.provider_name && s.provider_name.toLowerCase().includes(term))
    );
  });

  const openPort25Count = servers.filter((s) => s.port_25_status === "open").length;
  const mtaInstalledCount = servers.filter((s) => s.mta_installed).length;

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight text-slate-100">MTA Servers List</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
              {servers.length} Active Servers
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Centrally manage Mail Transfer Agent servers, SSH credentials, secondary IPs, VMTAs, and test port 25 availability.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()}
            className="border-slate-800 text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
          <Link href="/servers/mta/add-bulk">
            <Button variant="outline" size="sm" className="border-slate-800 text-slate-300 hover:bg-slate-800">
              <Layers className="h-3.5 w-3.5 mr-1.5" />
              Add Multiple MTAs
            </Button>
          </Link>
          <Link href="/servers/mta/add">
            <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add MTA Server
            </Button>
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Total MTA Servers</span>
            <Server className="h-4 w-4 text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-slate-100 mt-2">{servers.length}</p>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Port 25 Confirmed Open</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-400 mt-2">{openPort25Count}</p>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>MTA Daemon Installed</span>
            <ShieldCheck className="h-4 w-4 text-purple-400" />
          </div>
          <p className="text-2xl font-bold text-purple-400 mt-2">{mtaInstalledCount}</p>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Total Virtual MTAs (VMTAs)</span>
            <Network className="h-4 w-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-amber-400 mt-2">
            {servers.reduce((acc, s) => acc + (s.vmta_count || 0), 0)}
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search servers by name, hostname, IP address, or provider..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <select
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
          className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500"
        >
          <option value="">All Providers</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {p.port_25_open ? "(P25 Open)" : ""}
            </option>
          ))}
        </select>
        <select
          value={port25Filter}
          onChange={(e) => setPort25Filter(e.target.value)}
          className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500"
        >
          <option value="">All Port 25 Statuses</option>
          <option value="open">Port 25 Open</option>
          <option value="closed">Port 25 Closed / Blocked</option>
          <option value="unknown">Untested / Unknown</option>
        </select>
      </div>

      {/* Servers Table Card */}
      <Card className="border-slate-800 bg-slate-900/60 shadow-xl backdrop-blur">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/80 text-xs font-semibold text-slate-400 border-b border-slate-800 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Server / Main IP</th>
                  <th className="px-6 py-4">Provider</th>
                  <th className="px-6 py-4">Port 25 Outbound</th>
                  <th className="px-6 py-4">MTA Stack</th>
                  <th className="px-6 py-4 text-center">IPs & VMTAs</th>
                  <th className="px-6 py-4 text-center">Proxy</th>
                  <th className="px-6 py-4">Connection Health</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
                      Loading MTA servers...
                    </td>
                  </tr>
                ) : isError ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-rose-400">
                      <AlertCircle className="h-6 w-6 mx-auto mb-2" />
                      Failed to load MTA servers. Verify backend API connection.
                    </td>
                  </tr>
                ) : filteredServers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                      <Server className="h-8 w-8 mx-auto mb-2 text-slate-600" />
                      <p className="text-sm font-medium text-slate-300">No MTA servers registered</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Click "Add MTA Server" or "Add Multiple MTAs" to add your servers with SSH credentials.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredServers.map((srv) => {
                    const isTesting = activeTestingId === srv.id;
                    return (
                      <tr key={srv.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-mono text-xs">
                              {srv.ssh_port}
                            </div>
                            <div>
                              <span className="font-semibold text-slate-100 block">{srv.name}</span>
                              <span className="text-xs font-mono text-slate-400 block mt-0.5">
                                {srv.main_ip || srv.hostname_or_ip} (port {srv.ssh_port})
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          {srv.provider_name ? (
                            <span className="inline-flex items-center gap-1 text-xs text-slate-300 font-medium">
                              {srv.provider_name}
                              {srv.provider_port_25_open && (
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" title="Provider Port 25 unblocked" />
                              )}
                            </span>
                          ) : (
                            <span className="text-slate-500 text-xs">Custom / Self-hosted</span>
                          )}
                        </td>

                        <td className="px-6 py-4">
                          {srv.port_25_status === "open" ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                              OPEN
                            </span>
                          ) : srv.port_25_status === "closed" ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              <XCircle className="h-3.5 w-3.5 text-rose-400" />
                              BLOCKED
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                              <Clock className="h-3.5 w-3.5 text-slate-400" />
                              UNTESTED
                            </span>
                          )}
                        </td>

                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            <span className="text-xs uppercase font-mono font-semibold text-slate-200 block">
                              {srv.mta_software || "postfix"}
                            </span>
                            <span className={`text-[11px] font-medium block ${srv.mta_installed ? "text-emerald-400" : "text-amber-400"}`}>
                              {srv.mta_installed ? "Installed & Configured" : "Pending Setup"}
                            </span>
                          </div>
                        </td>

                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Link 
                              href={`/servers/mta/configure-ips?server_id=${srv.id}`}
                              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-blue-300 text-xs font-mono font-medium transition-colors"
                              title="Manage secondary IPs"
                            >
                              {srv.ip_count} IPs
                            </Link>
                            <Link 
                              href={`/servers/mta/vmtas?server_id=${srv.id}`}
                              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 text-xs font-mono font-medium transition-colors"
                              title="Manage VMTAs"
                            >
                              {srv.vmta_count} VMTAs
                            </Link>
                          </div>
                        </td>

                        <td className="px-6 py-4 text-center">
                          <Link href={`/servers/mta/proxies?server_id=${srv.id}`}>
                            {srv.proxy_enabled ? (
                              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                Active
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium text-slate-500 bg-slate-800/60">
                                Disabled
                              </span>
                            )}
                          </Link>
                        </td>

                        <td className="px-6 py-4">
                          {srv.last_tested_at ? (
                            <div className="space-y-0.5">
                              <span className={`text-xs font-semibold ${srv.last_test_status === "success" ? "text-emerald-400" : "text-rose-400"}`}>
                                {srv.last_test_status === "success" ? "SSH Verified" : "Auth Failed"}
                              </span>
                              <span className="text-[11px] text-slate-500 block">
                                {new Date(srv.last_tested_at).toLocaleTimeString()}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-500 text-xs">Never tested</span>
                          )}
                        </td>

                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isTesting}
                              onClick={() => handleTestConnection(srv.id)}
                              className="border-slate-800 hover:bg-blue-600/10 hover:border-blue-500/30 text-blue-400 text-xs h-8 px-2.5"
                              title="Test SSH auth and port 25 reachability"
                            >
                              {isTesting ? (
                                <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                <Play className="h-3 w-3 mr-1" />
                              )}
                              Test
                            </Button>
                            <button
                              onClick={() => handleDelete(srv)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                              title="Delete Server"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      </div>

      {/* SSH & Port 25 Test Result Modal */}
      {testResultModal && (
        <div className="fixed inset-0 !m-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                {testResultModal.success ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                ) : (
                  <XCircle className="h-5 w-5 text-rose-400" />
                )}
                <h3 className="font-semibold text-slate-100">SSH & Port 25 Diagnostic</h3>
              </div>
              <button 
                onClick={() => setTestResultModal(null)} 
                className="text-slate-400 hover:text-slate-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block font-semibold mb-1">Status Message:</span>
                <p className="text-slate-200 font-mono">{testResultModal.message}</p>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                <span className="text-slate-400 font-semibold">Outbound Port 25:</span>
                {testResultModal.port_25_status === "open" ? (
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    OPEN & UNBLOCKED
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                    BLOCKED / FILTERED
                  </span>
                )}
              </div>

              {testResultModal.os_info && (
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-slate-400 block font-semibold mb-1">Kernel & System:</span>
                  <pre className="text-slate-300 font-mono whitespace-pre-wrap">{testResultModal.os_info}</pre>
                </div>
              )}

              {testResultModal.error && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">
                  <span className="font-semibold block mb-1">Error Trace:</span>
                  <p className="font-mono">{testResultModal.error}</p>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <Button size="sm" onClick={() => setTestResultModal(null)} className="bg-blue-600 hover:bg-blue-500 text-white">
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
