"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  SendHorizontal,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Play,
  Pause,
  XCircle,
  Eye,
  Trash2,
  Download,
  AlertCircle,
  RefreshCw,
  MailCheck,
  FileCode,
  Layers,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useGetCampaignsQuery,
  useGetCampaignsSummaryQuery,
  useLaunchCampaignMutation,
  usePauseCampaignMutation,
  useResumeCampaignMutation,
  useCancelCampaignMutation,
  useDeleteCampaignMutation,
  Campaign,
  CampaignStatus,
} from "@/lib/store/api/campaigns-api";
import { notify } from "@/lib/notifications/notification-store";
import { confirmAction } from "@/lib/dialogs/confirm-dialog-service";

const STATUS_TABS: { label: string; value: string }[] = [
  { label: "All Campaigns", value: "all" },
  { label: "Drafts", value: "draft" },
  { label: "Queued & Sending", value: "queued" },
  { label: "Paused", value: "paused" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
];

export default function CampaignsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const { data: summary, isLoading: isSummaryLoading, refetch: refetchSummary } = useGetCampaignsSummaryQuery(undefined, {
    pollingInterval: 5000,
  });

  const {
    data: campaignsData,
    isLoading,
    isFetching,
    refetch: refetchList,
  } = useGetCampaignsQuery(
    {
      page,
      page_size: pageSize,
      status: selectedStatus,
      search: searchTerm,
    },
    {
      pollingInterval: 5000,
    }
  );

  const [launchCampaign, { isLoading: isLaunching }] = useLaunchCampaignMutation();
  const [pauseCampaign, { isLoading: isPausing }] = usePauseCampaignMutation();
  const [resumeCampaign, { isLoading: isResuming }] = useResumeCampaignMutation();
  const [cancelCampaign, { isLoading: isCancelling }] = useCancelCampaignMutation();
  const [deleteCampaign, { isLoading: isDeleting }] = useDeleteCampaignMutation();

  const handleLaunch = async (c: Campaign) => {
    const confirmed = await confirmAction({
      title: "Launch Campaign",
      message: `Queue "${c.name}" for message generation and file spooling? It will process ${c.total_recipients ? c.total_recipients.toLocaleString() : "all eligible"} contacts.`,
      confirmText: "Launch Now",
      variant: "default",
    });
    if (!confirmed) return;

    try {
      await launchCampaign(c.id).unwrap();
      notify.success("Campaign queued for message generation");
      refetchList();
      refetchSummary();
    } catch (err: any) {
      notify.error(err?.data?.message || "Failed to launch campaign");
    }
  };

  const handlePause = async (c: Campaign) => {
    const confirmed = await confirmAction({
      title: "Pause Campaign",
      message: `Temporarily pause spooling for "${c.name}"? Active batches will finish and dispatching will halt.`,
      confirmText: "Pause",
      variant: "warning",
    });
    if (!confirmed) return;

    try {
      await pauseCampaign(c.id).unwrap();
      notify.info("Campaign paused");
      refetchList();
      refetchSummary();
    } catch (err: any) {
      notify.error(err?.data?.message || "Failed to pause campaign");
    }
  };

  const handleResume = async (c: Campaign) => {
    try {
      await resumeCampaign(c.id).unwrap();
      notify.success("Campaign resumed");
      refetchList();
      refetchSummary();
    } catch (err: any) {
      notify.error(err?.data?.message || "Failed to resume campaign");
    }
  };

  const handleCancel = async (c: Campaign) => {
    const confirmed = await confirmAction({
      title: "Cancel Campaign",
      message: `Permanently cancel "${c.name}"? Incomplete messages will not be generated.`,
      confirmText: "Cancel Campaign",
      variant: "destructive",
    });
    if (!confirmed) return;

    try {
      await cancelCampaign(c.id).unwrap();
      notify.info("Campaign cancelled");
      refetchList();
      refetchSummary();
    } catch (err: any) {
      notify.error(err?.data?.message || "Failed to cancel campaign");
    }
  };

  const handleDelete = async (c: Campaign) => {
    const confirmed = await confirmAction({
      title: "Delete Campaign",
      message: `Are you sure you want to delete "${c.name}"? This action removes all dispatch logs and cannot be undone.`,
      confirmText: "Delete",
      variant: "destructive",
    });
    if (!confirmed) return;

    try {
      await deleteCampaign(c.id).unwrap();
      notify.success("Campaign deleted");
      refetchList();
      refetchSummary();
    } catch (err: any) {
      notify.error(err?.data?.message || "Failed to delete campaign");
    }
  };

  const handleDownloadZip = (campaignId: string) => {
    window.open(`/api/v1/campaigns/${campaignId}/spool/download`, "_blank");
  };

  const renderStatusBadge = (status: CampaignStatus) => {
    switch (status) {
      case "draft":
        return <Badge variant="outline" className="bg-slate-800/60 text-slate-400 border-slate-700">Draft</Badge>;
      case "scheduled":
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30">Scheduled</Badge>;
      case "queued":
        return (
          <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1.5 animate-pulse">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
            Queued
          </Badge>
        );
      case "processing":
        return (
          <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5 animate-pulse">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Processing
          </Badge>
        );
      case "paused":
        return <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/30">Paused</Badge>;
      case "completed":
        return <Badge className="bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">Completed</Badge>;
      case "failed":
        return <Badge className="bg-rose-500/20 text-rose-300 border border-rose-500/30">Failed</Badge>;
      case "cancelled":
        return <Badge variant="outline" className="bg-slate-800 text-slate-500 border-slate-700">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const totalPages = campaignsData ? Math.ceil(campaignsData.total / pageSize) : 1;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <SendHorizontal className="h-6 w-6 text-blue-400" />
            Campaigns & Mailing Engine
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Assemble multi-part emails, target segmented audiences, and generate RFC 5322 EML spools ready for delivery.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchList();
              refetchSummary();
            }}
            disabled={isFetching}
            className="border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin text-blue-400")} />
            Refresh
          </Button>

          <Link href="/campaigns/create">
            <Button className="bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20">
              <Plus className="h-4 w-4 mr-2" />
              Create Campaign
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-900/50 border-slate-800 backdrop-blur">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-400">Total Campaigns</p>
              <h3 className="text-2xl font-bold text-white mt-1">
                {isSummaryLoading ? "..." : (summary?.total_campaigns || 0).toLocaleString()}
              </h3>
            </div>
            <div className="h-10 w-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Layers className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800 backdrop-blur">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-400">Active / In Progress</p>
              <h3 className="text-2xl font-bold text-emerald-400 mt-1">
                {isSummaryLoading ? "..." : (summary?.active_sending || 0).toLocaleString()}
              </h3>
            </div>
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Play className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800 backdrop-blur">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-400">Messages Spooled</p>
              <h3 className="text-2xl font-bold text-blue-400 mt-1">
                {isSummaryLoading ? "..." : (summary?.total_spooled || 0).toLocaleString()}
              </h3>
            </div>
            <div className="h-10 w-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <MailCheck className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800 backdrop-blur">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-400">Completed Campaigns</p>
              <h3 className="text-2xl font-bold text-slate-200 mt-1">
                {isSummaryLoading ? "..." : (summary?.completed_count || 0).toLocaleString()}
              </h3>
            </div>
            <div className="h-10 w-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs & Search Bar */}
      <Card className="bg-slate-900/50 border-slate-800 backdrop-blur">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Status tabs */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => {
                    setSelectedStatus(tab.value);
                    setPage(1);
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap",
                    selectedStatus === tab.value
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search by name, subject, email..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Campaigns Table */}
      <Card className="bg-slate-900/50 border-slate-800 backdrop-blur overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 border-b border-slate-800 uppercase tracking-wider text-[11px] text-slate-400 font-semibold">
              <tr>
                <th className="px-5 py-3">Campaign & Subject</th>
                <th className="px-4 py-3">Target Mail List</th>
                <th className="px-4 py-3">Routing Mode</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-5 py-3">Progress / Spooled</th>
                <th className="px-4 py-3">Created / Scheduled</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto text-blue-400 mb-2" />
                    Loading campaigns...
                  </td>
                </tr>
              ) : campaignsData?.campaigns && campaignsData.campaigns.length > 0 ? (
                campaignsData.campaigns.map((c) => {
                  const percent = c.total_recipients > 0 
                    ? Math.min(100, Math.round((c.sent_count / c.total_recipients) * 100))
                    : 0;

                  return (
                    <tr key={c.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-100 flex items-center gap-2">
                          <Link href={`/campaigns/${c.id}`} className="hover:text-blue-400 hover:underline">
                            {c.name}
                          </Link>
                        </div>
                        <div className="text-[11px] text-slate-400 truncate max-w-xs mt-0.5" title={c.subject}>
                          {c.subject}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          From: {c.from_name} &lt;{c.from_email}&gt;
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <Badge variant="outline" className="bg-slate-800/40 border-slate-700 text-slate-300 text-[11px]">
                          {c.mail_list_name || "Unassigned"}
                        </Badge>
                        {c.mail_list_code && (
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            {c.mail_list_code}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <FileCode className="h-3.5 w-3.5 text-blue-400" />
                          <span className="capitalize text-slate-300">
                            {c.routing_type === "file_spool" ? "Local EML Spool" : c.routing_type}
                          </span>
                        </div>
                        {c.custom_vmta && (
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            VMTA: {c.custom_vmta}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        {renderStatusBadge(c.status)}
                      </td>

                      <td className="px-5 py-3.5 w-56">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-300 font-semibold">{c.sent_count.toLocaleString()}</span>
                            <span className="text-slate-500">
                              / {c.total_recipients ? c.total_recipients.toLocaleString() : "—"} ({percent}%)
                            </span>
                          </div>
                          <div className="w-full bg-slate-950/80 rounded-full h-1.5 overflow-hidden border border-slate-800">
                            <div
                              className={cn(
                                "h-full transition-all duration-300 rounded-full",
                                c.status === "completed"
                                  ? "bg-emerald-500"
                                  : c.status === "failed"
                                  ? "bg-rose-500"
                                  : "bg-blue-500"
                              )}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          {c.failed_count > 0 && (
                            <div className="text-[10px] text-rose-400 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              {c.failed_count} failed
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-[11px] text-slate-400">
                        <div>{new Date(c.created_at).toLocaleDateString()}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {new Date(c.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </td>

                      <td className="px-5 py-3.5 text-right space-x-1 whitespace-nowrap">
                        <Link href={`/campaigns/${c.id}`}>
                          <Button variant="ghost" size="sm" className="h-8 px-2 text-slate-400 hover:text-white hover:bg-slate-800">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </Link>

                        {/* Lifecycle controls */}
                        {(c.status === "draft" || c.status === "scheduled") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleLaunch(c)}
                            disabled={isLaunching}
                            className="h-8 px-2 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                            title="Launch Campaign"
                          >
                            <Play className="h-3.5 w-3.5" />
                          </Button>
                        )}

                        {(c.status === "queued" || c.status === "processing") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePause(c)}
                            disabled={isPausing}
                            className="h-8 px-2 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                            title="Pause Campaign"
                          >
                            <Pause className="h-3.5 w-3.5" />
                          </Button>
                        )}

                        {c.status === "paused" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleResume(c)}
                            disabled={isResuming}
                            className="h-8 px-2 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                            title="Resume Campaign"
                          >
                            <Play className="h-3.5 w-3.5" />
                          </Button>
                        )}

                        {(c.status === "queued" || c.status === "processing" || c.status === "paused") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCancel(c)}
                            disabled={isCancelling}
                            className="h-8 px-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                            title="Cancel Campaign"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        )}

                        {c.sent_count > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownloadZip(c.id)}
                            className="h-8 px-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                            title="Download Spool ZIP (.eml bundle)"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        )}

                        {c.status !== "processing" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(c)}
                            disabled={isDeleting}
                            className="h-8 px-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10"
                            title="Delete Campaign"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                    <SendHorizontal className="h-8 w-8 mx-auto text-slate-600 mb-2" />
                    No campaigns found. Create your first campaign to begin dispatching!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        {campaignsData && campaignsData.total > pageSize && (
          <div className="p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <div>
              Showing {Math.min((page - 1) * pageSize + 1, campaignsData.total)} to{" "}
              {Math.min(page * pageSize, campaignsData.total)} of {campaignsData.total} campaigns
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page === 1}
                className="h-8 border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <span className="text-slate-300 font-medium">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                disabled={page >= totalPages}
                className="h-8 border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
