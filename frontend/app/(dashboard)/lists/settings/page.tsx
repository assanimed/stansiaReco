"use client";

import React, { useState, useEffect } from "react";
import {
  Sliders,
  RefreshCw,
  Save,
  ShieldCheck,
  UploadCloud,
  Filter,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useGetDataSettingsQuery,
  useUpdateDataSettingsMutation,
} from "@/lib/store/api/lists-api";
import { notify } from "@/lib/notifications/notification-store";

export default function DataSettingsPage() {
  const { data: settingsData, isLoading, isFetching, refetch } = useGetDataSettingsQuery();
  const [updateSettings, { isLoading: isUpdating }] = useUpdateDataSettingsMutation();

  // Local state for settings keys
  const [maxFileSizeMB, setMaxFileSizeMB] = useState(100);
  const [maxRowsPerJob, setMaxRowsPerJob] = useState(1000000);
  const [concurrentJobs, setConcurrentJobs] = useState(3);

  const [lowercaseEmail, setLowercaseEmail] = useState(true);
  const [trimWhitespace, setTrimWhitespace] = useState(true);
  const [preservePlusTags, setPreservePlusTags] = useState(true);
  const [stripControlChars, setStripControlChars] = useState(true);

  const [autoSuppressBounces, setAutoSuppressBounces] = useState(true);
  const [globalSuppressionPriority, setGlobalSuppressionPriority] = useState(true);

  useEffect(() => {
    if (settingsData?.settings) {
      const s = settingsData.settings;
      if (s.import_limits) {
        setMaxFileSizeMB(s.import_limits.max_file_size_mb ?? 100);
        setMaxRowsPerJob(s.import_limits.max_rows_per_job ?? 1000000);
        setConcurrentJobs(s.import_limits.concurrent_jobs ?? 3);
      }
      if (s.normalization_rules) {
        setLowercaseEmail(s.normalization_rules.lowercase_email ?? true);
        setTrimWhitespace(s.normalization_rules.trim_whitespace ?? true);
        setPreservePlusTags(s.normalization_rules.preserve_plus_tags ?? true);
        setStripControlChars(s.normalization_rules.strip_control_chars ?? true);
      }
      if (s.suppression_rules) {
        setAutoSuppressBounces(s.suppression_rules.auto_suppress_hard_bounces ?? true);
        setGlobalSuppressionPriority(s.suppression_rules.global_suppressions_take_precedence ?? true);
      }
    }
  }, [settingsData]);

  const handleSaveImportLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateSettings({
        key: "import_limits",
        value: {
          max_file_size_mb: Number(maxFileSizeMB),
          max_rows_per_job: Number(maxRowsPerJob),
          concurrent_jobs: Number(concurrentJobs),
        },
        description: "CSV import upload and row processing constraints",
      }).unwrap();

      notify.success("Import limit constraints updated.");
    } catch (err: any) {
      notify.error(err?.data?.error || "Failed to update import limits.");
    }
  };

  const handleSaveNormalization = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateSettings({
        key: "normalization_rules",
        value: {
          lowercase_email: lowercaseEmail,
          trim_whitespace: trimWhitespace,
          preserve_plus_tags: preservePlusTags,
          strip_control_chars: stripControlChars,
        },
        description: "Contact email address cleaning policies",
      }).unwrap();

      notify.success("Email normalization rules saved.");
    } catch (err: any) {
      notify.error(err?.data?.error || "Failed to update normalization rules.");
    }
  };

  const handleSaveSuppressionRules = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateSettings({
        key: "suppression_rules",
        value: {
          auto_suppress_hard_bounces: autoSuppressBounces,
          global_suppressions_take_precedence: globalSuppressionPriority,
        },
        description: "Sending compliance and suppression rules",
      }).unwrap();

      notify.success("Suppression precedence rules saved.");
    } catch (err: any) {
      notify.error(err?.data?.error || "Failed to update suppression rules.");
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2.5">
            <Sliders className="h-7 w-7 text-blue-500" />
            Data Settings & Hygiene Rules
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Configure CSV ingestion limits, email address sanitization policies, and suppression precedence rules.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="border-slate-800 text-slate-300 hover:bg-slate-800 self-start sm:self-auto"
        >
          <RefreshCw className={cn("h-4 w-4 mr-1.5", isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-slate-500">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
          Loading administrative settings...
        </div>
      ) : (
        <div className="space-y-6">
          {/* Section 1: Import Limits */}
          <Card className="bg-slate-900/60 border-slate-800">
            <CardContent className="p-6">
              <form onSubmit={handleSaveImportLimits} className="space-y-4">
                <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                      <UploadCloud className="h-4 w-4 text-blue-400" />
                      CSV Ingestion Constraints
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Protect backend worker resources against runaway memory usage during large bulk imports.
                    </p>
                  </div>
                  <Button type="submit" size="sm" disabled={isUpdating} className="bg-blue-600 hover:bg-blue-700 text-white">
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                    Save Limits
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Max Upload File Size (MB)</label>
                    <input
                      type="number"
                      min={10}
                      max={500}
                      value={maxFileSizeMB}
                      onChange={(e) => setMaxFileSizeMB(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Max Rows Per Job</label>
                    <input
                      type="number"
                      min={1000}
                      max={10000000}
                      step={10000}
                      value={maxRowsPerJob}
                      onChange={(e) => setMaxRowsPerJob(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Concurrent Worker Jobs</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={concurrentJobs}
                      onChange={(e) => setConcurrentJobs(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Section 2: Email Normalization */}
          <Card className="bg-slate-900/60 border-slate-800">
            <CardContent className="p-6">
              <form onSubmit={handleSaveNormalization} className="space-y-4">
                <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                      <Filter className="h-4 w-4 text-emerald-400" />
                      Email Sanitization & Normalization
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Standardize email addresses before calculating MD5 hashes and inserting records.
                    </p>
                  </div>
                  <Button type="submit" size="sm" disabled={isUpdating} className="bg-blue-600 hover:bg-blue-700 text-white">
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                    Save Normalization
                  </Button>
                </div>

                <div className="space-y-3 pt-1 text-xs">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={lowercaseEmail}
                      onChange={(e) => setLowercaseEmail(e.target.checked)}
                      className="rounded border-slate-800 text-blue-600 focus:ring-0"
                    />
                    <div>
                      <span className="font-medium text-slate-200">Convert to lowercase</span>
                      <p className="text-slate-500 text-[11px]">Enforces RFC 5321 lowercase normalization for consistent uniqueness matching.</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={trimWhitespace}
                      onChange={(e) => setTrimWhitespace(e.target.checked)}
                      className="rounded border-slate-800 text-blue-600 focus:ring-0"
                    />
                    <div>
                      <span className="font-medium text-slate-200">Trim leading and trailing whitespace</span>
                      <p className="text-slate-500 text-[11px]">Strips accidental tabs, spaces, and invisible padding from CSV values.</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preservePlusTags}
                      onChange={(e) => setPreservePlusTags(e.target.checked)}
                      className="rounded border-slate-800 text-blue-600 focus:ring-0"
                    />
                    <div>
                      <span className="font-medium text-slate-200">Preserve subaddress plus tags (user+tag@domain.com)</span>
                      <p className="text-slate-500 text-[11px]">Keep explicit mailbox routing tags without stripping the + extension.</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={stripControlChars}
                      onChange={(e) => setStripControlChars(e.target.checked)}
                      className="rounded border-slate-800 text-blue-600 focus:ring-0"
                    />
                    <div>
                      <span className="font-medium text-slate-200">Strip non-printable and ASCII control characters</span>
                      <p className="text-slate-500 text-[11px]">Removes null bytes and control codes that cause SMTP command injection failures.</p>
                    </div>
                  </label>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Section 3: Suppression Policies */}
          <Card className="bg-slate-900/60 border-slate-800">
            <CardContent className="p-6">
              <form onSubmit={handleSaveSuppressionRules} className="space-y-4">
                <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-purple-400" />
                      Compliance & Suppression Precedence
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Ensure CAN-SPAM and GDPR compliance during contact imports and mailing campaigns.
                    </p>
                  </div>
                  <Button type="submit" size="sm" disabled={isUpdating} className="bg-blue-600 hover:bg-blue-700 text-white">
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                    Save Policies
                  </Button>
                </div>

                <div className="space-y-3 pt-1 text-xs">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoSuppressBounces}
                      onChange={(e) => setAutoSuppressBounces(e.target.checked)}
                      className="rounded border-slate-800 text-blue-600 focus:ring-0"
                    />
                    <div>
                      <span className="font-medium text-slate-200">Automatic quarantine for hard bounces</span>
                      <p className="text-slate-500 text-[11px]">Automatically add 5xx permanent delivery failures into the suppression table.</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={globalSuppressionPriority}
                      onChange={(e) => setGlobalSuppressionPriority(e.target.checked)}
                      className="rounded border-slate-800 text-blue-600 focus:ring-0"
                    />
                    <div>
                      <span className="font-medium text-slate-200">Global suppressions take precedence over list imports</span>
                      <p className="text-slate-500 text-[11px]">
                        Contacts suppressed globally will NEVER be re-activated or overwritten by fresh CSV uploads.
                      </p>
                    </div>
                  </label>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
