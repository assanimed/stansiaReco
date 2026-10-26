"use client";

import React, { useState } from "react";
import {
  UserX,
  Search,
  Plus,
  RefreshCw,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  FileText,
  Filter,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useGetSuppressionsQuery,
  useGetMailListsQuery,
  useCreateSuppressionMutation,
  useBulkCreateSuppressionsMutation,
  useDeleteSuppressionMutation,
  Suppression,
} from "@/lib/store/api/lists-api";
import { notify } from "@/lib/notifications/notification-store";
import { confirmAction } from "@/lib/dialogs/confirm-dialog-service";

export default function SuppressionsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedReason, setSelectedReason] = useState("");
  const [selectedList, setSelectedList] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 20;

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

  // Single form
  const [singleEmail, setSingleEmail] = useState("");
  const [singleReason, setSingleReason] = useState("manual");
  const [singleListId, setSingleListId] = useState("");

  // Bulk form
  const [bulkText, setBulkText] = useState("");
  const [bulkReason, setBulkReason] = useState("manual");
  const [bulkListId, setBulkListId] = useState("");

  const { data: listsData } = useGetMailListsQuery({ per_page: 100 });
  const {
    data: suppressionsData,
    isLoading,
    isFetching,
    refetch,
  } = useGetSuppressionsQuery({
    search: searchTerm || undefined,
    reason: selectedReason || undefined,
    list_id: selectedList || undefined,
    page,
    per_page: perPage,
  });

  const [createSuppression, { isLoading: isCreating }] = useCreateSuppressionMutation();
  const [bulkCreate, { isLoading: isBulkCreating }] = useBulkCreateSuppressionsMutation();
  const [deleteSuppression] = useDeleteSuppressionMutation();

  const suppressions = suppressionsData?.suppressions || [];
  const total = suppressionsData?.total || 0;
  const totalPages = Math.ceil(total / perPage) || 1;

  const handleCreateSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleEmail) return;

    try {
      await createSuppression({
        email: singleEmail.trim(),
        reason: singleReason,
        list_id: singleListId || undefined,
        source: "admin_ui",
      }).unwrap();

      notify.success("Suppression created.");
      setIsAddModalOpen(false);
      setSingleEmail("");
    } catch (err: any) {
      notify.error(err?.data?.error || "Failed to add suppression.");
    }
  };

  const handleCreateBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    const emails = bulkText
      .split(/[\r\n,]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes("@"));

    if (emails.length === 0) {
      notify.error("No valid emails found in input text.");
      return;
    }

    try {
      const res = await bulkCreate({
        emails,
        reason: bulkReason,
        list_id: bulkListId || undefined,
        source: "admin_bulk_import",
      }).unwrap();

      notify.success(`Successfully added ${res.count} suppression records.`);
      setIsBulkModalOpen(false);
      setBulkText("");
    } catch (err: any) {
      notify.error(err?.data?.error || "Failed to add bulk suppressions.");
    }
  };

  const handleDelete = async (s: Suppression) => {
    const confirmed = await confirmAction({
      title: "Remove Suppression",
      message: `Are you sure you want to remove ${s.email} from suppressions?`,
      confirmLabel: "Remove Suppression",
      variant: "destructive",
    });

    if (!confirmed) return;

    try {
      await deleteSuppression(s.id).unwrap();
      notify.success("Suppression removed.");
    } catch (err: any) {
      notify.error(err?.data?.error || "Failed to delete suppression.");
    }
  };

  const reasonColors: Record<string, string> = {
    hard_bounce: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    spam_complaint: "bg-red-600/20 text-red-400 border-red-600/30",
    unsubscribe: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    optout: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    manual: "bg-slate-800 text-slate-300 border-slate-700",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2.5">
            <UserX className="h-7 w-7 text-blue-500" />
            Suppressions Management
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Global and list-scoped suppression lists to prevent emailing bounced, opted-out, or blacklisted contacts.
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

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsBulkModalOpen(true)}
            className="border-slate-800 text-slate-300 hover:bg-slate-800"
          >
            <FileText className="h-4 w-4 mr-1.5 text-blue-400" />
            Bulk Import
          </Button>

          <Button onClick={() => setIsAddModalOpen(true)} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-4 w-4 mr-1.5" />
            Add Suppression
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card className="bg-slate-900/60 border-slate-800">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search suppressed email or MD5..."
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
                value={selectedReason}
                onChange={(e) => {
                  setSelectedReason(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 bg-slate-950/70 border border-slate-800 rounded-md text-sm text-slate-300 focus:outline-none focus:border-blue-500"
              >
                <option value="">All Suppression Reasons</option>
                <option value="hard_bounce">Hard Bounce</option>
                <option value="spam_complaint">Spam Complaint</option>
                <option value="unsubscribe">Unsubscribe</option>
                <option value="optout">Opt-out</option>
                <option value="manual">Manual Admin Blacklist</option>
              </select>
            </div>

            <div>
              <select
                value={selectedList}
                onChange={(e) => {
                  setSelectedList(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 bg-slate-950/70 border border-slate-800 rounded-md text-sm text-slate-300 focus:outline-none focus:border-blue-500"
              >
                <option value="">All Scopes (Global + Lists)</option>
                <option value="global">Global Only (No specific list)</option>
                {listsData?.lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    List: {l.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-slate-900/60 border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-[11px] font-semibold uppercase text-slate-400 tracking-wider">
              <tr>
                <th className="px-4 py-3">Suppressed Email & MD5</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Scope</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Added At</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
                    Loading suppressions...
                  </td>
                </tr>
              ) : suppressions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                    No suppression records found.
                  </td>
                </tr>
              ) : (
                suppressions.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-2.5 font-mono">
                      <div className="font-medium text-slate-100">{s.email}</div>
                      <div className="text-[10px] text-slate-500">{s.email_md5}</div>
                    </td>

                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-medium border capitalize",
                          reasonColors[s.reason] || reasonColors.manual
                        )}
                      >
                        {s.reason.replace(/_/g, " ")}
                      </span>
                    </td>

                    <td className="px-4 py-2.5">
                      {s.list_id ? (
                        <span className="text-slate-300">List: {s.list_name || s.list_id}</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-red-600/15 text-red-300 border border-red-600/30 font-semibold uppercase">
                          Global System-Wide
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-2.5 text-slate-400 font-mono text-[11px]">{s.source || "—"}</td>

                    <td className="px-4 py-2.5 text-slate-400 text-[11px]">
                      {new Date(s.created_at).toLocaleString()}
                    </td>

                    <td className="px-4 py-2.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(s)}
                        className="h-7 px-2 text-rose-400/80 hover:text-rose-400 hover:bg-slate-800"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Server-side Pagination Footer */}
        <div className="px-4 py-3 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div>
            Showing <span className="font-semibold text-slate-200">{suppressions.length > 0 ? (page - 1) * perPage + 1 : 0}</span> to{" "}
            <span className="font-semibold text-slate-200">{Math.min(page * perPage, total)}</span> of{" "}
            <span className="font-semibold text-slate-200">{total}</span> records
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

      {/* Add Single Suppression Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <Plus className="h-4 w-4 text-blue-500" />
                Add Suppression
              </h2>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSingle} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="blacklist@example.com"
                  value={singleEmail}
                  onChange={(e) => setSingleEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Reason *</label>
                <select
                  value={singleReason}
                  onChange={(e) => setSingleReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="manual">Manual Blacklist</option>
                  <option value="unsubscribe">Unsubscribe Request</option>
                  <option value="optout">Direct Opt-out</option>
                  <option value="hard_bounce">Hard Bounce</option>
                  <option value="spam_complaint">Spam Complaint</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Scope</label>
                <select
                  value={singleListId}
                  onChange={(e) => setSingleListId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="">Global (All Mail Lists)</option>
                  {listsData?.lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      Specific List: {l.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddModalOpen(false)}
                  className="border-slate-800 text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isCreating} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {isCreating ? "Adding..." : "Add Suppression"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Add Suppressions Modal */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-500" />
                Bulk Add Suppressions
              </h2>
              <button onClick={() => setIsBulkModalOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateBulk} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Email Addresses (One per line or comma-separated) *
                </label>
                <textarea
                  rows={6}
                  required
                  placeholder={"user1@example.com\nuser2@example.com\nuser3@domain.org"}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-xs font-mono text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Reason</label>
                  <select
                    value={bulkReason}
                    onChange={(e) => setBulkReason(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value="manual">Manual Blacklist</option>
                    <option value="unsubscribe">Unsubscribe Request</option>
                    <option value="optout">Direct Opt-out</option>
                    <option value="hard_bounce">Hard Bounce</option>
                    <option value="spam_complaint">Spam Complaint</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Scope</label>
                  <select
                    value={bulkListId}
                    onChange={(e) => setBulkListId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Global (All Lists)</option>
                    {listsData?.lists.map((l) => (
                      <option key={l.id} value={l.id}>
                        List: {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsBulkModalOpen(false)}
                  className="border-slate-800 text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isBulkCreating} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {isBulkCreating ? "Processing..." : "Import Suppressions"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
