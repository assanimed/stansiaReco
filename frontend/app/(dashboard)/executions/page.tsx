"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Command,
  Play,
  Search,
  Server,
  Terminal,
  FileCode2,
  CheckCircle2,
  XCircle,
  Clock,
  Copy,
  Check,
  RefreshCw,
  AlertTriangle,
  Cpu,
  Eye,
  Layers,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useGetServersQuery } from "@/lib/store/api/servers-api";
import {
  useGetExecutionsQuery,
  useRunExecutionMutation,
  streamExecution,
  StreamLogEvent,
  ExecutionJob,
} from "@/lib/store/api/executions-api";

const QUICK_SNIPPETS = [
  { label: "System & Uptime", cmd: "uname -a && uptime" },
  { label: "IPv4 Interfaces", cmd: "ip -o -4 addr show || ifconfig" },
  { label: "Disk & Memory", cmd: "df -h / && echo '---' && (free -m || vm_stat)" },
  { label: "Listening Ports", cmd: "ss -tlnp 2>/dev/null || netstat -an | head -n 25" },
  { label: "Postfix Queue", cmd: "postqueue -p 2>/dev/null | tail -n 20 || echo 'Postfix not installed'" },
  { label: "OS Release", cmd: "cat /etc/os-release 2>/dev/null || sw_vers" },
];

