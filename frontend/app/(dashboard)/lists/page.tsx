"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Mail,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  Archive,
  Play,
  Pause,
  UploadCloud,
  Eye,
  Edit2,
  ArrowUpDown,
  RefreshCw,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  Database,
  Globe,
  Tag,
  BarChart3,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useGetMailListsQuery,
  useGetGlobalSummaryQuery,
  useGetMailboxProvidersQuery,
  useGetCountriesQuery,
  useGetVerticalsQuery,
  useCreateMailListMutation,
  useUpdateMailListMutation,
  useSetMailListStatusMutation,
  MailList,
} from "@/lib/store/api/lists-api";
import { notify } from "@/lib/notifications/notification-store";
import { confirmAction } from "@/lib/dialogs/confirm-dialog-service";

export default function MailListsPage() {
  // Query parameters & filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedCountry, setSelectedCountry] = useState("");
  const [selectedVertical, setSelectedVertical] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 15;

  // Data fetching
  const { data: summary, isLoading: isSummaryLoading } = useGetGlobalSummaryQuery();
  const {
    data: listsData,
    isLoading: isListsLoading,
    isFetching,
    refetch,
  } = useGetMailListsQuery({
    search: searchTerm || undefined,
    provider_id: selectedProvider || undefined,
    country_id: selectedCountry || undefined,
    vertical_id: selectedVertical || undefined,
    status: selectedStatus || undefined,
    page,
    per_page: perPage,
  });

  const { data: providersData } = useGetMailboxProvidersQuery();
  const { data: countriesData } = useGetCountriesQuery();
  const { data: verticalsData } = useGetVerticalsQuery();

  // Mutations
  const [createMailList, { isLoading: isCreating }] = useCreateMailListMutation();
  const [updateMailList, { isLoading: isUpdating }] = useUpdateMailListMutation();
  const [setMailListStatus] = useSetMailListStatusMutation();

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingList, setEditingList] = useState<MailList | null>(null);

  // Create form state
  const [createForm, setCreateForm] = useState({
    name: "",
    code: "",
    mailbox_provider_id: "",
    country_id: "",
    vertical_id: "",
    description: "",
  });

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
  });

  // Auto-generate suggested code
  const handleCreateFieldChange = (field: string, value: string) => {
    const updated = { ...createForm, [field]: value };

    if (field === "name" || field === "mailbox_provider_id" || field === "country_id" || field === "vertical_id") {
      const provider = providersData?.providers.find((p) => p.id === (field === "mailbox_provider_id" ? value : updated.mailbox_provider_id));
      const country = countriesData?.countries.find((c) => c.id === (field === "country_id" ? value : updated.country_id));
      const vertical = verticalsData?.verticals.find((v) => v.id === (field === "vertical_id" ? value : updated.vertical_id));

      const parts: string[] = [];
      if (provider?.code) parts.push(provider.code.toLowerCase().replace(/[^a-z0-9]/g, ""));
      if (country?.code) parts.push(country.code.toLowerCase());
      if (vertical?.code) parts.push(vertical.code.toLowerCase().replace(/[^a-z0-9]/g, ""));
      if (updated.name) {
        const cleanName = updated.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 20);
        if (cleanName && !parts.includes(cleanName)) parts.push(cleanName);
      }

      if (parts.length > 0) {
        updated.code = parts.join("_");
      }
    }

    setCreateForm(updated);
  };

  const handleOpenCreateModal = () => {
    setCreateForm({
      name: "",
      code: "",
      mailbox_provider_id: providersData?.providers[0]?.id || "",
      country_id: countriesData?.countries[0]?.id || "",
      vertical_id: verticalsData?.verticals[0]?.id || "",
      description: "",
    });
    setIsCreateModalOpen(true);
  };

  const handleSaveCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name || !createForm.mailbox_provider_id || !createForm.country_id || !createForm.vertical_id) {
      notify.error("Please fill in all required fields.");
      return;
    }

    try {
      await createMailList({
        name: createForm.name.trim(),
        code: createForm.code.trim() || undefined,
        mailbox_provider_id: createForm.mailbox_provider_id,
        country_id: createForm.country_id,
        vertical_id: createForm.vertical_id,
        description: createForm.description.trim() || undefined,
      }).unwrap();

      notify.success("Mail list created successfully.");
      setIsCreateModalOpen(false);
    } catch (err: any) {
      notify.error(err?.data?.error || "Failed to create mail list.");
    }
  };

  const handleOpenEditModal = (list: MailList) => {
    setEditingList(list);
    setEditForm({
      name: list.name,
      description: list.description || "",
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingList || !editForm.name) return;

    try {
      await updateMailList({
        id: editingList.id,
        name: editForm.name.trim(),
        description: editForm.description.trim() || undefined,
      }).unwrap();

      notify.success("Mail list updated successfully.");
      setEditingList(null);
    } catch (err: any) {
      notify.error(err?.data?.error || "Failed to update mail list.");
    }
  };

  const handleToggleStatus = async (list: MailList) => {
    const nextStatus = list.status === "active" ? "paused" : "active";
    const confirmed = await confirmAction({
      title: `${nextStatus === "active" ? "Activate" : "Pause"} Mail List`,
      message: `Are you sure you want to change the status of "${list.name}" to ${nextStatus}?`,
      confirmLabel: nextStatus === "active" ? "Activate List" : "Pause List",
      variant: "default",
    });

    if (!confirmed) return;

    try {
      await setMailListStatus({ id: list.id, status: nextStatus }).unwrap();
      notify.success(`List status set to ${nextStatus}.`);
    } catch (err: any) {
      notify.error(err?.data?.error || "Failed to update list status.");
    }
  };

  const handleArchiveList = async (list: MailList) => {
    const confirmed = await confirmAction({
      title: "Archive Mail List",
      message: `Are you sure you want to archive "${list.name}"? Contacts and historical events will be preserved.`,
      confirmLabel: "Archive List",
      variant: "destructive",
    });

    if (!confirmed) return;

    try {
      await setMailListStatus({ id: list.id, status: "archived" }).unwrap();
      notify.success("Mail list archived.");
    } catch (err: any) {
      notify.error(err?.data?.error || "Failed to archive mail list.");
    }
  };

  const lists = listsData?.lists || [];
  const total = listsData?.total || 0;
  const totalPages = Math.ceil(total / perPage) || 1;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2.5">
            <Mail className="h-7 w-7 text-blue-500" />
            Mail Lists
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Browse, manage, and segment authorized contact lists by mailbox provider, country, and vertical.
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

          <Link href="/lists/imports">
            <Button variant="outline" size="sm" className="border-slate-800 text-slate-300 hover:bg-slate-800">
              <UploadCloud className="h-4 w-4 mr-1.5 text-blue-400" />
              Import Contacts
            </Button>
          </Link>

          <Button onClick={handleOpenCreateModal} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-4 w-4 mr-1.5" />
            Create List
          </Button>
        </div>
      </div>

      {/* Summary Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-slate-900/60 border-slate-800 backdrop-blur">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-slate-400">Total Lists</div>
            <div className="text-2xl font-bold text-slate-100 mt-1">
              {isSummaryLoading ? "—" : (summary?.total_lists ?? 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Configured segments</div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800 backdrop-blur">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-emerald-400">Active Lists</div>
            <div className="text-2xl font-bold text-emerald-400 mt-1">
              {isSummaryLoading ? "—" : (summary?.active_lists ?? 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Ready for delivery</div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800 backdrop-blur">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-blue-400">Total Contacts</div>
            <div className="text-2xl font-bold text-blue-400 mt-1">
              {isSummaryLoading ? "—" : (summary?.total_contacts ?? 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Across all lists</div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800 backdrop-blur">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-amber-400">Imports in Progress</div>
            <div className="text-2xl font-bold text-amber-400 mt-1">
              {isSummaryLoading ? "—" : (summary?.imports_in_progress ?? 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Worker streaming</div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800 backdrop-blur">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-rose-400">Failed Imports</div>
            <div className="text-2xl font-bold text-rose-400 mt-1">
              {isSummaryLoading ? "—" : (summary?.failed_imports ?? 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Requires review</div>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card className="bg-slate-900/60 border-slate-800">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="lg:col-span-2 relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search by list name or code..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-9 pr-3 py-2 bg-slate-950/70 border border-slate-800 rounded-md text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <select
                value={selectedProvider}
                onChange={(e) => {
                  setSelectedProvider(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 bg-slate-950/70 border border-slate-800 rounded-md text-sm text-slate-300 focus:outline-none focus:border-blue-500"
              >
                <option value="">All Providers</option>
                {providersData?.providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={selectedCountry}
                onChange={(e) => {
                  setSelectedCountry(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 bg-slate-950/70 border border-slate-800 rounded-md text-sm text-slate-300 focus:outline-none focus:border-blue-500"
              >
                <option value="">All Countries</option>
                {countriesData?.countries.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} - {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={selectedVertical}
                onChange={(e) => {
                  setSelectedVertical(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 bg-slate-950/70 border border-slate-800 rounded-md text-sm text-slate-300 focus:outline-none focus:border-blue-500"
              >
                <option value="">All Verticals</option>
                {verticalsData?.verticals.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 bg-slate-950/70 border border-slate-800 rounded-md text-sm text-slate-300 focus:outline-none focus:border-blue-500"
              >
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Mail Lists Table */}
      <Card className="bg-slate-900/60 border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-xs font-semibold uppercase text-slate-400 tracking-wider">
              <tr>
                <th className="px-4 py-3.5">List Name & Code</th>
                <th className="px-4 py-3.5">Mailbox Provider</th>
                <th className="px-4 py-3.5">Country</th>
                <th className="px-4 py-3.5">Vertical</th>
                <th className="px-4 py-3.5 text-right">Contacts</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Last Import</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {isListsLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
                    Loading mail lists...
                  </td>
                </tr>
              ) : lists.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-slate-400">
                    <FolderOpen className="h-10 w-10 mx-auto text-slate-600 mb-2" />
                    <div className="text-base font-medium text-slate-300">No mail lists found</div>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                      No lists match your search criteria. Create a new list or reset your filters.
                    </p>
                    <Button onClick={handleOpenCreateModal} size="sm" className="mt-4 bg-blue-600 hover:bg-blue-700">
                      <Plus className="h-4 w-4 mr-1.5" />
                      Create First List
                    </Button>
                  </td>
                </tr>
              ) : (
                lists.map((list) => {
                  const statusColors = {
                    active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                    paused: "bg-amber-500/10 text-amber-400 border-amber-500/20",
                    archived: "bg-slate-800 text-slate-400 border-slate-700",
                  };

                  return (
                    <tr key={list.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3.5">
                        <Link href={`/lists/${list.id}`} className="font-medium text-slate-100 hover:text-blue-400 transition-colors">
                          {list.name}
                        </Link>
                        <div className="text-xs font-mono text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <Tag className="h-3 w-3 text-slate-600" />
                          {list.code}
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="font-medium text-slate-200">{list.mailbox_provider_name || "—"}</span>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                          {list.country_code || "—"}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="text-xs text-slate-300 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/60">
                          {list.vertical_name || "—"}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-right font-mono font-medium text-slate-200">
                        {list.contact_count.toLocaleString()}
                      </td>

                      <td className="px-4 py-3.5">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border capitalize font-medium",
                            statusColors[list.status] || statusColors.active
                          )}
                        >
                          {list.status}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-xs text-slate-400">
                        {list.last_imported_at ? new Date(list.last_imported_at).toLocaleString() : "Never"}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link href={`/lists/${list.id}`}>
                            <Button variant="ghost" size="sm" className="h-8 px-2 text-slate-300 hover:text-white hover:bg-slate-800">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>

                          <Link href={`/lists/imports?list_id=${list.id}`}>
                            <Button variant="ghost" size="sm" className="h-8 px-2 text-blue-400 hover:text-blue-300 hover:bg-slate-800">
                              <UploadCloud className="h-4 w-4" />
                            </Button>
                          </Link>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleStatus(list)}
                            title={list.status === "active" ? "Pause List" : "Activate List"}
                            className="h-8 px-2 text-slate-400 hover:text-white hover:bg-slate-800"
                          >
                            {list.status === "active" ? <Pause className="h-4 w-4 text-amber-400" /> : <Play className="h-4 w-4 text-emerald-400" />}
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEditModal(list)}
                            className="h-8 px-2 text-slate-400 hover:text-white hover:bg-slate-800"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>

                          {list.status !== "archived" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleArchiveList(list)}
                              title="Archive List"
                              className="h-8 px-2 text-rose-400/70 hover:text-rose-400 hover:bg-slate-800"
                            >
                              <Archive className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Server-side Pagination Footer */}
        <div className="px-4 py-3 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div>
            Showing <span className="font-semibold text-slate-200">{lists.length > 0 ? (page - 1) * perPage + 1 : 0}</span> to{" "}
            <span className="font-semibold text-slate-200">{Math.min(page * perPage, total)}</span> of{" "}
            <span className="font-semibold text-slate-200">{total}</span> lists
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isFetching}
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              className="h-7 px-2 border-slate-800 text-slate-300 hover:bg-slate-800"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-2 font-mono">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isFetching}
              onClick={() => setPage((p) => p + 1)}
              className="h-7 px-2 border-slate-800 text-slate-300 hover:bg-slate-800"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Create List Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                <Plus className="h-5 w-5 text-blue-500" />
                Create New Mail List
              </h2>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">List Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Gmail USA Retail Optins"
                  value={createForm.name}
                  onChange={(e) => handleCreateFieldChange("name", e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Unique Code / Alias (Auto-generated)
                </label>
                <input
                  type="text"
                  placeholder="gmail_us_retail"
                  value={createForm.code}
                  onChange={(e) => setCreateForm({ ...createForm, code: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Identifier alias for ESP routing, automations, and reporting.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Provider *</label>
                  <select
                    required
                    value={createForm.mailbox_provider_id}
                    onChange={(e) => handleCreateFieldChange("mailbox_provider_id", e.target.value)}
                    className="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-md text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                  >
                    {providersData?.providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Country *</label>
                  <select
                    required
                    value={createForm.country_id}
                    onChange={(e) => handleCreateFieldChange("country_id", e.target.value)}
                    className="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-md text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                  >
                    {countriesData?.countries.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} - {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Vertical *</label>
                  <select
                    required
                    value={createForm.vertical_id}
                    onChange={(e) => handleCreateFieldChange("vertical_id", e.target.value)}
                    className="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-md text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                  >
                    {verticalsData?.verticals.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Description (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Target audience or acquisition channel context..."
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="border-slate-800 text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isCreating} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {isCreating ? "Saving..." : "Create List"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit List Modal */}
      {editingList && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                <Edit2 className="h-5 w-5 text-blue-500" />
                Edit Mail List
              </h2>
              <button onClick={() => setEditingList(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">List Name *</label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">List Code (Read Only)</label>
                <input
                  type="text"
                  disabled
                  value={editingList.code}
                  className="w-full px-3 py-2 bg-slate-950/50 border border-slate-800 rounded-md text-sm text-slate-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingList(null)}
                  className="border-slate-800 text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isUpdating} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {isUpdating ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
