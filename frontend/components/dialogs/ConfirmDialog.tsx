"use client";

import React, { useState, useEffect, useSyncExternalStore } from "react";
import { AlertTriangle, Trash2, HelpCircle, X, Loader2 } from "lucide-react";
import { confirmDialogService, ConfirmDialogState } from "@/lib/dialogs/confirm-dialog-service";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const initialServerState: ConfirmDialogState = {
  isOpen: false,
  title: "",
  message: "",
};
const getServerSnapshot = () => initialServerState;

export function ConfirmDialog() {
  const state = useSyncExternalStore(
    confirmDialogService.subscribe,
    confirmDialogService.getSnapshot,
    getServerSnapshot
  );

  const [typedVerification, setTypedVerification] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset verification text whenever dialog opens
  useEffect(() => {
    if (state.isOpen) {
      setTypedVerification("");
      setIsSubmitting(false);
    }
  }, [state.isOpen]);

  // Handle keyboard events (Escape to cancel)
  useEffect(() => {
    if (!state.isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        confirmDialogService.handleCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.isOpen]);

  if (!state.isOpen) {
    return null;
  }

  const isVerificationRequired = Boolean(state.verificationText);
  const isVerificationValid = !isVerificationRequired || typedVerification.trim() === state.verificationText?.trim();

  const handleConfirm = async () => {
    if (!isVerificationValid || isSubmitting) return;
    setIsSubmitting(true);
    confirmDialogService.handleConfirm();
  };

  const getVariantStyles = () => {
    switch (state.variant) {
      case "destructive":
        return {
          icon: <Trash2 className="h-6 w-6 text-rose-400" />,
          iconBg: "bg-rose-500/10 border-rose-500/20",
          border: "border-rose-500/30",
          confirmButtonVariant: "destructive" as const,
        };
      case "warning":
        return {
          icon: <AlertTriangle className="h-6 w-6 text-amber-400" />,
          iconBg: "bg-amber-500/10 border-amber-500/20",
          border: "border-amber-500/30",
          confirmButtonVariant: "primary" as const,
        };
      default:
        return {
          icon: <HelpCircle className="h-6 w-6 text-blue-400" />,
          iconBg: "bg-blue-500/10 border-blue-500/20",
          border: "border-slate-800",
          confirmButtonVariant: "primary" as const,
        };
    }
  };

  const variant = getVariantStyles();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 !m-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        className={cn(
          "bg-slate-900 border rounded-2xl max-w-md w-full p-6 shadow-2xl relative space-y-4 animate-in zoom-in-95 duration-200",
          variant.border
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={cn("p-2.5 rounded-xl border", variant.iconBg)}>
              {variant.icon}
            </div>
            <h3 id="confirm-dialog-title" className="text-base font-bold text-slate-100">
              {state.title}
            </h3>
          </div>

          <button
            onClick={() => confirmDialogService.handleCancel()}
            aria-label="Cancel confirmation"
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Message */}
        <p className="text-xs text-slate-300 leading-relaxed">
          {state.message}
        </p>

        {/* Optional Verification Text Input for high-risk actions */}
        {isVerificationRequired && (
          <div className="space-y-1.5 pt-1">
            <label className="text-[11px] font-semibold text-slate-400 block">
              To proceed, please type <strong className="text-slate-200 font-mono select-all">{state.verificationText}</strong> below:
            </label>
            <input
              type="text"
              autoFocus
              value={typedVerification}
              onChange={(e) => setTypedVerification(e.target.value)}
              placeholder={state.verificationPlaceholder || state.verificationText}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-mono text-xs focus:outline-none focus:border-rose-500 placeholder:text-slate-600"
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => confirmDialogService.handleCancel()}
            disabled={isSubmitting}
            className="border-slate-800 text-slate-300 hover:bg-slate-800"
          >
            {state.cancelLabel}
          </Button>

          <Button
            type="button"
            variant={variant.confirmButtonVariant}
            size="sm"
            onClick={handleConfirm}
            disabled={!isVerificationValid || isSubmitting}
            className="gap-1.5"
          >
            {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {state.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
