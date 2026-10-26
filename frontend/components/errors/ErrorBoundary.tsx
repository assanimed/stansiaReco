"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home, ChevronDown, ChevronUp } from "lucide-react";
import { errorReporter } from "@/lib/errors/error-reporter";
import { normalizeError } from "@/lib/errors/normalize-error";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showStack: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showStack: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });

    const appError = normalizeError(error, {
      fallbackTitle: "React Component Crash",
      category: "unknown",
    });

    errorReporter.report(appError, {
      operation: "react_render_error",
      additionalInfo: {
        componentStack: errorInfo.componentStack,
      },
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showStack: false,
    });
  };

  handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] flex items-center justify-center p-6 w-full">
          <div className="max-w-md w-full bg-slate-900 border border-rose-500/30 rounded-2xl p-6 shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center mx-auto">
              <AlertTriangle className="h-6 w-6" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-slate-100">
                {this.props.fallbackTitle || "Something went wrong"}
              </h3>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                {this.props.fallbackMessage ||
                  "A rendering error occurred in this view. Your data is safe. You can reload this section or return to the dashboard."}
              </p>
            </div>

            {/* Collapsible stack trace */}
            {this.state.error && (
              <div className="text-left border border-slate-800 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => this.setState((prev) => ({ showStack: !prev.showStack }))}
                  className="w-full px-3 py-2 bg-slate-950/40 text-[11px] text-slate-400 flex items-center justify-between font-medium"
                >
                  <span>Error Details</span>
                  {this.state.showStack ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                {this.state.showStack && (
                  <pre className="p-3 bg-slate-950 text-[10px] font-mono text-rose-300 overflow-x-auto max-h-40 whitespace-pre-wrap break-all border-t border-slate-800">
                    {this.state.error.message}
                    {"\n\n"}
                    {this.state.errorInfo?.componentStack}
                  </pre>
                )}
              </div>
            )}

            <div className="flex items-center justify-center gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={this.handleReset} className="border-slate-800 text-slate-300">
                Try Again
              </Button>
              <Button variant="primary" size="sm" onClick={this.handleReload} className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
                Reload Page
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
