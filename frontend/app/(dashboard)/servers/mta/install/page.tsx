"use client";

import React, { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useGetServersQuery, useInstallMTAMutation } from "@/lib/store/api/servers-api";
import { 
  DownloadCloud, 
  Server, 
  Terminal, 
  Check, 
  Copy, 
  ShieldCheck, 
  AlertCircle,
  PlayCircle,
  FileCode
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InstallMTAPayload } from "@/lib/api/servers";

function InstallMTAServersContent() {
  const searchParams = useSearchParams();
  const initialServerId = searchParams.get("server_id") || "";

  const [selectedServerId, setSelectedServerId] = useState(initialServerId);
  const [software, setSoftware] = useState<"postfix" | "powermta">("postfix");
  const [hostname, setHostname] = useState("");
  const [domain, setDomain] = useState("");
  const [enableTLS, setEnableTLS] = useState(true);
  const [setupOpenDKIM, setSetupOpenDKIM] = useState(true);
  const [disableIPv6, setDisableIPv6] = useState(true);

  const [generatedScript, setGeneratedScript] = useState("");
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const { data: servers = [] } = useGetServersQuery();

  const activeServerId = selectedServerId || (servers.length > 0 ? servers[0].id : "");
  const currentServer = servers.find((s) => s.id === activeServerId);

  const [installMTA, { isLoading: isInstalling }] = useInstallMTAMutation();

  const handleInstall = async () => {
    if (!activeServerId) return;
    try {
      const res = await installMTA({
        serverId: activeServerId,
        payload: {
          software,
          hostname: hostname.trim() || undefined,
          domain: domain.trim() || undefined,
          enable_tls: enableTLS,
          setup_opendkim: setupOpenDKIM,
          disable_ipv6: disableIPv6,
        },
      }).unwrap();
      setGeneratedScript(res.install_script);
      setErrorMessage("");
    } catch (err: any) {
      setErrorMessage(err?.data?.error?.message || err?.message || "Failed to generate installation script");
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold tracking-tight text-slate-100">Install MTA Servers</h2>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            Postfix / PowerMTA Automation
          </span>
        </div>
        <p className="text-sm text-slate-400 mt-1">
          Automate the deployment, tuning, and initial hardening of mail transfer agents (Postfix or PowerMTA) on your target servers.
        </p>
      </div>

      {/* Target Server Selector Banner */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Server className="h-5 w-5 text-blue-400 shrink-0" />
          <div>
            <span className="text-xs text-slate-400 block font-semibold uppercase">Target Server:</span>
            <span className="text-sm font-bold text-slate-100">
              {currentServer ? `${currentServer.name} (${currentServer.main_ip})` : "Select a server"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 font-semibold uppercase">Change Server:</label>
          <select
            value={activeServerId}
            onChange={(e) => {
              setSelectedServerId(e.target.value);
              setGeneratedScript("");
            }}
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

      {/* Configuration Card */}
      <Card className="border-slate-800 bg-slate-900/60 shadow-xl backdrop-blur">
        <CardContent className="p-6 space-y-5">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <DownloadCloud className="h-4 w-4 text-purple-400" />
            <h3 className="font-semibold text-slate-100 text-sm">Deployment & Configuration Parameters</h3>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                MTA Software
              </label>
              <select
                value={software}
                onChange={(e) => setSoftware(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="postfix">Postfix (Standard Open-Source ESMTP)</option>
                <option value="powermta">PowerMTA (Commercial High Volume)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                Mail Hostname (myhostname)
              </label>
              <input
                type="text"
                placeholder="e.g. mail1.example.com"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                Sending Domain (mydomain)
              </label>
              <input
                type="text"
                placeholder="e.g. example.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          {/* Hardening Options */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <span className="text-xs font-semibold uppercase text-slate-400 block">
              Hardening & Deliverability Options
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between cursor-pointer">
                <span className="text-xs text-slate-300 font-medium">Enable Outbound TLS</span>
                <input
                  type="checkbox"
                  checked={enableTLS}
                  onChange={(e) => setEnableTLS(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0"
                />
              </label>

              <label className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between cursor-pointer">
                <span className="text-xs text-slate-300 font-medium">Install OpenDKIM Tools</span>
                <input
                  type="checkbox"
                  checked={setupOpenDKIM}
                  onChange={(e) => setSetupOpenDKIM(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0"
                />
              </label>

              <label className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between cursor-pointer">
                <span className="text-xs text-slate-300 font-medium">Force IPv4 Delivery</span>
                <input
                  type="checkbox"
                  checked={disableIPv6}
                  onChange={(e) => setDisableIPv6(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0"
                />
              </label>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <Button
              size="sm"
              onClick={handleInstall}
              disabled={isInstalling || !activeServerId}
              className="bg-blue-600 hover:bg-blue-500 text-white min-w-44"
            >
              {isInstalling ? "Generating Installer..." : "Generate Install Script"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Generated Script Display */}
      {generatedScript && (
        <Card className="border-slate-800 bg-slate-900/60 shadow-xl backdrop-blur animate-in fade-in duration-200">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileCode className="h-4 w-4 text-emerald-400" />
                <h3 className="font-semibold text-slate-100 text-sm">Automated Installation Script Ready</h3>
              </div>
              <Button size="sm" onClick={handleCopy} className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs">
                {copied ? <Check className="h-3.5 w-3.5 mr-1 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                {copied ? "Copied to Clipboard!" : "Copy Full Script"}
              </Button>
            </div>

            <pre className="p-4 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-300 max-h-96 overflow-y-auto whitespace-pre">
              {generatedScript}
            </pre>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span>Execute via SSH root terminal or dispatch directly via Remote Execution.</span>
              <span className="text-emerald-400 font-mono text-[11px]">Idempotent Execution</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function InstallMTAServersPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading installer wizard...</div>}>
      <InstallMTAServersContent />
    </Suspense>
  );
}
