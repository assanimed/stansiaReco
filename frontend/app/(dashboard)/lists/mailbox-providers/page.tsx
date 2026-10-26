"use client";

import React, { useState } from "react";
import {
  Inbox,
  Plus,
  Search,
  RefreshCw,
  Edit2,
  CheckCircle2,
  XCircle,
  Layers,
  Globe,
  Tag,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useGetMailboxProvidersQuery,
  useCreateMailboxProviderMutation,
  useUpdateMailboxProviderMutation,
  MailboxProvider,
} from "@/lib/store/api/lists-api";
import { notify } from "@/lib/notifications/notification-store";
import { confirmAction } from "@/lib/dialogs/confirm-dialog-service";

export default function MailboxProvidersPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");

  const { data: providersData, isLoading, isFetching, refetch } = useGetMailboxProvidersQuery();
  const [createProvider, { isLoading: isCreating }] = useCreateMailboxProviderMutation();
  const [updateProvider, { isLoading: isUpdating }] = useUpdateMailboxProviderMutation();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<MailboxProvider | null>(null);

  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formDomains, setFormDomains] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);

  const providers = (providersData?.providers || []).filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.domains.some((d) => d.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;
    if (filterActive === "active") return p.is_active;
    if (filterActive === "inactive") return !p.is_active;
    return true;
  });

  const handleOpenCreate = () => {
    setEditingProvider(null);
    setFormName("");
    setFormCode("");
    setFormDomains("");
    setFormDescription("");
    setFormIsActive(true);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (provider: MailboxProvider) => {
    setEditingProvider(provider);
    setFormName(provider.name);
    setFormCode(provider.code);
    setFormDomains(provider.domains.join(", "));
    setFormDescription(provider.description || "");
    setFormIsActive(provider.is_active);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName) return;

    const domainList = formDomains
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter((d) => d.length > 0);

    try {
      if (editingProvider) {
        await updateProvider({
          id: editingProvider.id,
          name: formName.trim(),
          domains: domainList,
          description: formDescription.trim() || undefined,
          is_active: formIsActive,
        }).unwrap();
        notify.success("Mailbox provider updated successfully.");
      } else {
        if (!formCode) {
          notify.error("Provider code is required.");
          return;
        }
        await createProvider({
          name: formName.trim(),
          code: formCode.trim().toLowerCase(),
          domains: domainList,
          description: formDescription.trim() || undefined,
          is_active: formIsActive,
        }).unwrap();
        notify.success("Mailbox provider created successfully.");
      }

      setIsModalOpen(false);
    } catch (err: any) {
      notify.error(err?.data?.error || "Failed to save mailbox provider.");
    }
  };

  const handleToggleStatus = async (provider: MailboxProvider) => {
    const nextState = !provider.is_active;
    const confirmed = await confirmAction({
      title: `${nextState ? "Activate" : "Deactivate"} Mailbox Provider`,
      message: `Are you sure you want to ${nextState ? "activate" : "deactivate"} ${provider.name}?`,
      confirmLabel: nextState ? "Activate" : "Deactivate",
      variant: "default",
    });

    if (!confirmed) return;

    try {
      await updateProvider({
        id: provider.id,
        is_active: nextState,
      }).unwrap();
      notify.success(`${provider.name} ${nextState ? "activated" : "deactivated"}.`);
    } catch (err: any) {
      notify.error(err?.data?.error || "Failed to update provider status.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2.5">
            <Inbox className="h-7 w-7 text-blue-500" />
            Mailbox Providers
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Maintain worldwide destination mailbox providers, MX domains mapping, and list counts.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="border-slate-800 text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw className={cn("h-4 w-4 mr-1.5", isFetching && "animate-spin")} />
            Refresh
          </Button>

          <Button onClick={handleOpenCreate} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-4 w-4 mr-1.5" />
            Add Provider
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card className="bg-slate-900/60 border-slate-800">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search by provider name, code, or domain..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-950/70 border border-slate-800 rounded-md text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={filterActive}
                onChange={(e) => setFilterActive(e.target.value as any)}
                className="px-3 py-2 bg-slate-950/70 border border-slate-800 rounded-md text-sm text-slate-300 focus:outline-none focus:border-blue-500"
              >
                <option value="all">All Providers ({providersData?.providers.length || 0})</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-slate-900/60 border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-xs font-semibold uppercase text-slate-400 tracking-wider">
              <tr>
                <th className="px-4 py-3.5">Provider Name</th>
                <th className="px-4 py-3.5">Code</th>
                <th className="px-4 py-3.5">Associated Domains</th>
                <th className="px-4 py-3.5 text-center">Active Status</th>
                <th className="px-4 py-3.5 text-right">Associated Lists</th>
                <th className="px-4 py-3.5">Created Date</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
                    Loading mailbox providers...
                  </td>
                </tr>
              ) : providers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                    No mailbox providers found.
                  </td>
                </tr>
              ) : (
                providers.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3.5 font-medium text-slate-100">
                      <div>{p.name}</div>
                      {p.description && <div className="text-xs text-slate-500 font-normal mt-0.5">{p.description}</div>}
                    </td>

                    <td className="px-4 py-3.5 font-mono text-xs text-slate-300">
                      <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">{p.code}</span>
                    </td>

                    <td className="px-4 py-3.5 max-w-xs">
                      <div className="flex flex-wrap gap-1">
                        {p.domains.slice(0, 4).map((d) => (
                          <span key={d} className="px-1.5 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                            {d}
                          </span>
                        ))}
                        {p.domains.length > 4 && (
                          <span className="px-1.5 py-0.5 rounded text-[11px] bg-slate-800 text-slate-400 font-mono">
                            +{p.domains.length - 4} more
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-center">
                      <button
                        onClick={() => handleToggleStatus(p)}
                        className="inline-flex items-center gap-1.5 text-xs focus:outline-none"
                      >
                        {p.is_active ? (
                          <span className="inline-flex items-center text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700 font-medium">
                            <XCircle className="h-3.5 w-3.5 mr-1" />
                            Inactive
                          </span>
                        )}
                      </button>
                    </td>

                    <td className="px-4 py-3.5 text-right font-mono font-medium text-slate-200">
                      {(p.lists_count ?? 0).toLocaleString()}
                    </td>

                    <td className="px-4 py-3.5 text-xs text-slate-400">
                      {new Date(p.created_at).toLocaleDateString()}
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenEdit(p)}
                        className="h-8 px-2 text-slate-400 hover:text-white hover:bg-slate-800"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <Inbox className="h-4 w-4 text-blue-500" />
                {editingProvider ? "Edit Mailbox Provider" : "Create Mailbox Provider"}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Provider Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Gmail"
                  value={formName}
                  onChange={(e) => {
                    setFormName(e.target.value);
                    if (!editingProvider && !formCode) {
                      setFormCode(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""));
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Provider Code *</label>
                <input
                  type="text"
                  required
                  disabled={!!editingProvider}
                  placeholder="e.g. gmail"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 font-mono disabled:opacity-60 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Associated Domains (Comma separated)
                </label>
                <input
                  type="text"
                  placeholder="gmail.com, googlemail.com"
                  value={formDomains}
                  onChange={(e) => setFormDomains(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Description (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Notes about destination provider..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="providerActive"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="rounded border-slate-800 text-blue-600 focus:ring-0"
                />
                <label htmlFor="providerActive" className="text-xs text-slate-300">
                  Provider is active and available for list association
                </label>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  className="border-slate-800 text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isCreating || isUpdating} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {isCreating || isUpdating ? "Saving..." : "Save Provider"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
