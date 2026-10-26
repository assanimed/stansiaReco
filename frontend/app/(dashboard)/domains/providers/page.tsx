"use client";

import React, { useState } from "react";
import { 
  Building2, 
  Plus, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  ExternalLink, 
  KeyRound, 
  ShieldCheck, 
  Trash2, 
  Edit3, 
  AlertCircle,
  Globe,
  Zap,
  Lock
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  useGetDomainProvidersQuery,
  useCreateDomainProviderMutation,
  useUpdateDomainProviderMutation,
  useDeleteDomainProviderMutation,
  useTestDomainProviderMutation,
  useSyncDomainProviderMutation,
  useGetOutboundIPQuery,
  DomainProvider,
} from "@/lib/store/api/domains-api";
import { notify } from "@/lib/notifications/notification-store";
import { confirmAction } from "@/lib/dialogs/confirm-dialog-service";

export default function DomainProvidersPage() {
  const { data: providers = [], isLoading, refetch } = useGetDomainProvidersQuery();
  const { data: outboundData } = useGetOutboundIPQuery();
  const [createProvider, { isLoading: isCreating }] = useCreateDomainProviderMutation();
  const [updateProvider, { isLoading: isUpdating }] = useUpdateDomainProviderMutation();
  const [deleteProvider] = useDeleteDomainProviderMutation();
  const [testProvider] = useTestDomainProviderMutation();
  const [syncProvider] = useSyncDomainProviderMutation();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<DomainProvider | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string; latency?: string }>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    provider_type: "namecheap",
    name: "",
    api_user: "",
    account_user: "",
    api_key: "",
    api_secret: "",
    client_ip: "",
    environment: "production",
    notes: "",
  });

  const openCreateModal = () => {
    setEditingProvider(null);
    setFormData({
      provider_type: "namecheap",
      name: "",
      api_user: "",
      account_user: "",
      api_key: "",
      api_secret: "",
      client_ip: "",
      environment: "production",
      notes: "",
    });
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const openEditModal = (p: DomainProvider) => {
    setEditingProvider(p);
    setFormData({
      provider_type: p.provider_type,
      name: p.name,
      api_user: p.api_user,
      account_user: p.account_user,
      api_key: "",
      api_secret: "",
      client_ip: p.client_ip,
      environment: p.environment,
      notes: p.notes || "",
    });
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    try {
      if (editingProvider) {
        await updateProvider({
          id: editingProvider.id,
          name: formData.name,
          api_user: formData.api_user,
          account_user: formData.account_user,
          api_key: formData.api_key || undefined,
          api_secret: formData.api_secret || undefined,
          client_ip: formData.client_ip,
          environment: formData.environment,
          notes: formData.notes,
        }).unwrap();
      } else {
        await createProvider({
          provider_type: formData.provider_type,
          name: formData.name,
          api_user: formData.api_user,
          account_user: formData.account_user || formData.api_user,
          api_key: formData.api_key,
          api_secret: formData.api_secret,
          client_ip: formData.client_ip,
          environment: formData.environment,
          notes: formData.notes,
        }).unwrap();
        notify.success("Domain provider added successfully.");
      }
      setIsModalOpen(false);
      refetch();
    } catch (err: any) {
      setErrorMessage(err?.data?.error?.message || err?.message || "Failed to save provider");
      notify.error(err, { title: "Failed to save provider" });
    }
  };

  const handleTestConnection = async (id: string) => {
    setTestingId(id);
    try {
      const res = await testProvider(id).unwrap();
      setTestResults((prev) => ({ ...prev, [id]: res }));
      if (res.success) {
        notify.success(res.message, { title: "Provider Connection Verified" });
      } else {
        notify.error(res.message, { title: "Connection Failed", openDialog: true });
      }
    } catch (err: any) {
      const msg = err?.data?.error?.message || err?.message || "Connection check failed";
      setTestResults((prev) => ({
        ...prev,
        [id]: { success: false, message: msg },
      }));
      notify.error(err, { title: "Connection Verification Failed", openDialog: true });
    } finally {
      setTestingId(null);
    }
  };

  const handleSync = async (id: string, name?: string) => {
    setSyncingId(id);
    const displayName = name || "registrar";
    const loadingId = notify.loading(`Synchronizing domains with ${displayName}...`);
    try {
      const res = await syncProvider(id).unwrap();
      notify.update(loadingId, {
        type: "success",
        title: "Synchronization Complete",
        message: `Successfully synchronized ${res.synced_count} domain(s).`,
      });
      refetch();
    } catch (err: any) {
      notify.dismiss(loadingId);
      notify.error(err, {
        title: `Failed to synchronize with ${displayName}`,
        openDialog: true,
      });
    } finally {
      setSyncingId(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const confirmed = await confirmAction({
      title: "Remove Domain Provider",
      message: `Are you sure you want to remove domain provider "${name}"? Associated domains will be detached from API automation.`,
      confirmLabel: "Remove Provider",
      variant: "destructive",
    });
    if (!confirmed) return;

    try {
      await deleteProvider(id).unwrap();
      notify.success(`Domain provider "${name}" removed successfully.`);
      refetch();
    } catch (err: any) {
      notify.error(err, { title: "Failed to remove provider" });
    }
  };

  const getProviderBadge = (type: string) => {
    switch (type.toLowerCase()) {
      case "namecheap":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/20">
            Namecheap
          </span>
        );
      case "name.com":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Name.com
          </span>
        );
      case "godaddy":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            GoDaddy
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
            {type}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2.5">
            <Building2 className="h-6 w-6 text-blue-400" />
            Domains Providers
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Configure registrar integrations and encrypted API credentials for Namecheap, Name.com, and GoDaddy.
          </p>
        </div>
        <Button onClick={openCreateModal} className="bg-blue-600 hover:bg-blue-500 text-white">
          <Plus className="h-4 w-4 mr-1.5" />
          Add Domain Provider
        </Button>
      </div>

      {/* Providers Grid / Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {providers.length === 0 ? (
          <div className="col-span-full">
            <Card className="border-dashed border-slate-800 bg-slate-900/40">
              <CardContent className="py-12 text-center text-slate-400">
                <Globe className="h-10 w-10 mx-auto mb-3 text-slate-600" />
                <h3 className="text-base font-semibold text-slate-200">No domain providers configured</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Add Namecheap, Name.com, or GoDaddy with your registrar API credentials to automate domain tracking and DNS provisioning.
                </p>
                <Button onClick={openCreateModal} size="sm" className="mt-4 bg-blue-600 hover:bg-blue-500 text-white">
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Configure First Provider
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          providers.map((p) => {
            const testResult = testResults[p.id];
            return (
              <Card key={p.id} className="border-slate-800 bg-slate-900/70 hover:border-slate-700 transition-colors">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                        {p.name}
                      </h3>
                      <div className="mt-1.5 flex items-center gap-2">
                        {getProviderBadge(p.provider_type)}
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 uppercase">
                          {p.environment}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => openEditModal(p)}
                        className="h-8 w-8 p-0 text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                        title="Edit Provider"
                      >
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleDelete(p.id, p.name)}
                        className="h-8 w-8 p-0 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
                        title="Delete Provider"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-800/80 text-xs">
                    {p.provider_type === "godaddy" ? (
                      <>
                        <div className="flex justify-between py-1 text-slate-400">
                          <span>Auth Mode:</span>
                          <span className="font-mono text-emerald-400">
                            {p.has_api_secret ? "Classic Key + Secret (sso-key)" : "Personal Access Token (PAT)"}
                          </span>
                        </div>
                        {p.api_user && (
                          <div className="flex justify-between py-1 text-slate-400">
                            <span>Shopper ID:</span>
                            <span className="font-mono text-slate-200">{p.api_user}</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex justify-between py-1 text-slate-400">
                        <span>API User:</span>
                        <span className="font-mono text-slate-200">{p.api_user || "—"}</span>
                      </div>
                    )}

                    {p.client_ip && (
                      <div className="flex justify-between py-1 text-slate-400">
                        <span>Whitelisted IP:</span>
                        <span className="font-mono text-slate-200">{p.client_ip}</span>
                      </div>
                    )}

                    <div className="flex justify-between py-1 text-slate-400">
                      <span>Key Protection:</span>
                      <span className="flex items-center gap-1 text-emerald-400 font-medium">
                        <Lock className="h-3 w-3" />
                        AES-256 Encrypted
                      </span>
                    </div>

                    <div className="flex justify-between py-1 text-slate-400">
                      <span>Managed Domains:</span>
                      <span className="font-mono font-bold text-blue-400">{p.domain_count}</span>
                    </div>

                    {p.notes && (
                      <p className="text-[11px] text-slate-500 italic pt-1">{p.notes}</p>
                    )}
                  </div>

                  {/* Test Connection Banner */}
                  {testResult && (
                    <div
                      className={`p-2.5 rounded-lg text-xs flex items-start gap-2 ${
                        testResult.success
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                      }`}
                    >
                      {testResult.success ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 leading-relaxed">
                        <span>{testResult.message}</span>
                        {testResult.latency && (
                          <span className="block text-[10px] opacity-75 font-mono">Response: {testResult.latency}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTestConnection(p.id)}
                      disabled={testingId === p.id}
                      className="flex-1 h-8 text-xs border-slate-800 text-slate-300 hover:bg-slate-800"
                    >
                      <Zap className={`h-3.5 w-3.5 mr-1.5 ${testingId === p.id ? "animate-pulse text-amber-400" : "text-amber-400"}`} />
                      {testingId === p.id ? "Checking..." : "Test Connection"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSync(p.id, p.name)}
                      disabled={syncingId === p.id}
                      className="flex-1 h-8 text-xs border-slate-800 text-slate-300 hover:bg-slate-800"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncingId === p.id ? "animate-spin" : ""}`} />
                      {syncingId === p.id ? "Syncing..." : "Sync Domains"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 !m-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-blue-400" />
                {editingProvider ? "Edit Domain Provider" : "Add Domain Provider"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-mono"
              >
                ✕
              </button>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              {/* Provider Type */}
              {!editingProvider && (
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Registrar Provider Type</label>
                  <select
                    value={formData.provider_type}
                    onChange={(e) => setFormData({ ...formData, provider_type: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 font-medium"
                  >
                    <option value="namecheap">Namecheap (API User, API Key, Whitelisted IP)</option>
                    <option value="godaddy">GoDaddy (Personal Access Token PAT or Classic API Key &amp; Secret)</option>
                    <option value="name.com">Name.com (Username, API Token)</option>
                  </select>
                </div>
              )}

              {/* Display Name */}
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Configuration Name</label>
                <input
                  type="text"
                  required
                  placeholder={formData.provider_type === "godaddy" ? "e.g. Primary GoDaddy Account" : "e.g. Primary Namecheap Account"}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Provider Specific Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    {formData.provider_type === "godaddy" ? "Shopper ID (Optional)" : "API Username"}
                  </label>
                  <input
                    type="text"
                    required={formData.provider_type !== "godaddy"}
                    placeholder={formData.provider_type === "godaddy" ? "Optional (e.g. 123456789)" : "my_registrar_user"}
                    value={formData.api_user}
                    onChange={(e) => setFormData({ ...formData, api_user: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Environment</label>
                  <select
                    value={formData.environment}
                    onChange={(e) => setFormData({ ...formData, environment: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 font-medium"
                  >
                    <option value="production">Production (api.godaddy.com)</option>
                    <option value="ote">OTE / Sandbox (api.ote-godaddy.com)</option>
                    <option value="sandbox">Sandbox / Testing</option>
                  </select>
                </div>
              </div>

              {/* API Key / Personal Access Token */}
              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  {formData.provider_type === "godaddy"
                    ? "Personal Access Token (PAT) or Classic API Key"
                    : "API Key / Token"}
                  {editingProvider && " (Leave blank to keep current)"}
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <input
                    type="password"
                    required={!editingProvider}
                    placeholder={
                      formData.provider_type === "godaddy"
                        ? "Paste GoDaddy PAT (Bearer) or Classic API Key"
                        : "••••••••••••••••••••••••"
                    }
                    value={formData.api_key}
                    onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>

              {/* GoDaddy API Secret (Optional for PAT, Required for Classic sso-key) */}
              {formData.provider_type === "godaddy" && (
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    API Secret{" "}
                    <span className="text-slate-500 font-normal">
                      (Leave blank if using a Personal Access Token / PAT)
                    </span>
                  </label>
                  <input
                    type="password"
                    placeholder={
                      editingProvider && editingProvider.has_api_secret
                        ? "Leave blank to keep secret, or type __CLEAR__ to switch to PAT"
                        : "Only required for Classic API Key (sso-key)"
                    }
                    value={formData.api_secret}
                    onChange={(e) => setFormData({ ...formData, api_secret: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 font-mono"
                  />
                  <p className="text-[10px] text-slate-500 mt-1.5 leading-normal">
                    Supports both GoDaddy <strong className="text-slate-300">Personal Access Tokens (PAT)</strong>{" "}
                    (<code className="text-emerald-400">Authorization: Bearer</code> with scopes{" "}
                    <code className="text-slate-300">domains.domain:read</code>,{" "}
                    <code className="text-slate-300">domains.dns:update</code>) and{" "}
                    <strong className="text-slate-300">Classic API Keys</strong>{" "}
                    (<code className="text-emerald-400">Authorization: sso-key KEY:SECRET</code>).
                  </p>
                </div>
              )}

              {/* Namecheap Whitelisted Client IP */}
              {formData.provider_type === "namecheap" && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-slate-400 font-semibold">
                      Whitelisted Client IP Address
                    </label>
                    {outboundData?.outbound_ip && (
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, client_ip: outboundData.outbound_ip })}
                        className="text-[11px] text-blue-400 hover:text-blue-300 font-mono flex items-center gap-1 transition-colors"
                      >
                        <span>Detected: {outboundData.outbound_ip}</span>
                        <span className="underline font-sans">(Use this)</span>
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. 41.92.116.80 (Registered in Namecheap profile)"
                    value={formData.client_ip}
                    onChange={(e) => setFormData({ ...formData, client_ip: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 font-mono"
                  />
                  <p className="text-[10px] text-slate-500 mt-1 leading-normal">
                    Namecheap API verifies the public IP making the request. You must add this IP in{" "}
                    <strong className="text-slate-400 font-mono">Namecheap Profile &gt; Tools &gt; Namecheap API Access &gt; Whitelisted IPs</strong>.
                  </p>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Notes / Description (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Optional internal notes or billing details..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  className="border-slate-800 text-slate-400"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isCreating || isUpdating}
                  className="bg-blue-600 hover:bg-blue-500 text-white"
                >
                  {isCreating || isUpdating ? "Saving..." : editingProvider ? "Save Changes" : "Save Provider"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
