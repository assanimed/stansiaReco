"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  SendHorizontal,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Users,
  Layers,
  Sparkles,
  FileCode,
  ShieldCheck,
  Send,
  Eye,
  Sliders,
  Calendar,
  AlertCircle,
  Plus,
  Trash2,
  Smartphone,
  Monitor,
  Clock,
  MailCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useCreateCampaignMutation,
  useEstimateAudienceMutation,
  usePreviewCampaignMutation,
  AudienceFilter,
  RoutingType,
  PreviewResponse,
} from "@/lib/store/api/campaigns-api";
import {
  useGetMailListsQuery,
  useGetSendingIPPoolsQuery,
  useGetSendingESPsQuery,
} from "@/lib/store/api/lists-api";
import { notify } from "@/lib/notifications/notification-store";

const STEPS = [
  { id: 1, name: "Campaign Basics", desc: "Name, sender & subject" },
  { id: 2, name: "Target Audience", desc: "List & segmentation" },
  { id: 3, name: "Routing & Settings", desc: "Spool & delivery config" },
  { id: 4, name: "Message Composer", desc: "Multi-part HTML & schedule" },
];

export default function CreateCampaignPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);

  // Form State
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [fromName, setFromName] = useState("Marketing Team");
  const [fromEmail, setFromEmail] = useState("newsletter@stansiareco.local");
  const [replyTo, setReplyTo] = useState("");

  // Audience State
  const [mailListID, setMailListID] = useState("");
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>({
    only_clean: true,
    only_openers: false,
    only_clickers: false,
    only_seeds: false,
    exclude_unsubs: true,
    country_codes: [],
    verticals: [],
  });

  // Routing State
  const [routingType, setRoutingType] = useState<RoutingType>("file_spool");
  const [sendingIPPoolID, setSendingIPPoolID] = useState<string>("");
  const [sendingESPID, setSendingESPID] = useState<string>("");
  const [customVMTA, setCustomVMTA] = useState<string>("");
  const [listUnsubscribeHeader, setListUnsubscribeHeader] = useState(true);
  const [trackOpens, setTrackOpens] = useState(true);
  const [trackClicks, setTrackClicks] = useState(true);
  const [customHeaders, setCustomHeaders] = useState<{ key: string; value: string }[]>([]);

  // Content State
  const [htmlContent, setHtmlContent] = useState<string>(
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Special Announcement</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 30px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #1e293b; border-radius: 12px; padding: 32px; border: 1px solid #334155;">
    <h1 style="color: #38bdf8; font-size: 24px; margin-top: 0;">Hello, {{first_name}}!</h1>
    <p style="font-size: 15px; line-height: 1.6; color: #cbd5e1;">
      We are excited to share our latest product updates and deliverability features with you in {{city}}, {{country}}.
    </p>
    <div style="margin: 28px 0; text-align: center;">
      <a href="https://example.com" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
        Explore Dashboard &rarr;
      </a>
    </div>
    <hr style="border: none; border-top: 1px solid #334155; margin: 24px 0;" />
    <p style="font-size: 12px; color: #64748b; text-align: center;">
      You received this message because you subscribed to our service.
      <br />
      <a href="{{unsubscribe_url}}" style="color: #94a3b8; text-decoration: underline;">1-Click Unsubscribe</a>
    </p>
  </div>
</body>
</html>`
  );
  const [plainContent, setPlainContent] = useState<string>(
    `Hello {{first_name}}!\n\nWe are excited to share our latest product updates with you in {{city}}, {{country}}.\n\nExplore Dashboard: https://example.com\n\nTo unsubscribe: {{unsubscribe_url}}`
  );

  // Schedule & Throttle
  const [scheduleMode, setScheduleMode] = useState<"immediate" | "scheduled">("immediate");
  const [scheduledAtDate, setScheduledAtDate] = useState("");
  const [scheduledAtTime, setScheduledAtTime] = useState("");
  const [hourlyLimit, setHourlyLimit] = useState(0);
  const [batchSize, setBatchSize] = useState(500);

  // Preview Mode
  const [editorTab, setEditorTab] = useState<"html" | "plain" | "preview">("html");
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);

  // API Queries & Mutations
  const { data: listsData } = useGetMailListsQuery({ page: 1, per_page: 100 });
  const { data: ipPoolsData } = useGetSendingIPPoolsQuery();
  const { data: espsData } = useGetSendingESPsQuery();

  const [createCampaign, { isLoading: isCreating }] = useCreateCampaignMutation();
  const [estimateAudience, { data: estimate, isLoading: isEstimating }] = useEstimateAudienceMutation();
  const [previewCampaign, { isLoading: isPreviewing }] = usePreviewCampaignMutation();

  // Trigger audience estimate when list or filter changes
  useEffect(() => {
    if (mailListID) {
      estimateAudience({
        mail_list_id: mailListID,
        audience_filter: audienceFilter,
      });
    }
  }, [mailListID, audienceFilter, estimateAudience]);

  // Handle Live Preview generation
  const handleGeneratePreview = async () => {
    try {
      const resp = await previewCampaign({
        subject,
        html_content: htmlContent,
        plain_content: plainContent,
        custom_headers: customHeaders.reduce((acc, h) => {
          if (h.key && h.value) acc[h.key] = h.value;
          return acc;
        }, {} as Record<string, string>),
        sample_contact: {
          first_name: "Sarah",
          last_name: "Connor",
          email: "sarah.connor@example.com",
          city: "Los Angeles",
          country: "United States",
          country_code: "US",
        },
      }).unwrap();
      setPreviewData(resp);
    } catch (err: any) {
      notify.error("Failed to render preview");
    }
  };

  const insertMergeTag = (tag: string, target: "subject" | "html" | "plain") => {
    if (target === "subject") {
      setSubject((prev) => prev + " " + tag);
    } else if (target === "html") {
      setHtmlContent((prev) => prev + tag);
    } else {
      setPlainContent((prev) => prev + tag);
    }
    notify.info(`Inserted ${tag}`);
  };

  const handleAddHeader = () => {
    setCustomHeaders([...customHeaders, { key: "", value: "" }]);
  };

  const handleRemoveHeader = (index: number) => {
    setCustomHeaders(customHeaders.filter((_, i) => i !== index));
  };

  const handleSubmit = async (launchImmediately: boolean) => {
    if (!name.trim()) {
      notify.error("Campaign name is required");
      setCurrentStep(1);
      return;
    }
    if (!subject.trim()) {
      notify.error("Subject line is required");
      setCurrentStep(1);
      return;
    }
    if (!mailListID) {
      notify.error("Please select a target Mail List");
      setCurrentStep(2);
      return;
    }

    let scheduledTime: string | undefined = undefined;
    if (scheduleMode === "scheduled" && scheduledAtDate) {
      const combined = new Date(`${scheduledAtDate}T${scheduledAtTime || "00:00"}:00Z`);
      scheduledTime = combined.toISOString();
    }

    const headersMap: Record<string, string> = {};
    customHeaders.forEach((h) => {
      if (h.key.trim() && h.value.trim()) {
        headersMap[h.key.trim()] = h.value.trim();
      }
    });

    try {
      const resp = await createCampaign({
        name,
        subject,
        from_name: fromName,
        from_email: fromEmail,
        reply_to: replyTo || undefined,
        mail_list_id: mailListID,
        audience_filter: audienceFilter,
        routing_type: routingType,
        sending_ip_pool_id: sendingIPPoolID || undefined,
        sending_esp_id: sendingESPID || undefined,
        custom_vmta: customVMTA || undefined,
        html_content: htmlContent,
        plain_content: plainContent,
        custom_headers: headersMap,
        track_opens: trackOpens,
        track_clicks: trackClicks,
        list_unsubscribe_header: listUnsubscribeHeader,
        scheduled_at: scheduledTime,
        hourly_limit: hourlyLimit,
        batch_size: batchSize,
      }).unwrap();

      notify.success("Campaign created successfully");

      if (launchImmediately) {
        // Redirect directly to details to launch or monitor
        router.push(`/campaigns/${resp.campaign.id}?autoLaunch=true`);
      } else {
        router.push(`/campaigns/${resp.campaign.id}`);
      }
    } catch (err: any) {
      notify.error(err?.data?.message || "Failed to create campaign");
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Back and Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/campaigns">
            <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-slate-400 hover:text-white hover:bg-slate-800">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <SendHorizontal className="h-5 w-5 text-blue-400" />
              Create Email Campaign
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Step-by-step assembly wizard for multi-part email generation and file spooling.
            </p>
          </div>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {STEPS.map((s) => {
          const isComplete = currentStep > s.id;
          const isCurrent = currentStep === s.id;

          return (
            <button
              key={s.id}
              onClick={() => setCurrentStep(s.id)}
              className={cn(
                "p-3 rounded-xl border text-left transition-all",
                isCurrent
                  ? "bg-blue-600/10 border-blue-500/40 text-blue-400 shadow-md shadow-blue-500/5"
                  : isComplete
                  ? "bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700"
                  : "bg-slate-950/40 border-slate-900 text-slate-600 cursor-not-allowed"
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                    isCurrent
                      ? "bg-blue-600 text-white"
                      : isComplete
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-slate-800 text-slate-500"
                  )}
                >
                  {isComplete ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.id}
                </span>
                <span className="text-xs font-semibold truncate">{s.name}</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 pl-8 truncate">{s.desc}</p>
            </button>
          );
        })}
      </div>

      {/* STEP 1: CAMPAIGN BASICS */}
      {currentStep === 1 && (
        <Card className="bg-slate-900/50 border-slate-800 backdrop-blur">
          <CardContent className="p-6 space-y-5">
            <div>
              <h2 className="text-base font-semibold text-white">Campaign Details</h2>
              <p className="text-xs text-slate-400 mt-0.5">Specify identifying name, subject line, and sender addresses.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-medium text-slate-300">Campaign Name *</label>
                <input
                  type="text"
                  placeholder="e.g. October Product Launch - Retail USA"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-300">Subject Line *</label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-500">Insert tag:</span>
                    <button
                      type="button"
                      onClick={() => insertMergeTag("{{first_name}}", "subject")}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-blue-400 font-mono"
                    >
                      {"{{first_name}}"}
                    </button>
                    <button
                      type="button"
                      onClick={() => insertMergeTag("{{city}}", "subject")}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-blue-400 font-mono"
                    >
                      {"{{city}}"}
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="e.g. Special offer for {{first_name}} from Stansia"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">From Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Acme Deals Team"
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">From Email Address *</label>
                <input
                  type="email"
                  placeholder="e.g. newsletter@deals.example.com"
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-medium text-slate-300">Reply-To Email Address (Optional)</label>
                <input
                  type="email"
                  placeholder="e.g. support@deals.example.com"
                  value={replyTo}
                  onChange={(e) => setReplyTo(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-800/80">
              <Button
                onClick={() => {
                  if (!name.trim()) {
                    notify.error("Campaign name is required");
                    return;
                  }
                  if (!subject.trim()) {
                    notify.error("Subject line is required");
                    return;
                  }
                  setCurrentStep(2);
                }}
                className="bg-blue-600 hover:bg-blue-500 text-white"
              >
                Next: Target Audience &rarr;
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2: TARGET AUDIENCE */}
      {currentStep === 2 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="bg-slate-900/50 border-slate-800 backdrop-blur">
              <CardContent className="p-6 space-y-5">
                <div>
                  <h2 className="text-base font-semibold text-white">Select Mail List</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Pick an authorized list of contacts organized by Mailbox Provider, Country, and Vertical.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Target Mail List *</label>
                  <select
                    value={mailListID}
                    onChange={(e) => setMailListID(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">-- Select a Mail List --</option>
                    {listsData?.lists?.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name} ({list.code}) &mdash; {list.contact_count.toLocaleString()} contacts
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pt-4 border-t border-slate-800/80 space-y-3">
                  <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                    Audience Filters & Suppression Rules
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="flex items-center gap-2.5 p-3 rounded-lg bg-slate-950/40 border border-slate-800/80 cursor-pointer hover:bg-slate-950/80 transition-colors">
                      <input
                        type="checkbox"
                        checked={audienceFilter.only_clean}
                        onChange={(e) =>
                          setAudienceFilter({ ...audienceFilter, only_clean: e.target.checked })
                        }
                        className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0"
                      />
                      <div>
                        <div className="text-xs font-medium text-slate-200">Clean Contacts Only</div>
                        <div className="text-[10px] text-slate-500">Exclude syntax-risky addresses</div>
                      </div>
                    </label>

                    <label className="flex items-center gap-2.5 p-3 rounded-lg bg-slate-950/40 border border-slate-800/80 cursor-pointer hover:bg-slate-950/80 transition-colors">
                      <input
                        type="checkbox"
                        checked={audienceFilter.exclude_unsubs}
                        onChange={(e) =>
                          setAudienceFilter({ ...audienceFilter, exclude_unsubs: e.target.checked })
                        }
                        className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0"
                      />
                      <div>
                        <div className="text-xs font-medium text-slate-200">Strict Suppressions</div>
                        <div className="text-[10px] text-slate-500">Auto-filter unsubs, bounces & optouts</div>
                      </div>
                    </label>

                    <label className="flex items-center gap-2.5 p-3 rounded-lg bg-slate-950/40 border border-slate-800/80 cursor-pointer hover:bg-slate-950/80 transition-colors">
                      <input
                        type="checkbox"
                        checked={audienceFilter.only_openers}
                        onChange={(e) =>
                          setAudienceFilter({ ...audienceFilter, only_openers: e.target.checked })
                        }
                        className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0"
                      />
                      <div>
                        <div className="text-xs font-medium text-slate-200">Active Openers Only</div>
                        <div className="text-[10px] text-slate-500">Target contacts with proven opens</div>
                      </div>
                    </label>

                    <label className="flex items-center gap-2.5 p-3 rounded-lg bg-slate-950/40 border border-slate-800/80 cursor-pointer hover:bg-slate-950/80 transition-colors">
                      <input
                        type="checkbox"
                        checked={audienceFilter.only_clickers}
                        onChange={(e) =>
                          setAudienceFilter({ ...audienceFilter, only_clickers: e.target.checked })
                        }
                        className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0"
                      />
                      <div>
                        <div className="text-xs font-medium text-slate-200">Clickers Only</div>
                        <div className="text-[10px] text-slate-500">High-intent engaged recipients</div>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="flex justify-between pt-4 border-t border-slate-800/80">
                  <Button variant="ghost" onClick={() => setCurrentStep(1)} className="text-slate-400">
                    &larr; Back
                  </Button>
                  <Button
                    onClick={() => {
                      if (!mailListID) {
                        notify.error("Please select a target Mail List");
                        return;
                      }
                      setCurrentStep(3);
                    }}
                    className="bg-blue-600 hover:bg-blue-500 text-white"
                  >
                    Next: Outbound Routing &rarr;
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Real-Time Audience Estimator Card */}
          <div className="space-y-4">
            <Card className="bg-slate-900/60 border-slate-800 sticky top-4">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2 text-slate-200">
                  <Sparkles className="h-4 w-4 text-blue-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider">Live Audience Estimate</h3>
                </div>

                {isEstimating ? (
                  <div className="py-8 text-center text-xs text-slate-500">
                    <span className="animate-pulse">Calculating audience segments...</span>
                  </div>
                ) : estimate ? (
                  <div className="space-y-3">
                    <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                      <div className="text-[11px] text-slate-400">Total Contacts in List</div>
                      <div className="text-xl font-bold text-slate-200 mt-0.5">
                        {estimate.total_in_list.toLocaleString()}
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                      <div className="text-[11px] text-slate-400">Matching Filter Criteria</div>
                      <div className="text-lg font-bold text-blue-400 mt-0.5">
                        {estimate.matching_filter.toLocaleString()}
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                      <div className="text-[11px] text-slate-400">Suppressed / Excluded</div>
                      <div className="text-lg font-bold text-rose-400 mt-0.5">
                        - {estimate.suppressed_count.toLocaleString()}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Matched against Global & List Suppressions
                      </p>
                    </div>

                    <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                      <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
                        Eligible to Receive Campaign
                      </div>
                      <div className="text-2xl font-black text-emerald-300 mt-1">
                        {estimate.eligible_to_send.toLocaleString()}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Messages will be generated and spooled for these contacts.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-slate-500">
                    Select a Mail List to compute live recipient metrics.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* STEP 3: ROUTING & DELIVERY SETTINGS */}
      {currentStep === 3 && (
        <Card className="bg-slate-900/50 border-slate-800 backdrop-blur">
          <CardContent className="p-6 space-y-6">
            <div>
              <h2 className="text-base font-semibold text-white">Outbound Routing Mode</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Configure how the generated messages will be spooled or routed.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label
                className={cn(
                  "p-4 rounded-xl border text-left cursor-pointer transition-all",
                  routingType === "file_spool"
                    ? "bg-blue-600/10 border-blue-500 text-blue-400 shadow-sm"
                    : "bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-900"
                )}
              >
                <input
                  type="radio"
                  name="routing_type"
                  value="file_spool"
                  checked={routingType === "file_spool"}
                  onChange={() => setRoutingType("file_spool")}
                  className="sr-only"
                />
                <FileCode className="h-5 w-5 mb-2 text-blue-400" />
                <div className="font-semibold text-xs text-slate-200">Local EML File Spooler</div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Generates RFC 5322 .eml files directly into campaign spool directory on disk.
                </div>
                <Badge variant="outline" className="mt-2.5 bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px]">
                  Recommended (No PMTA yet)
                </Badge>
              </label>

              <label
                className={cn(
                  "p-4 rounded-xl border text-left cursor-pointer transition-all",
                  routingType === "ip_pool"
                    ? "bg-blue-600/10 border-blue-500 text-blue-400 shadow-sm"
                    : "bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-900"
                )}
              >
                <input
                  type="radio"
                  name="routing_type"
                  value="ip_pool"
                  checked={routingType === "ip_pool"}
                  onChange={() => setRoutingType("ip_pool")}
                  className="sr-only"
                />
                <Layers className="h-5 w-5 mb-2 text-purple-400" />
                <div className="font-semibold text-xs text-slate-200">Sending IP Pool</div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Tag messages for round-robin rotation across an IP Pool.
                </div>
              </label>

              <label
                className={cn(
                  "p-4 rounded-xl border text-left cursor-pointer transition-all",
                  routingType === "sending_esp"
                    ? "bg-blue-600/10 border-blue-500 text-blue-400 shadow-sm"
                    : "bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-900"
                )}
              >
                <input
                  type="radio"
                  name="routing_type"
                  value="sending_esp"
                  checked={routingType === "sending_esp"}
                  onChange={() => setRoutingType("sending_esp")}
                  className="sr-only"
                />
                <SendHorizontal className="h-5 w-5 mb-2 text-emerald-400" />
                <div className="font-semibold text-xs text-slate-200">Sending ESP Relay</div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Tag messages for delivery via third-party sending provider.
                </div>
              </label>
            </div>

            {/* Conditional selects for IP Pool and ESP */}
            {routingType === "ip_pool" && (
              <div className="space-y-1.5 p-4 rounded-lg bg-slate-950/60 border border-slate-800">
                <label className="text-xs font-medium text-slate-300">Choose Sending IP Pool</label>
                <select
                  value={sendingIPPoolID}
                  onChange={(e) => setSendingIPPoolID(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- Select an IP Pool --</option>
                  {ipPoolsData?.pools?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {routingType === "sending_esp" && (
              <div className="space-y-1.5 p-4 rounded-lg bg-slate-950/60 border border-slate-800">
                <label className="text-xs font-medium text-slate-300">Choose Sending ESP</label>
                <select
                  value={sendingESPID}
                  onChange={(e) => setSendingESPID(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- Select a Sending ESP --</option>
                  {espsData?.esps?.map((esp) => (
                    <option key={esp.id} value={esp.id}>
                      {esp.name} ({esp.provider_type})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Advanced MTA & Unsubscribe Headers */}
            <div className="pt-4 border-t border-slate-800/80 space-y-4">
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                Headers & Compliance Settings
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">X-Virtual-MTA Header (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. vmta_pool1_ip1"
                    value={customVMTA}
                    onChange={(e) => setCustomVMTA(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-[10px] text-slate-500">
                    Injects <code className="text-slate-400">X-Virtual-MTA: [name]</code> into each message header.
                  </p>
                </div>

                <div className="space-y-3">
                  <label className="flex items-center gap-2.5 p-3 rounded-lg bg-slate-950/40 border border-slate-800/80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={listUnsubscribeHeader}
                      onChange={(e) => setListUnsubscribeHeader(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0"
                    />
                    <div>
                      <div className="text-xs font-medium text-slate-200">
                        RFC 8058 1-Click List-Unsubscribe Header
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Required by Google & Yahoo for high-inbox deliverability
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Custom Headers */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-300">Custom Email Headers</label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddHeader}
                    className="h-7 text-xs border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Header
                  </Button>
                </div>

                {customHeaders.map((header, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Header Name (e.g. X-Category)"
                      value={header.key}
                      onChange={(e) => {
                        const updated = [...customHeaders];
                        updated[idx].key = e.target.value;
                        setCustomHeaders(updated);
                      }}
                      className="w-1/2 px-3 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                    <input
                      type="text"
                      placeholder="Header Value"
                      value={header.value}
                      onChange={(e) => {
                        const updated = [...customHeaders];
                        updated[idx].value = e.target.value;
                        setCustomHeaders(updated);
                      }}
                      className="w-1/2 px-3 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveHeader(idx)}
                      className="h-8 w-8 p-0 text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t border-slate-800/80">
              <Button variant="ghost" onClick={() => setCurrentStep(2)} className="text-slate-400">
                &larr; Back
              </Button>
              <Button onClick={() => setCurrentStep(4)} className="bg-blue-600 hover:bg-blue-500 text-white">
                Next: Message Composer &rarr;
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 4: MESSAGE COMPOSER & SCHEDULE */}
      {currentStep === 4 && (
        <div className="space-y-6">
          <Card className="bg-slate-900/50 border-slate-800 backdrop-blur">
            <CardContent className="p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-white">Multi-Part Message Content</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Compose both HTML and Plaintext versions. Merge tags will be automatically replaced per recipient.
                  </p>
                </div>

                {/* Editor Tabs */}
                <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-950 border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setEditorTab("html")}
                    className={cn(
                      "px-3 py-1.5 rounded text-xs font-medium transition-colors",
                      editorTab === "html" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                    )}
                  >
                    HTML Content
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorTab("plain")}
                    className={cn(
                      "px-3 py-1.5 rounded text-xs font-medium transition-colors",
                      editorTab === "plain" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                    )}
                  >
                    Plaintext Fallback
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditorTab("preview");
                      handleGeneratePreview();
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1",
                      editorTab === "preview" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                    )}
                  >
                    <Eye className="h-3 w-3" />
                    Live Preview
                  </button>
                </div>
              </div>

              {/* Merge Tag Palette */}
              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-400 mr-2 flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5 text-blue-400" />
                  Merge Tags:
                </span>
                {["{{first_name}}", "{{last_name}}", "{{email}}", "{{city}}", "{{country}}", "{{unsubscribe_url}}"].map(
                  (tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => insertMergeTag(tag, editorTab === "plain" ? "plain" : "html")}
                      className="px-2 py-1 rounded bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-[11px] font-mono text-blue-300 transition-colors"
                    >
                      {tag}
                    </button>
                  )
                )}
              </div>

              {/* HTML Editor */}
              {editorTab === "html" && (
                <div className="space-y-1.5">
                  <textarea
                    rows={18}
                    value={htmlContent}
                    onChange={(e) => setHtmlContent(e.target.value)}
                    className="w-full p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-200 focus:outline-none focus:border-blue-500 leading-relaxed"
                    placeholder="Enter full HTML content..."
                  />
                </div>
              )}

              {/* Plaintext Editor */}
              {editorTab === "plain" && (
                <div className="space-y-1.5">
                  <textarea
                    rows={14}
                    value={plainContent}
                    onChange={(e) => setPlainContent(e.target.value)}
                    className="w-full p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-200 focus:outline-none focus:border-blue-500 leading-relaxed"
                    placeholder="Enter plaintext fallback content..."
                  />
                </div>
              )}

              {/* Live Preview Tab */}
              {editorTab === "preview" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div className="text-xs text-slate-400">
                      Sample Recipient: <span className="text-white font-medium">Sarah Connor &lt;sarah.connor@example.com&gt;</span>
                    </div>

                    <div className="flex items-center gap-1 p-0.5 rounded bg-slate-950 border border-slate-800">
                      <button
                        type="button"
                        onClick={() => setPreviewDevice("desktop")}
                        className={cn(
                          "px-2 py-1 rounded text-xs",
                          previewDevice === "desktop" ? "bg-slate-800 text-white" : "text-slate-400"
                        )}
                      >
                        <Monitor className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewDevice("mobile")}
                        className={cn(
                          "px-2 py-1 rounded text-xs",
                          previewDevice === "mobile" ? "bg-slate-800 text-white" : "text-slate-400"
                        )}
                      >
                        <Smartphone className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {isPreviewing ? (
                    <div className="py-12 text-center text-xs text-slate-500">
                      <span className="animate-pulse">Rendering personalized message...</span>
                    </div>
                  ) : previewData ? (
                    <div className="space-y-4">
                      <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 text-xs text-slate-300">
                        <span className="text-slate-500">Subject: </span>
                        <span className="font-semibold text-white">{previewData.rendered_subject}</span>
                      </div>

                      <div
                        className={cn(
                          "mx-auto transition-all rounded-xl border border-slate-800 bg-white overflow-hidden shadow-2xl",
                          previewDevice === "mobile" ? "max-w-sm" : "max-w-full"
                        )}
                      >
                        <iframe
                          title="HTML Preview"
                          srcDoc={previewData.rendered_html}
                          className="w-full h-[450px] border-0"
                          sandbox="allow-same-origin"
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Dispatch Schedule & Throttle Controls */}
              <div className="pt-5 border-t border-slate-800/80 space-y-4">
                <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-400" />
                  Dispatch Schedule & Spool Throughput
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-300">Dispatch Timing</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setScheduleMode("immediate")}
                        className={cn(
                          "flex-1 py-2 px-3 rounded-lg text-xs font-medium border transition-colors",
                          scheduleMode === "immediate"
                            ? "bg-blue-600/10 border-blue-500 text-blue-400"
                            : "bg-slate-950/40 border-slate-800 text-slate-400"
                        )}
                      >
                        Immediate Launch
                      </button>
                      <button
                        type="button"
                        onClick={() => setScheduleMode("scheduled")}
                        className={cn(
                          "flex-1 py-2 px-3 rounded-lg text-xs font-medium border transition-colors",
                          scheduleMode === "scheduled"
                            ? "bg-blue-600/10 border-blue-500 text-blue-400"
                            : "bg-slate-950/40 border-slate-800 text-slate-400"
                        )}
                      >
                        Schedule Later
                      </button>
                    </div>
                  </div>

                  {scheduleMode === "scheduled" && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">Scheduled Date & Time (UTC)</label>
                      <div className="flex gap-2">
                        <input
                          type="date"
                          value={scheduledAtDate}
                          onChange={(e) => setScheduledAtDate(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-white"
                        />
                        <input
                          type="time"
                          value={scheduledAtTime}
                          onChange={(e) => setScheduledAtTime(e.target.value)}
                          className="w-32 px-3 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-white"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Hourly Limit / Throttling</label>
                    <input
                      type="number"
                      min="0"
                      step="50"
                      placeholder="0 for unlimited speed"
                      value={hourlyLimit || ""}
                      onChange={(e) => setHourlyLimit(parseInt(e.target.value, 10) || 0)}
                      className="w-full px-3.5 py-2 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                    <p className="text-[10px] text-slate-500">0 = process at maximum disk spooling rate.</p>
                  </div>
                </div>
              </div>

              {/* Wizard Bottom Controls */}
              <div className="flex items-center justify-between pt-5 border-t border-slate-800/80">
                <Button variant="ghost" onClick={() => setCurrentStep(3)} className="text-slate-400">
                  &larr; Back
                </Button>

                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={() => handleSubmit(false)}
                    disabled={isCreating}
                    className="border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800"
                  >
                    Save as Draft
                  </Button>

                  <Button
                    onClick={() => handleSubmit(true)}
                    disabled={isCreating}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Queue & Launch Dispatcher
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
