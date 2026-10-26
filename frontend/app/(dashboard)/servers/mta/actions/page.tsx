"use client";

import React, { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useGetServersQuery, useGetActionsQuery } from "@/lib/store/api/servers-api";
import Link from "next/link";
import { 
  PlayCircle, 
  Server, 
  Copy, 
  Check, 
  Terminal, 
  AlertTriangle, 
  ShieldCheck, 
  RefreshCw,
  ExternalLink
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ServerAction } from "@/lib/api/servers";

function MTAServersActionsContent() {
  const searchParams = useSearchParams();
  const initialServerId = searchParams.get("server_id") || "";

  const [selectedServerId, setSelectedServerId] = useState(initialServerId);
  const [copiedActionId, setCopiedActionId] = useState<string | null>(null);

  const { data: servers = [] } = useGetServersQuery();
  const { data: actions = [], isLoading } = useGetActionsQuery();

  const activeServerId = selectedServerId || (servers.length > 0 ? servers[0].id : "");
  const currentServer = servers.find((s) => s.id === activeServerId);

  const handleCopyCommand = (action: ServerAction) => {
    navigator.clipboard.writeText(action.command);
    setCopiedActionId(action.id);
    setTimeout(() => setCopiedActionId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold tracking-tight text-slate-100">MTA Servers Actions</h2>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Remote Operations
          </span>
        </div>
        <p className="text-sm text-slate-400 mt-1">
          Pre-configured operational recipes and diagnostic scripts for mail queue management, daemon control, and deliverability health checks.
        </p>
      </div>

      {/* Target Server Selector Banner */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Server className="h-5 w-5 text-blue-400 shrink-0" />
          <div>
            <span className="text-xs text-slate-400 block font-semibold uppercase">Active Target Server:</span>
            <span className="text-sm font-bold text-slate-100">
              {currentServer ? `${currentServer.name} (${currentServer.main_ip})` : "Select a server"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 font-semibold uppercase">Change Server:</label>
          <select
            value={activeServerId}
            onChange={(e) => setSelectedServerId(e.target.value)}
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500"
          >
            {servers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.main_ip}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Actions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoading ? (
          <div className="col-span-2 text-center py-12 text-slate-500">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
            Loading standard actions...
          </div>
        ) : (
          actions.map((action) => {
            const isCopied = copiedActionId === action.id;
            return (
              <Card key={action.id} className="border-slate-800 bg-slate-900/60 shadow-xl backdrop-blur flex flex-col justify-between">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <PlayCircle className="h-4 w-4 text-blue-400 shrink-0" />
                      <h3 className="font-semibold text-slate-100 text-sm">{action.name}</h3>
                    </div>
                    {action.is_dangerous ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        <AlertTriangle className="h-3 w-3" />
                        Destructive
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <ShieldCheck className="h-3 w-3" />
                        Safe
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-400">
                    {action.description}
                  </p>

                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 break-all">
                    {action.command}
                  </div>
                </CardContent>

                <div className="px-5 py-3 border-t border-slate-800/80 bg-slate-950/40 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">
                    Target: {currentServer?.name || "All"}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopyCommand(action)}
                      className="border-slate-800 text-slate-300 hover:bg-slate-800 text-xs h-8"
                    >
                      {isCopied ? <Check className="h-3.5 w-3.5 mr-1 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                      {isCopied ? "Copied" : "Copy Command"}
                    </Button>

                    <Link href={`/executions?server_id=${activeServerId}&command=${encodeURIComponent(action.command)}`}>
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-8"
                      >
                        <Terminal className="h-3.5 w-3.5 mr-1" />
                        Run Remotely
                      </Button>
                    </Link>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function MTAServersActionsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading server actions...</div>}>
      <MTAServersActionsContent />
    </Suspense>
  );
}
