"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { 
  Globe, 
  RefreshCw, 
  Plus, 
  Search, 
  ExternalLink, 
  Layers, 
  Trash2, 
  Edit3, 
  ShieldCheck, 
  AlertCircle,
  Building2,
  Lock,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Flame
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useGetDomainsQuery,
  useGetDomainProvidersQuery,
  useCreateDomainMutation,
  useCreateBulkDomainsMutation,
  useUpdateDomainMutation,
  useDeleteDomainMutation,
  useFlushDomainDNSRecordsMutation,
  useSyncAllDomainsMutation,
  useSyncDomainMutation,
  DomainItem,
} from "@/lib/store/api/domains-api";
import { notify } from "@/lib/notifications/notification-store";
import { confirmAction } from "@/lib/dialogs/confirm-dialog-service";

export default function DomainsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");

  const { data: domains = [], isLoading, refetch } = useGetDomainsQuery();
  const { data: providers = [] } = useGetDomainProvidersQuery();

  const [createDomain, { isLoading: isCreating }] = useCreateDomainMutation();
  const [createBulkDomains, { isLoading: isBulkCreating }] = useCreateBulkDomainsMutation();
  const [updateDomain, { isLoading: isUpdating }] = useUpdateDomainMutation();
  const [deleteDomain] = useDeleteDomainMutation();
  const [syncAllDomains, { isLoading: isSyncing }] = useSyncAllDomainsMutation();
  const [syncDomain] = useSyncDomainMutation();
  const [flushDomainDNSRecords, { isLoading: isFlushingDNS }] = useFlushDomainDNSRecordsMutation();
  const [syncingDomainId, setSyncingDomainId] = useState<string | null>(null);

  // Multi-select domains state
  const [selectedDomainIds, setSelectedDomainIds] = useState<Set<string>>(new Set());
  const [isFlushModalOpen, setIsFlushModalOpen] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [addMode, setAddMode] = useState<"single" | "bulk">("single");
  const [editingDomain, setEditingDomain] = useState<DomainItem | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Bulk Domain States
  const [bulkRawText, setBulkRawText] = useState("");
  const [showBulkAdvanced, setShowBulkAdvanced] = useState(false);
  const [bulkFormData, setBulkFormData] = useState({
    integration_id: "",
    status: "active",
    auto_renew: true,
    is_locked: false,
    nameservers: "dns1.registrar-servers.com, dns2.registrar-servers.com",
    notes: "",
  });

  // Real-time parser for bulk domains
  const parsedBulkDomains = useMemo(() => {
    if (!bulkRawText.trim()) {
      return { valid: [], duplicates: [], invalid: [] };
    }

    const parts = bulkRawText
      .split(/[\n\r,;\s]+/)
      .map((p) => p.trim())
      .filter(Boolean);

    const valid: string[] = [];
    const duplicates: string[] = [];
    const invalid: string[] = [];
    const seen = new Set<string>();

    for (const raw of parts) {
      if (raw.startsWith("#")) continue;

      let d = raw.toLowerCase();
      // Remove http://, https://, paths, ports, trailing dots
      d = d.replace(/^https?:\/\//i, "");
      d = d.split("/")[0].split(":")[0].replace(/\.+$/, "");

      // Validate domain regex: at least one dot, valid domain characters
      const domainRegex = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;
      if (!domainRegex.test(d)) {
        invalid.push(raw);
        continue;
      }

      if (seen.has(d)) {
        duplicates.push(d);
      } else {
        seen.add(d);
        valid.push(d);
      }
    }

    return { valid, duplicates, invalid };
  }, [bulkRawText]);

  const handleSyncDomain = async (id: string, name: string) => {
    setSyncingDomainId(id);
    const loadingId = notify.loading(`Synchronizing domain "${name}" with registrar...`);
    try {
      const res = await syncDomain(id).unwrap();
      notify.update(loadingId, {
        type: "success",
        title: "Domain Synchronized",
        message: `Domain "${name}": ${res.message}`,
      });
      refetch();
    } catch (err: any) {
      notify.dismiss(loadingId);
      notify.error(err, {
        title: `Sync Failed for "${name}"`,
        openDialog: true,
      });
    } finally {
      setSyncingDomainId(null);
    }
  };

  // Single Form State
  const [formData, setFormData] = useState({
    domain_name: "",
    integration_id: "",
    status: "active",
    auto_renew: true,
    is_locked: false,
    nameservers: "dns1.registrar-servers.com, dns2.registrar-servers.com",
    notes: "",
  });

  const handleSyncAll = async () => {
    const loadingId = notify.loading("Synchronizing all registered domains with active providers...");
    try {
      const res = await syncAllDomains().unwrap();
      notify.update(loadingId, {
        type: "success",
        title: "Domain Synchronization Complete",
        message: `Synchronized successfully: ${res.total_synced} domain(s) checked.`,
      });
      refetch();
    } catch (err: any) {
      notify.dismiss(loadingId);
      notify.error(err, { title: "Registrar Sync Failed", openDialog: true });
    }
  };

  const openCreateModal = () => {
    setEditingDomain(null);
    setAddMode("single");
    setFormData({
      domain_name: "",
      integration_id: providers.length > 0 ? providers[0].id : "",
      status: "active",
      auto_renew: true,
      is_locked: false,
      nameservers: "dns1.registrar-servers.com, dns2.registrar-servers.com",
      notes: "",
    });
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const openBulkModal = () => {
    setEditingDomain(null);
    setAddMode("bulk");
    setBulkRawText("");
    setShowBulkAdvanced(false);
    setBulkFormData({
      integration_id: providers.length > 0 ? providers[0].id : "",
      status: "active",
      auto_renew: true,
      is_locked: false,
      nameservers: "dns1.registrar-servers.com, dns2.registrar-servers.com",
      notes: "",
    });
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const openEditModal = (d: DomainItem) => {
    setEditingDomain(d);
    setAddMode("single");
    setFormData({
      domain_name: d.domain_name,
      integration_id: d.integration_id || "",
      status: d.status,
      auto_renew: d.auto_renew,
      is_locked: d.is_locked,
      nameservers: d.nameservers?.join(", ") || "",
      notes: d.notes || "",
    });
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (parsedBulkDomains.valid.length === 0) {
      setErrorMessage("Please enter at least one valid domain name.");
      return;
    }

    const nsArray = bulkFormData.nameservers
      .split(",")
      .map((ns) => ns.trim())
      .filter(Boolean);

    const loadingId = notify.loading(`Adding ${parsedBulkDomains.valid.length} domain(s) in bulk...`);
    try {
      const res = await createBulkDomains({
        domains: parsedBulkDomains.valid,
        integration_id: bulkFormData.integration_id || undefined,
        status: bulkFormData.status,
        auto_renew: bulkFormData.auto_renew,
        is_locked: bulkFormData.is_locked,
        nameservers: nsArray,
        notes: bulkFormData.notes,
      }).unwrap();

      let summary = `Imported ${res.total_created} domain(s).`;
      if (res.total_skipped > 0) {
        summary += ` ${res.total_skipped} skipped (already in inventory).`;
      }
      if (res.total_errors > 0) {
        summary += ` ${res.total_errors} failed.`;
      }

      notify.update(loadingId, {
        type: "success",
        title: "Bulk Domains Processed",
        message: summary,
      });

      setIsModalOpen(false);
      setBulkRawText("");
      refetch();
    } catch (err: any) {
      notify.dismiss(loadingId);
      const errMsg = err?.data?.error?.message || err?.message || "Failed to add bulk domains";
      setErrorMessage(errMsg);
      notify.error(err, { title: "Bulk Import Failed" });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const nsArray = formData.nameservers
      .split(",")
      .map((ns) => ns.trim())
      .filter(Boolean);

    try {
      if (editingDomain) {
        await updateDomain({
          id: editingDomain.id,
          integration_id: formData.integration_id || undefined,
          status: formData.status,
          auto_renew: formData.auto_renew,
          is_locked: formData.is_locked,
          nameservers: nsArray,
          notes: formData.notes,
        }).unwrap();
        notify.success(`Domain "${formData.domain_name}" updated successfully.`);
      } else {
        await createDomain({
          domain_name: formData.domain_name,
          integration_id: formData.integration_id || undefined,
          status: formData.status,
          auto_renew: formData.auto_renew,
          is_locked: formData.is_locked,
          nameservers: nsArray,
          notes: formData.notes,
        }).unwrap();
        notify.success(`Domain "${formData.domain_name}" added successfully.`);
      }
      setIsModalOpen(false);
      refetch();
    } catch (err: any) {
      setErrorMessage(err?.data?.error?.message || err?.message || "Failed to save domain");
      notify.error(err, { title: "Domain Save Failed" });
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const confirmed = await confirmAction({
      title: "Delete Domain",
      message: `Are you sure you want to remove domain "${name}" and all its managed DNS records? This action is permanent.`,
      confirmLabel: "Delete Domain",
      variant: "destructive",
      verificationText: name,
    });
    if (!confirmed) return;

    try {
      await deleteDomain(id).unwrap();
      notify.success(`Domain "${name}" removed successfully.`);
      refetch();
    } catch (err: any) {
      notify.error(err, { title: "Failed to delete domain" });
    }
  };

  const toggleSelectDomain = (id: string) => {
    setSelectedDomainIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAllFilteredDomains = () => {
    if (selectedDomainIds.size === filteredDomains.length && filteredDomains.length > 0) {
      setSelectedDomainIds(new Set());
    } else {
      setSelectedDomainIds(new Set(filteredDomains.map((d) => d.id)));
    }
  };

  const handleOpenFlushSelected = () => {
    if (selectedDomainIds.size === 0) return;
    setIsFlushModalOpen(true);
  };

  const handleExecuteFlush = async () => {
    if (selectedDomainIds.size === 0) return;
    const count = selectedDomainIds.size;
    const loadingId = notify.loading(`Flushing DNS records for ${count} domain(s)...`);
    try {
      const res = await flushDomainDNSRecords({
        domain_ids: Array.from(selectedDomainIds),
      }).unwrap();

      notify.update(loadingId, {
        type: "success",
        title: "DNS Records Flushed",
        message: res.message || `Deleted ${res.deleted_records_count} records across ${res.domains_count} domain(s).`,
      });
      setIsFlushModalOpen(false);
      setSelectedDomainIds(new Set());
      refetch();
    } catch (err: any) {
      notify.dismiss(loadingId);
      notify.error(err, { title: "Flush DNS Failed", openDialog: true });
    }
  };

  const handleFlushSingleDomain = async (domainId: string, domainName: string) => {
    const confirmed = await confirmAction({
      title: `Flush DNS for "${domainName}"`,
      message: `Are you sure you want to delete ALL DNS records for "${domainName}"? This change cannot be undone.`,
      confirmLabel: "Flush All DNS Records",
      variant: "destructive",
    });
    if (!confirmed) return;

    const loadingId = notify.loading(`Flushing DNS records for "${domainName}"...`);
    try {
      const res = await flushDomainDNSRecords({ domain_ids: [domainId] }).unwrap();
      notify.update(loadingId, {
        type: "success",
        title: "DNS Records Flushed",
        message: res.message || `Deleted ${res.deleted_records_count} DNS records for "${domainName}".`,
      });
      refetch();
    } catch (err: any) {
      notify.dismiss(loadingId);
      notify.error(err, { title: "Flush DNS Failed", openDialog: true });
    }
  };

  const filteredDomains = domains.filter((d) => {
    const matchesSearch = d.domain_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesProvider =
      selectedProvider === "ALL" || d.integration_id === selectedProvider;
    const matchesStatus =
      selectedStatus === "ALL" || d.status.toLowerCase() === selectedStatus.toLowerCase();
    return matchesSearch && matchesProvider && matchesStatus;
  });

  const activeCount = domains.filter((d) => d.status === "active").length;
  const totalRecordsCount = domains.reduce((acc, d) => acc + (d.record_count || 0), 0);

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2.5">
            <Globe className="h-6 w-6 text-blue-400" />
            Domains List
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Centralized inventory of registrar domains, DNS nameservers, and delivery infrastructure routing.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleSyncAll}
            disabled={isSyncing}
            className="border-slate-800 text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Syncing..." : "Sync All Registrars"}
          </Button>
          <Button 
            variant="outline"
            size="sm"
            onClick={openBulkModal}
            className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"
          >
            <Layers className="h-3.5 w-3.5 mr-1.5" />
            Bulk Add
          </Button>
          <Button onClick={openCreateModal} size="sm" className="bg-blue-600 hover:bg-blue-500 text-white">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Domain
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Total Domains</span>
            <Globe className="h-4 w-4 text-blue-400" />
          </div>
          <div className="text-2xl font-black text-slate-100 mt-2 font-mono">{domains.length}</div>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Active Domains</span>
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 mt-2 font-mono">{activeCount}</div>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>DNS Records</span>
            <Layers className="h-4 w-4 text-purple-400" />
          </div>
          <div className="text-2xl font-black text-purple-400 mt-2 font-mono">{totalRecordsCount}</div>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Registrar Providers</span>
            <Building2 className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400 mt-2 font-mono">{providers.length}</div>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search domain names (e.g. deliverability-hub.net)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Provider Filter */}
        <select
          value={selectedProvider}
          onChange={(e) => setSelectedProvider(e.target.value)}
          className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-blue-500"
        >
          <option value="ALL">All Providers ({providers.length})</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.provider_type})</option>
          ))}
        </select>

        {/* Status Filter */}
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-blue-500"
        >
          <option value="ALL">All Statuses</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {/* Bulk Domain Selection Banner */}
      {selectedDomainIds.size > 0 && (
        <div className="p-3 bg-blue-950/40 border border-blue-500/30 rounded-xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-150">
          <div className="flex items-center gap-2.5">
            <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono text-xs font-bold">
              {selectedDomainIds.size} selected
            </span>
            <span className="text-xs text-slate-300">
              Domain{selectedDomainIds.size > 1 ? "s" : ""} selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedDomainIds(new Set())}
              className="border-slate-800 text-slate-400 hover:text-slate-200 text-xs h-8"
            >
              Clear
            </Button>
            <Button
              size="sm"
              onClick={handleOpenFlushSelected}
              className="bg-rose-600 hover:bg-rose-500 text-white text-xs h-8 flex items-center gap-1.5"
            >
              <Flame className="h-3.5 w-3.5" />
              Flush DNS Records ({selectedDomainIds.size})
            </Button>
          </div>
        </div>
      )}

      {/* Domains Table */}
      <Card className="border-slate-800 bg-slate-900/60 overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/80 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3.5 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={filteredDomains.length > 0 && selectedDomainIds.size === filteredDomains.length}
                      onChange={toggleSelectAllFilteredDomains}
                      className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500 cursor-pointer h-4 w-4"
                      title="Select / Deselect All Domains"
                    />
                  </th>
                  <th className="px-6 py-3.5">Domain Name</th>
                  <th className="px-6 py-3.5">Registrar Provider</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">DNS Records</th>
                  <th className="px-6 py-3.5">Auto-Renew</th>
                  <th className="px-6 py-3.5">Last Synced</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredDomains.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                      <Globe className="h-8 w-8 mx-auto mb-2 text-slate-600" />
                      <p className="text-sm font-medium text-slate-300">No matching domains found</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Add a domain manually or import them using your registrar integrations.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredDomains.map((domain) => (
                    <tr
                      key={domain.id}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        selectedDomainIds.has(domain.id) ? "bg-blue-600/5" : ""
                      }`}
                    >
                      <td className="px-4 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={selectedDomainIds.has(domain.id)}
                          onChange={() => toggleSelectDomain(domain.id)}
                          className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500 cursor-pointer h-4 w-4"
                        />
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-slate-100 flex items-center gap-2">
                        <span>{domain.domain_name}</span>
                        {domain.is_locked && (
                          <span title="Registrar Transfer Locked">
                            <Lock className="h-3 w-3 text-slate-500" />
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-300 font-medium">
                        <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700/60 font-mono text-[11px]">
                          {domain.provider_name || "Custom / Manual"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-semibold border ${
                            domain.status === "active"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          }`}
                        >
                          {domain.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <Link
                          href={`/domains/dns?domain=${domain.id}`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-semibold bg-blue-600/10 text-blue-400 hover:bg-blue-600/20 border border-blue-500/20 transition-colors"
                        >
                          <Layers className="h-3 w-3" />
                          {domain.record_count} Records
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-xs font-mono text-slate-400">
                        {domain.auto_renew ? (
                          <span className="text-emerald-400 font-semibold">Enabled</span>
                        ) : (
                          <span className="text-slate-500">Disabled</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs font-mono text-slate-500">
                        {domain.last_synced_at ? new Date(domain.last_synced_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={syncingDomainId === domain.id}
                            onClick={() => handleSyncDomain(domain.id, domain.domain_name)}
                            className="h-7 text-xs border-slate-800 text-slate-300 hover:text-emerald-400 hover:border-emerald-500/40"
                            title="Sync DNS records from Namecheap / Live DNS"
                          >
                            <RefreshCw className={`h-3 w-3 mr-1 ${syncingDomainId === domain.id ? "animate-spin text-emerald-400" : ""}`} />
                            Sync DNS
                          </Button>
                          <Link href={`/domains/dns?domain=${domain.id}`}>
                            <Button variant="outline" size="sm" className="h-7 text-xs border-slate-800 text-blue-400 hover:bg-blue-600/10">
                              Manage DNS
                              <ArrowRight className="h-3 w-3 ml-1" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditModal(domain)}
                            className="h-7 w-7 p-0 text-slate-400 hover:text-slate-100"
                            title="Edit Domain"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleFlushSingleDomain(domain.id, domain.domain_name)}
                            className="h-7 w-7 p-0 text-slate-400 hover:text-rose-400"
                            title={`Flush all DNS records for ${domain.domain_name}`}
                          >
                            <Flame className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(domain.id, domain.domain_name)}
                            className="h-7 w-7 p-0 text-slate-400 hover:text-rose-400"
                            title="Delete Domain"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
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

      {/* Add / Edit Domain Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 !m-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                {editingDomain ? (
                  <>
                    <Globe className="h-5 w-5 text-blue-400" />
                    Edit Domain
                  </>
                ) : addMode === "bulk" ? (
                  <>
                    <Layers className="h-5 w-5 text-blue-400" />
                    Bulk Add Domains
                  </>
                ) : (
                  <>
                    <Globe className="h-5 w-5 text-blue-400" />
                    Add Domain
                  </>
                )}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-mono"
              >
                ✕
              </button>
            </div>

            {/* Mode Switcher Tabs (when adding new domains) */}
            {!editingDomain && (
              <div className="flex border-b border-slate-800 -mx-6 px-6 gap-2">
                <button
                  type="button"
                  onClick={() => { setAddMode("single"); setErrorMessage(null); }}
                  className={cn(
                    "flex items-center gap-2 py-2 px-3 text-xs font-semibold border-b-2 transition-colors",
                    addMode === "single"
                      ? "border-blue-500 text-blue-400"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  )}
                >
                  <Globe className="h-3.5 w-3.5" />
                  Single Domain
                </button>
                <button
                  type="button"
                  onClick={() => { setAddMode("bulk"); setErrorMessage(null); }}
                  className={cn(
                    "flex items-center gap-2 py-2 px-3 text-xs font-semibold border-b-2 transition-colors",
                    addMode === "bulk"
                      ? "border-blue-500 text-blue-400"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  )}
                >
                  <Layers className="h-3.5 w-3.5" />
                  Bulk Add Domains
                </button>
              </div>
            )}

            {errorMessage && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Single Mode Form */}
            {(!editingDomain && addMode === "single") || editingDomain ? (
              <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Domain Name (FQDN)</label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingDomain)}
                    placeholder="e.g. deliverability-pro.net"
                    value={formData.domain_name}
                    onChange={(e) => setFormData({ ...formData, domain_name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 font-mono disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Registrar Provider</label>
                  <select
                    value={formData.integration_id}
                    onChange={(e) => setFormData({ ...formData, integration_id: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Manual / Custom Nameservers</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.provider_type})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
                    >
                      <option value="active">Active</option>
                      <option value="expired">Expired</option>
                      <option value="pending">Pending</option>
                    </select>
                  </div>

                  <div className="flex flex-col justify-end space-y-2 pb-1">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={formData.auto_renew}
                        onChange={(e) => setFormData({ ...formData, auto_renew: e.target.checked })}
                        className="rounded bg-slate-950 border-slate-800 text-blue-600 focus:ring-0"
                      />
                      <span className="text-slate-300">Auto-Renew Enabled</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={formData.is_locked}
                        onChange={(e) => setFormData({ ...formData, is_locked: e.target.checked })}
                        className="rounded bg-slate-950 border-slate-800 text-blue-600 focus:ring-0"
                      />
                      <span className="text-slate-300">Registrar Transfer Lock</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Nameservers (Comma-separated)</label>
                  <input
                    type="text"
                    placeholder="ns1.provider.com, ns2.provider.com"
                    value={formData.nameservers}
                    onChange={(e) => setFormData({ ...formData, nameservers: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Notes / Remarks</label>
                  <textarea
                    rows={2}
                    placeholder="Optional internal allocation notes..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>

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
                    {isCreating || isUpdating ? "Saving..." : editingDomain ? "Save Changes" : "Create Domain"}
                  </Button>
                </div>
              </form>
            ) : (
              /* Bulk Mode Form: Paste domain names only */
              <form onSubmit={handleBulkSubmit} className="space-y-4 text-xs">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-slate-300 font-semibold">
                      Domain Names (FQDNs) <span className="text-rose-400">*</span>
                    </label>
                    <span className="text-[11px] text-slate-400 font-mono">
                      One per line, comma or space-separated
                    </span>
                  </div>
                  <textarea
                    rows={6}
                    required
                    placeholder={`deliverability-pro.net\nmarketing-mail.com\ncluster1.outbound.io`}
                    value={bulkRawText}
                    onChange={(e) => setBulkRawText(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 font-mono text-xs leading-relaxed"
                  />

                  {/* Live Validation & Status Badges */}
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className={cn(
                      "px-2.5 py-0.5 rounded-full text-[11px] font-medium border flex items-center gap-1.5 transition-colors",
                      parsedBulkDomains.valid.length > 0
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : "bg-slate-800/60 text-slate-400 border-slate-700"
                    )}>
                      <CheckCircle2 className="h-3 w-3" />
                      {parsedBulkDomains.valid.length} Valid domain(s) detected
                    </span>
                    {parsedBulkDomains.duplicates.length > 0 && (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1.5">
                        <AlertCircle className="h-3 w-3" />
                        {parsedBulkDomains.duplicates.length} duplicate(s) ignored
                      </span>
                    )}
                    {parsedBulkDomains.invalid.length > 0 && (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1.5">
                        <AlertCircle className="h-3 w-3" />
                        {parsedBulkDomains.invalid.length} invalid line(s)
                      </span>
                    )}
                  </div>

                  {/* Quick Domain Preview Chips */}
                  {parsedBulkDomains.valid.length > 0 && (
                    <div className="mt-2.5 p-2 bg-slate-950/60 border border-slate-800/80 rounded-lg">
                      <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                        Import Preview:
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                        {parsedBulkDomains.valid.slice(0, 10).map((d) => (
                          <span
                            key={d}
                            className="px-2 py-0.5 bg-blue-500/10 text-blue-300 border border-blue-500/20 rounded font-mono text-[11px]"
                          >
                            {d}
                          </span>
                        ))}
                        {parsedBulkDomains.valid.length > 10 && (
                          <span className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded text-[11px]">
                            +{parsedBulkDomains.valid.length - 10} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Optional Configuration Collapsible */}
                <div className="border border-slate-800 rounded-xl p-3 bg-slate-950/40 space-y-3">
                  <button
                    type="button"
                    onClick={() => setShowBulkAdvanced(!showBulkAdvanced)}
                    className="flex items-center justify-between w-full text-left text-xs font-semibold text-slate-300 hover:text-slate-100 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <span>Shared Settings</span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        (Optional: all have default values)
                      </span>
                    </span>
                    {showBulkAdvanced ? (
                      <ChevronUp className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    )}
                  </button>

                  {/* Custom overrides if expanded */}
                  {showBulkAdvanced && (
                    <div className="space-y-3 pt-2 border-t border-slate-800/80 animate-in fade-in duration-150">
                      <div>
                        <label className="block text-slate-400 font-semibold mb-1">Registrar Provider</label>
                        <select
                          value={bulkFormData.integration_id}
                          onChange={(e) => setBulkFormData({ ...bulkFormData, integration_id: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
                        >
                          <option value="">Manual / Custom Nameservers</option>
                          {providers.map((p) => (
                            <option key={p.id} value={p.id}>{p.name} ({p.provider_type})</option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-slate-400 font-semibold mb-1">Status</label>
                          <select
                            value={bulkFormData.status}
                            onChange={(e) => setBulkFormData({ ...bulkFormData, status: e.target.value })}
                            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
                          >
                            <option value="active">Active</option>
                            <option value="expired">Expired</option>
                            <option value="pending">Pending</option>
                          </select>
                        </div>

                        <div className="flex flex-col justify-end space-y-2 pb-1">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={bulkFormData.auto_renew}
                              onChange={(e) => setBulkFormData({ ...bulkFormData, auto_renew: e.target.checked })}
                              className="rounded bg-slate-950 border-slate-800 text-blue-600 focus:ring-0"
                            />
                            <span className="text-slate-300">Auto-Renew Enabled</span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={bulkFormData.is_locked}
                              onChange={(e) => setBulkFormData({ ...bulkFormData, is_locked: e.target.checked })}
                              className="rounded bg-slate-950 border-slate-800 text-blue-600 focus:ring-0"
                            />
                            <span className="text-slate-300">Registrar Transfer Lock</span>
                          </label>
                        </div>
                      </div>

                      <div>
                        <label className="block text-slate-400 font-semibold mb-1">Nameservers (Comma-separated)</label>
                        <input
                          type="text"
                          placeholder="dns1.registrar-servers.com, dns2.registrar-servers.com"
                          value={bulkFormData.nameservers}
                          onChange={(e) => setBulkFormData({ ...bulkFormData, nameservers: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-400 font-semibold mb-1">Notes / Remarks</label>
                        <textarea
                          rows={2}
                          placeholder="Optional internal allocation notes..."
                          value={bulkFormData.notes}
                          onChange={(e) => setBulkFormData({ ...bulkFormData, notes: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  )}
                </div>

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
                    disabled={isBulkCreating || parsedBulkDomains.valid.length === 0}
                    className="bg-blue-600 hover:bg-blue-500 text-white"
                  >
                    {isBulkCreating
                      ? "Importing..."
                      : `Import ${parsedBulkDomains.valid.length} Domain(s)`}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Flush Confirmation Modal for Selected Domains */}
      {isFlushModalOpen && (
        <div className="fixed inset-0 !m-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Flame className="h-5 w-5 text-rose-400" />
                Flush DNS Records ({selectedDomainIds.size} Domains)
              </h3>
              <button
                onClick={() => setIsFlushModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-mono"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-4 py-2 pr-1">
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 space-y-1">
                <div className="font-semibold flex items-center gap-1.5 text-rose-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Irreversible DNS Deletion Warning
                </div>
                <p>
                  You are about to permanently delete <strong>ALL DNS host records</strong> (A, AAAA, MX, CNAME, TXT, SPF) for the {selectedDomainIds.size} selected domain(s). If connected to Namecheap, the domain zone will be reset to default parking hosts.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase text-slate-400 block mb-2">
                  Target Domains ({selectedDomainIds.size})
                </label>
                <div className="space-y-1.5 max-h-56 overflow-y-auto rounded-lg border border-slate-800 p-2 bg-slate-950/60">
                  {domains
                    .filter((d) => selectedDomainIds.has(d.id))
                    .map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800/80 text-xs"
                      >
                        <span className="font-mono font-medium text-slate-200">{d.domain_name}</span>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                          <span>{d.provider_name || "Custom"}</span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-slate-300">
                            {d.record_count ?? 0} records
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800 shrink-0">
              <span className="text-xs text-slate-400 font-mono">
                Total records to clear:{" "}
                <span className="text-rose-400 font-bold">
                  {domains
                    .filter((d) => selectedDomainIds.has(d.id))
                    .reduce((sum, d) => sum + (d.record_count || 0), 0)}
                </span>
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsFlushModalOpen(false)}
                  className="border-slate-800 text-slate-400"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={isFlushingDNS}
                  onClick={handleExecuteFlush}
                  className="bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1.5"
                >
                  <Trash2 className="h-4 w-4" />
                  {isFlushingDNS ? "Flushing..." : `Flush Records (${selectedDomainIds.size})`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
