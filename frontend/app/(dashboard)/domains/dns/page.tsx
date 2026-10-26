"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { 
  Layers, 
  Plus, 
  Trash2, 
  Edit3, 
  Search, 
  Copy, 
  Check, 
  Globe, 
  ArrowLeftRight, 
  AlertCircle,
  Clock,
  Hash,
  ShieldCheck,
  RefreshCw,
  Flame,
  CheckSquare,
  Square,
  Sparkles
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  useGetDomainsQuery,
  useGetDNSRecordsQuery,
  useCreateDNSRecordMutation,
  useUpdateDNSRecordMutation,
  useDeleteDNSRecordMutation,
  useBulkDeleteDNSRecordsMutation,
  useFlushDomainDNSRecordsMutation,
  useSyncDomainMutation,
  DNSRecord,
} from "@/lib/store/api/domains-api";
import { notify } from "@/lib/notifications/notification-store";
import { confirmAction } from "@/lib/dialogs/confirm-dialog-service";

function DNSManagementContent() {
  const searchParams = useSearchParams();
  const initialDomainId = searchParams.get("domain") || "";

  const { data: domains = [], isLoading: isLoadingDomains } = useGetDomainsQuery();
  const [selectedDomainId, setSelectedDomainId] = useState<string>(initialDomainId);

  // Sync initial domain
  useEffect(() => {
    if (!selectedDomainId && domains.length > 0) {
      setSelectedDomainId(initialDomainId || domains[0].id);
    }
  }, [domains, initialDomainId, selectedDomainId]);

  const {
    data: records = [],
    isLoading: isLoadingRecords,
    refetch: refetchRecords,
  } = useGetDNSRecordsQuery(selectedDomainId, {
    skip: !selectedDomainId,
  });

  const [createRecord, { isLoading: isCreating }] = useCreateDNSRecordMutation();
  const [updateRecord, { isLoading: isUpdating }] = useUpdateDNSRecordMutation();
  const [deleteRecord] = useDeleteDNSRecordMutation();
  const [bulkDeleteRecords, { isLoading: isBulkDeleting }] = useBulkDeleteDNSRecordsMutation();
  const [flushDomains, { isLoading: isFlushing }] = useFlushDomainDNSRecordsMutation();
  const [syncDomain, { isLoading: isSyncingDomain }] = useSyncDomainMutation();
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  // Multi-select DNS records state
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());

  // Multi-domain Flush Modal state
  const [isFlushModalOpen, setIsFlushModalOpen] = useState(false);
  const [selectedDomainIdsToFlush, setSelectedDomainIdsToFlush] = useState<Set<string>>(new Set());

  // Clear record selection on domain change
  useEffect(() => {
    setSelectedRecordIds(new Set());
  }, [selectedDomainId]);

  const handleSyncRegistrar = async () => {
    if (!selectedDomainId) return;
    const loadingId = notify.loading(`Synchronizing host records with ${currentDomain?.provider_name || "registrar"}...`);
    try {
      const res = await syncDomain(selectedDomainId).unwrap();
      if (res.records_synced === 0) {
        notify.dismiss(loadingId);
        notify.warning(res.message || "No DNS records were returned by the registrar.", {
          title: "Zero Records Synced",
        });
      } else {
        notify.update(loadingId, {
          type: "success",
          title: "Synchronization Complete",
          message: res.message || `Successfully synchronized ${res.records_synced} DNS record(s).`,
        });
      }
      refetchRecords();
    } catch (err: any) {
      notify.dismiss(loadingId);
      notify.error(err, {
        title: "Registrar Sync Failed",
        openDialog: true,
      });
    }
  };

  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DNSRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    record_type: "A",
    host_name: "@",
    record_value: "",
    ttl: 1800,
    mx_priority: 10,
  });

  const currentDomain = domains.find((d) => d.id === selectedDomainId);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    notify.info("Copied record target to clipboard.", { duration: 2000 });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openCreateModal = () => {
    setEditingRecord(null);
    setFormData({
      record_type: "A",
      host_name: "@",
      record_value: "",
      ttl: 1800,
      mx_priority: 10,
    });
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const openEditModal = (rec: DNSRecord) => {
    setEditingRecord(rec);
    setFormData({
      record_type: rec.record_type,
      host_name: rec.host_name,
      record_value: rec.record_value,
      ttl: rec.ttl,
      mx_priority: rec.mx_priority || 10,
    });
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDomainId) return;
    setErrorMessage(null);

    try {
      if (editingRecord) {
        await updateRecord({
          id: editingRecord.id,
          domain_id: selectedDomainId,
          record_type: formData.record_type,
          host_name: formData.host_name,
          record_value: formData.record_value,
          ttl: Number(formData.ttl),
          mx_priority: formData.record_type === "MX" ? Number(formData.mx_priority) : undefined,
        }).unwrap();
        notify.success("DNS record updated successfully.");
      } else {
        await createRecord({
          domain_id: selectedDomainId,
          record_type: formData.record_type,
          host_name: formData.host_name,
          record_value: formData.record_value,
          ttl: Number(formData.ttl),
          mx_priority: formData.record_type === "MX" ? Number(formData.mx_priority) : undefined,
        }).unwrap();
        notify.success("DNS record created successfully.");
      }
      setIsModalOpen(false);
      refetchRecords();
    } catch (err: any) {
      setErrorMessage(err?.data?.error?.message || err?.message || "Failed to save DNS record");
      notify.error(err, { title: "DNS Record Save Failed" });
    }
  };

  const handleDelete = async (id: string, host: string, type: string) => {
    const confirmed = await confirmAction({
      title: "Delete DNS Record",
      message: `Are you sure you want to delete ${type} record for "${host}"? This change will be authoritative.`,
      confirmLabel: "Delete Record",
      variant: "destructive",
    });
    if (!confirmed) return;

    try {
      await deleteRecord({ id, domain_id: selectedDomainId }).unwrap();
      notify.success(`Deleted ${type} record for "${host}".`);
      setSelectedRecordIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      refetchRecords();
    } catch (err: any) {
      notify.error(err, { title: "Delete Failed" });
    }
  };

  const toggleSelectRecord = (id: string) => {
    setSelectedRecordIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    if (selectedRecordIds.size === filteredRecords.length && filteredRecords.length > 0) {
      setSelectedRecordIds(new Set());
    } else {
      setSelectedRecordIds(new Set(filteredRecords.map((r) => r.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedRecordIds.size === 0) return;
    const count = selectedRecordIds.size;
    const confirmed = await confirmAction({
      title: `Delete ${count} DNS Record${count > 1 ? "s" : ""}`,
      message: `Are you sure you want to delete ${count} selected DNS record(s) from "${currentDomain?.domain_name || "domain"}"? This change will be pushed authoritatively to nameservers.`,
      confirmLabel: `Delete ${count} Record${count > 1 ? "s" : ""}`,
      variant: "destructive",
    });
    if (!confirmed) return;

    const loadingId = notify.loading(`Deleting ${count} DNS record(s)...`);
    try {
      const res = await bulkDeleteRecords({
        record_ids: Array.from(selectedRecordIds),
        domain_id: selectedDomainId,
      }).unwrap();

      notify.update(loadingId, {
        type: "success",
        title: "Bulk Delete Complete",
        message: res.message || `Deleted ${res.deleted_count} DNS record(s).`,
      });
      setSelectedRecordIds(new Set());
      refetchRecords();
    } catch (err: any) {
      notify.dismiss(loadingId);
      notify.error(err, { title: "Bulk Delete Failed", openDialog: true });
    }
  };

  const openFlushModal = () => {
    if (selectedDomainId) {
      setSelectedDomainIdsToFlush(new Set([selectedDomainId]));
    } else {
      setSelectedDomainIdsToFlush(new Set());
    }
    setIsFlushModalOpen(true);
  };

  const toggleDomainToFlush = (id: string) => {
    setSelectedDomainIdsToFlush((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleExecuteFlushDomains = async () => {
    if (selectedDomainIdsToFlush.size === 0) return;
    const count = selectedDomainIdsToFlush.size;
    const confirmed = await confirmAction({
      title: `Flush All DNS Records for ${count} Domain${count > 1 ? "s" : ""}`,
      message: `Are you sure you want to flush (delete ALL DNS records) for ${count} selected domain(s)? This will wipe every host record for these domains.`,
      confirmLabel: `Flush ${count} Domain${count > 1 ? "s" : ""}`,
      variant: "destructive",
    });
    if (!confirmed) return;

    const loadingId = notify.loading(`Flushing DNS records across ${count} domain(s)...`);
    try {
      const res = await flushDomains({
        domain_ids: Array.from(selectedDomainIdsToFlush),
      }).unwrap();

      notify.update(loadingId, {
        type: "success",
        title: "DNS Records Flushed",
        message: res.message || `Deleted ${res.deleted_records_count} records across ${res.domains_count} domain(s).`,
      });
      setIsFlushModalOpen(false);
      setSelectedDomainIdsToFlush(new Set());
      setSelectedRecordIds(new Set());
      refetchRecords();
    } catch (err: any) {
      notify.dismiss(loadingId);
      notify.error(err, { title: "DNS Flush Failed", openDialog: true });
    }
  };

  const filteredRecords = records.filter((r) => {
    const matchesSearch =
      r.host_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.record_value.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === "ALL" || r.record_type === typeFilter;
    return matchesSearch && matchesType;
  });

  const getRecordTypeBadge = (type: string) => {
    switch (type.toUpperCase()) {
      case "A":
        return <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">A</span>;
      case "AAAA":
        return <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">AAAA</span>;
      case "CNAME":
        return <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">CNAME</span>;
      case "MX":
        return <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">MX</span>;
      case "TXT":
      case "SPF":
        return <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{type}</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">{type}</span>;
    }
  };

  return (
    <>
      <div className="space-y-6">
        {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2.5">
            <Layers className="h-6 w-6 text-blue-400" />
            DNS Record Management
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Configure authoritative DNS records (A, AAAA, MX, CNAME, TXT, SPF) and propagation TTLs.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            disabled={!selectedDomainId || isSyncingDomain}
            onClick={handleSyncRegistrar}
            className="border-slate-800 text-slate-300 hover:text-emerald-400 hover:border-emerald-500/40"
            title="Fetch authoritative DNS host records directly from your registrar (GoDaddy / Namecheap API)"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isSyncingDomain ? "animate-spin text-emerald-400" : ""}`} />
            Sync from Registrar
          </Button>
          <Link href={`/domains/dns/ip-replace${selectedDomainId ? `?domain=${selectedDomainId}` : ""}`}>
            <Button variant="outline" size="sm" className="border-slate-800 text-blue-400 hover:bg-blue-600/10">
              <ArrowLeftRight className="h-3.5 w-3.5 mr-1.5" />
              Bulk IP Replacement
            </Button>
          </Link>
          <Link href="/domains/dns/spf-studio">
            <Button variant="outline" size="sm" className="border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 hover:border-indigo-500/50">
              <Sparkles className="h-3.5 w-3.5 mr-1.5 text-indigo-400" />
              SPF &amp; DKIM Studio
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={openFlushModal}
            className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/50"
            title="Flush (delete all) DNS host records for selected domains"
          >
            <Flame className="h-3.5 w-3.5 mr-1.5 text-rose-400" />
            Flush DNS Records
          </Button>
          <Button 
            onClick={openCreateModal} 
            size="sm" 
            disabled={!selectedDomainId}
            className="bg-blue-600 hover:bg-blue-500 text-white"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add DNS Record
          </Button>
        </div>
      </div>

      {syncNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs text-emerald-300">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{syncNotice}</span>
          </div>
          <button
            onClick={() => setSyncNotice(null)}
            className="text-emerald-400 hover:text-emerald-200 text-xs font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Domain Selection Bar */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-600/10 border border-blue-500/20 text-blue-400">
            <Globe className="h-5 w-5" />
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
              Active Managed Domain
            </span>
            <select
              value={selectedDomainId}
              onChange={(e) => setSelectedDomainId(e.target.value)}
              className="mt-0.5 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm font-mono font-bold text-slate-100 focus:outline-none focus:border-blue-500"
            >
              {domains.length === 0 ? (
                <option value="">No domains available</option>
              ) : (
                domains.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.domain_name} ({d.record_count} records)
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {currentDomain && (
          <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
            <div>
              <span className="text-slate-500">Provider: </span>
              <span className="text-slate-200">{currentDomain.provider_name || "Custom"}</span>
            </div>
            <div>
              <span className="text-slate-500">Status: </span>
              <span className="text-emerald-400 font-semibold uppercase">{currentDomain.status}</span>
            </div>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search host (e.g. mail) or address/value..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Record Type Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {["ALL", "A", "AAAA", "CNAME", "MX", "TXT"].map((type) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                typeFilter === type
                  ? "bg-blue-600 text-white"
                  : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk Record Selection Banner */}
      {selectedRecordIds.size > 0 && (
        <div className="p-3 bg-blue-950/40 border border-blue-500/30 rounded-xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-150">
          <div className="flex items-center gap-2.5">
            <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono text-xs font-bold">
              {selectedRecordIds.size} selected
            </span>
            <span className="text-xs text-slate-300">
              DNS record{selectedRecordIds.size > 1 ? "s" : ""} selected on {currentDomain?.domain_name || "this domain"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedRecordIds(new Set())}
              className="border-slate-800 text-slate-400 hover:text-slate-200 text-xs h-8"
            >
              Clear
            </Button>
            <Button
              size="sm"
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
              className="bg-rose-600 hover:bg-rose-500 text-white text-xs h-8 flex items-center gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {isBulkDeleting ? "Deleting..." : `Delete Selected (${selectedRecordIds.size})`}
            </Button>
          </div>
        </div>
      )}

      {/* DNS Records Table */}
      <Card className="border-slate-800 bg-slate-900/60 overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/80 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3.5 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={filteredRecords.length > 0 && selectedRecordIds.size === filteredRecords.length}
                      onChange={toggleSelectAllFiltered}
                      className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500 cursor-pointer h-4 w-4"
                      title="Select / Deselect All Records"
                    />
                  </th>
                  <th className="px-6 py-3.5">Type</th>
                  <th className="px-6 py-3.5">Host / Subdomain</th>
                  <th className="px-6 py-3.5">Value / Target</th>
                  <th className="px-6 py-3.5">TTL</th>
                  <th className="px-6 py-3.5">Priority</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                      <Layers className="h-8 w-8 mx-auto mb-2 text-slate-600" />
                      <p className="text-sm font-medium text-slate-300">No DNS records stored for this domain</p>
                      <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                        Click &quot;Sync from Registrar&quot; to pull authoritative host records directly from your domain provider (GoDaddy or Namecheap API).
                      </p>
                      <div className="mt-4">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!selectedDomainId || isSyncingDomain}
                          onClick={handleSyncRegistrar}
                          className="border-slate-800 text-slate-300 hover:text-emerald-400 hover:border-emerald-500/40"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isSyncingDomain ? "animate-spin text-emerald-400" : ""}`} />
                          Sync from Registrar Now
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((rec) => (
                    <tr
                      key={rec.id}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        selectedRecordIds.has(rec.id) ? "bg-blue-600/5" : ""
                      }`}
                    >
                      <td className="px-4 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={selectedRecordIds.has(rec.id)}
                          onChange={() => toggleSelectRecord(rec.id)}
                          className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500 cursor-pointer h-4 w-4"
                        />
                      </td>
                      <td className="px-6 py-4">
                        {getRecordTypeBadge(rec.record_type)}
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-slate-100">
                        {rec.host_name}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-300 max-w-md truncate">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{rec.record_value}</span>
                          <button
                            onClick={() => copyToClipboard(rec.record_value, rec.id)}
                            className="text-slate-500 hover:text-slate-300 transition-colors shrink-0"
                            title="Copy Value"
                          >
                            {copiedId === rec.id ? (
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-mono text-slate-400">
                        {rec.ttl}s
                      </td>
                      <td className="px-6 py-4 text-xs font-mono text-slate-400">
                        {rec.mx_priority !== undefined && rec.mx_priority !== null ? rec.mx_priority : "—"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditModal(rec)}
                            className="h-7 w-7 p-0 text-slate-400 hover:text-slate-100"
                            title="Edit Record"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(rec.id, rec.host_name, rec.record_type)}
                            className="h-7 w-7 p-0 text-slate-400 hover:text-rose-400"
                            title="Delete Record"
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

      {/* Add / Edit DNS Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 !m-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Layers className="h-5 w-5 text-blue-400" />
                {editingRecord ? "Edit DNS Record" : "Add DNS Record"}
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Record Type</label>
                  <select
                    value={formData.record_type}
                    onChange={(e) => setFormData({ ...formData, record_type: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 font-bold"
                  >
                    <option value="A">A (IPv4 Address)</option>
                    <option value="AAAA">AAAA (IPv6 Address)</option>
                    <option value="CNAME">CNAME (Alias)</option>
                    <option value="MX">MX (Mail Exchange)</option>
                    <option value="TXT">TXT (Text / SPF / DKIM)</option>
                    <option value="NS">NS (Name Server)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Host / Name</label>
                  <input
                    type="text"
                    required
                    placeholder="@ or mail"
                    value={formData.host_name}
                    onChange={(e) => setFormData({ ...formData, host_name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  Record Value / Destination
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    formData.record_type === "A"
                      ? "e.g. 192.168.1.10"
                      : formData.record_type === "MX"
                      ? "mail.example.com"
                      : "v=spf1 include:... ~all"
                  }
                  value={formData.record_value}
                  onChange={(e) => setFormData({ ...formData, record_value: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">TTL (Seconds)</label>
                  <select
                    value={formData.ttl}
                    onChange={(e) => setFormData({ ...formData, ttl: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                  >
                    <option value={60}>60s (1 min - Live migration)</option>
                    <option value={300}>300s (5 mins)</option>
                    <option value={1800}>1800s (30 mins - Standard)</option>
                    <option value={3600}>3600s (1 hour)</option>
                    <option value={86400}>86400s (1 day)</option>
                  </select>
                </div>

                {formData.record_type === "MX" && (
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">MX Priority</label>
                    <input
                      type="number"
                      required
                      min={0}
                      max={65535}
                      value={formData.mx_priority}
                      onChange={(e) => setFormData({ ...formData, mx_priority: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                    />
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
                  disabled={isCreating || isUpdating}
                  className="bg-blue-600 hover:bg-blue-500 text-white"
                >
                  {isCreating || isUpdating ? "Saving..." : editingRecord ? "Save Record" : "Add Record"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Flush DNS Records Modal */}
      {isFlushModalOpen && (
        <div className="fixed inset-0 !m-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Flame className="h-5 w-5 text-rose-400" />
                Flush DNS Records
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
                  Irreversible DNS Flush Warning
                </div>
                <p>
                  This action will permanently delete <strong>ALL</strong> DNS host records (A, AAAA, MX, CNAME, TXT, SPF) for the selected domain(s). If connected to Namecheap, the zone will be reset to default parking hosts.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold uppercase text-slate-400">
                    Select Domains to Flush ({selectedDomainIdsToFlush.size} selected)
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedDomainIdsToFlush(new Set(domains.map((d) => d.id)))}
                      className="text-xs text-blue-400 hover:underline"
                    >
                      Select All
                    </button>
                    <span className="text-slate-600">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedDomainIdsToFlush(new Set())}
                      className="text-xs text-slate-400 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 max-h-60 overflow-y-auto rounded-lg border border-slate-800 p-2 bg-slate-950/60">
                  {domains.map((d) => (
                    <label
                      key={d.id}
                      className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors text-xs ${
                        selectedDomainIdsToFlush.has(d.id)
                          ? "bg-rose-500/15 border border-rose-500/30 text-slate-100"
                          : "hover:bg-slate-800/40 text-slate-300 border border-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={selectedDomainIdsToFlush.has(d.id)}
                          onChange={() => toggleDomainToFlush(d.id)}
                          className="rounded border-slate-700 bg-slate-900 text-rose-600 focus:ring-rose-500 cursor-pointer h-4 w-4"
                        />
                        <span className="font-mono font-medium">{d.domain_name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <span>{d.provider_name || "Custom"}</span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-slate-300">
                          {d.record_count ?? 0} records
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800 shrink-0">
              <span className="text-xs text-slate-400 font-mono">
                {selectedDomainIdsToFlush.size} domain(s) selected
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
                  disabled={selectedDomainIdsToFlush.size === 0 || isFlushing}
                  onClick={handleExecuteFlushDomains}
                  className="bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1.5"
                >
                  <Trash2 className="h-4 w-4" />
                  {isFlushing ? "Flushing..." : `Flush ${selectedDomainIdsToFlush.size} Domain${selectedDomainIdsToFlush.size > 1 ? "s" : ""}`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function DNSManagementPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-400 text-sm">Loading DNS management...</div>}>
      <DNSManagementContent />
    </Suspense>
  );
}
