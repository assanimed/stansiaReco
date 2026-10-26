"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  SendHorizontal,
  ChevronLeft,
  Play,
  Pause,
  XCircle,
  Download,
  RefreshCw,
  MailCheck,
  FileCode,
  AlertCircle,
  Clock,
  Eye,
  CheckCircle2,
  FileSpreadsheet,
  Send,
  Sliders,
  ShieldCheck,
  Terminal,
  Copy,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useGetCampaignByIdQuery,
  useLaunchCampaignMutation,
  usePauseCampaignMutation,
  useResumeCampaignMutation,
  useCancelCampaignMutation,
  useGetCampaignLogsQuery,
  useGetSpoolFilesQuery,
  useReadSpoolFileQuery,
  useTestSendCampaignMutation,
  CampaignStatus,
} from "@/lib/store/api/campaigns-api";
import { notify } from "@/lib/notifications/notification-store";
import { confirmAction } from "@/lib/dialogs/confirm-dialog-service";

export default function CampaignDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const campaignId = params.id as string;
  const autoLaunch = searchParams.get("autoLaunch") === "true";

  const [activeTab, setActiveTab] = useState<"spool" | "logs" | "preview" | "config">("spool");
  const [logsPage, setLogsPage] = useState(1);
  const [selectedEmlFile, setSelectedEmlFile] = useState<string | null>(null);

  // Test Send Dialog
  const [isTestSendOpen, setIsTestSendOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("test@stansiareco.local");

  const {
    data: campaignData,
    isLoading,
    refetch: refetchCampaign,
  } = useGetCampaignByIdQuery(campaignId, {
    pollingInterval: 3000,
  });

  const {
    data: logsData,
    isLoading: isLogsLoading,
    refetch: refetchLogs,
  } = useGetCampaignLogsQuery(
    { campaignId, page: logsPage, page_size: 25 },
    { pollingInterval: 3000 }
  );

  const {
    data: spoolFilesData,
    isLoading: isSpoolFilesLoading,
    refetch: refetchSpoolFiles,
  } = useGetSpoolFilesQuery(campaignId, {
    pollingInterval: 3000,
  });

  const { data: rawEmlContent, isLoading: isReadingEml } = useReadSpoolFileQuery(
    { campaignId, fileName: selectedEmlFile || "" },
    { skip: !selectedEmlFile }
  );

  const [launchCampaign, { isLoading: isLaunching }] = useLaunchCampaignMutation();
  const [pauseCampaign, { isLoading: isPausing }] = usePauseCampaignMutation();
  const [resumeCampaign, { isLoading: isResuming }] = useResumeCampaignMutation();
  const [cancelCampaign, { isLoading: isCancelling }] = useCancelCampaignMutation();
  const [testSend, { isLoading: isTestSending }] = useTestSendCampaignMutation();

  const campaign = campaignData?.campaign;

  // Auto-launch if redirected from wizard with ?autoLaunch=true
  useEffect(() => {
    if (autoLaunch && campaign && campaign.status === "draft") {
      launchCampaign(campaign.id)
        .unwrap()
        .then(() => notify.success("Campaign queued for message generation"))
        .catch(() => {});
    }
  }, [autoLaunch, campaign, launchCampaign]);

  const handleLaunch = async () => {
    if (!campaign) return;
    const confirmed = await confirmAction({
      title: "Launch Campaign",
      message: `Queue "${campaign.name}" for message generation and file spooling?`,
      confirmText: "Launch Now",
      variant: "default",
    });
    if (!confirmed) return;

    try {
      await launchCampaign(campaign.id).unwrap();
      notify.success("Campaign queued for message generation");
      refetchCampaign();
    } catch (err: any) {
      notify.error(err?.data?.message || "Failed to launch campaign");
    }
  };

  const handlePause = async () => {
    if (!campaign) return;
    const confirmed = await confirmAction({
      title: "Pause Campaign",
      message: `Pause spooling for "${campaign.name}"? Active batches will finish and generation will halt.`,
      confirmText: "Pause",
      variant: "warning",
    });
    if (!confirmed) return;

    try {
      await pauseCampaign(campaign.id).unwrap();
      notify.info("Campaign paused");
      refetchCampaign();
    } catch (err: any) {
      notify.error(err?.data?.message || "Failed to pause campaign");
    }
  };

  const handleResume = async () => {
    if (!campaign) return;
    try {
      await resumeCampaign(campaign.id).unwrap();
      notify.success("Campaign resumed");
      refetchCampaign();
    } catch (err: any) {
      notify.error(err?.data?.message || "Failed to resume campaign");
    }
  };

  const handleCancel = async () => {
    if (!campaign) return;
    const confirmed = await confirmAction({
      title: "Cancel Campaign",
      message: `Permanently cancel "${campaign.name}"? Incomplete messages will not be generated.`,
      confirmText: "Cancel Campaign",
      variant: "destructive",
    });
    if (!confirmed) return;

    try {
      await cancelCampaign(campaign.id).unwrap();
      notify.info("Campaign cancelled");
      refetchCampaign();
    } catch (err: any) {
      notify.error(err?.data?.message || "Failed to cancel campaign");
    }
  };

  const handleDownloadZip = () => {
    window.open(`/api/v1/campaigns/${campaignId}/spool/download`, "_blank");
  };

  const handleExecuteTestSend = async () => {
    if (!testEmail.trim()) {
      notify.error("Recipient email is required");
      return;
    }

    try {
      await testSend({
        id: campaignId,
        data: {
          recipient_email: testEmail.trim(),
          sample_contact: {
            first_name: "TestUser",
            last_name: "Operator",
            email: testEmail.trim(),
            city: "TestCity",
            country: "TestCountry",
            country_code: "TC",
          },
        },
      }).unwrap();

      notify.success(`Test email spooled to disk for ${testEmail}`);
      setIsTestSendOpen(false);
      refetchSpoolFiles();
      refetchLogs();
    } catch (err: any) {
      notify.error(err?.data?.message || "Failed to spool test email");
    }
  };

  const renderStatusBadge = (status?: CampaignStatus) => {
    switch (status) {
      case "draft":
        return <Badge variant="outline" className="bg-slate-800 text-slate-400 border-slate-700">Draft</Badge>;
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

  if (isLoading || !campaign) {
    return (
      <div className="py-24 text-center text-slate-500">
        <RefreshCw className="h-8 w-8 animate-spin mx-auto text-blue-400 mb-2" />
        Loading campaign monitor...
      </div>
    );
  }

  const percent = campaign.total_recipients > 0
    ? Math.min(100, Math.round((campaign.sent_count / campaign.total_recipients) * 100))
    : 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/campaigns">
            <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-slate-400 hover:text-white hover:bg-slate-800">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-white">{campaign.name}</h1>
              {renderStatusBadge(campaign.status)}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Subject: <span className="text-slate-200">{campaign.subject}</span> &bull; List:{" "}
              <span className="text-blue-400 font-medium">{campaign.mail_list_name || "Unassigned"}</span>
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsTestSendOpen(true)}
            className="border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800"
          >
            <Send className="h-3.5 w-3.5 mr-1.5" />
            Test Send
          </Button>

          {(campaign.status === "draft" || campaign.status === "scheduled") && (
            <Button
              onClick={handleLaunch}
              disabled={isLaunching}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20"
            >
              <Play className="h-3.5 w-3.5 mr-1.5" />
              Launch Dispatcher
            </Button>
          )}

          {(campaign.status === "queued" || campaign.status === "processing") && (
            <Button
              onClick={handlePause}
              disabled={isPausing}
              size="sm"
              className="bg-amber-600 hover:bg-amber-500 text-white"
            >
              <Pause className="h-3.5 w-3.5 mr-1.5" />
              Pause
            </Button>
          )}

          {campaign.status === "paused" && (
            <Button
              onClick={handleResume}
              disabled={isResuming}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              <Play className="h-3.5 w-3.5 mr-1.5" />
              Resume
            </Button>
          )}

          {(campaign.status === "queued" || campaign.status === "processing" || campaign.status === "paused") && (
            <Button
              onClick={handleCancel}
              disabled={isCancelling}
              size="sm"
              variant="outline"
              className="border-rose-900/50 text-rose-400 hover:bg-rose-500/10"
            >
              <XCircle className="h-3.5 w-3.5 mr-1.5" />
              Cancel
            </Button>
          )}

          {campaign.sent_count > 0 && (
            <Button
              onClick={handleDownloadZip}
              size="sm"
              className="bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Download Spool ZIP
            </Button>
          )}
        </div>
      </div>

      {/* Real-Time Progress & KPI Stats */}
      <Card className="bg-slate-900/50 border-slate-800 backdrop-blur">
        <CardContent className="p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Overall Dispatching Progress
              </div>
              <div className="text-2xl font-black text-white mt-0.5">
                {campaign.sent_count.toLocaleString()} /{" "}
                <span className="text-slate-400 font-normal">
                  {campaign.total_recipients ? campaign.total_recipients.toLocaleString() : "—"}
                </span>{" "}
                <span className="text-blue-400 text-lg">({percent}%)</span>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs">
              <div className="text-right">
                <span className="text-slate-500 block">Routing Mode</span>
                <span className="font-semibold text-slate-200 capitalize">
                  {campaign.routing_type === "file_spool" ? "Local EML Spool" : campaign.routing_type}
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block">Started At</span>
                <span className="font-semibold text-slate-200">
                  {campaign.started_at ? new Date(campaign.started_at).toLocaleTimeString() : "Pending"}
                </span>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-950 rounded-full h-3 overflow-hidden border border-slate-800">
            <div
              className={cn(
                "h-full transition-all duration-500 rounded-full",
                campaign.status === "completed"
                  ? "bg-emerald-500"
                  : campaign.status === "failed"
                  ? "bg-rose-500"
                  : "bg-blue-500"
              )}
              style={{ width: `${percent}%` }}
            />
          </div>

          {/* 4 Metrics Counters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
              <div className="text-[11px] text-slate-400">Total Recipients</div>
              <div className="text-lg font-bold text-white mt-0.5">
                {campaign.total_recipients ? campaign.total_recipients.toLocaleString() : "0"}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
              <div className="text-[11px] text-slate-400">Messages Spooled</div>
              <div className="text-lg font-bold text-emerald-400 mt-0.5">
                {campaign.sent_count.toLocaleString()}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
              <div className="text-[11px] text-slate-400">Suppressed Exclusions</div>
              <div className="text-lg font-bold text-amber-400 mt-0.5">
                {campaign.suppressed_count.toLocaleString()}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
              <div className="text-[11px] text-slate-400">Failed Records</div>
              <div className="text-lg font-bold text-rose-400 mt-0.5">
                {campaign.failed_count.toLocaleString()}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs Selector */}
      <div className="flex items-center gap-1 border-b border-slate-800 pb-px">
        <button
          onClick={() => setActiveTab("spool")}
          className={cn(
            "px-4 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2",
            activeTab === "spool"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          )}
        >
          <FileCode className="h-4 w-4" />
          Generated Spool Files ({spoolFilesData?.files?.length || 0})
        </button>

        <button
          onClick={() => setActiveTab("logs")}
          className={cn(
            "px-4 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2",
            activeTab === "logs"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          )}
        >
          <Terminal className="h-4 w-4" />
          Dispatch Audit Logs
        </button>

        <button
          onClick={() => setActiveTab("preview")}
          className={cn(
            "px-4 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2",
            activeTab === "preview"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          )}
        >
          <Eye className="h-4 w-4" />
          Message Content Preview
        </button>

        <button
          onClick={() => setActiveTab("config")}
          className={cn(
            "px-4 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2",
            activeTab === "config"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          )}
        >
          <Sliders className="h-4 w-4" />
          Audience & Config
        </button>
      </div>

      {/* TAB 1: SPOOL FILES & EML INSPECTOR */}
      {activeTab === "spool" && (
        <div className="space-y-4">
          <Card className="bg-slate-900/50 border-slate-800 backdrop-blur overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                  Generated .EML Spool Files on Disk
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Click any file to inspect the exact raw RFC 5322 MIME message generated for delivery.
                </p>
              </div>

              {campaign.sent_count > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadZip}
                  className="h-8 text-xs border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800"
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Download Bundle (.zip)
                </Button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 border-b border-slate-800 uppercase tracking-wider text-[11px] text-slate-400 font-semibold">
                  <tr>
                    <th className="px-5 py-3">File Name</th>
                    <th className="px-4 py-3">Recipient Email</th>
                    <th className="px-4 py-3">File Size</th>
                    <th className="px-4 py-3">Generated At</th>
                    <th className="px-5 py-3 text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium">
                  {isSpoolFilesLoading ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-10 text-center text-slate-500">
                        <RefreshCw className="h-5 w-5 animate-spin mx-auto text-blue-400 mb-2" />
                        Scanning spool directory...
                      </td>
                    </tr>
                  ) : spoolFilesData?.files && spoolFilesData.files.length > 0 ? (
                    spoolFilesData.files.slice(0, 50).map((file) => (
                      <tr key={file.file_name} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-5 py-3 font-mono text-[11px] text-blue-300">
                          {file.file_name}
                        </td>
                        <td className="px-4 py-3 text-slate-200">
                          {file.recipient || "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-400 font-mono">
                          {(file.size_bytes / 1024).toFixed(1)} KB
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {new Date(file.generated_at).toLocaleTimeString()}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedEmlFile(file.file_name)}
                            className="h-7 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            View EML
                          </Button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center text-slate-500">
                        No spool files generated yet. Launch the campaign to begin writing .eml messages to disk.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Raw EML Viewer Modal / Drawer */}
          {selectedEmlFile && (
            <Card className="bg-slate-950 border-slate-800 shadow-2xl">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileCode className="h-4 w-4 text-blue-400" />
                  <span className="text-xs font-semibold text-white font-mono">{selectedEmlFile}</span>
                  <Badge variant="outline" className="bg-slate-900 text-slate-400 text-[10px]">
                    RFC 5322 MIME
                  </Badge>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (rawEmlContent) {
                        navigator.clipboard.writeText(rawEmlContent);
                        notify.success("EML copied to clipboard");
                      }
                    }}
                    className="h-7 text-xs text-slate-400 hover:text-white"
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedEmlFile(null)}
                    className="h-7 w-7 p-0 text-slate-400 hover:text-white"
                  >
                    &times;
                  </Button>
                </div>
              </div>

              <div className="p-4 max-h-96 overflow-y-auto font-mono text-[11px] text-slate-300 bg-slate-950 leading-relaxed whitespace-pre-wrap select-all">
                {isReadingEml ? "Reading file content..." : rawEmlContent}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* TAB 2: DISPATCH AUDIT LOGS */}
      {activeTab === "logs" && (
        <Card className="bg-slate-900/50 border-slate-800 backdrop-blur overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 border-b border-slate-800 uppercase tracking-wider text-[11px] text-slate-400 font-semibold">
                <tr>
                  <th className="px-5 py-3">Recipient Email</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Message-ID</th>
                  <th className="px-4 py-3">Spool File Path</th>
                  <th className="px-4 py-3">Details</th>
                  <th className="px-5 py-3 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {isLogsLoading ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-slate-500">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto text-blue-400 mb-2" />
                      Loading logs...
                    </td>
                  </tr>
                ) : logsData?.logs && logsData.logs.length > 0 ? (
                  logsData.logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-5 py-3 text-slate-200 font-medium">
                        {log.email}
                      </td>
                      <td className="px-4 py-3">
                        {log.status === "spooled" ? (
                          <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px]">
                            Spooled
                          </Badge>
                        ) : log.status === "suppressed" ? (
                          <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px]">
                            Suppressed
                          </Badge>
                        ) : (
                          <Badge className="bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px]">
                            Failed
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-[10px] text-slate-400 truncate max-w-xs">
                        {log.message_id || "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-[10px] text-slate-500 truncate max-w-xs">
                        {log.file_path || "—"}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-slate-400 truncate max-w-xs">
                        {log.details || "—"}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-500 text-[11px]">
                        {new Date(log.created_at).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-slate-500">
                      No logs recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB 3: MESSAGE PREVIEW */}
      {activeTab === "preview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-slate-900/50 border-slate-800 backdrop-blur">
            <CardContent className="p-5 space-y-4">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                HTML Content Rendering
              </h3>
              <div className="rounded-xl border border-slate-800 bg-white overflow-hidden shadow-lg">
                <iframe
                  title="HTML Preview"
                  srcDoc={campaign.html_content}
                  className="w-full h-[400px] border-0"
                  sandbox="allow-same-origin"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800 backdrop-blur">
            <CardContent className="p-5 space-y-4">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Plaintext Content Fallback
              </h3>
              <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 whitespace-pre-wrap h-[400px] overflow-y-auto leading-relaxed">
                {campaign.plain_content || "No plaintext content provided."}
              </pre>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 4: AUDIENCE & CONFIG */}
      {activeTab === "config" && (
        <Card className="bg-slate-900/50 border-slate-800 backdrop-blur">
          <CardContent className="p-6 space-y-6">
            <div>
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Audience Filter Rules
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                  <span className="text-[11px] text-slate-500 block">Clean Only</span>
                  <span className="text-xs font-semibold text-slate-200">
                    {campaign.audience_filter?.only_clean ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                  <span className="text-[11px] text-slate-500 block">Exclude Unsubs</span>
                  <span className="text-xs font-semibold text-slate-200">
                    {campaign.audience_filter?.exclude_unsubs ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                  <span className="text-[11px] text-slate-500 block">Openers Only</span>
                  <span className="text-xs font-semibold text-slate-200">
                    {campaign.audience_filter?.only_openers ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                  <span className="text-[11px] text-slate-500 block">Clickers Only</span>
                  <span className="text-xs font-semibold text-slate-200">
                    {campaign.audience_filter?.only_clickers ? "Enabled" : "Disabled"}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Delivery Settings & Headers
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                  <span className="text-[11px] text-slate-500 block">From Email</span>
                  <span className="text-xs font-semibold text-slate-200">
                    {campaign.from_name} &lt;{campaign.from_email}&gt;
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                  <span className="text-[11px] text-slate-500 block">Virtual MTA (VMTA)</span>
                  <span className="text-xs font-semibold text-slate-200">
                    {campaign.custom_vmta || "Default VMTA"}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                  <span className="text-[11px] text-slate-500 block">1-Click List-Unsubscribe</span>
                  <span className="text-xs font-semibold text-slate-200">
                    {campaign.list_unsubscribe_header ? "RFC 8058 Active" : "Disabled"}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test Send Dialog */}
      {isTestSendOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-slate-900 border-slate-800 shadow-2xl">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Send className="h-4 w-4 text-blue-400" />
                  Spool Immediate Test Message
                </h3>
                <button
                  onClick={() => setIsTestSendOpen(false)}
                  className="text-slate-500 hover:text-white"
                >
                  &times;
                </button>
              </div>

              <p className="text-xs text-slate-400">
                Renders a live sample message with all merge tags and RFC 5322 headers, and spools it to disk.
              </p>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Test Recipient Email</label>
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="e.g. dev@example.com"
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsTestSendOpen(false)}
                  className="text-slate-400"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleExecuteTestSend}
                  disabled={isTestSending}
                  className="bg-blue-600 hover:bg-blue-500 text-white"
                >
                  {isTestSending ? "Spooling..." : "Spool Test Email"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
