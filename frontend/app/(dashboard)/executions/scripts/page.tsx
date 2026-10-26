"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  FileCode2,
  Play,
  Plus,
  Edit3,
  Trash2,
  Search,
  ShieldAlert,
  ShieldCheck,
  Clock,
  Server,
  Cpu,
  Code2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  X,
  Command,
  Terminal,
  Copy,
  Check,
  Radio,
  StopCircle,
  Sliders,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useGetServersQuery } from "@/lib/store/api/servers-api";
import {
  useGetScriptsQuery,
  useCreateScriptMutation,
  useUpdateScriptMutation,
  useDeleteScriptMutation,
  streamExecution,
  StreamLogEvent,
  RegisteredScript,
  CreateScriptPayload,
  ExecutionJob,
} from "@/lib/store/api/executions-api";
import { notify } from "@/lib/notifications/notification-store";
import { confirmAction } from "@/lib/dialogs/confirm-dialog-service";

const CATEGORIES = ["ALL", "mta", "network", "system", "security"] as const;

export default function PreconfiguredScriptsPage() {
  const { data: scripts = [], isLoading: loadingScripts } = useGetScriptsQuery();
  const { data: servers = [] } = useGetServersQuery();

  const [createScript, { isLoading: isCreating }] = useCreateScriptMutation();
  const [updateScript, { isLoading: isUpdating }] = useUpdateScriptMutation();
  const [deleteScript] = useDeleteScriptMutation();

  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedScriptIds, setExpandedScriptIds] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Create / Edit Modal State
  const [editorOpen, setEditorOpen] = useState<boolean>(false);
  const [editingScript, setEditingScript] = useState<RegisteredScript | null>(null);
  const [formState, setFormState] = useState<CreateScriptPayload>({
    name: "",
    slug: "",
    category: "mta",
    description: "",
    script_content: "#!/usr/bin/env bash\nset -e\n\necho \"=== Diagnostic Script ===\"\n",
    timeout_seconds: 180,
    is_dangerous: false,
    os_target: "linux",
  });
  const [formError, setFormError] = useState<string | null>(null);

  // Run Script Modal State (with Real-time Output Streaming)
  const [runnerScript, setRunnerScript] = useState<RegisteredScript | null>(null);
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>([]);
  const [useLocalhost, setUseLocalhost] = useState<boolean>(false);
  const [runnerTimeout, setRunnerTimeout] = useState<number>(180);
  const [echoCommands, setEchoCommands] = useState<boolean>(true);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [liveLogs, setLiveLogs] = useState<
    Record<
      string,
      {
        stdout: string;
        stderr: string;
        status: string;
        exitCode?: number;
        durationMs?: number;
        name: string;
        host: string;
        chunks: Array<{ stream: "stdout" | "stderr"; text: string }>;
      }
    >
  >({});
  const [activeServerTab, setActiveServerTab] = useState<string>("all");
  const [executionResults, setExecutionResults] = useState<ExecutionJob[]>([]);
  const [runError, setRunError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const terminalLogEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isStreaming && terminalLogEndRef.current) {
      terminalLogEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [liveLogs, isStreaming]);

  const toggleExpandSource = (id: string) => {
    setExpandedScriptIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const openCreateModal = () => {
    setEditingScript(null);
    setFormError(null);
    setFormState({
      name: "",
      slug: "",
      category: "mta",
      description: "",
      script_content:
        "#!/usr/bin/env bash\nset -e\n\necho \"=== Running Custom Server Script ===\"\nuname -a\n",
      timeout_seconds: 60,
      is_dangerous: false,
      os_target: "linux",
    });
    setEditorOpen(true);
  };

  const openEditModal = (script: RegisteredScript) => {
    setEditingScript(script);
    setFormError(null);
    setFormState({
      name: script.name,
      slug: script.slug,
      category: script.category || "general",
      description: script.description,
      script_content: script.script_content,
      timeout_seconds: script.timeout_seconds,
      is_dangerous: script.is_dangerous,
      os_target: script.os_target || "linux",
    });
    setEditorOpen(true);
  };

  const handleSaveScript = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!formState.name.trim() || !formState.script_content.trim()) {
      setFormError("Script name and bash script body are required.");
      return;
    }

    try {
      if (editingScript) {
        await updateScript({
          id: editingScript.id,
          name: formState.name,
          category: formState.category,
          os_target: formState.os_target,
          description: formState.description,
          script_content: formState.script_content,
          timeout_seconds: formState.timeout_seconds,
          is_dangerous: formState.is_dangerous,
        }).unwrap();
        notify.success(`Script "${formState.name}" updated successfully.`);
      } else {
        await createScript(formState).unwrap();
        notify.success(`Script "${formState.name}" created successfully.`);
      }
      setEditorOpen(false);
    } catch (err: any) {
      const msg =
        typeof err === "string"
          ? err
          : err?.data?.error?.message ||
            err?.data?.message ||
            err?.message ||
            "Failed to save script.";
      const cleanMsg =
        typeof msg === "string" && msg !== "[object Object]" && !msg.startsWith("[object Object]")
          ? msg
          : "Failed to save script.";
      setFormError(cleanMsg);
      notify.error(cleanMsg, { title: "Failed to save script" });
    }
  };

  const handleDeleteScript = async (script: RegisteredScript) => {
    const confirmed = await confirmAction({
      title: "Delete Script",
      message: `Delete pre-configured script "${script.name}"? This action cannot be undone.`,
      confirmLabel: "Delete Script",
      variant: "destructive",
    });
    if (!confirmed) return;

    try {
      await deleteScript(script.id).unwrap();
      notify.success(`Script "${script.name}" deleted successfully.`);
    } catch (err: any) {
      notify.error(err, { title: "Failed to delete script" });
    }
  };

  const openRunModal = (script: RegisteredScript) => {
    setRunnerScript(script);
    setExecutionResults([]);
    setRunError(null);
    setLiveLogs({});
    setRunnerTimeout(script.timeout_seconds > 0 ? script.timeout_seconds : 180);
    // CRITICAL: Default localhost to false so Linux scripts target remote MTA servers!
    setUseLocalhost(false);
    // Auto-select first server if none selected
    if (servers.length > 0 && selectedServerIds.length === 0) {
      setSelectedServerIds([servers[0].id]);
      setActiveServerTab(servers[0].id);
    } else if (selectedServerIds.length > 0) {
      setActiveServerTab(selectedServerIds[0]);
    } else {
      setActiveServerTab("local");
    }
  };

  const toggleTargetServer = (id: string) => {
    setSelectedServerIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const selectAllServers = () => {
    setSelectedServerIds(servers.map((s) => s.id));
  };

  const clearAllServers = () => {
    setSelectedServerIds([]);
  };

  const handleStopExecution = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
      notify.info("Execution aborted by operator.");
    }
  };

  const handleRunScriptNow = async () => {
    if (!runnerScript) return;
    setRunError(null);
    if (selectedServerIds.length === 0 && !useLocalhost) {
      setRunError("Please select at least one target server or enable Control Plane Local Shell.");
      return;
    }

    setIsStreaming(true);
    setExecutionResults([]);

    // Initialize live logs container for each selected target
    const initialLogs: Record<
      string,
      {
        stdout: string;
        stderr: string;
        status: string;
        exitCode?: number;
        durationMs?: number;
        name: string;
        host: string;
        chunks: Array<{ stream: "stdout" | "stderr"; text: string }>;
      }
    > = {};

    if (useLocalhost) {
      initialLogs["local"] = {
        stdout: "",
        stderr: "",
        status: "running",
        name: "Local Control Plane",
        host: "127.0.0.1",
        chunks: [],
      };
    }
    for (const sid of selectedServerIds) {
      const srv = servers.find((s) => s.id === sid);
      initialLogs[sid] = {
        stdout: "",
        stderr: "",
        status: "running",
        name: srv?.name || "Server",
        host: srv?.hostname_or_ip || "",
        chunks: [],
      };
    }
    setLiveLogs(initialLogs);

    if (selectedServerIds.length > 0) {
      setActiveServerTab(selectedServerIds[0]);
    } else if (useLocalhost) {
      setActiveServerTab("local");
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      let scriptToRun = runnerScript.script_content;
      if (echoCommands && !scriptToRun.includes("set -x")) {
        scriptToRun = "set -x\n" + scriptToRun;
      }

      const completedJobs = await streamExecution(
        {
          server_ids: selectedServerIds,
          use_localhost: useLocalhost,
          execution_type: "script",
          script_id: runnerScript.id,
          command: scriptToRun,
          timeout_seconds: runnerTimeout,
        },
        (event: StreamLogEvent) => {
          const targetKey = event.server_id || "local";
          setLiveLogs((prev) => {
            const current = prev[targetKey] || {
              stdout: "",
              stderr: "",
              status: "running",
              name: event.server_name || "Server",
              host: event.server_host || "",
              chunks: [],
            };

            if (event.type === "start") {
              return {
                ...prev,
                [targetKey]: {
                  ...current,
                  status: "running",
                  name: event.server_name || current.name,
                  host: event.server_host || current.host,
                },
              };
            }

            if (event.type === "log") {
              const chunk = event.chunk || "";
              const stream: "stdout" | "stderr" = event.stream === "stderr" ? "stderr" : "stdout";
              const updatedChunks = [...(current.chunks || []), { stream, text: chunk }];
              if (stream === "stderr") {
                return {
                  ...prev,
                  [targetKey]: {
                    ...current,
                    stderr: current.stderr + chunk,
                    chunks: updatedChunks,
                  },
                };
              } else {
                return {
                  ...prev,
                  [targetKey]: {
                    ...current,
                    stdout: current.stdout + chunk,
                    chunks: updatedChunks,
                  },
                };
              }
            }

            if (event.type === "done") {
              return {
                ...prev,
                [targetKey]: {
                  ...current,
                  status: event.status || "completed",
                  exitCode: event.exit_code,
                  durationMs: event.duration_ms,
                },
              };
            }

            return prev;
          });
        },
        controller.signal
      );

      setExecutionResults(completedJobs);
      const allSuccess = completedJobs.every((j) => j.status === "success");
      if (allSuccess) {
        notify.success(`Script "${runnerScript.name}" completed successfully on ${completedJobs.length} node(s).`);
      } else {
        notify.warning(`Script execution finished with exit code failure on some nodes.`);
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        const msg =
          typeof err === "string"
            ? err
            : err?.data?.error?.message ||
              err?.data?.message ||
              err?.message ||
              "Script execution failed.";
        const cleanMsg =
          typeof msg === "string" && msg !== "[object Object]" && !msg.startsWith("[object Object]")
            ? msg
            : "Script execution failed.";
        setRunError(cleanMsg);
        notify.error(cleanMsg, { title: "Script execution failed" });
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const copyScriptBody = (script: RegisteredScript) => {
    navigator.clipboard.writeText(script.script_content);
    setCopiedId(script.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredScripts = scripts.filter((s) => {
    if (categoryFilter !== "ALL" && s.category.toLowerCase() !== categoryFilter.toLowerCase()) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.slug.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.script_content.toLowerCase().includes(q)
    );
  });

  const getCategoryBadgeStyle = (category: string) => {
    switch (category.toUpperCase()) {
      case "MTA":
        return "bg-purple-500/15 text-purple-300 border-purple-500/30";
      case "NETWORK":
        return "bg-cyan-500/15 text-cyan-300 border-cyan-500/30";
      case "SECURITY":
        return "bg-amber-500/15 text-amber-300 border-amber-500/30";
      default:
        return "bg-blue-500/15 text-blue-300 border-blue-500/30";
    }
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-purple-600/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <FileCode2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-100">
              Pre-configured Server Scripts
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Curated library of operational, MTA, network, and security Bash scripts ready for one-click SSH execution.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Link href="/executions">
            <Button variant="secondary" size="sm" className="gap-1.5">
              <Command className="h-3.5 w-3.5 text-blue-400" />
              Ad-Hoc Commands
            </Button>
          </Link>
          <Link href="/executions/terminal">
            <Button variant="secondary" size="sm" className="gap-1.5">
              <Terminal className="h-3.5 w-3.5 text-emerald-400" />
              Live Terminal
            </Button>
          </Link>
          <Button size="sm" onClick={openCreateModal} className="gap-1.5">
            <Plus className="h-4 w-4" />
            New Pre-configured Script
          </Button>
        </div>
      </div>

      {/* Category Filter + Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-900/80 p-1 rounded-lg border border-slate-800">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium uppercase transition-colors ${
                categoryFilter === cat
                  ? "bg-blue-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {cat === "ALL" ? `All Scripts (${scripts.length})` : cat}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search scripts by name or command..."
            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Scripts Grid */}
      {loadingScripts ? (
        <div className="py-16 text-center text-sm text-slate-500">
          Loading pre-configured scripts registry...
        </div>
      ) : filteredScripts.length === 0 ? (
        <Card className="border-slate-800 bg-slate-900/50">
          <CardContent className="py-12 text-center space-y-3">
            <FileCode2 className="h-10 w-10 text-slate-600 mx-auto" />
            <p className="text-sm font-medium text-slate-300">No scripts match your filter</p>
            <Button size="sm" onClick={openCreateModal}>
              <Plus className="h-4 w-4" />
              Create Pre-configured Script
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredScripts.map((script) => {
            const isExpanded = expandedScriptIds.includes(script.id);
            return (
              <Card
                key={script.id}
                className="border-slate-800 bg-slate-900/60 hover:border-slate-700 transition-colors flex flex-col justify-between"
              >
                <CardContent className="p-5 space-y-4">
                  {/* Top Row */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-semibold text-slate-100">
                          {script.name}
                        </h3>
                        <span
                          className={`px-2 py-0.5 text-[10px] font-mono uppercase rounded border ${getCategoryBadgeStyle(
                            script.category
                          )}`}
                        >
                          {script.category}
                        </span>
                        {script.is_dangerous ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            <ShieldAlert className="h-3 w-3" />
                            MUTATING
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <ShieldCheck className="h-3 w-3" />
                            SAFE AUDIT
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                        slug: {script.slug} • timeout: {script.timeout_seconds}s • target:{" "}
                        {script.os_target}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditModal(script)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                        title="Edit Script"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteScript(script)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Delete Script"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {script.description || "No description provided."}
                  </p>

                  {/* Source Code Preview */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => toggleExpandSource(script.id)}
                        className="text-[11px] font-mono text-blue-400 hover:text-blue-300 flex items-center gap-1"
                      >
                        <Code2 className="h-3.5 w-3.5" />
                        {isExpanded ? "Hide Bash Source" : "View Bash Source"}
                      </button>
                      <button
                        type="button"
                        onClick={() => copyScriptBody(script)}
                        className="text-[11px] font-mono text-slate-400 hover:text-slate-200 flex items-center gap-1"
                      >
                        {copiedId === script.id ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-400" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            Copy Script
                          </>
                        )}
                      </button>
                    </div>

                    <pre
                      className={`p-3 rounded-lg bg-slate-950 border border-slate-800/90 font-mono text-[11px] text-emerald-300 overflow-x-auto leading-relaxed ${
                        isExpanded ? "max-h-72" : "max-h-24"
                      }`}
                    >
                      {script.script_content}
                    </pre>
                  </div>

                  {/* Action Footer */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Max execution: {script.timeout_seconds}s
                    </span>
                    <Button
                      size="sm"
                      onClick={() => openRunModal(script)}
                      className="gap-1.5"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Run Script on Server
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      </div>

      {/* Modal 1: Run Pre-configured Script on Server(s) with Real-Time Output Streaming */}
      {runnerScript && (
        <div className="fixed inset-0 !m-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-4xl rounded-xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div>
                <div className="flex items-center gap-2">
                  <Play className="h-4 w-4 text-blue-400" />
                  <h3 className="text-base font-bold text-slate-100">
                    Execute Script: {runnerScript.name}
                  </h3>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-mono uppercase rounded border ${getCategoryBadgeStyle(
                      runnerScript.category
                    )}`}
                  >
                    {runnerScript.category}
                  </span>
                  {runnerScript.is_dangerous && (
                    <span className="px-2 py-0.5 text-[10px] font-mono uppercase rounded border bg-amber-500/15 text-amber-300 border-amber-500/30">
                      Mutating
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{runnerScript.description}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (isStreaming) handleStopExecution();
                  setRunnerScript(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              {runError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                  {runError}
                </div>
              )}

              {/* Server Picker & Configuration Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Target Servers (2 cols) */}
                <div className="md:col-span-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <Server className="h-3.5 w-3.5 text-blue-400" />
                      Select Target Servers ({selectedServerIds.length} selected)
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={selectAllServers}
                        className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        Select All
                      </button>
                      <span className="text-slate-600">•</span>
                      <button
                        type="button"
                        onClick={clearAllServers}
                        className="text-[11px] text-slate-400 hover:text-slate-300 transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 divide-y divide-slate-800/60">
                    {servers.map((srv) => (
                      <label
                        key={srv.id}
                        className="flex items-center justify-between px-3.5 py-2.5 hover:bg-slate-900 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={selectedServerIds.includes(srv.id)}
                            onChange={() => toggleTargetServer(srv.id)}
                            className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0"
                          />
                          <div>
                            <span className="text-xs font-semibold text-slate-200">
                              {srv.name}
                            </span>{" "}
                            <span className="text-xs font-mono text-slate-400">
                              ({srv.hostname_or_ip}:{srv.ssh_port})
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">
                          {srv.username || "root"}
                        </span>
                      </label>
                    ))}

                    <label className="flex items-center justify-between px-3.5 py-2.5 hover:bg-slate-900 cursor-pointer border-t border-slate-800/80">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={useLocalhost}
                          onChange={(e) => setUseLocalhost(e.target.checked)}
                          className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0"
                        />
                        <div>
                          <span className="text-xs font-semibold text-slate-200">
                            Control Plane Local Shell (127.0.0.1)
                          </span>
                          <p className="text-[10px] text-slate-500 font-mono">
                            Execute script directly on local host shell
                          </p>
                        </div>
                      </div>
                      <Cpu className="h-4 w-4 text-emerald-400" />
                    </label>
                  </div>
                </div>

                {/* Execution Options (1 col) */}
                <div className="space-y-3">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Sliders className="h-3.5 w-3.5 text-blue-400" />
                    Execution Options
                  </label>

                  <div className="p-3.5 rounded-lg border border-slate-800 bg-slate-950 space-y-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">
                        Timeout (Seconds)
                      </label>
                      <input
                        type="number"
                        min={10}
                        max={1800}
                        value={runnerTimeout}
                        onChange={(e) => setRunnerTimeout(Number(e.target.value))}
                        disabled={isStreaming}
                        className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        Allow longer timeouts for package installs & builds.
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={echoCommands}
                          onChange={(e) => setEchoCommands(e.target.checked)}
                          disabled={isStreaming}
                          className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0 mt-0.5"
                        />
                        <div>
                          <span className="text-[11px] font-medium text-slate-200 block">
                            Echo commands as they run
                          </span>
                          <p className="text-[10px] text-slate-400">
                            Prints each command line (<span className="text-emerald-400 font-mono">+ cmd</span>) right before executing it.
                          </p>
                        </div>
                      </label>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80">
                      <span className="text-[11px] text-slate-400 block mb-0.5">Execution Shell</span>
                      <span className="text-xs font-mono text-emerald-400">bash -l -s (stdin)</span>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        CRLF normalized • Non-interactive env
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Real-Time Live Streaming Terminal Log Viewer */}
              {(isStreaming || Object.keys(liveLogs).length > 0) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Terminal className="h-4 w-4 text-emerald-400" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                        Live Execution Logs
                      </span>
                      {isStreaming && (
                        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-[10px] font-mono text-blue-400 animate-pulse">
                          <Radio className="h-2.5 w-2.5 animate-spin" />
                          STREAMING REAL-TIME
                        </span>
                      )}
                    </div>

                    {/* Server Tabs */}
                    <div className="flex gap-1.5 flex-wrap">
                      {Object.entries(liveLogs).map(([key, node]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setActiveServerTab(key)}
                          className={`px-2.5 py-1 rounded text-xs font-mono flex items-center gap-1.5 border transition-colors ${
                            activeServerTab === key
                              ? "bg-blue-600/25 text-blue-300 border-blue-500/50 shadow-sm"
                              : "bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700"
                          }`}
                        >
                          {node.status === "running" ? (
                            <RefreshCw className="h-3 w-3 animate-spin text-blue-400" />
                          ) : node.status === "success" || node.status === "completed" ? (
                            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                          ) : node.status === "failed" ? (
                            <XCircle className="h-3 w-3 text-red-400" />
                          ) : (
                            <div className="h-2 w-2 rounded-full bg-slate-500" />
                          )}
                          <span>{node.name}</span>
                          {node.exitCode !== undefined && (
                            <span className="text-[10px] opacity-75">
                              (exit: {node.exitCode})
                            </span>
                          )}
                        </button>
                      ))}

                      {Object.keys(liveLogs).length > 1 && (
                        <button
                          type="button"
                          onClick={() => setActiveServerTab("all")}
                          className={`px-2.5 py-1 rounded text-xs font-mono border transition-colors ${
                            activeServerTab === "all"
                              ? "bg-purple-600/25 text-purple-300 border-purple-500/50"
                              : "bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700"
                          }`}
                        >
                          All Consolidated
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Terminal Box */}
                  <div className="rounded-xl bg-black border border-slate-800 overflow-hidden shadow-inner font-mono text-xs">
                    {/* Terminal Top Bar */}
                    <div className="px-4 py-2 border-b border-slate-800/80 bg-slate-950/80 flex items-center justify-between text-[11px] text-slate-400">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          <div className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
                          <div className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
                          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
                        </div>
                        <span className="text-slate-300 font-semibold ml-2">
                          {activeServerTab === "all"
                            ? "All Target Nodes"
                            : `${liveLogs[activeServerTab]?.name || "Target"} (${
                                liveLogs[activeServerTab]?.host || "host"
                              })`}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        {activeServerTab !== "all" && liveLogs[activeServerTab] && (
                          <span>
                            Status:{" "}
                            <span
                              className={
                                liveLogs[activeServerTab].status === "running"
                                  ? "text-blue-400 font-semibold animate-pulse"
                                  : liveLogs[activeServerTab].status === "success"
                                  ? "text-emerald-400 font-semibold"
                                  : "text-red-400 font-semibold"
                              }
                            >
                              {liveLogs[activeServerTab].status}
                            </span>
                            {liveLogs[activeServerTab].durationMs !== undefined && (
                              <span className="ml-2 text-slate-500">
                                • {liveLogs[activeServerTab].durationMs}ms
                              </span>
                            )}
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            let text = "";
                            if (activeServerTab === "all") {
                              text = Object.values(liveLogs)
                                .map((n) => `=== ${n.name} ===\n${n.stdout}\n${n.stderr}`)
                                .join("\n\n");
                            } else if (liveLogs[activeServerTab]) {
                              text = [
                                liveLogs[activeServerTab].stdout,
                                liveLogs[activeServerTab].stderr,
                              ]
                                .filter(Boolean)
                                .join("\n");
                            }
                            navigator.clipboard.writeText(text);
                            notify.success("Terminal log copied to clipboard.");
                          }}
                          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
                        >
                          <Copy className="h-3 w-3" />
                          Copy Log
                        </button>
                      </div>
                    </div>

                    {/* Terminal Stream Area */}
                    <div className="p-4 max-h-72 overflow-y-auto space-y-1 bg-black/95 select-text">
                      {activeServerTab === "all" ? (
                        Object.entries(liveLogs).map(([key, node]) => (
                          <div key={key} className="mb-4">
                            <div className="text-blue-400 text-[11px] font-bold border-b border-slate-900 pb-1 mb-1.5 flex items-center justify-between">
                              <span>=== {node.name} ({node.host}) ===</span>
                              <span className="text-[10px] text-slate-500">{node.status}</span>
                            </div>
                            {node.chunks && node.chunks.length > 0 ? (
                              <pre className="whitespace-pre-wrap break-words leading-relaxed font-mono">
                                {node.chunks.map((c, i) => (
                                  <span
                                    key={i}
                                    className={c.stream === "stderr" ? "text-rose-400" : "text-emerald-300"}
                                  >
                                    {c.text}
                                  </span>
                                ))}
                              </pre>
                            ) : (
                              <>
                                {node.stdout && (
                                  <pre className="text-emerald-300 whitespace-pre-wrap break-words leading-relaxed font-mono">
                                    {node.stdout}
                                  </pre>
                                )}
                                {node.stderr && (
                                  <pre className="text-rose-400 whitespace-pre-wrap break-words leading-relaxed font-mono">
                                    {node.stderr}
                                  </pre>
                                )}
                              </>
                            )}
                            {(!node.chunks || node.chunks.length === 0) && !node.stdout && !node.stderr && node.status === "running" && (
                              <div className="text-slate-600 italic py-1">
                                Waiting for output...
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <>
                          {liveLogs[activeServerTab]?.chunks && liveLogs[activeServerTab].chunks.length > 0 ? (
                            <pre className="whitespace-pre-wrap break-words leading-relaxed font-mono">
                              {liveLogs[activeServerTab].chunks.map((c, i) => (
                                <span
                                  key={i}
                                  className={c.stream === "stderr" ? "text-rose-400" : "text-emerald-300"}
                                >
                                  {c.text}
                                </span>
                              ))}
                            </pre>
                          ) : (
                            <>
                              {liveLogs[activeServerTab]?.stdout && (
                                <pre className="text-emerald-300 whitespace-pre-wrap break-words leading-relaxed font-mono">
                                  {liveLogs[activeServerTab].stdout}
                                </pre>
                              )}
                              {liveLogs[activeServerTab]?.stderr && (
                                <pre className="text-rose-400 whitespace-pre-wrap break-words leading-relaxed font-mono">
                                  {liveLogs[activeServerTab].stderr}
                                </pre>
                              )}
                            </>
                          )}
                          {(!liveLogs[activeServerTab]?.chunks || liveLogs[activeServerTab].chunks.length === 0) &&
                            !liveLogs[activeServerTab]?.stdout &&
                            !liveLogs[activeServerTab]?.stderr &&
                            liveLogs[activeServerTab]?.status === "running" && (
                              <div className="flex items-center gap-2 text-slate-500 py-3">
                                <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-400" />
                                <span>Session connected. Streaming remote process output...</span>
                              </div>
                            )}
                        </>
                      )}
                      <div ref={terminalLogEndRef} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (isStreaming) handleStopExecution();
                  setRunnerScript(null);
                }}
              >
                Close
              </Button>

              <div className="flex items-center gap-2">
                {isStreaming ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleStopExecution}
                    className="gap-2"
                  >
                    <StopCircle className="h-4 w-4" />
                    Stop Execution
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleRunScriptNow}
                    disabled={selectedServerIds.length === 0 && !useLocalhost}
                    className="gap-2"
                  >
                    <Play className="h-4 w-4" />
                    {Object.keys(liveLogs).length > 0 ? "Re-execute Script" : "Execute Script Now"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Create / Edit Script */}
      {editorOpen && (
        <div className="fixed inset-0 !m-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0">
              <h3 className="text-base font-bold text-slate-100">
                {editingScript ? `Edit Script: ${editingScript.name}` : "Create Pre-configured Script"}
              </h3>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveScript} className="p-6 space-y-4 overflow-y-auto flex-1">
              {formError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Script Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formState.name}
                    onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                    placeholder="e.g. Check PowerMTA Queue"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={formState.category}
                    onChange={(e) => setFormState({ ...formState, category: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value="mta">MTA</option>
                    <option value="network">NETWORK</option>
                    <option value="system">SYSTEM</option>
                    <option value="security">SECURITY</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={formState.description}
                  onChange={(e) => setFormState({ ...formState, description: e.target.value })}
                  placeholder="Describe what this script inspects or configures..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Bash Script Body *
                </label>
                <textarea
                  rows={8}
                  required
                  value={formState.script_content}
                  onChange={(e) =>
                    setFormState({ ...formState, script_content: e.target.value })
                  }
                  className="w-full p-3 bg-slate-950 border border-slate-800 rounded-lg font-mono text-xs text-emerald-300 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Timeout (Seconds)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={1800}
                    value={formState.timeout_seconds}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        timeout_seconds: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <label className="flex items-center gap-2.5 pt-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formState.is_dangerous}
                    onChange={(e) =>
                      setFormState({ ...formState, is_dangerous: e.target.checked })
                    }
                    className="rounded border-slate-700 bg-slate-950 text-amber-500"
                  />
                  <span className="text-xs text-slate-300">
                    Mark as Mutating / Privileged Operation
                  </span>
                </label>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setEditorOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isCreating || isUpdating}>
                  {editingScript ? "Save Changes" : "Register Script"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
