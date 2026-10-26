"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Contact as ContactIcon,
  Search,
  Filter,
  RefreshCw,
  Plus,
  Trash2,
  Eye,
  ChevronLeft,
  ChevronRight,
  Database,
  Globe,
  Tag,
  AlertTriangle,
  UserX,
  Flame,
  CheckCircle2,
  SlidersHorizontal,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useGetContactsQuery,
  useGetMailListsQuery,
  useCreateContactMutation,
  useDeleteContactMutation,
  Contact,
} from "@/lib/store/api/lists-api";
import { notify } from "@/lib/notifications/notification-store";
import { confirmAction } from "@/lib/dialogs/confirm-dialog-service";

export default function ContactsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedList, setSelectedList] = useState("");
  const [filterClean, setFilterClean] = useState(false);
  const [filterOpeners, setFilterOpeners] = useState(false);
  const [filterClickers, setFilterClickers] = useState(false);
  const [filterUnsub, setFilterUnsub] = useState(false);
  const [filterBounced, setFilterBounced] = useState(false);
  const [filterBlacklisted, setFilterBlacklisted] = useState(false);
  const [page, setPage] = useState(1);
  const perPage = 20;

  // Modals
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Add contact form
  const [addForm, setAddForm] = useState({
    list_id: "",
    email: "",
    first_name: "",
    last_name: "",
    country_code: "",
    ip: "",
  });

  const { data: listsData } = useGetMailListsQuery({ per_page: 100 });

  const {
    data: contactsData,
    isLoading,
    isFetching,
    refetch,
  } = useGetContactsQuery({
    search: searchTerm || undefined,
    list_id: selectedList || undefined,
    clean_only: filterClean || undefined,
    openers_only: filterOpeners || undefined,
    clickers_only: filterClickers || undefined,
    unsub_only: filterUnsub || undefined,
    bounced_only: filterBounced || undefined,
    blacklisted_only: filterBlacklisted || undefined,
    page,
    per_page: perPage,
  });

  const [createContact, { isLoading: isCreating }] = useCreateContactMutation();
  const [deleteContact] = useDeleteContactMutation();

  const contacts = contactsData?.contacts || [];
  const total = contactsData?.total || 0;
  const totalPages = Math.ceil(total / perPage) || 1;

  const handleOpenAdd = () => {
    setAddForm({
      list_id: selectedList || listsData?.lists[0]?.id || "",
      email: "",
      first_name: "",
      last_name: "",
      country_code: "",
      ip: "",
    });
    setIsAddModalOpen(true);
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.list_id || !addForm.email) {
      notify.error("List and email address are required.");
      return;
    }

    try {
      await createContact({
        list_id: addForm.list_id,
        email: addForm.email.trim(),
        first_name: addForm.first_name.trim() || undefined,
        last_name: addForm.last_name.trim() || undefined,
        country_code: addForm.country_code.trim() || undefined,
        ip: addForm.ip.trim() || undefined,
      }).unwrap();

      notify.success("Contact added successfully.");
      setIsAddModalOpen(false);
    } catch (err: any) {
      notify.error(err?.data?.error || "Failed to add contact.");
    }
  };

  const handleDelete = async (contact: Contact) => {
    const confirmed = await confirmAction({
      title: "Delete Contact",
      message: `Are you sure you want to permanently delete ${contact.email}?`,
      confirmLabel: "Delete Contact",
      variant: "destructive",
    });

    if (!confirmed) return;

    try {
      await deleteContact(contact.id).unwrap();
      notify.success("Contact removed.");
    } catch (err: any) {
      notify.error(err?.data?.error || "Failed to delete contact.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2.5">
            <ContactIcon className="h-7 w-7 text-blue-500" />
            Contacts Explorer
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Browse, search, and inspect contact records across all authorized segments and mail lists.
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

          <Button onClick={handleOpenAdd} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-4 w-4 mr-1.5" />
            Add Contact
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card className="bg-slate-900/60 border-slate-800">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search by email, MD5, name, or recipient IP..."
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
                value={selectedList}
                onChange={(e) => {
                  setSelectedList(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 bg-slate-950/70 border border-slate-800 rounded-md text-sm text-slate-300 focus:outline-none focus:border-blue-500"
              >
                <option value="">All Mail Lists</option>
                {listsData?.lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Filter Pills */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/80 text-xs">
            <span className="text-slate-500 flex items-center gap-1 font-medium mr-1">
              <Filter className="h-3.5 w-3.5" />
              Hygiene & Engagement:
            </span>

            <button
              onClick={() => {
                setFilterClean(!filterClean);
                setPage(1);
              }}
              className={cn(
                "px-2.5 py-1 rounded-full border transition-colors",
                filterClean
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-semibold"
                  : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
              )}
            >
              Clean Only
            </button>

            <button
              onClick={() => {
                setFilterOpeners(!filterOpeners);
                setPage(1);
              }}
              className={cn(
                "px-2.5 py-1 rounded-full border transition-colors",
                filterOpeners
                  ? "bg-blue-500/20 text-blue-300 border-blue-500/40 font-semibold"
                  : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
              )}
            >
              Openers
            </button>

            <button
              onClick={() => {
                setFilterClickers(!filterClickers);
                setPage(1);
              }}
              className={cn(
                "px-2.5 py-1 rounded-full border transition-colors",
                filterClickers
                  ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40 font-semibold"
                  : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
              )}
            >
              Clickers
            </button>

            <button
              onClick={() => {
                setFilterUnsub(!filterUnsub);
                setPage(1);
              }}
              className={cn(
                "px-2.5 py-1 rounded-full border transition-colors",
                filterUnsub
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40 font-semibold"
                  : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
              )}
            >
              Unsubscribed
            </button>

            <button
              onClick={() => {
                setFilterBounced(!filterBounced);
                setPage(1);
              }}
              className={cn(
                "px-2.5 py-1 rounded-full border transition-colors",
                filterBounced
                  ? "bg-rose-500/20 text-rose-300 border-rose-500/40 font-semibold"
                  : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
              )}
            >
              Hard Bounces
            </button>

            <button
              onClick={() => {
                setFilterBlacklisted(!filterBlacklisted);
                setPage(1);
              }}
              className={cn(
                "px-2.5 py-1 rounded-full border transition-colors",
                filterBlacklisted
                  ? "bg-red-600/20 text-red-300 border-red-600/40 font-semibold"
                  : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
              )}
            >
              Blacklisted
            </button>

            {(filterClean || filterOpeners || filterClickers || filterUnsub || filterBounced || filterBlacklisted) && (
              <button
                onClick={() => {
                  setFilterClean(false);
                  setFilterOpeners(false);
                  setFilterClickers(false);
                  setFilterUnsub(false);
                  setFilterBounced(false);
                  setFilterBlacklisted(false);
                  setPage(1);
                }}
                className="text-slate-500 hover:text-slate-300 underline ml-2"
              >
                Reset filters
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Main Table */}
      <Card className="bg-slate-900/60 border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-[11px] font-semibold uppercase text-slate-400 tracking-wider">
              <tr>
                <th className="px-4 py-3">Email Address & MD5</th>
                <th className="px-4 py-3">Assigned List</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Hygiene Flags</th>
                <th className="px-4 py-3">Geo / IP</th>
                <th className="px-4 py-3 text-right">Opens</th>
                <th className="px-4 py-3 text-right">Clicks</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
                    Searching contacts across lists...
                  </td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                    No contacts found matching the selected criteria.
                  </td>
                </tr>
              ) : (
                contacts.map((contact) => (
                  <tr key={contact.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-slate-100">
                      <button
                        onClick={() => setSelectedContact(contact)}
                        className="hover:text-blue-400 font-mono text-left block"
                      >
                        {contact.email}
                      </button>
                      <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                        {contact.email_md5}
                      </span>
                    </td>

                    <td className="px-4 py-2.5">
                      <Link
                        href={`/lists/${contact.list_id}`}
                        className="font-medium text-slate-200 hover:text-blue-400 hover:underline"
                      >
                        {contact.list_name || "—"}
                      </Link>
                    </td>

                    <td className="px-4 py-2.5 text-slate-400">
                      {contact.first_name || contact.last_name ? (
                        <span>
                          {contact.first_name} {contact.last_name}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-1">
                        {contact.is_clean && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Clean
                          </span>
                        )}
                        {contact.is_opener && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            Opener
                          </span>
                        )}
                        {contact.is_clicker && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            Clicker
                          </span>
                        )}
                        {contact.is_unsub && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Unsub
                          </span>
                        )}
                        {contact.is_hard_bounced && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            Bounced
                          </span>
                        )}
                        {contact.is_blacklisted && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-600/20 text-red-400 border border-red-600/30">
                            Blacklisted
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-2.5 text-slate-400 font-mono text-[11px]">
                      {contact.ip || contact.country_code ? (
                        <span>
                          {contact.country_code && <span className="mr-1">[{contact.country_code}]</span>}
                          {contact.ip || ""}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    <td className="px-4 py-2.5 text-right font-mono text-slate-300">
                      {contact.open_count}
                    </td>

                    <td className="px-4 py-2.5 text-right font-mono text-slate-300">
                      {contact.click_count}
                    </td>

                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedContact(contact)}
                          className="h-7 px-2 text-slate-400 hover:text-white hover:bg-slate-800"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(contact)}
                          className="h-7 px-2 text-rose-400/80 hover:text-rose-400 hover:bg-slate-800"
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

        {/* Server-side Pagination Footer */}
        <div className="px-4 py-3 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div>
            Showing <span className="font-semibold text-slate-200">{contacts.length > 0 ? (page - 1) * perPage + 1 : 0}</span> to{" "}
            <span className="font-semibold text-slate-200">{Math.min(page * perPage, total)}</span> of{" "}
            <span className="font-semibold text-slate-200">{total}</span> contacts
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

      {/* Add Contact Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <Plus className="h-4 w-4 text-blue-500" />
                Add Contact Record
              </h2>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveContact} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Target Mail List *</label>
                <select
                  required
                  value={addForm.list_id}
                  onChange={(e) => setAddForm({ ...addForm, list_id: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select a list...</option>
                  {listsData?.lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="user@example.com"
                  value={addForm.email}
                  onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">First Name</label>
                  <input
                    type="text"
                    value={addForm.first_name}
                    onChange={(e) => setAddForm({ ...addForm, first_name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={addForm.last_name}
                    onChange={(e) => setAddForm({ ...addForm, last_name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Country Code</label>
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="US"
                    value={addForm.country_code}
                    onChange={(e) => setAddForm({ ...addForm, country_code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 font-mono uppercase focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Recipient IP</label>
                  <input
                    type="text"
                    placeholder="192.0.2.1"
                    value={addForm.ip}
                    onChange={(e) => setAddForm({ ...addForm, ip: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
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
                  {isCreating ? "Adding..." : "Add Contact"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Contact Details Inspection Drawer/Modal */}
      {selectedContact && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <ContactIcon className="h-4 w-4 text-blue-500" />
                Contact Profile
              </h2>
              <button onClick={() => setSelectedContact(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-950 p-3 rounded border border-slate-800">
                <div className="text-sm font-semibold text-slate-100 font-mono">{selectedContact.email}</div>
                <div className="text-[11px] text-slate-500 font-mono mt-0.5">MD5: {selectedContact.email_md5}</div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-slate-300">
                <div>Mail List: <strong>{selectedContact.list_name || "—"}</strong></div>
                <div>Country Code: <strong>{selectedContact.country_code || "—"}</strong></div>
                <div>First Name: <strong>{selectedContact.first_name || "—"}</strong></div>
                <div>Last Name: <strong>{selectedContact.last_name || "—"}</strong></div>
                <div>IP Address: <strong>{selectedContact.ip || "—"}</strong></div>
                <div>Device / OS: <strong>{selectedContact.os || "—"}</strong></div>
                <div>Browser: <strong>{selectedContact.browser_name || "—"}</strong></div>
                <div>Total Opens: <strong>{selectedContact.open_count}</strong></div>
                <div>Total Clicks: <strong>{selectedContact.click_count}</strong></div>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <span className="text-slate-400 block mb-1">Raw Attributes JSON:</span>
                <pre className="bg-slate-950 p-2.5 rounded border border-slate-800 font-mono text-[11px] text-slate-300 max-h-36 overflow-y-auto">
                  {JSON.stringify(selectedContact.attributes, null, 2)}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedContact(null)}
                className="border-slate-800 text-slate-300 hover:bg-slate-800"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
