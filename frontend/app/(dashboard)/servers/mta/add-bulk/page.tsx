"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGetProvidersQuery, useBulkCreateServersMutation } from "@/lib/store/api/servers-api";
import { 
  Layers, 
  ArrowLeft, 
  AlertCircle, 
  CheckCircle2, 
  Info, 
  Server, 
  Eye
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BulkAddResult } from "@/lib/api/servers";

export default function AddMultipleMTAServersPage() {
  const router = useRouter();

  const [rawLines, setRawLines] = useState("");
  const [providerId, setProviderId] = useState("");
  const [mtaSoftware, setMtaSoftware] = useState<"postfix" | "powermta">("postfix");
  const [defaultUser, setDefaultUser] = useState("root");
  const [defaultPort, setDefaultPort] = useState(22);

  const [importResult, setImportResult] = useState<BulkAddResult | null>(null);
  const [formError, setFormError] = useState("");

  const { data: providers = [] } = useGetProvidersQuery();
  const [bulkCreateServers, { isLoading: isImporting }] = useBulkCreateServersMutation();

  // Real-time parser preview
  const parsedPreview = useMemo(() => {
    const lines = rawLines.split("\n");
    const previewList: { lineNum: number; ip: string; port: number; user: string; passMasked: string; host: string }[] = [];

    lines.forEach((l, idx) => {
      const line = l.trim();
      if (!line || line.startsWith("#")) return;

      let parts: string[] = [];
      if (line.includes(":")) parts = line.split(":");
      else if (line.includes(",")) parts = line.split(",");
      else parts = line.split(/\s+/);

      parts = parts.map((p) => p.trim());

      let ip = "";
      let port = defaultPort;
      let user = defaultUser;
      let pass = "";
      let host = "";

      switch (parts.length) {
        case 1:
          ip = parts[0];
          break;
        case 2:
          ip = parts[0];
          pass = parts[1];
          break;
        case 3:
          ip = parts[0];
          if (!isNaN(Number(parts[1]))) {
            port = Number(parts[1]);
            pass = parts[2];
          } else {
            user = parts[1];
            pass = parts[2];
          }
          break;
        case 4:
          ip = parts[0];
          if (!isNaN(Number(parts[1]))) port = Number(parts[1]);
          user = parts[2];
          pass = parts[3];
          break;
        case 5:
        default:
          ip = parts[0];
          if (!isNaN(Number(parts[1]))) port = Number(parts[1]);
          user = parts[2];
          pass = parts[3];
          host = parts[4] || "";
          break;
      }

      previewList.push({
        lineNum: idx + 1,
        ip,
        port,
        user,
        passMasked: pass ? "••••••••" : "(empty)",
        host: host || ip,
      });
    });

    return previewList;
  }, [rawLines, defaultUser, defaultPort]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setImportResult(null);

    if (!rawLines.trim()) {
      setFormError("Please enter at least one server line to import.");
      return;
    }

    try {
      const result = await bulkCreateServers({
        raw_lines: rawLines,
        provider_id: providerId || undefined,
        mta_software: mtaSoftware,
        default_user: defaultUser,
        default_port: defaultPort,
      }).unwrap();
      setImportResult(result);
    } catch (err: any) {
      setFormError(err?.data?.error?.message || err?.message || "Failed to process bulk import");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/servers/mta">
          <Button variant="outline" size="sm" className="border-slate-800 text-slate-400 hover:text-slate-100 hover:bg-slate-800">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to MTAs
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-100">Add Multiple MTA Servers</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Bulk import large batches of MTA nodes with automatic credential encryption, main IP, and default VMTA routing.
          </p>
        </div>
      </div>

      {/* Import Result Notification */}
      {importResult && (
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <h3 className="font-semibold text-slate-100">Bulk Import Processed</h3>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-xs text-slate-400 block">Total Parsed</span>
              <span className="text-lg font-bold text-slate-100">{importResult.total_parsed}</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-xs text-slate-400 block">Successfully Added</span>
              <span className="text-lg font-bold text-emerald-400">{importResult.added_count}</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-xs text-slate-400 block">Failed / Skipped</span>
              <span className="text-lg font-bold text-rose-400">{importResult.error_count}</span>
            </div>
          </div>

          {importResult.errors && importResult.errors.length > 0 && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs space-y-1">
              <span className="font-semibold block">Import Errors:</span>
              {importResult.errors.map((err, i) => (
                <p key={i} className="font-mono">{err}</p>
              ))}
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <Button size="sm" onClick={() => router.push("/servers/mta")} className="bg-blue-600 hover:bg-blue-500 text-white">
              View All MTA Servers
            </Button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {formError && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-2.5">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {/* Global Configuration for Batch */}
        <Card className="border-slate-800 bg-slate-900/60 shadow-xl backdrop-blur">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <Server className="h-4 w-4 text-blue-400" />
              <h3 className="font-semibold text-slate-100 text-sm">Batch Common Settings</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Provider (Optional)
                </label>
                <select
                  value={providerId}
                  onChange={(e) => setProviderId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select Provider</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  MTA Software
                </label>
                <select
                  value={mtaSoftware}
                  onChange={(e) => setMtaSoftware(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="postfix">Postfix</option>
                  <option value="powermta">PowerMTA</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Default User
                </label>
                <input
                  type="text"
                  value={defaultUser}
                  onChange={(e) => setDefaultUser(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Default Port
                </label>
                <input
                  type="number"
                  value={defaultPort}
                  onChange={(e) => setDefaultPort(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Multi-line Input Card */}
        <Card className="border-slate-800 bg-slate-900/60 shadow-xl backdrop-blur">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-emerald-400" />
                <h3 className="font-semibold text-slate-100 text-sm">Server Lines (One server per line)</h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {parsedPreview.length} Lines Detected
              </span>
            </div>

            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-semibold">
                <Info className="h-3.5 w-3.5" />
                <span>Supported Formats:</span>
              </div>
              <p className="font-mono text-[11px] text-slate-300">
                1. <span className="text-blue-400">ip:port:user:password:hostname</span> (e.g. <span className="text-slate-400">198.51.100.10:22:root:MyPass123:mta1.domain.com</span>)<br />
                2. <span className="text-blue-400">ip:port:user:password</span><br />
                3. <span className="text-blue-400">ip:password</span> (uses default user & port)<br />
                4. Lines starting with # are treated as comments.
              </p>
            </div>

            <textarea
              rows={8}
              required
              placeholder="198.51.100.11:22:root:SecretPass1:mta1.host.net&#10;198.51.100.12:22:root:SecretPass2:mta2.host.net&#10;198.51.100.13:SecretPass3"
              value={rawLines}
              onChange={(e) => setRawLines(e.target.value)}
              className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </CardContent>
        </Card>

        {/* Real-time Parsed Preview */}
        {parsedPreview.length > 0 && (
          <Card className="border-slate-800 bg-slate-900/60 shadow-xl backdrop-blur">
            <CardContent className="p-0">
              <div className="px-6 py-3 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-blue-400" />
                  <span className="text-xs font-semibold uppercase text-slate-300">Real-Time Parse Preview</span>
                </div>
                <span className="text-xs text-emerald-400 font-mono">Ready to batch insert</span>
              </div>
              <div className="max-h-56 overflow-y-auto">
                <table className="w-full text-left text-xs font-mono text-slate-300">
                  <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-2">#</th>
                      <th className="px-4 py-2">IP Address</th>
                      <th className="px-4 py-2">Port</th>
                      <th className="px-4 py-2">User</th>
                      <th className="px-4 py-2">Password</th>
                      <th className="px-4 py-2">Hostname</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {parsedPreview.map((item) => (
                      <tr key={item.lineNum} className="hover:bg-slate-800/30">
                        <td className="px-4 py-2 text-slate-500">{item.lineNum}</td>
                        <td className="px-4 py-2 text-slate-100 font-semibold">{item.ip}</td>
                        <td className="px-4 py-2">{item.port}</td>
                        <td className="px-4 py-2 text-blue-400">{item.user}</td>
                        <td className="px-4 py-2 text-slate-500">{item.passMasked}</td>
                        <td className="px-4 py-2 text-slate-300">{item.host}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Submit */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link href="/servers/mta">
            <Button type="button" variant="outline" className="border-slate-800 text-slate-400 hover:bg-slate-800">
              Cancel
            </Button>
          </Link>
          <Button 
            type="submit" 
            disabled={isImporting || parsedPreview.length === 0}
            className="bg-blue-600 hover:bg-blue-500 text-white min-w-36"
          >
            {isImporting ? "Importing Nodes..." : `Import ${parsedPreview.length} Servers`}
          </Button>
        </div>
      </form>
    </div>
  );
}
