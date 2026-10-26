"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Mail,
  ArrowLeft,
  RefreshCw,
  Users,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  UserX,
  Flame,
  MousePointerClick,
  Eye,
  Sliders,
  Calendar,
  FileSpreadsheet,
  Activity,
  ShieldCheck,
  Search,
  Filter,
  Plus,
  Trash2,
  Pause,
  Play,
  Archive,
  ChevronLeft,
  ChevronRight,
  Database,
  Tag,
  Globe,
  FileText,
  Info,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useGetMailListQuery,
  useGetMailListMetricsQuery,
  useGetListContactsQuery,
  useGetImportJobsQuery,
  useGetDataQualityReportQuery,
  useGetContactEventsQuery,
  useUpdateMailListMutation,
  useSetMailListStatusMutation,
  useCreateContactMutation,
  useDeleteContactMutation,
  Contact,
  ImportJob,
} from "@/lib/store/api/lists-api";
import { notify } from "@/lib/notifications/notification-store";
import { confirmAction } from "@/lib/dialogs/confirm-dialog-service";

export default function MailListDetailPage() {
  const params = useParams();
  const router = useRouter();
  const listId = params.id as string;

  // Active tab state
  const [activeTab, setActiveTab] = useState<"overview" | "contacts" | "imports" | "quality" | "activity" | "settings">("overview");

  // Contacts tab filters & pagination
  const [contactSearch, setContactSearch] = useState("");
  const [contactFilter, setContactFilter] = useState<"all" | "clean" | "unsub" | "optout" | "blacklisted" | "bounced" | "openers" | "clickers">("all");
  const [contactPage, setContactPage] = useState(1);
  const contactsPerPage = 15;

  // Selected contact detail modal
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isAddContactModalOpen, setIsAddContactModalOpen] = useState(false);
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactFirstName, setNewContactFirstName] = useState("");
  const [newContactLastName, setNewContactLastName] = useState("");

  // Selected import error report modal
  const [selectedImportJob, setSelectedImportJob] = useState<ImportJob | null>(null);

  // Queries
  const { data: list, isLoading: isListLoading, refetch: refetchList } = useGetMailListQuery(listId);
  const { data: metrics, isLoading: isMetricsLoading, refetch: refetchMetrics } = useGetMailListMetricsQuery(listId);

  const {
    data: contactsData,
    isLoading: isContactsLoading,
    isFetching: isContactsFetching,
    refetch: refetchContacts,
  } = useGetListContactsQuery({
    listId,
    search: contactSearch || undefined,
    clean_only: contactFilter === "clean" ? true : undefined,
    unsub_only: contactFilter === "unsub" ? true : undefined,
    optout_only: contactFilter === "optout" ? true : undefined,
    blacklisted_only: contactFilter === "blacklisted" ? true : undefined,
    bounced_only: contactFilter === "bounced" ? true : undefined,
    openers_only: contactFilter === "openers" ? true : undefined,
    clickers_only: contactFilter === "clickers" ? true : undefined,
    page: contactPage,
    per_page: contactsPerPage,
  });

  const { data: importsData, isLoading: isImportsLoading, refetch: refetchImports } = useGetImportJobsQuery(
    { list_id: listId, per_page: 20 },
    { skip: activeTab !== "imports" && activeTab !== "overview" }
  );

  const { data: qualityReport, isLoading: isQualityLoading, refetch: refetchQuality } = useGetDataQualityReportQuery(
    { list_id: listId },
    { skip: activeTab !== "quality" && activeTab !== "overview" }
  );

  const { data: eventsData, isLoading: isEventsLoading, refetch: refetchEvents } = useGetContactEventsQuery(
    { list_id: listId, per_page: 30 },
    { skip: activeTab !== "activity" }
  );

  // Mutations
  const [updateMailList, { isLoading: isUpdatingList }] = useUpdateMailListMutation();
  const [setMailListStatus] = useSetMailListStatusMutation();
  const [createContact, { isLoading: isCreatingContact }] = useCreateContactMutation();
  const [deleteContact] = useDeleteContactMutation();

  // Settings form state
  const [settingsName, setSettingsName] = useState("");
  const [settingsDescription, setSettingsDescription] = useState("");

  React.useEffect(() => {
    if (list) {
      setSettingsName(list.name);
      setSettingsDescription(list.description || "");
    }
  }, [list]);

  const handleToggleStatus = async () => {
    if (!list) return;
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

  const handleArchiveList = async () => {
    if (!list) return;
    const confirmed = await confirmAction({
      title: "Archive Mail List",
      message: `Are you sure you want to archive "${list.name}"? Contacts and statistics are preserved.`,
      confirmLabel: "Archive List",
      variant: "destructive",
    });

    if (!confirmed) return;

    try {
      await setMailListStatus({ id: list.id, status: "archived" }).unwrap();
      notify.success("Mail list archived.");
      router.push("/lists");
    } catch (err: any) {
      notify.error(err?.data?.error || "Failed to archive mail list.");
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!list || !settingsName) return;

    try {
      await updateMailList({
        id: list.id,
        name: settingsName.trim(),
        description: settingsDescription.trim() || undefined,
      }).unwrap();

      notify.success("Mail list settings updated successfully.");
    } catch (err: any) {
      notify.error(err?.data?.error || "Failed to update list settings.");
    }
  };

  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContactEmail) return;

    try {
      await createContact({
        list_id: listId,
        email: newContactEmail.trim(),
        first_name: newContactFirstName.trim() || undefined,
        last_name: newContactLastName.trim() || undefined,
      }).unwrap();

      notify.success("Contact added successfully.");
      setIsAddContactModalOpen(false);
      setNewContactEmail("");
      setNewContactFirstName("");
      setNewContactLastName("");
    } catch (err: any) {
      notify.error(err?.data?.error || "Failed to add contact.");
    }
  };

  const handleDeleteContact = async (contact: Contact) => {
    const confirmed = await confirmAction({
      title: "Delete Contact",
      message: `Are you sure you want to remove ${contact.email} from this list?`,
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

  if (isListLoading) {
    return (
      <div className="py-24 text-center text-slate-400">
        <RefreshCw className="h-8 w-8 animate-spin mx-auto text-blue-500 mb-3" />
        Loading mail list details...
      </div>
    );
  }

  if (!list) {
    return (
      <div className="py-20 text-center text-slate-400">
        <AlertTriangle className="h-10 w-10 mx-auto text-amber-500 mb-2" />
        <h2 className="text-lg font-semibold text-slate-200">Mail List Not Found</h2>
        <p className="text-sm text-slate-500 mt-1">The requested list could not be retrieved or has been removed.</p>
        <Link href="/lists">
          <Button variant="outline" size="sm" className="mt-4 border-slate-800">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back to All Lists
          </Button>
        </Link>
      </div>
    );
  }

  const contacts = contactsData?.contacts || [];
  const contactsTotal = contactsData?.total || 0;
  const contactsTotalPages = Math.ceil(contactsTotal / contactsPerPage) || 1;

  const statusColors = {
    active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    paused: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    archived: "bg-slate-800 text-slate-400 border-slate-700",
  };

  return (
    <div className="space-y-6">
      {/* Top Navigation & Breadcrumb */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <Link href="/lists">
            <Button variant="ghost" size="sm" className="h-8 px-2 text-slate-400 hover:text-white hover:bg-slate-800">
              <ArrowLeft className="h-4 w-4 mr-1" />
              All Lists
            </Button>
          </Link>
          <span className="text-slate-600">/</span>
          <span className="text-sm font-semibold text-slate-200">{list.name}</span>
          <span
            className={cn(
              "text-[11px] px-2 py-0.5 rounded-full border capitalize font-medium",
              statusColors[list.status] || statusColors.active
            )}
          >
            {list.status}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchList();
              refetchMetrics();
            }}
            className="border-slate-800 text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>

          <Link href={`/lists/imports?list_id=${list.id}`}>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
              <UploadCloud className="h-4 w-4 mr-1.5" />
              Import CSV
            </Button>
          </Link>
        </div>
      </div>

      {/* Hero Header Card */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-100">{list.name}</h1>
            <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              {list.code}
            </span>
          </div>

          <p className="text-xs text-slate-400 max-w-2xl">{list.description || "No description provided."}</p>

          <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <Database className="h-3.5 w-3.5 text-blue-400" />
              Provider: <strong className="text-slate-200 ml-1">{list.mailbox_provider_name || "—"}</strong>
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Globe className="h-3.5 w-3.5 text-emerald-400" />
              Country: <strong className="text-slate-200 ml-1">{list.country_code} ({list.country_name})</strong>
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Tag className="h-3.5 w-3.5 text-purple-400" />
              Vertical: <strong className="text-slate-200 ml-1">{list.vertical_name}</strong>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleStatus}
            className="border-slate-800 text-slate-300 hover:bg-slate-800"
          >
            {list.status === "active" ? (
              <>
                <Pause className="h-4 w-4 mr-1.5 text-amber-400" />
                Pause List
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-1.5 text-emerald-400" />
                Activate List
              </>
            )}
          </Button>

          {list.status !== "archived" && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleArchiveList}
              className="border-slate-800 text-rose-400 hover:bg-slate-800"
            >
              <Archive className="h-4 w-4 mr-1.5" />
              Archive
            </Button>
          )}
        </div>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <Card className="bg-slate-900/60 border-slate-800">
          <CardContent className="p-3 text-center">
            <div className="text-[11px] font-medium text-slate-400">Total Contacts</div>
            <div className="text-xl font-bold text-slate-100 mt-1 font-mono">
              {(metrics?.total_contacts ?? list.contact_count).toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800">
          <CardContent className="p-3 text-center">
            <div className="text-[11px] font-medium text-emerald-400">Eligible (Clean)</div>
            <div className="text-xl font-bold text-emerald-400 mt-1 font-mono">
              {(metrics?.clean_contacts ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800">
          <CardContent className="p-3 text-center">
            <div className="text-[11px] font-medium text-blue-400">Openers</div>
            <div className="text-xl font-bold text-blue-400 mt-1 font-mono">
              {(metrics?.openers ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800">
          <CardContent className="p-3 text-center">
            <div className="text-[11px] font-medium text-indigo-400">Clickers</div>
            <div className="text-xl font-bold text-indigo-400 mt-1 font-mono">
              {(metrics?.clickers ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800">
          <CardContent className="p-3 text-center">
            <div className="text-[11px] font-medium text-amber-400">Unsubscribed</div>
            <div className="text-xl font-bold text-amber-400 mt-1 font-mono">
              {(metrics?.unsubscribed_contacts ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800">
          <CardContent className="p-3 text-center">
            <div className="text-[11px] font-medium text-orange-400">Opt-outs</div>
            <div className="text-xl font-bold text-orange-400 mt-1 font-mono">
              {(metrics?.optout_contacts ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800">
          <CardContent className="p-3 text-center">
            <div className="text-[11px] font-medium text-rose-400">Hard Bounces</div>
            <div className="text-xl font-bold text-rose-400 mt-1 font-mono">
              {(metrics?.hard_bounces ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800">
          <CardContent className="p-3 text-center">
            <div className="text-[11px] font-medium text-red-400">Blacklisted</div>
            <div className="text-xl font-bold text-red-400 mt-1 font-mono">
              {(metrics?.blacklisted_contacts ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-slate-800 flex items-center gap-1">
        {[
          { id: "overview", label: "Overview", icon: Info },
          { id: "contacts", label: `Contacts (${(contactsTotal).toLocaleString()})`, icon: Users },
          { id: "imports", label: "Imports", icon: FileSpreadsheet },
          { id: "quality", label: "Data Quality", icon: ShieldCheck },
          { id: "activity", label: "Activity & Events", icon: Activity },
          { id: "settings", label: "Settings", icon: Sliders },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors",
                isActive
                  ? "border-blue-500 text-blue-400 bg-blue-500/5"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab 1: Overview */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="bg-slate-900/60 border-slate-800 lg:col-span-2">
            <CardContent className="p-5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-200">Delivery & Hygiene Composition</h3>
              <div className="space-y-3">
                {(() => {
                  const total = metrics?.total_contacts || 1;
                  const cleanPct = Math.round(((metrics?.clean_contacts || 0) / total) * 100);
                  const unsubPct = Math.round(((metrics?.unsubscribed_contacts || 0) / total) * 100);
                  const bouncePct = Math.round(((metrics?.hard_bounces || 0) / total) * 100);
                  const suppressedPct = Math.round((((metrics?.optout_contacts || 0) + (metrics?.blacklisted_contacts || 0)) / total) * 100);

                  return (
                    <>
                      <div className="w-full bg-slate-950 h-3 rounded-full flex overflow-hidden border border-slate-800">
                        <div style={{ width: `${cleanPct}%` }} className="bg-emerald-500" title={`Clean: ${cleanPct}%`} />
                        <div style={{ width: `${unsubPct}%` }} className="bg-amber-500" title={`Unsub: ${unsubPct}%`} />
                        <div style={{ width: `${bouncePct}%` }} className="bg-rose-500" title={`Bounced: ${bouncePct}%`} />
                        <div style={{ width: `${suppressedPct}%` }} className="bg-red-600" title={`Suppressed: ${suppressedPct}%`} />
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                          <span className="text-slate-400">Clean / Active:</span>
                          <strong className="text-slate-200 font-mono">{cleanPct}%</strong>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                          <span className="text-slate-400">Unsubscribed:</span>
                          <strong className="text-slate-200 font-mono">{unsubPct}%</strong>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                          <span className="text-slate-400">Hard Bounced:</span>
                          <strong className="text-slate-200 font-mono">{bouncePct}%</strong>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full bg-red-600" />
                          <span className="text-slate-400">Blacklisted:</span>
                          <strong className="text-slate-200 font-mono">{suppressedPct}%</strong>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/60 border-slate-800">
            <CardContent className="p-5 space-y-3 text-xs">
              <h3 className="text-sm font-semibold text-slate-200 mb-2">List Metadata</h3>
              <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400">Internal List ID:</span>
                <span className="font-mono text-slate-300 text-[11px] truncate max-w-[150px]" title={list.id}>
                  {list.id}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400">Created At:</span>
                <span className="text-slate-300">{new Date(list.created_at).toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400">Last Updated:</span>
                <span className="text-slate-300">{new Date(list.updated_at).toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-400">Last Imported:</span>
                <span className="text-slate-300">
                  {list.last_imported_at ? new Date(list.last_imported_at).toLocaleString() : "None"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 2: Contacts */}
      {activeTab === "contacts" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 flex-1">
              <div className="relative min-w-[240px] flex-1 max-w-md">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search by email or name..."
                  value={contactSearch}
                  onChange={(e) => {
                    setContactSearch(e.target.value);
                    setContactPage(1);
                  }}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-950/70 border border-slate-800 rounded-md text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <select
                value={contactFilter}
                onChange={(e) => {
                  setContactFilter(e.target.value as any);
                  setContactPage(1);
                }}
                className="px-3 py-1.5 bg-slate-950/70 border border-slate-800 rounded-md text-xs text-slate-300 focus:outline-none focus:border-blue-500"
              >
                <option value="all">All Contacts</option>
                <option value="clean">Clean / Eligible Only</option>
                <option value="openers">Openers Only</option>
                <option value="clickers">Clickers Only</option>
                <option value="unsub">Unsubscribed Only</option>
                <option value="optout">Opt-outs Only</option>
                <option value="blacklisted">Blacklisted Only</option>
                <option value="bounced">Hard Bounced Only</option>
              </select>
            </div>

            <Button onClick={() => setIsAddContactModalOpen(true)} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="h-4 w-4 mr-1.5" />
              Add Contact
            </Button>
          </div>

          <Card className="bg-slate-900/60 border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/60 border-b border-slate-800 text-[11px] font-semibold uppercase text-slate-400 tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Email Address</th>
                    <th className="px-4 py-3">Recipient Name</th>
                    <th className="px-4 py-3">Flags & Hygiene</th>
                    <th className="px-4 py-3">Geo / IP</th>
                    <th className="px-4 py-3 text-right">Opens</th>
                    <th className="px-4 py-3 text-right">Clicks</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {isContactsLoading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
                        Loading contacts...
                      </td>
                    </tr>
                  ) : contacts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                        No contacts found matching the filters.
                      </td>
                    </tr>
                  ) : (
                    contacts.map((contact) => (
                      <tr key={contact.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-2.5 font-medium text-slate-200">
                          <button
                            onClick={() => setSelectedContact(contact)}
                            className="hover:text-blue-400 font-mono text-left"
                          >
                            {contact.email}
                          </button>
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
                              onClick={() => handleDeleteContact(contact)}
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

            {/* Pagination */}
            <div className="px-4 py-3 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <div>
                Showing <span className="font-semibold text-slate-200">{contacts.length > 0 ? (contactPage - 1) * contactsPerPage + 1 : 0}</span> to{" "}
                <span className="font-semibold text-slate-200">{Math.min(contactPage * contactsPerPage, contactsTotal)}</span> of{" "}
                <span className="font-semibold text-slate-200">{contactsTotal}</span> contacts
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={contactPage <= 1 || isContactsFetching}
                  onClick={() => setContactPage((p) => Math.max(p - 1, 1))}
                  className="h-7 px-2 border-slate-800 text-slate-300 hover:bg-slate-800"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="px-2 font-mono">
                  Page {contactPage} of {contactsTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={contactPage >= contactsTotalPages || isContactsFetching}
                  onClick={() => setContactPage((p) => p + 1)}
                  className="h-7 px-2 border-slate-800 text-slate-300 hover:bg-slate-800"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 3: Imports */}
      {activeTab === "imports" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">Import Jobs History</h3>
            <Link href={`/lists/imports?list_id=${list.id}`}>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                <UploadCloud className="h-4 w-4 mr-1.5" />
                Launch New Import
              </Button>
            </Link>
          </div>

          <Card className="bg-slate-900/60 border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/60 border-b border-slate-800 text-[11px] font-semibold uppercase text-slate-400 tracking-wider">
                  <tr>
                    <th className="px-4 py-3">File Name</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Processed / Total</th>
                    <th className="px-4 py-3 text-right">Inserted</th>
                    <th className="px-4 py-3 text-right">Updated</th>
                    <th className="px-4 py-3 text-right">Duplicates</th>
                    <th className="px-4 py-3 text-right">Suppressed</th>
                    <th className="px-4 py-3 text-right">Errors</th>
                    <th className="px-4 py-3">Started At</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {isImportsLoading ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-slate-500">
                        Loading import jobs...
                      </td>
                    </tr>
                  ) : (importsData?.jobs || []).length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-slate-500">
                        No imports have been executed for this list yet.
                      </td>
                    </tr>
                  ) : (
                    (importsData?.jobs || []).map((job) => (
                      <tr key={job.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3 font-mono font-medium text-slate-200">{job.filename}</td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-full text-[10px] font-medium capitalize",
                              job.status === "completed"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : job.status === "processing"
                                ? "bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse"
                                : job.status === "failed"
                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                : "bg-slate-800 text-slate-400"
                            )}
                          >
                            {job.status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {job.processed_rows.toLocaleString()} / {job.total_rows.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-400">
                          {job.inserted_rows.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-blue-400">
                          {job.updated_rows.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-400">
                          {job.duplicate_rows.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-amber-400">
                          {job.suppressed_rows.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-rose-400">
                          {job.error_count.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {job.started_at ? new Date(job.started_at).toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {job.error_count > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedImportJob(job)}
                              className="h-7 text-xs text-rose-400 hover:text-rose-300 hover:bg-slate-800"
                            >
                              Errors
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 4: Data Quality */}
      {activeTab === "quality" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="bg-slate-900/60 border-slate-800">
              <CardContent className="p-4">
                <div className="text-xs text-slate-400">Missing First Names</div>
                <div className="text-2xl font-bold text-slate-200 mt-1 font-mono">
                  {(qualityReport?.missing_first_name ?? 0).toLocaleString()}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/60 border-slate-800">
              <CardContent className="p-4">
                <div className="text-xs text-slate-400">Missing Country Field</div>
                <div className="text-2xl font-bold text-slate-200 mt-1 font-mono">
                  {(qualityReport?.missing_country ?? 0).toLocaleString()}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/60 border-slate-800">
              <CardContent className="p-4">
                <div className="text-xs text-slate-400">Missing IP Address</div>
                <div className="text-2xl font-bold text-slate-200 mt-1 font-mono">
                  {(qualityReport?.missing_ip ?? 0).toLocaleString()}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Tab 5: Activity & Events */}
      {activeTab === "activity" && (
        <Card className="bg-slate-900/60 border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 border-b border-slate-800 text-[11px] font-semibold uppercase text-slate-400 tracking-wider">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Event Type</th>
                  <th className="px-4 py-3">Email Address</th>
                  <th className="px-4 py-3">IP Address</th>
                  <th className="px-4 py-3">User Agent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {isEventsLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                      Loading activity stream...
                    </td>
                  </tr>
                ) : (eventsData?.events || []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                      No activity recorded for this list yet.
                    </td>
                  </tr>
                ) : (
                  (eventsData?.events || []).map((ev) => (
                    <tr key={ev.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-2.5 text-slate-400">{new Date(ev.created_at).toLocaleString()}</td>
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                          {ev.event_type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-200">{ev.email}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-400">{ev.ip_address || "—"}</td>
                      <td className="px-4 py-2.5 text-slate-500 truncate max-w-xs">{ev.user_agent || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab 6: Settings */}
      {activeTab === "settings" && (
        <Card className="bg-slate-900/60 border-slate-800 max-w-xl">
          <CardContent className="p-6">
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <h3 className="text-base font-semibold text-slate-200 border-b border-slate-800 pb-2">
                List Configuration
              </h3>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">List Name</label>
                <input
                  type="text"
                  required
                  value={settingsName}
                  onChange={(e) => setSettingsName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">List Code (Immutable)</label>
                <input
                  type="text"
                  disabled
                  value={list.code}
                  className="w-full px-3 py-2 bg-slate-950/60 border border-slate-800 rounded-md text-sm text-slate-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={settingsDescription}
                  onChange={(e) => setSettingsDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end pt-3 border-t border-slate-800">
                <Button type="submit" disabled={isUpdatingList} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {isUpdatingList ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Add Single Contact Modal */}
      {isAddContactModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-semibold text-slate-100">Add Contact to {list.name}</h2>
              <button onClick={() => setIsAddContactModalOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateContact} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="contact@domain.com"
                  value={newContactEmail}
                  onChange={(e) => setNewContactEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">First Name</label>
                  <input
                    type="text"
                    value={newContactFirstName}
                    onChange={(e) => setNewContactFirstName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={newContactLastName}
                    onChange={(e) => setNewContactLastName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddContactModalOpen(false)}
                  className="border-slate-800 text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isCreatingContact} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {isCreatingContact ? "Adding..." : "Add Contact"}
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
                <Users className="h-4 w-4 text-blue-500" />
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
                <div>First Name: <strong>{selectedContact.first_name || "—"}</strong></div>
                <div>Last Name: <strong>{selectedContact.last_name || "—"}</strong></div>
                <div>Country: <strong>{selectedContact.country_code || "—"}</strong></div>
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

      {/* Import Error Report Modal */}
      {selectedImportJob && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-semibold text-rose-400 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Import Error Report: {selectedImportJob.filename}
              </h2>
              <button onClick={() => setSelectedImportJob(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-2">
              {(selectedImportJob.error_report || []).length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-xs">No errors recorded.</div>
              ) : (
                selectedImportJob.error_report?.map((err, idx) => (
                  <div key={idx} className="bg-slate-950 p-2.5 rounded border border-slate-800 text-xs">
                    <div className="flex items-center justify-between text-slate-400 mb-1">
                      <span className="font-mono text-slate-300">Row #{err.row_index}</span>
                      <span className="font-mono text-slate-400">{err.email || ""}</span>
                    </div>
                    <div className="text-rose-400">{err.reason}</div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedImportJob(null)}
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
