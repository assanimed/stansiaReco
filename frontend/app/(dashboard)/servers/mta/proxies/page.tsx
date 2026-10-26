"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { 
  useGetServersQuery, 
  useGetServerProxyQuery, 
  useUpdateServerProxyMutation, 
  useLazyGetProxyInstallScriptQuery 
} from "@/lib/store/api/servers-api";
import { 
  Radio, 
  Server, 
  Terminal, 
  Check, 
  Copy, 
  RefreshCw, 
  AlertCircle, 
  Lock, 
  Globe, 
  ShieldCheck,
  CheckCircle2,
  XCircle,
  FileCode
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProxyServer, UpdateProxyPayload } from "@/lib/api/servers";
import { notify } from "@/lib/notifications/notification-store";

function ManageProxiesServersContent() {
  const searchParams = useSearchParams();
  const initialServerId = searchParams.get("server_id") || "";

  const [selectedServerId, setSelectedServerId] = useState(initialServerId);

  // Form states
  const [httpEnabled, setHttpEnabled] = useState(false);
  const [httpPort, setHttpPort] = useState(3128);
  const [socksEnabled, setSocksEnabled] = useState(false);
  const [socksPort, setSocksPort] = useState(1080);
  const [authUser, setAuthUser] = useState("proxyuser");
  const [authPassword, setAuthPassword] = useState("SecretProxyPass123!");

  const [generatedScript, setGeneratedScript] = useState("");
  const [copied, setCopied] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [formError, setFormError] = useState("");

  const { data: servers = [] } = useGetServersQuery();

  const activeServerId = selectedServerId || (servers.length > 0 ? servers[0].id : "");
  const currentServer = servers.find((s) => s.id === activeServerId);

  const { data: proxyConfig, isLoading, isError, refetch } = useGetServerProxyQuery(activeServerId, {
    skip: !activeServerId,
  });

  const [updateServerProxy, { isLoading: isUpdating }] = useUpdateServerProxyMutation();
  const [getProxyInstallScript] = useLazyGetProxyInstallScriptQuery();

  useEffect(() => {
    if (proxyConfig) {
      setHttpEnabled(proxyConfig.http_proxy_enabled);
      setHttpPort(proxyConfig.http_proxy_port || 3128);
      setSocksEnabled(proxyConfig.socks_proxy_enabled);
      setSocksPort(proxyConfig.socks_proxy_port || 1080);
      setAuthUser(proxyConfig.auth_user || "proxyuser");
      setAuthPassword(proxyConfig.auth_password || "SecretProxyPass123!");
    }
  }, [proxyConfig]);

  const handleGenerateScript = async () => {
    if (!activeServerId) return;
    const loadingId = notify.loading("Generating proxy installer script...");
    try {
      const res = await getProxyInstallScript(activeServerId).unwrap();
      setGeneratedScript(res.script);
      notify.update(loadingId, {
        type: "success",
        message: "Proxy installer script generated successfully.",
      });
    } catch (err: any) {
      notify.dismiss(loadingId);
      notify.error(err, { title: "Failed to generate proxy install script" });
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedScript);
    setCopied(true);
    notify.info("Proxy installer script copied to clipboard.", { duration: 2000 });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeServerId) return;

    try {
      await updateServerProxy({
        serverId: activeServerId,
        payload: {
          http_proxy_enabled: httpEnabled,
          http_proxy_port: Number(httpPort) || 3128,
          socks_proxy_enabled: socksEnabled,
          socks_proxy_port: Number(socksPort) || 1080,
          auth_user: authUser.trim() || "proxyuser",
          auth_password: authPassword || "SecretProxyPass123!",
        },
      }).unwrap();
      setSaveSuccess(true);
      setFormError("");
      notify.success("Proxy configuration updated successfully.");
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setFormError(err?.data?.error?.message || err?.message || "Failed to update proxy settings");
      notify.error(err, { title: "Proxy Update Failed" });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold tracking-tight text-slate-100">Manage Proxies Servers</h2>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Squid HTTP & Dante SOCKS5
          </span>
        </div>
        <p className="text-sm text-slate-400 mt-1">
          Configure and automate authenticated HTTP (Squid) and SOCKS5 (Dante) proxies with custom ports on your MTA nodes.
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

      {/* Proxy Settings Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {formError && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {saveSuccess && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Proxy configuration saved successfully. Click "Generate Installer" to deploy.</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Squid HTTP Proxy Card */}
          <Card className="border-slate-800 bg-slate-900/60 shadow-xl backdrop-blur">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-blue-400" />
                  <h3 className="font-semibold text-slate-100 text-sm">HTTP Proxy (Squid)</h3>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={httpEnabled}
                    onChange={(e) => setHttpEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Custom HTTP Proxy Port
                </label>
                <input
                  type="number"
                  disabled={!httpEnabled}
                  value={httpPort}
                  onChange={(e) => setHttpPort(Number(e.target.value))}
                  placeholder="3128"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 font-mono focus:outline-none focus:border-blue-500 disabled:opacity-50"
                />
              </div>

              <p className="text-xs text-slate-400">
                Squid proxy daemon with basic NCSA htpasswd authentication, tunnel support, and anonymized headers.
              </p>
            </CardContent>
          </Card>

          {/* Dante SOCKS5 Proxy Card */}
          <Card className="border-slate-800 bg-slate-900/60 shadow-xl backdrop-blur">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Radio className="h-4 w-4 text-emerald-400" />
                  <h3 className="font-semibold text-slate-100 text-sm">SOCKS5 Proxy (Dante)</h3>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={socksEnabled}
                    onChange={(e) => setSocksEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Custom SOCKS5 Port
                </label>
                <input
                  type="number"
                  disabled={!socksEnabled}
                  value={socksPort}
                  onChange={(e) => setSocksPort(Number(e.target.value))}
                  placeholder="1080"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 font-mono focus:outline-none focus:border-blue-500 disabled:opacity-50"
                />
              </div>

              <p className="text-xs text-slate-400">
                High-performance Dante SOCKS v5 server with system user auth and full TCP/UDP protocol forwarding.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Credentials Card */}
        <Card className="border-slate-800 bg-slate-900/60 shadow-xl backdrop-blur">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <Lock className="h-4 w-4 text-amber-400" />
              <h3 className="font-semibold text-slate-100 text-sm">Proxy Authentication Credentials</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Auth Username
                </label>
                <input
                  type="text"
                  required
                  value={authUser}
                  onChange={(e) => setAuthUser(e.target.value)}
                  placeholder="proxyuser"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Auth Password
                </label>
                <input
                  type="text"
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="SecretProxyPass123!"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGenerateScript}
                disabled={!activeServerId}
                className="border-blue-500/30 text-blue-400 hover:bg-blue-600/10"
              >
                <Terminal className="h-3.5 w-3.5 mr-1.5" />
                Generate Proxy Installer Script
              </Button>

              <Button
                type="submit"
                size="sm"
                disabled={isUpdating || !activeServerId}
                className="bg-blue-600 hover:bg-blue-500 text-white min-w-32"
              >
                {isUpdating ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {/* Script View Card */}
      {generatedScript && (
        <Card className="border-slate-800 bg-slate-900/60 shadow-xl backdrop-blur animate-in fade-in duration-200">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileCode className="h-4 w-4 text-emerald-400" />
                <h3 className="font-semibold text-slate-100 text-sm">Automated Proxy Installer Script</h3>
              </div>
              <Button size="sm" onClick={handleCopy} className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs">
                {copied ? <Check className="h-3.5 w-3.5 mr-1 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                {copied ? "Copied!" : "Copy Full Script"}
              </Button>
            </div>

            <pre className="p-4 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-300 max-h-96 overflow-y-auto whitespace-pre">
              {generatedScript}
            </pre>

            <p className="text-xs text-slate-500">
              Installs Squid and Dante packages, configures authentication users and ACLs, and enables systemd daemons automatically.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ManageProxiesServersPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading proxy settings...</div>}>
      <ManageProxiesServersContent />
    </Suspense>
  );
}
