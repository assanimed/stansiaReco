"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { 
  ArrowLeftRight, 
  Layers, 
  Globe, 
  Play, 
  Eye, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  ArrowRight,
  ShieldAlert,
  Sparkles,
  RotateCcw,
  Loader2
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  useGetDomainsQuery,
  usePreviewIPReplacementMutation,
  useExecuteIPReplacementMutation,
  IPReplacementChange,
} from "@/lib/store/api/domains-api";

function IPReplacementContent() {
  const searchParams = useSearchParams();
  const initialDomain = searchParams.get("domain") || "ALL";

  const { data: domains = [] } = useGetDomainsQuery();
  const [selectedDomain, setSelectedDomain] = useState<string>(initialDomain);

  const [oldIPsText, setOldIPsText] = useState("");
  const [newIPsText, setNewIPsText] = useState("");

  const [previewMutation, { isLoading: isPreviewing }] = usePreviewIPReplacementMutation();
  const [executeMutation, { isLoading: isExecuting }] = useExecuteIPReplacementMutation();

  const [previewChanges, setPreviewChanges] = useState<IPReplacementChange[] | null>(null);
  const [totalMatches, setTotalMatches] = useState<number>(0);
  const [executionResult, setExecutionResult] = useState<{ total_updated: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  // Split lines
  const oldLines = oldIPsText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const newLines = newIPsText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const lineCountMatches = oldLines.length === newLines.length && oldLines.length > 0;
  const pairCount = Math.min(oldLines.length, newLines.length);

  const buildPairs = () => {
    const pairs = [];
    for (let i = 0; i < pairCount; i++) {
      pairs.push({
        old_ip: oldLines[i],
        new_ip: newLines[i],
      });
    }
    return pairs;
  };

  // Real-time debounced auto-preview whenever aligned pairs are entered
  useEffect(() => {
    if (!lineCountMatches || pairCount === 0) {
      setPreviewChanges(null);
      setTotalMatches(0);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const pairs = buildPairs();
        const res = await previewMutation({
          domain_id: selectedDomain === "ALL" ? undefined : selectedDomain,
          pairs,
        }).unwrap();
        setPreviewChanges(res.changes);
        setTotalMatches(res.total_matches);
      } catch (err: any) {
        // Debounce errors do not disrupt typing
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [oldIPsText, newIPsText, selectedDomain, lineCountMatches, pairCount]);

  const handlePreview = async () => {
    setErrorMessage(null);
    setExecutionResult(null);

    if (oldLines.length === 0 || newLines.length === 0) {
      setErrorMessage("Please provide at least one IP address in both textareas.");
      return;
    }

    if (oldLines.length !== newLines.length) {
      setErrorMessage(`Line count mismatch: Old list has ${oldLines.length} lines, while New list has ${newLines.length} lines. Each line in box A must correspond to box B.`);
      return;
    }

    const pairs = buildPairs();

    try {
      const res = await previewMutation({
        domain_id: selectedDomain === "ALL" ? undefined : selectedDomain,
        pairs,
      }).unwrap();

      setPreviewChanges(res.changes);
      setTotalMatches(res.total_matches);
    } catch (err: any) {
      setErrorMessage(err?.data?.error?.message || err?.message || "Failed to generate replacement preview");
    }
  };

  const handleExecuteClick = async () => {
    setErrorMessage(null);

    if (!lineCountMatches) {
      setErrorMessage("Line counts between Column A and Column B must match to execute replacements.");
      return;
    }

    // If preview hasn't been fetched yet or was invalidated, fetch it first
    if (previewChanges === null) {
      const pairs = buildPairs();
      try {
        const res = await previewMutation({
          domain_id: selectedDomain === "ALL" ? undefined : selectedDomain,
          pairs,
        }).unwrap();

        setPreviewChanges(res.changes);
        setTotalMatches(res.total_matches);

        if (res.total_matches === 0) {
          setErrorMessage("No matching DNS records were found for the provided IP(s) in this scope.");
          return;
        }

        setIsConfirmOpen(true);
      } catch (err: any) {
        setErrorMessage(err?.data?.error?.message || err?.message || "Failed to evaluate replacement matches");
      }
      return;
    }

    if (totalMatches === 0) {
      setErrorMessage("No matching DNS records were found for the provided IP(s) in this scope.");
      return;
    }

    setIsConfirmOpen(true);
  };

  const handleExecute = async () => {
    setErrorMessage(null);
    setIsConfirmOpen(false);

    const pairs = buildPairs();

    try {
      const res = await executeMutation({
        domain_id: selectedDomain === "ALL" ? undefined : selectedDomain,
        pairs,
      }).unwrap();

      setExecutionResult({ total_updated: res.total_updated });
      setPreviewChanges(null);
      setTotalMatches(0);
    } catch (err: any) {
      setErrorMessage(err?.data?.error?.message || err?.message || "Failed to execute bulk replacement");
    }
  };

  const handleLoadSample = () => {
    setOldIPsText("192.168.1.10\n192.168.1.11\n192.168.1.12");
    setNewIPsText("10.0.0.10\n10.0.0.11\n10.0.0.12");
    setPreviewChanges(null);
    setExecutionResult(null);
    setErrorMessage(null);
  };

  const handleClear = () => {
    setOldIPsText("");
    setNewIPsText("");
    setPreviewChanges(null);
    setExecutionResult(null);
    setErrorMessage(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2.5">
            <ArrowLeftRight className="h-6 w-6 text-blue-400" />
            DNS Record IP Replacement
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Bulk migration engine: Replace occurrences of old IP addresses with new IPs line-by-line across all domains or targeted zones.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleLoadSample}
            className="border-slate-800 text-slate-300 hover:bg-slate-800 text-xs"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5 text-amber-400" />
            Load Sample IPs
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            className="border-slate-800 text-slate-400 hover:text-slate-200 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Clear
          </Button>
        </div>
      </div>

      {/* Scope Selector Card */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-600/10 border border-blue-500/20 text-blue-400">
            <Globe className="h-5 w-5" />
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
              Replacement Scope
            </span>
            <select
              value={selectedDomain}
              onChange={(e) => {
                setSelectedDomain(e.target.value);
                setPreviewChanges(null);
              }}
              className="mt-0.5 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm font-mono font-bold text-slate-100 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">🌐 All Domains (Global Infrastructure Replacement)</option>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.domain_name} ({d.record_count} records)
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="text-xs text-slate-400 max-w-sm">
          <span>
            Every occurrence of an IP in Column A will be replaced by the matching line IP in Column B across all targeted DNS host records.
          </span>
        </div>
      </div>

      {/* Error or Success Alerts */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{errorMessage}</div>
        </div>
      )}

      {executionResult && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold text-sm block">Replacement Execution Completed Successfully</span>
            <span className="mt-0.5 block text-emerald-300">
              Updated <strong>{executionResult.total_updated}</strong> DNS records across the selected scope. The authoritative records have been committed.
            </span>
            <div className="mt-3">
              <Link href="/domains/dns">
                <Button size="sm" variant="outline" className="h-7 text-xs border-emerald-500/30 text-emerald-300">
                  View Updated DNS Records
                  <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Two Textareas Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Left: Old IPs */}
        <Card className="border-slate-800 bg-slate-900/70">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                Old / Current IP Addresses (Column A)
              </label>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                {oldLines.length} line(s)
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Enter one IPv4/IPv6 address per line to search for:
            </p>
            <textarea
              rows={10}
              value={oldIPsText}
              onChange={(e) => {
                setOldIPsText(e.target.value);
                setPreviewChanges(null);
              }}
              placeholder={`192.168.1.10\n192.168.1.11\n192.168.1.12`}
              className="w-full p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder:text-slate-700 font-mono leading-relaxed focus:outline-none focus:border-blue-500 resize-y"
            />
          </CardContent>
        </Card>

        {/* Right: New IPs */}
        <Card className="border-slate-800 bg-slate-900/70">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                New Replacement IP Addresses (Column B)
              </label>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                {newLines.length} line(s)
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Enter corresponding replacement IP address on the matching line:
            </p>
            <textarea
              rows={10}
              value={newIPsText}
              onChange={(e) => {
                setNewIPsText(e.target.value);
                setPreviewChanges(null);
              }}
              placeholder={`10.0.0.10\n10.0.0.11\n10.0.0.12`}
              className="w-full p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder:text-slate-700 font-mono leading-relaxed focus:outline-none focus:border-blue-500 resize-y"
            />
          </CardContent>
        </Card>
      </div>

      {/* Alignment Bar & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/90 border border-slate-800">
        <div className="flex items-center gap-2 text-xs font-mono">
          {oldLines.length === 0 && newLines.length === 0 ? (
            <span className="text-slate-500">Enter IP lists above to begin comparison</span>
          ) : lineCountMatches ? (
            <span className="text-emerald-400 flex items-center gap-1.5 font-semibold">
              <CheckCircle2 className="h-4 w-4" />
              {pairCount} aligned replacement pair(s) ready (Line A ↔ Line B)
            </span>
          ) : (
            <span className="text-amber-400 flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="h-4 w-4" />
              Count mismatch: Column A ({oldLines.length}) vs Column B ({newLines.length})
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            onClick={handlePreview}
            disabled={isPreviewing || !lineCountMatches}
            className="border-slate-800 text-slate-200 hover:bg-slate-800 text-xs"
          >
            {isPreviewing ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin text-blue-400" />
            ) : (
              <Eye className="h-4 w-4 mr-1.5 text-blue-400" />
            )}
            {isPreviewing ? "Checking Records..." : "Preview Matching Records"}
          </Button>

          <Button
            onClick={handleExecuteClick}
            disabled={!lineCountMatches || isExecuting || isPreviewing || (previewChanges !== null && totalMatches === 0)}
            className={`font-semibold text-xs text-white transition-all shadow-md ${
              totalMatches > 0
                ? "bg-blue-600 hover:bg-blue-500 shadow-blue-900/30 ring-1 ring-blue-500/50"
                : "bg-slate-800 text-slate-400 hover:bg-slate-700"
            }`}
          >
            {isExecuting ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Executing...
              </>
            ) : isPreviewing ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Evaluating...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-1.5" />
                Execute Bulk Replacement ({totalMatches})
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Preview Diff Table */}
      {previewChanges !== null && (
        <Card className="border-slate-800 bg-slate-900/70 overflow-hidden animate-in fade-in duration-200">
          <div className="p-4 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Layers className="h-4 w-4 text-blue-400" />
                Dry Run Preview: {totalMatches} Record(s) Matched
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Every occurrence of the specified IP(s) across host records, SPF, and TXT values will be replaced.
              </p>
            </div>
            {totalMatches > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                {totalMatches} Ready to Replace
              </span>
            )}
          </div>

          <CardContent className="p-0">
            {previewChanges.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                <Globe className="h-8 w-8 mx-auto mb-2 text-slate-600" />
                <p className="font-semibold text-slate-300 text-sm">No DNS records matched the provided IPs</p>
                <p className="mt-1 max-w-sm mx-auto">
                  Ensure the old IPs in Column A currently exist in your DNS records (A, AAAA, TXT/SPF, MX, etc.) within the selected scope.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/80 text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-6 py-3">Domain</th>
                      <th className="px-6 py-3">Host / Subdomain</th>
                      <th className="px-6 py-3">Type</th>
                      <th className="px-6 py-3">Current Value (Old)</th>
                      <th className="px-6 py-3">Replacement Value (New)</th>
                      <th className="px-6 py-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {previewChanges.map((ch, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40">
                        <td className="px-6 py-3 font-bold text-slate-100">{ch.domain_name}</td>
                        <td className="px-6 py-3 text-blue-400 font-semibold">{ch.host_name}</td>
                        <td className="px-6 py-3">
                          <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px]">
                            {ch.record_type}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-rose-400 bg-rose-500/5">
                          <div className="max-w-md break-all whitespace-pre-wrap line-through">
                            {ch.old_value}
                          </div>
                        </td>
                        <td className="px-6 py-3 text-emerald-400 bg-emerald-500/5 font-bold">
                          <div className="max-w-md break-all whitespace-pre-wrap">
                            {ch.new_value}
                          </div>
                        </td>
                        <td className="px-6 py-3 text-right">
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            Ready
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Confirmation Modal */}
      {isConfirmOpen && (
        <div className="fixed inset-0 !m-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <ShieldAlert className="h-6 w-6" />
              <h3 className="text-base font-bold text-slate-100">Confirm Bulk DNS Replacement</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              You are about to update <strong className="text-blue-400 font-mono">{totalMatches}</strong> DNS records across the selected domain scope.
            </p>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-400 space-y-1 font-mono">
              <div>Scope: <span className="text-slate-200">{selectedDomain === "ALL" ? "All Domains" : selectedDomain}</span></div>
              <div>Pairs: <span className="text-slate-200">{pairCount} Line Mappings</span></div>
              <div>Records To Update: <span className="text-emerald-400 font-bold">{totalMatches}</span></div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <Button
                variant="outline"
                onClick={() => setIsConfirmOpen(false)}
                className="border-slate-800 text-slate-400 text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={handleExecute}
                disabled={isExecuting}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
              >
                {isExecuting ? "Executing..." : "Confirm & Replace Now"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function IPReplacementPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-400 text-sm">Loading bulk IP replacement tool...</div>}>
      <IPReplacementContent />
    </Suspense>
  );
}
