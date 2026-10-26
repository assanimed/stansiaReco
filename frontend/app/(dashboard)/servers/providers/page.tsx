"use client";

import React, { useState } from "react";
import { 
  useGetProvidersQuery, 
  useCreateProviderMutation, 
  useUpdateProviderMutation, 
  useDeleteProviderMutation 
} from "@/lib/store/api/servers-api";
import { 
  Building2, 
  Plus, 
  ExternalLink, 
  CheckCircle2, 
  XCircle, 
  Search, 
  Trash2, 
  Edit3, 
  AlertCircle,
  RefreshCw
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ServerProvider } from "@/lib/api/servers";
import { notify } from "@/lib/notifications/notification-store";
import { confirmAction } from "@/lib/dialogs/confirm-dialog-service";

export default function ServerProvidersPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ServerProvider | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [port25Open, setPort25Open] = useState(true);
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState("");

  const { data: providers = [], isLoading, isError, refetch } = useGetProvidersQuery();
  const [createProvider, { isLoading: isCreating }] = useCreateProviderMutation();
  const [updateProvider, { isLoading: isUpdating }] = useUpdateProviderMutation();
  const [deleteProvider] = useDeleteProviderMutation();

  const closeModal = () => {
    setIsAddModalOpen(false);
    setEditingProvider(null);
    setName("");
    setPort25Open(true);
    setWebsite("");
    setDescription("");
    setFormError("");
  };

  const openEditModal = (p: ServerProvider) => {
    setEditingProvider(p);
    setName(p.name);
    setPort25Open(p.port_25_open);
    setWebsite(p.website || "");
    setDescription(p.description || "");
    setFormError("");
    setIsAddModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError("Provider name is required");
      return;
    }

    try {
      if (editingProvider) {
        await updateProvider({
          id: editingProvider.id,
          payload: { 
            name: name.trim(), 
            port_25_open: port25Open, 
            website: website.trim(), 
            description: description.trim() 
          },
        }).unwrap();
        notify.success(`Provider "${name.trim()}" updated successfully.`);
      } else {
        await createProvider({
          name: name.trim(),
          port_25_open: port25Open,
          website: website.trim(),
          description: description.trim(),
        }).unwrap();
        notify.success(`Provider "${name.trim()}" registered successfully.`);
      }
      closeModal();
    } catch (err: any) {
      const errorMsg = err?.data?.error?.message || err?.message || "Failed to save provider";
      setFormError(errorMsg);
      notify.error(err, { fallbackMessage: "Failed to save provider" });
    }
  };

  const handleDelete = async (provider: ServerProvider) => {
    const confirmed = await confirmAction({
      title: "Delete Server Provider",
      message: `Are you sure you want to delete provider "${provider.name}"? This action cannot be undone.`,
      confirmText: "Delete Provider",
      isDestructive: true,
    });
    if (!confirmed) return;

    try {
      await deleteProvider(provider.id).unwrap();
      notify.success(`Provider "${provider.name}" deleted successfully.`);
    } catch (err: any) {
      notify.error(err, { fallbackMessage: `Failed to delete provider "${provider.name}".` });
    }
  };

  const filteredProviders = providers.filter((p) => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <>
      <div className="space-y-6">
        {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight text-slate-100">Servers Providers</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
              {providers.length} Registered
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Manage infrastructure providers, dedicated hosts, and inspect outbound port 25 email delivery availability.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()} 
            className="border-slate-800 hover:bg-slate-800 text-slate-300"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
          <Button 
            size="sm" 
            onClick={() => { closeModal(); setIsAddModalOpen(true); }}
            className="bg-blue-600 hover:bg-blue-500 text-white"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Server Provider
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search provider by name or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Providers Table Card */}
      <Card className="border-slate-800 bg-slate-900/60 shadow-xl backdrop-blur">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/80 text-xs font-semibold text-slate-400 border-b border-slate-800 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Provider Name</th>
                  <th className="px-6 py-4">Port 25 Status</th>
                  <th className="px-6 py-4">Website</th>
                  <th className="px-6 py-4">Description</th>
                  <th className="px-6 py-4 text-center">Servers</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
                      Loading server providers...
                    </td>
                  </tr>
                ) : isError ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-rose-400">
                      <AlertCircle className="h-6 w-6 mx-auto mb-2" />
                      Failed to load server providers. Please ensure backend is running.
                    </td>
                  </tr>
                ) : filteredProviders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                      <Building2 className="h-8 w-8 mx-auto mb-2 text-slate-600" />
                      <p className="text-sm font-medium text-slate-300">No server providers found</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Add a new cloud or dedicated server provider to begin organizing inventory.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredProviders.map((provider) => (
                    <tr key={provider.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-slate-800 border border-slate-700/80 flex items-center justify-center text-blue-400 font-bold text-xs">
                            {provider.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-semibold text-slate-100">{provider.name}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {provider.port_25_open ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                            Port 25 Open (Unblocked)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <XCircle className="h-3.5 w-3.5 text-amber-400" />
                            Port 25 Blocked by Default
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {provider.website ? (
                          <a 
                            href={provider.website} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2"
                          >
                            <span>{provider.website.replace(/^https?:\/\//, "")}</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-slate-500 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 max-w-xs">
                        <p className="text-xs text-slate-400 truncate" title={provider.description}>
                          {provider.description || "—"}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-xs font-mono font-medium">
                          {provider.server_count}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEditModal(provider)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition-colors"
                            title="Edit Provider"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(provider)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                            title="Delete Provider"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
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

      {/* Add / Edit Provider Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 !m-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <Building2 className="h-5 w-5 text-blue-400" />
                <h3 className="font-semibold text-slate-100">
                  {editingProvider ? "Edit Server Provider" : "Add New Server Provider"}
                </h3>
              </div>
              <button 
                onClick={closeModal} 
                className="text-slate-400 hover:text-slate-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
              {formError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Provider Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. OVHcloud, Contabo, Scaleway"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Port 25 Toggle */}
              <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold text-slate-200 block">Outbound Port 25 Open</span>
                  <span className="text-xs text-slate-400 block mt-0.5">
                    Is port 25 outbound unblocked by default for email sending on this provider?
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={port25Open}
                    onChange={(e) => setPort25Open(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Website URL
                </label>
                <input
                  type="url"
                  placeholder="https://provider.example.com"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Description / PTR & Unblock Notes
                </label>
                <textarea
                  rows={3}
                  placeholder="Notes on reverse DNS (PTR), default firewall policies, or unblock ticket requirements..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800">
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={closeModal}
                  className="border-slate-800 text-slate-400 hover:bg-slate-800"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  size="sm" 
                  disabled={isCreating || isUpdating}
                  className="bg-blue-600 hover:bg-blue-500 text-white"
                >
                  {isCreating || isUpdating ? "Saving..." : editingProvider ? "Update Provider" : "Create Provider"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
