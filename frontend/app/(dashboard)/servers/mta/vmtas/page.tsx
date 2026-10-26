"use client";

import React, { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { 
  useGetServersQuery, 
  useGetVmtasQuery, 
  useCreateVmtaMutation, 
  useBulkCreateVmtasMutation, 
  useDeleteVmtaMutation, 
  useLazyGetVmtaConfigQuery 
} from "@/lib/store/api/servers-api";
import { 
  Network, 
  Plus, 
  Layers, 
  Download, 
  Search, 
  RefreshCw, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  Check, 
  Server
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { VMTA, CreateVMTAPayload } from "@/lib/api/servers";
import { notify } from "@/lib/notifications/notification-store";
import { confirmAction } from "@/lib/dialogs/confirm-dialog-service";

function VMTAsContent() {
  const searchParams = useSearchParams();
  const initialServerId = searchParams.get("server_id") || "";

  const [selectedServerId, setSelectedServerId] = useState(initialServerId);
  const [searchTerm, setSearchTerm] = useState("");

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [configType, setConfigType] = useState<"postfix" | "powermta">("postfix");
  const [generatedConfig, setGeneratedConfig] = useState("");
  const [copied, setCopied] = useState(false);

  // Add Form state
  const [formServerId, setFormServerId] = useState(initialServerId);
  const [vmtaName, setVmtaName] = useState("");
  const [ipAddress, setIpAddress] = useState("");
  const [domainName, setDomainName] = useState("");
  const [hostName, setHostName] = useState("");
  const [bulkLines, setBulkLines] = useState("");
  const [formError, setFormError] = useState("");

  const { data: servers = [] } = useGetServersQuery();
  const { data: allVmtas = [], isLoading, isError, refetch } = useGetVmtasQuery();

  const vmtas = selectedServerId 
    ? allVmtas.filter((v) => v.server_id === selectedServerId) 
    : allVmtas;

  const [createVmta, { isLoading: isCreating }] = useCreateVmtaMutation();
  const [bulkCreateVmtas, { isLoading: isBulkCreating }] = useBulkCreateVmtasMutation();
  const [deleteVmta] = useDeleteVmtaMutation();
  const [getVmtaConfig] = useLazyGetVmtaConfigQuery();

  const closeModals = () => {
    setIsAddModalOpen(false);
    setIsBulkModalOpen(false);
    setIsConfigModalOpen(false);
    setVmtaName("");
    setIpAddress("");
    setDomainName("");
    setHostName("");
    setBulkLines("");
    setFormError("");
    setCopied(false);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formServerId) { setFormError("Target server is required"); return; }
    if (!ipAddress.trim()) { setFormError("IP address is required"); return; }

    try {
      await createVmta({
        serverId: formServerId,
        payload: {
          vmta_name: vmtaName.trim() || undefined,
          ip_address: ipAddress.trim(),
          domain_name: domainName.trim() || undefined,
          host_name: hostName.trim() || undefined,
        },
      }).unwrap();
      notify.success(`VMTA "${vmtaName || ipAddress}" created successfully.`);
      closeModals();
    } catch (err: any) {
      setFormError(err?.data?.error?.message || err?.message || "Failed to create VMTA");
      notify.error(err, { title: "Failed to create VMTA" });
    }
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formServerId) { setFormError("Target server is required"); return; }
    if (!bulkLines.trim()) { setFormError("Please enter at least one VMTA line"); return; }

    try {
      await bulkCreateVmtas({
        serverId: formServerId,
        payload: {
          raw_lines: bulkLines.trim(),
        },
      }).unwrap();
      notify.success("Bulk VMTAs configured successfully.");
      closeModals();
    } catch (err: any) {
      setFormError(err?.data?.error?.message || err?.message || "Failed to bulk create VMTAs");
      notify.error(err, { title: "Bulk VMTA Configuration Failed" });
    }
  };

  const handleDeleteVmta = async (id: string, name: string) => {
    const confirmed = await confirmAction({
      title: "Delete VMTA",
      message: `Delete virtual MTA entry "${name}"? Mail routing associated with this virtual interface will be removed.`,
      confirmLabel: "Delete VMTA",
      variant: "destructive",
    });
    if (!confirmed) return;

    try {
      await deleteVmta(id).unwrap();
      notify.success(`VMTA "${name}" deleted successfully.`);
    } catch (err: any) {
      notify.error(err, { title: "Failed to delete VMTA" });
    }
  };

  const handleExportConfig = async (srvId: string, type?: "postfix" | "powermta") => {
    if (!srvId) return;
    const loadingId = notify.loading(`Generating ${type ? type.toUpperCase() : "MTA"} configuration...`);
    try {
      const res = await getVmtaConfig({ serverId: srvId, type }).unwrap();
      setGeneratedConfig(res.config);
      setIsConfigModalOpen(true);
      notify.update(loadingId, {
        type: "success",
        message: "MTA configuration generated successfully.",
      });
    } catch (err: any) {
      notify.dismiss(loadingId);
      notify.error(err, { title: "Failed to generate configuration" });
    }
  };

  const handleCopyConfig = () => {
    navigator.clipboard.writeText(generatedConfig);
    setCopied(true);
    notify.info("Configuration copied to clipboard.", { duration: 2000 });
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredVMTAs = vmtas.filter((v) => {
    const term = searchTerm.toLowerCase();
    return (
      v.vmta_name.toLowerCase().includes(term) ||
      v.ip_address.toLowerCase().includes(term) ||
      (v.domain_name && v.domain_name.toLowerCase().includes(term)) ||
      (v.server_name && v.server_name.toLowerCase().includes(term))
    );
  });

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight text-slate-100">Virtual MTAs (VMTAs)</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
              {vmtas.length} Mappings
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Map sending IP addresses to dedicated sending domains and export Postfix or PowerMTA virtual routing rules.
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

          {selectedServerId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExportConfig(selectedServerId, configType)}
              className="border-slate-800 text-slate-300 hover:bg-slate-800"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export Config
            </Button>
          )}

          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => { closeModals(); setIsBulkModalOpen(true); }}
            className="border-slate-800 text-slate-300 hover:bg-slate-800"
          >
            <Layers className="h-3.5 w-3.5 mr-1.5" />
            Bulk Add
          </Button>

          <Button 
            size="sm" 
            onClick={() => { closeModals(); setIsAddModalOpen(true); }}
            className="bg-blue-600 hover:bg-blue-500 text-white"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add VMTA
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search VMTAs by name, IP, domain, or server..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <select
          value={selectedServerId}
          onChange={(e) => setSelectedServerId(e.target.value)}
          className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500"
        >
          <option value="">All Servers ({servers.length})</option>
          {servers.map((s) => (
            <option key={s.id} value={s.id}>{s.name} ({s.main_ip})</option>
          ))}
        </select>
      </div>

      {/* VMTAs Table */}
      <Card className="border-slate-800 bg-slate-900/60 shadow-xl backdrop-blur">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/80 text-xs font-semibold text-slate-400 border-b border-slate-800 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">VMTA Name</th>
                  <th className="px-6 py-4">Target Server</th>
                  <th className="px-6 py-4">Outbound Source IP</th>
                  <th className="px-6 py-4">Sending Domain</th>
                  <th className="px-6 py-4">HELO Hostname</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
                      Loading VMTAs...
                    </td>
                  </tr>
                ) : isError ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-rose-400">
                      <AlertCircle className="h-6 w-6 mx-auto mb-2" />
                      Failed to load VMTAs.
                    </td>
                  </tr>
                ) : filteredVMTAs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                      <Network className="h-8 w-8 mx-auto mb-2 text-slate-600" />
                      <p className="text-sm font-medium text-slate-300">No Virtual MTAs registered</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Add a VMTA to pair outbound secondary IPs with authenticated sending domains.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredVMTAs.map((vmta) => (
                    <tr key={vmta.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="h-2 w-2 rounded-full bg-amber-400" />
                          <span className="font-mono font-semibold text-slate-100">{vmta.vmta_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-300 font-medium text-xs">
                        {vmta.server_name || "—"}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-blue-400">
                        {vmta.ip_address}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-300 font-medium">
                        {vmta.domain_name || "—"}
                      </td>
                      <td className="px-6 py-4 text-xs font-mono text-slate-400">
                        {vmta.host_name || "—"}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {vmta.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleDeleteVmta(vmta.id, vmta.vmta_name)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                          title="Delete VMTA"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
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

      {/* Add VMTA Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 !m-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Network className="h-5 w-5 text-amber-400" />
                <h3 className="font-semibold text-slate-100">Add Virtual MTA (VMTA)</h3>
              </div>
              <button onClick={closeModals} className="text-slate-400 hover:text-slate-200">✕</button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">Target Server *</label>
                <select
                  required
                  value={formServerId}
                  onChange={(e) => setFormServerId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select Server</option>
                  {servers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.main_ip})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">Outbound IP Address *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 198.51.100.20"
                  value={ipAddress}
                  onChange={(e) => setIpAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">VMTA Pool Name</label>
                <input
                  type="text"
                  placeholder="e.g. vmta_ip_1 (optional, auto-generated if empty)"
                  value={vmtaName}
                  onChange={(e) => setVmtaName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">Sending Domain</label>
                <input
                  type="text"
                  placeholder="e.g. newsletter.example.com"
                  value={domainName}
                  onChange={(e) => setDomainName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">HELO Hostname</label>
                <input
                  type="text"
                  placeholder="e.g. mail1.example.com"
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3 border-t border-slate-800">
                <Button type="button" variant="outline" size="sm" onClick={closeModals} className="border-slate-800 text-slate-400">Cancel</Button>
                <Button type="submit" size="sm" disabled={isCreating} className="bg-blue-600 hover:bg-blue-500 text-white">
                  {isCreating ? "Creating..." : "Save VMTA"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Add Modal */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 !m-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-amber-400" />
                <h3 className="font-semibold text-slate-100">Bulk Create VMTAs</h3>
              </div>
              <button onClick={closeModals} className="text-slate-400 hover:text-slate-200">✕</button>
            </div>

            <form onSubmit={handleBulkSubmit} className="space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">{formError}</div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">Target Server *</label>
                <select
                  required
                  value={formServerId}
                  onChange={(e) => setFormServerId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select Server</option>
                  {servers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.main_ip})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  VMTAs Lines (Format: <span className="text-blue-400">vmta_name:ip:domain</span> or <span className="text-blue-400">ip:domain</span>)
                </label>
                <textarea
                  rows={6}
                  required
                  placeholder="vmta_01:198.51.100.11:domain1.com&#10;vmta_02:198.51.100.12:domain2.com"
                  value={bulkLines}
                  onChange={(e) => setBulkLines(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3 border-t border-slate-800">
                <Button type="button" variant="outline" size="sm" onClick={closeModals} className="border-slate-800 text-slate-400">Cancel</Button>
                <Button type="submit" size="sm" disabled={isBulkCreating} className="bg-blue-600 hover:bg-blue-500 text-white">
                  {isBulkCreating ? "Importing..." : "Bulk Import"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Export Config Modal */}
      {isConfigModalOpen && (
        <div className="fixed inset-0 !m-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Download className="h-5 w-5 text-blue-400" />
                <h3 className="font-semibold text-slate-100">Generated MTA Virtual Configuration</h3>
              </div>
              <button onClick={closeModals} className="text-slate-400 hover:text-slate-200">✕</button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setConfigType("postfix"); handleExportConfig(selectedServerId, "postfix"); }}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold ${configType === "postfix" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400"}`}
                >
                  Postfix Format
                </button>
                <button
                  type="button"
                  onClick={() => { setConfigType("powermta"); handleExportConfig(selectedServerId, "powermta"); }}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold ${configType === "powermta" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400"}`}
                >
                  PowerMTA Format
                </button>
              </div>

              <Button size="sm" onClick={handleCopyConfig} className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs">
                {copied ? <Check className="h-3.5 w-3.5 mr-1 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                {copied ? "Copied!" : "Copy Config"}
              </Button>
            </div>

            <pre className="p-4 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 max-h-80 overflow-y-auto whitespace-pre">
              {generatedConfig}
            </pre>

            <div className="flex justify-end">
              <Button size="sm" onClick={closeModals} className="bg-blue-600 hover:bg-blue-500 text-white">Done</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function VMTAsListPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading VMTAs...</div>}>
      <VMTAsContent />
    </Suspense>
  );
}
