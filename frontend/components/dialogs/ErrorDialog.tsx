"use client";

import React, { useState, useEffect, useSyncExternalStore } from "react";
import { 
  AlertOctagon, 
  ChevronDown, 
  ChevronUp, 
  Copy, 
  Check, 
  RotateCcw, 
  X,
  ShieldAlert
} from "lucide-react";
import { errorDialogService, ErrorDialogState } from "@/lib/dialogs/error-dialog-service";
import { Button } from "@/components/ui/button";

const initialServerState: ErrorDialogState = { isOpen: false, error: null };
const getServerSnapshot = () => initialServerState;

export function ErrorDialog() {
  const state = useSyncExternalStore(
    errorDialogService.subscribe,
    errorDialogService.getSnapshot,
    getServerSnapshot
  );

  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // Close on Escape key
  useEffect(() => {
    if (!state.isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        errorDialogService.close();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.isOpen]);

  if (!state.isOpen || !state.error) {
    return null;
  }

  const error = state.error;

  const handleCopyDetails = () => {
    const detailsString = JSON.stringify(
      {
        code: error.code,
        category: error.category,
        title: error.title,
        message: error.userMessage,
        suggestedAction: error.suggestedAction,
        technicalDetails: error.technicalDetails,
        timestamp: error.timestamp,
      },
      null,
      2
    );

    navigator.clipboard.writeText(detailsString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRetry = async () => {
    if (!state.onRetry) return;
    setIsRetrying(true);
    try {
      await state.onRetry();
      errorDialogService.close();
    } catch {
      // The retry will update state or trigger another notification
    } finally {
      setIsRetrying(false);
    }
  };

  // Split suggestedAction into checklist steps if it contains numbered lines
  const actionSteps = error.suggestedAction
    ? error.suggestedAction.split("\n").filter((s) => s.trim().length > 0)
    : [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="error-dialog-title"
      className="fixed inset-0 !m-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="bg-slate-900 border border-rose-500/30 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-5 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <AlertOctagon className="h-6 w-6" />
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                {error.code}
              </span>
              <h3 id="error-dialog-title" className="text-base font-bold text-slate-100 mt-1">
                {error.title}
              </h3>
            </div>
          </div>

          <button
            onClick={() => errorDialogService.close()}
            aria-label="Close dialog"
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Message */}
        <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-200 leading-relaxed">
          {error.userMessage}
        </div>

        {/* Suggested Next Steps / Actions */}
        {actionSteps.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4 text-amber-400" />
              Recommended Resolution Steps
            </h4>
            <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-1.5 text-xs text-slate-400">
              {actionSteps.map((step, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <span className="text-blue-400 font-bold shrink-0 mt-0.5">•</span>
                  <span className="leading-relaxed">{step.replace(/^\d+\.\s*/, "")}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Collapsible Technical Details */}
        <div className="border border-slate-800 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
            className="w-full px-3.5 py-2.5 bg-slate-950/40 hover:bg-slate-800/40 flex items-center justify-between text-xs font-medium text-slate-400 transition-colors"
          >
            <span>Technical details & debugging info</span>
            {showTechnicalDetails ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          {showTechnicalDetails && (
            <div className="p-3.5 bg-slate-950/90 border-t border-slate-800 space-y-3">
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                {error.technicalDetails?.provider && (
                  <div>
                    <span className="text-slate-500">Provider:</span>{" "}
                    <span className="text-slate-300">{String(error.technicalDetails.provider)}</span>
                  </div>
                )}
                {error.technicalDetails?.providerErrorCode && (
                  <div>
                    <span className="text-slate-500">Error Code:</span>{" "}
                    <span className="text-rose-400 font-bold">
                      {String(error.technicalDetails.providerErrorCode)}
                    </span>
                  </div>
                )}
                {error.technicalDetails?.rejectedIP && (
                  <div className="col-span-2">
                    <span className="text-slate-500">Rejected Server IP:</span>{" "}
                    <span className="text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded">
                      {String(error.technicalDetails.rejectedIP)}
                    </span>
                  </div>
                )}
                {error.technicalDetails?.statusCode && (
                  <div>
                    <span className="text-slate-500">HTTP Status:</span>{" "}
                    <span className="text-slate-300">{String(error.technicalDetails.statusCode)}</span>
                  </div>
                )}
                {error.technicalDetails?.requestId && (
                  <div>
                    <span className="text-slate-500">Request ID:</span>{" "}
                    <span className="text-slate-300">{String(error.technicalDetails.requestId)}</span>
                  </div>
                )}
              </div>

              {error.technicalDetails?.rawResponse && (
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                    Raw Provider Response
                  </div>
                  <pre className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-32 whitespace-pre-wrap break-all">
                    {String(error.technicalDetails.rawResponse)}
                  </pre>
                </div>
              )}

              <button
                type="button"
                onClick={handleCopyDetails}
                className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors pt-1"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? "Copied to clipboard!" : "Copy technical details"}</span>
              </button>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => errorDialogService.close()}
            className="border-slate-800 text-slate-300 hover:bg-slate-800"
          >
            Close
          </Button>

          {state.onRetry && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleRetry}
              disabled={isRetrying}
              className="bg-blue-600 hover:bg-blue-500 text-white gap-1.5"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${isRetrying ? "animate-spin" : ""}`} />
              {isRetrying ? "Retrying..." : "Retry Operation"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
