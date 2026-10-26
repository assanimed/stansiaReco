"use client";

import React, { useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  FileSpreadsheet,
  UploadCloud,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Database,
  Search,
  ChevronLeft,
  ChevronRight,
  Sliders,
  HelpCircle,
  Ban,
  FileCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useGetImportJobsQuery,
  useGetMailListsQuery,
  usePreviewCSVMutation,
  useCreateImportJobMutation,
  useCancelImportJobMutation,
  ImportJob,
  CSVPreviewResult,
} from "@/lib/store/api/lists-api";
import { notify } from "@/lib/notifications/notification-store";
import { confirmAction } from "@/lib/dialogs/confirm-dialog-service";

export default function ImportJobsPage() {
  const searchParams = useSearchParams();
  const initialListId = searchParams.get("list_id") || "";

  // Wizard state
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [targetListId, setTargetListId] = useState(initialListId);
  const [duplicateStrategy, setDuplicateStrategy] = useState<"skip" | "update" | "replace">("skip");

  // Preview result & Column mapping state
  const [previewData, setPreviewData] = useState<CSVPreviewResult | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, number>>({});

  // Table filters & pagination
  const [filterList, setFilterList] = useState(initialListId);
  const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 15;

  // Selected error report modal
  const [selectedErrorJob, setSelectedErrorJob] = useState<ImportJob | null>(null);

  // Queries
  const { data: listsData } = useGetMailListsQuery({ per_page: 100 });
  const {
    data: jobsData,
    isLoading,
    isFetching,
    refetch,
  } = useGetImportJobsQuery(
    {
      list_id: filterList || undefined,
      status: filterStatus || undefined,
      page,
      per_page: perPage,
    },
    { pollingInterval: 4000 }
  );

  const [previewCSV, { isLoading: isPreviewing }] = usePreviewCSVMutation();
  const [createImportJob, { isLoading: isSubmitting }] = useCreateImportJobMutation();
  const [cancelImportJob] = useCancelImportJobMutation();

  const jobs = jobsData?.jobs || [];
  const total = jobsData?.total || 0;
  const totalPages = Math.ceil(total / perPage) || 1;

  // Handle Step 1 -> Step 2 (Preview CSV)
  const handlePreviewUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      notify.error("Please select a CSV file to upload.");
      return;
    }
    if (!targetListId) {
      notify.error("Please select a target mail list.");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await previewCSV(formData).unwrap();
      setPreviewData(res);

      // Initialize column mapping directly from backend suggested maps (fieldKey -> columnIdx)
      const initialMap: Record<string, number> = { ...(res.suggested_maps || {}) };
      if (res.headers.length === 1 && initialMap["email"] === undefined) {
        initialMap["email"] = 0;
      }
      setColumnMapping(initialMap);
      setWizardStep(2);
    } catch (err: any) {
      notify.error(err?.data?.error || "Failed to parse CSV file. Ensure it is a valid CSV.");
    }
  };

  // Handle Step 2 -> Step 3 (Launch Background Import Job)
  const handleLaunchImport = async () => {
    if (!selectedFile || !targetListId) return;

    if (columnMapping["email"] === undefined || columnMapping["email"] < 0) {
      notify.error("A column mapping for 'Email Address' is strictly required.");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("list_id", targetListId);
    formData.append("duplicate_strategy", duplicateStrategy);
    formData.append("column_mapping", JSON.stringify(columnMapping));

    try {
      await createImportJob(formData).unwrap();
      notify.success("CSV import job queued for background streaming processing.");
      // Reset wizard
      setSelectedFile(null);
      setPreviewData(null);
      setColumnMapping({});
      setWizardStep(1);
    } catch (err: any) {
      notify.error(err?.data?.error || "Failed to start import job.");
    }
  };

  const handleCancel = async (job: ImportJob) => {
    const confirmed = await confirmAction({
      title: "Cancel Import Job",
      message: `Are you sure you want to cancel the active import for ${job.filename}?`,
      confirmLabel: "Cancel Job",
      variant: "destructive",
    });

    if (!confirmed) return;

    try {
      await cancelImportJob(job.id).unwrap();
      notify.success("Import job cancellation requested.");
    } catch (err: any) {
      notify.error(err?.data?.error || "Failed to cancel import job.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2.5">
            <FileSpreadsheet className="h-7 w-7 text-blue-500" />
            CSV Import Jobs
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Asynchronously stream, auto-map, sanitize, and ingest large contact lists with live status tracking.
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

      {/* Import Wizard Card */}
      <Card className="bg-slate-900/60 border-slate-800">
        <CardContent className="p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <UploadCloud className="h-5 w-5 text-blue-500" />
              Upload & Map Contacts CSV
            </h2>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
              <span className={cn("px-2 py-0.5 rounded", wizardStep === 1 ? "bg-blue-600 text-white" : "bg-slate-800")}>
                1. Select File
              </span>
              <span>→</span>
              <span className={cn("px-2 py-0.5 rounded", wizardStep === 2 ? "bg-blue-600 text-white" : "bg-slate-800")}>
                2. Preview & Map Columns
              </span>
            </div>
          </div>

          {/* Wizard Step 1: Upload and Configuration */}
          {wizardStep === 1 && (
            <form onSubmit={handlePreviewUpload} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Target Mail List *</label>
                  <select
                    required
                    value={targetListId}
                    onChange={(e) => setTargetListId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Select destination list...</option>
                    {listsData?.lists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Duplicate Strategy</label>
                  <select
                    value={duplicateStrategy}
                    onChange={(e) => setDuplicateStrategy(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value="skip">Skip duplicates (Keep existing records untouched)</option>
                    <option value="update">Update existing records with new CSV data</option>
                    <option value="replace">Replace attributes (Preserve suppression status)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">CSV File *</label>
                  <input
                    type="file"
                    required
                    accept=".csv,text/csv"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  disabled={!selectedFile || !targetListId || isPreviewing}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isPreviewing ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />
                      Analyzing CSV Headers...
                    </>
                  ) : (
                    <>
                      Next: Inspect & Map Columns
                      <ArrowRight className="h-4 w-4 ml-1.5" />
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}

          {/* Wizard Step 2: Live Column Mapping & Preview */}
          {wizardStep === 2 && previewData && (
            <div className="space-y-4">
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex items-center justify-between text-xs text-slate-300">
                <div>
                  Detected <strong className="text-white">{previewData.headers.length}</strong> columns and approx{" "}
                  <strong className="text-white">{previewData.total_rows_est.toLocaleString()}</strong> rows in{" "}
                  <span className="font-mono text-blue-400">{selectedFile?.name}</span>.
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setWizardStep(1)}
                  className="h-7 text-xs text-slate-400 hover:text-white"
                >
                  Change File
                </Button>
              </div>

              {/* Single Column Email List Info Banner */}
              {previewData.headers.length === 1 && (
                <div className="bg-blue-950/40 border border-blue-500/30 rounded-lg p-3.5 flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-blue-400 mt-0.5 shrink-0" />
                  <div className="text-xs space-y-1">
                    <p className="font-semibold text-blue-200">
                      Single-Column Email List Auto-Configured
                    </p>
                    <p className="text-blue-300/80 leading-relaxed">
                      Column 1 is automatically mapped to <strong>Email Address</strong>.
                      Both <strong>First Name</strong> and <strong>Last Name</strong> will automatically be populated with the email username prefix before the <code className="bg-blue-900/40 px-1 py-0.5 rounded text-blue-200">@</code> (e.g. <span className="font-mono text-white">abc@gmail.com</span> → first name & last name: <span className="font-mono text-white">&quot;abc&quot;</span>).
                      All other profile fields will safely default to <code className="bg-blue-900/40 px-1 py-0.5 rounded text-blue-200">null</code> in the database.
                    </p>
                  </div>
                </div>
              )}

              {/* Column Mapping Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 bg-slate-950/60 p-4 rounded-lg border border-slate-800">
                {previewData.available_slots.map((slot) => {
                  const currentMappedIdx = columnMapping[slot.key];
                  return (
                    <div key={slot.key} className="space-y-1">
                      <label className="block text-xs font-medium text-slate-300">
                        {slot.label} {slot.required && <span className="text-rose-500">*</span>}
                      </label>
                      <select
                        value={currentMappedIdx !== undefined ? currentMappedIdx : ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setColumnMapping({
                            ...columnMapping,
                            [slot.key]: val === "" ? -1 : parseInt(val, 10),
                          });
                        }}
                        className={cn(
                          "w-full px-2.5 py-1.5 bg-slate-900 border rounded-md text-xs text-slate-200 focus:outline-none",
                          slot.required && (currentMappedIdx === undefined || currentMappedIdx < 0)
                            ? "border-rose-500/80 bg-rose-500/5 text-rose-300"
                            : "border-slate-800 focus:border-blue-500"
                        )}
                      >
                        <option value="">— Do Not Map —</option>
                        {previewData.headers.map((h, hIdx) => (
                          <option key={hIdx} value={hIdx}>
                            Column {hIdx + 1}: {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>

              {/* Sample Rows Preview */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-300">CSV Sample Records (First 5 Rows):</span>
                <div className="overflow-x-auto rounded border border-slate-800">
                  <table className="w-full text-left text-xs text-slate-300 bg-slate-950">
                    <thead className="bg-slate-900 border-b border-slate-800 text-[11px] font-mono text-slate-400">
                      <tr>
                        {previewData.headers.map((h, idx) => (
                          <th key={idx} className="px-3 py-2 truncate max-w-[150px]">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                      {previewData.sample_rows.map((row, rIdx) => (
                        <tr key={rIdx}>
                          {row.map((val, cIdx) => (
                            <td key={cIdx} className="px-3 py-1.5 truncate max-w-[150px] text-slate-400">
                              {val}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setWizardStep(1)}
                  className="border-slate-800 text-slate-300 hover:bg-slate-800"
                >
                  Back
                </Button>

                <Button
                  type="button"
                  onClick={handleLaunchImport}
                  disabled={isSubmitting || columnMapping["email"] === undefined || columnMapping["email"] < 0}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isSubmitting ? "Queueing Import..." : "Launch Background Import Job"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Jobs History Table */}
      <Card className="bg-slate-900/60 border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-500" />
            Background Import Tasks
          </h3>

          <div className="flex items-center gap-2.5">
            <select
              value={filterList}
              onChange={(e) => {
                setFilterList(e.target.value);
                setPage(1);
              }}
              className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-md text-xs text-slate-300 focus:outline-none focus:border-blue-500"
            >
              <option value="">All Mail Lists</option>
              {listsData?.lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setPage(1);
              }}
              className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-md text-xs text-slate-300 focus:outline-none focus:border-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="completed">Completed</option>
              <option value="completed_with_errors">With Errors</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-[11px] font-semibold uppercase text-slate-400 tracking-wider">
              <tr>
                <th className="px-4 py-3">File & List</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Processed / Total</th>
                <th className="px-4 py-3 text-right">Inserted</th>
                <th className="px-4 py-3 text-right">Updated</th>
                <th className="px-4 py-3 text-right">Duplicate</th>
                <th className="px-4 py-3 text-right">Suppressed</th>
                <th className="px-4 py-3 text-right">Invalid / Errors</th>
                <th className="px-4 py-3">Timestamps</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-500">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
                    Loading import jobs...
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-500">
                    No import jobs found.
                  </td>
                </tr>
              ) : (
                jobs.map((job) => {
                  const pct =
                    job.total_rows > 0 ? Math.min(Math.round((job.processed_rows / job.total_rows) * 100), 100) : 0;

                  return (
                    <tr key={job.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-mono font-medium text-slate-200">{job.filename}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          List: <strong className="text-slate-400">{job.list_name || "—"}</strong>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-full text-[10px] font-medium capitalize inline-block",
                              job.status === "completed"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : job.status === "processing"
                                ? "bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse"
                                : job.status === "completed_with_errors"
                                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                : job.status === "failed"
                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                : "bg-slate-800 text-slate-400"
                            )}
                          >
                            {job.status.replace(/_/g, " ")}
                          </span>

                          {job.status === "processing" && (
                            <div className="w-24 bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
                              <div style={{ width: `${pct}%` }} className="bg-blue-500 h-full transition-all" />
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right font-mono">
                        {job.processed_rows.toLocaleString()} / {job.total_rows.toLocaleString()}
                        <span className="text-slate-500 text-[10px] block">({pct}%)</span>
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

                      <td className="px-4 py-3 text-slate-400 text-[11px]">
                        <div>Created: {new Date(job.created_at).toLocaleTimeString()}</div>
                        {job.completed_at && <div>Done: {new Date(job.completed_at).toLocaleTimeString()}</div>}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {job.error_count > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedErrorJob(job)}
                              className="h-7 text-xs text-rose-400 hover:text-rose-300 hover:bg-slate-800"
                            >
                              Errors
                            </Button>
                          )}

                          {(job.status === "processing" || job.status === "pending") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCancel(job)}
                              className="h-7 text-xs text-rose-400 hover:bg-slate-800"
                            >
                              <Ban className="h-3.5 w-3.5 mr-1" />
                              Cancel
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
            Showing <span className="font-semibold text-slate-200">{jobs.length > 0 ? (page - 1) * perPage + 1 : 0}</span> to{" "}
            <span className="font-semibold text-slate-200">{Math.min(page * perPage, total)}</span> of{" "}
            <span className="font-semibold text-slate-200">{total}</span> jobs
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

      {/* Error Report Modal */}
      {selectedErrorJob && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-semibold text-rose-400 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Import Error Report: {selectedErrorJob.filename}
              </h2>
              <button onClick={() => setSelectedErrorJob(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-2">
              {(selectedErrorJob.error_report || []).length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-xs">No errors recorded in buffer.</div>
              ) : (
                selectedErrorJob.error_report?.map((err, idx) => (
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
                onClick={() => setSelectedErrorJob(null)}
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