export default function RemoteCommandsPage() {
  const { data: servers = [], isLoading: loadingServers } = useGetServersQuery();
  const {
    data: jobs = [],
    isLoading: loadingJobs,
    refetch: refetchJobs,
  } = useGetExecutionsQuery(100);
  const [runExecution] = useRunExecutionMutation();
  const [isExecuting, setIsExecuting] = useState<boolean>(false);

  const [selectedServerIds, setSelectedServerIds] = useState<string[]>([]);
  const [useLocalhost, setUseLocalhost] = useState<boolean>(true);
  const [commandText, setCommandText] = useState<string>("uname -a && uptime");
  const [timeoutSec, setTimeoutSec] = useState<number>(30);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "command" | "script">("ALL");

  const [activeBatchJobs, setActiveBatchJobs] = useState<ExecutionJob[]>([]);
  const [inspectedJob, setInspectedJob] = useState<ExecutionJob | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const toggleServer = (id: string) => {
    setSelectedServerIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAllServers = () => {
    if (selectedServerIds.length === servers.length) {
      setSelectedServerIds([]);
    } else {
      setSelectedServerIds(servers.map((s) => s.id));
    }
  };

  const handleDispatchCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!commandText.trim()) {
      setErrorMsg("Please enter a command to execute.");
      return;
    }
    if (selectedServerIds.length === 0 && !useLocalhost) {
      setErrorMsg("Select at least one target MTA server or enable Control Plane Local Shell.");
      return;
    }

    setIsExecuting(true);
    setActiveBatchJobs([]);

    try {
      const response = await streamExecution(
        {
          server_ids: selectedServerIds,
          use_localhost: useLocalhost,
          execution_type: "command",
          command: commandText,
          timeout_seconds: timeoutSec,
        },
        (event: StreamLogEvent) => {
          if (event.type === "start" || event.type === "log" || event.type === "done") {
            setActiveBatchJobs((prev) => {
              const targetKey = event.server_id || "local";
              const existingIdx = prev.findIndex(
                (j) => (event.server_id && j.server_id === event.server_id) || (!event.server_id && !j.server_id)
              );

              if (existingIdx >= 0) {
                const updated = [...prev];
                const current = updated[existingIdx];
                const updatedJob: ExecutionJob = {
                  ...current,
                  status: event.status || current.status,
                  stdout: event.stream === "stdout" ? current.stdout + (event.chunk || "") : current.stdout,
                  stderr: event.stream === "stderr" ? current.stderr + (event.chunk || "") : current.stderr,
                  exit_code: event.exit_code !== undefined ? event.exit_code : current.exit_code,
                  duration_ms: event.duration_ms !== undefined ? event.duration_ms : current.duration_ms,
                };
                updated[existingIdx] = updatedJob;

                // Keep inspected job synced if viewing this target
                setInspectedJob((curr) => {
                  if (
                    curr &&
                    ((event.server_id && curr.server_id === event.server_id) ||
                      (!event.server_id && !curr.server_id))
                  ) {
                    return updatedJob;
                  }
                  return curr;
                });

                return updated;
              } else {
                const newJob: ExecutionJob = {
                  id: event.job_id || "temp-" + Date.now(),
                  server_id: event.server_id,
                  server_name: event.server_name || (event.server_id ? "Remote Server" : "Local Control Plane"),
                  server_host: event.server_host || (event.server_id ? "" : "127.0.0.1"),
                  requested_by_user_id: "",
                  execution_type: "command",
                  script_slug: "adhoc-command",
                  script_name: "Ad-Hoc Remote Command",
                  command_text: commandText,
                  status: event.status || "running",
                  stdout: event.stream === "stdout" ? event.chunk || "" : "",
                  stderr: event.stream === "stderr" ? event.chunk || "" : "",
                  duration_ms: 0,
                  queued_at: new Date().toISOString(),
                  created_at: new Date().toISOString(),
                };

                setInspectedJob((curr) => (!curr ? newJob : curr));
                return [...prev, newJob];
              }
            });
          }
        }
      );

      setActiveBatchJobs(response || []);
      if (response && response.length > 0) {
        setInspectedJob(response[0]);
      }
      refetchJobs();
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to dispatch remote command.");
    } finally {
      setIsExecuting(false);
    }
  };

  const copyOutput = (job: ExecutionJob) => {
    const text = [job.stdout, job.stderr].filter(Boolean).join("\n");
    navigator.clipboard.writeText(text);
    setCopiedId(job.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const displayedJob = inspectedJob || activeBatchJobs[0] || jobs[0] || null;

  const filteredJobs = jobs.filter((job) => {
    if (typeFilter !== "ALL" && job.execution_type.toLowerCase() !== typeFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      job.server_name.toLowerCase().includes(q) ||
      job.server_host.toLowerCase().includes(q) ||
      job.command_text.toLowerCase().includes(q) ||
      (job.script_name && job.script_name.toLowerCase().includes(q)) ||
      job.id.toLowerCase().includes(q)
    );
  });

  const isSuccessStatus = (status: string) =>
    status.toLowerCase() === "success" || status.toUpperCase() === "SUCCEEDED";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-blue-600/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Command className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-100">
                Remote Commands Execution
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Dispatch parallel SSH commands across MTA servers or the Control Plane and inspect real-time stdout/stderr streams.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Link href="/executions/scripts">
            <Button variant="secondary" size="sm" className="gap-1.5">
              <FileCode2 className="h-3.5 w-3.5 text-blue-400" />
              Pre-configured Scripts
            </Button>
          </Link>
          <Link href="/executions/terminal">
            <Button size="sm" className="gap-1.5">
              <Terminal className="h-3.5 w-3.5" />
              Open Live SSH Terminal
            </Button>
          </Link>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-2.5 text-xs text-red-300">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Workspace Grid: Composer + Output Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Target Selector + Command Composer */}
        <Card className="lg:col-span-6 border-slate-800 bg-slate-900/60">
          <CardContent className="p-5 space-y-5">
            <form onSubmit={handleDispatchCommand} className="space-y-5">
              {/* Target Selection */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Server className="h-3.5 w-3.5 text-blue-400" />
                    1. Select Target Execution Nodes
                  </label>
                  {servers.length > 0 && (
                    <button
                      type="button"
                      onClick={selectAllServers}
                      className="text-xs text-blue-400 hover:text-blue-300 font-medium"
                    >
                      {selectedServerIds.length === servers.length
                        ? "Deselect All MTA Servers"
                        : `Select All (${servers.length})`}
                    </button>
                  )}
                </div>

                <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/60 divide-y divide-slate-800/60">
                  {/* Local Control Plane option */}
                  <label className="flex items-center justify-between px-3.5 py-2.5 hover:bg-slate-900/60 cursor-pointer transition-colors">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={useLocalhost}
                        onChange={(e) => setUseLocalhost(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-200">
                            Control Plane Local Shell
                          </span>
                          <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            LOCAL TTY
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-mono">
                          127.0.0.1 (Direct host bash execution)
                        </p>
                      </div>
                    </div>
                    <Cpu className="h-4 w-4 text-emerald-400" />
                  </label>

                  {/* Remote MTA Servers */}
                  {loadingServers ? (
                    <div className="px-4 py-3 text-xs text-slate-500">Loading MTA servers...</div>
                  ) : servers.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-slate-500">
                      No remote MTA servers registered yet. You can run commands on the Control Plane Local Shell above or add MTA servers under MTA Servers.
                    </div>
                  ) : (
                    servers.map((srv) => {
                      const isChecked = selectedServerIds.includes(srv.id);
                      return (
                        <label
                          key={srv.id}
                          className="flex items-center justify-between px-3.5 py-2.5 hover:bg-slate-900/60 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleServer(srv.id)}
                              className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500"
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-slate-200">
                                  {srv.name}
                                </span>
                                <span className="text-[11px] font-mono text-slate-400">
                                  {srv.hostname_or_ip}:{srv.ssh_port}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500">
                                SSH User:{" "}
                                <span className="font-mono text-slate-400">
                                  {srv.username || "root"}
                                </span>{" "}
                                • Auth: {srv.credential_type || "password"}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`px-2 py-0.5 text-[10px] font-mono rounded border ${
                              srv.is_active
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : "bg-slate-800 text-slate-400 border-slate-700"
                            }`}
                          >
                            {srv.is_active ? "ACTIVE" : "INACTIVE"}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Quick Snippets */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  2. Quick Diagnostic Presets
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_SNIPPETS.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => setCommandText(s.cmd)}
                      className="px-2.5 py-1 rounded-md text-xs font-mono bg-slate-950 border border-slate-800 text-slate-300 hover:border-blue-500/40 hover:text-blue-300 transition-colors"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Command Textarea */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    3. Shell Command (Bash / Sh)
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Timeout:</span>
                    <select
                      value={timeoutSec}
                      onChange={(e) => setTimeoutSec(Number(e.target.value))}
                      className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                    >
                      <option value={15}>15s</option>
                      <option value={30}>30s</option>
                      <option value={60}>60s</option>
                      <option value={120}>120s</option>
                      <option value={300}>300s</option>
                    </select>
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute left-3 top-3 text-xs font-mono text-emerald-400 select-none">
                    root@#
                  </div>
                  <textarea
                    rows={4}
                    value={commandText}
                    onChange={(e) => setCommandText(e.target.value)}
                    placeholder="Enter bash command to run across selected servers..."
                    className="w-full pl-16 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-lg font-mono text-xs text-emerald-300 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-slate-400">
                  Targets selected:{" "}
                  <strong className="text-slate-200">
                    {selectedServerIds.length + (useLocalhost ? 1 : 0)} node(s)
                  </strong>
                </span>
                <Button type="submit" disabled={isExecuting} className="gap-2">
                  {isExecuting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Executing over SSH...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Execute Command
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Right: Live Output Console */}
        <Card className="lg:col-span-6 border-slate-800 bg-slate-950 flex flex-col">
          <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
              </div>
              <span className="text-xs font-mono font-semibold text-slate-200 ml-2">
                SSH Execution Output Console
              </span>
            </div>

            {displayedJob && (
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 text-[10px] font-mono rounded border uppercase ${
                    isSuccessStatus(displayedJob.status)
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                      : "bg-red-500/15 text-red-300 border-red-500/30"
                  }`}
                >
                  {displayedJob.status} (exit: {displayedJob.exit_code ?? 0})
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  {displayedJob.duration_ms}ms
                </span>
                <button
                  type="button"
                  onClick={() => copyOutput(displayedJob)}
                  className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  title="Copy output"
                >
                  {copiedId === displayedJob.id ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Batch Node Tabs if multiple nodes were executed */}
          {activeBatchJobs.length > 1 && (
            <div className="px-3 py-2 border-b border-slate-800 bg-slate-900/40 flex items-center gap-1.5 overflow-x-auto">
              {activeBatchJobs.map((bJob) => {
                const isSelected = displayedJob?.id === bJob.id;
                return (
                  <button
                    key={bJob.id}
                    type="button"
                    onClick={() => setInspectedJob(bJob)}
                    className={`px-2.5 py-1 rounded text-xs font-mono flex items-center gap-1.5 border transition-colors ${
                      isSelected
                        ? "bg-blue-600/20 text-blue-300 border-blue-500/40"
                        : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
                    }`}
                  >
                    {isSuccessStatus(bJob.status) ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <XCircle className="h-3 w-3 text-red-400" />
                    )}
                    <span>{bJob.server_name}</span>
                  </button>
                );
              })}
            </div>
          )}

          <CardContent className="p-4 flex-1 flex flex-col justify-between font-mono text-xs min-h-[340px] max-h-[430px] overflow-y-auto">
            {!displayedJob ? (
              <div className="my-auto text-center text-slate-500 space-y-2">
                <Terminal className="h-8 w-8 mx-auto text-slate-700" />
                <p className="text-xs text-slate-400">
                  Run a command or click any job in the audit log below to inspect its stdout/stderr stream.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="pb-2 border-b border-slate-800/80 text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-slate-500">Node:</span>{" "}
                    <span className="text-slate-200 font-semibold">{displayedJob.server_name}</span>{" "}
                    <span className="text-slate-500">({displayedJob.server_host})</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Type:</span>{" "}
                    <span className="text-blue-400 uppercase">{displayedJob.execution_type}</span>
                    {displayedJob.script_name && (
                      <span className="text-slate-300"> • {displayedJob.script_name}</span>
                    )}
                  </div>
                </div>

                <div className="p-2.5 rounded bg-slate-900/90 border border-slate-800 text-amber-300 break-all">
                  <span className="text-slate-500 select-none">$ </span>
                  {displayedJob.command_text}
                </div>

                {displayedJob.stdout ? (
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500">
                      STANDARD OUTPUT (STDOUT)
                    </span>
                    <pre className="p-3 rounded bg-black/60 border border-slate-800/90 text-emerald-300 whitespace-pre-wrap break-words leading-relaxed">
                      {displayedJob.stdout}
                    </pre>
                  </div>
                ) : (
                  <div className="text-slate-500 italic text-xs">No stdout returned.</div>
                )}

                {displayedJob.stderr && (
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase tracking-wider text-red-400">
                      STANDARD ERROR (STDERR)
                    </span>
                    <pre className="p-3 rounded bg-red-950/30 border border-red-500/30 text-red-300 whitespace-pre-wrap break-words leading-relaxed">
                      {displayedJob.stderr}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Execution History & Audit Table */}
      <Card className="border-slate-800 bg-slate-900/60">
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-slate-100">
              Execution History & Audit Trail
            </h3>
            <span className="px-2 py-0.5 text-xs rounded-full bg-slate-800 text-slate-300 font-mono">
              {filteredJobs.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg bg-slate-950 p-0.5 border border-slate-800">
              {(["ALL", "command", "script"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium uppercase transition-colors ${
                    typeFilter === t
                      ? "bg-blue-600 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by server, IP, command..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <Button variant="secondary" size="sm" onClick={() => refetchJobs()}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 text-[11px] uppercase font-medium text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Target Node</th>
                  <th className="px-4 py-3">Command / Script</th>
                  <th className="px-4 py-3">Exit / Duration</th>
                  <th className="px-4 py-3">Executed At</th>
                  <th className="px-4 py-3 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {loadingJobs ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                      Loading execution history...
                    </td>
                  </tr>
                ) : filteredJobs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-slate-500">
                      No remote executions recorded matching your filter.
                    </td>
                  </tr>
                ) : (
                  filteredJobs.map((job) => {
                    const isSelected = displayedJob?.id === job.id;
                    const ok = isSuccessStatus(job.status);
                    return (
                      <tr
                        key={job.id}
                        onClick={() => setInspectedJob(job)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? "bg-blue-600/10" : "hover:bg-slate-800/40"
                        }`}
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono uppercase border ${
                              ok
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : "bg-red-500/10 text-red-400 border-red-500/20"
                            }`}
                          >
                            {ok ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : (
                              <XCircle className="h-3 w-3" />
                            )}
                            {job.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                              job.execution_type.toLowerCase() === "script"
                                ? "bg-purple-500/15 text-purple-300 border border-purple-500/30"
                                : "bg-blue-500/15 text-blue-300 border border-blue-500/30"
                            }`}
                          >
                            {job.execution_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-medium text-slate-200">{job.server_name}</div>
                          <div className="text-[11px] font-mono text-slate-500">
                            {job.server_host}
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-md">
                          {job.script_name ? (
                            <div className="font-semibold text-purple-300">{job.script_name}</div>
                          ) : null}
                          <div className="font-mono text-[11px] text-slate-300 truncate">
                            {job.command_text}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-mono text-[11px]">
                          <span
                            className={
                              job.exit_code === 0 ? "text-emerald-400" : "text-red-400"
                            }
                          >
                            exit {job.exit_code ?? 0}
                          </span>{" "}
                          <span className="text-slate-500">• {job.duration_ms}ms</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-400">
                          {new Date(job.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setInspectedJob(job);
                            }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Output
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
