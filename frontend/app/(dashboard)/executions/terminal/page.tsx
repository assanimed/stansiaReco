"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Terminal,
  Plus,
  X,
  Server,
  Cpu,
  Play,
  Trash2,
  Maximize2,
  Minimize2,
  Command,
  FileCode2,
  Radio,
  ShieldCheck,
  AlertCircle,
  Send,
  CornerDownLeft,
  StopCircle,
  Eraser,
  RefreshCw,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useGetServersQuery } from "@/lib/store/api/servers-api";
import {
  useGetTerminalSessionsQuery,
  useCreateTerminalSessionMutation,
  useWriteTerminalInputMutation,
  useCloseTerminalSessionMutation,
  TerminalSessionInfo,
} from "@/lib/store/api/executions-api";

const TERMINAL_MACROS = [
  { label: "System Info", cmd: "uname -a && uptime\n" },
  { label: "IP Addresses", cmd: "ip -o -4 addr show 2>/dev/null || ifconfig\n" },
  { label: "Disk Usage", cmd: "df -h\n" },
  { label: "Processes", cmd: "ps aux | head -n 15\n" },
  { label: "Open Ports", cmd: "ss -tlnp 2>/dev/null || netstat -an | head -n 20\n" },
  { label: "Mail Queue", cmd: "postqueue -p 2>/dev/null || echo 'Postfix not installed'\n" },
  { label: "List Files", cmd: "ls -la\n" },
];

interface StyledSegment {
  text: string;
  colorClass: string;
}

/**
 * Lightweight ANSI escape sequence parser for xterm-256color output.
 * Handles screen clear sequences (\x1b[2J\x1b[H) and standard SGR color codes.
 */
function parseAnsiOutput(raw: string): StyledSegment[] {
  if (!raw) return [];

  const clearTokens = ["\x1b[2J\x1b[H", "\x1b[H\x1b[2J", "\x1b[2J"];
  let processed = raw;
  for (const token of clearTokens) {
    const idx = processed.lastIndexOf(token);
    if (idx !== -1) {
      processed = processed.slice(idx + token.length);
    }
  }

  processed = processed.replace(/\x1b\[\?[0-9;]*[a-zA-Z]/g, "");

  const segments: StyledSegment[] = [];
  const regex = /\x1b\[([0-9;]*)m/g;
  let lastIdx = 0;
  let currentColor = "text-slate-200";

  let match: RegExpExecArray | null;
  while ((match = regex.exec(processed)) !== null) {
    if (match.index > lastIdx) {
      segments.push({
        text: processed.slice(lastIdx, match.index),
        colorClass: currentColor,
      });
    }

    const codeStr = match[1];
    const codes = codeStr.split(";").map((n) => parseInt(n || "0", 10));
    if (codes.includes(0)) {
      currentColor = "text-slate-200";
    }
    if (codes.includes(31) || codes.includes(91)) {
      currentColor = "text-red-400 font-semibold";
    } else if (codes.includes(32) || codes.includes(92)) {
      currentColor = "text-emerald-400 font-semibold";
    } else if (codes.includes(33) || codes.includes(93)) {
      currentColor = "text-amber-300";
    } else if (codes.includes(34) || codes.includes(94)) {
      currentColor = "text-blue-400 font-semibold";
    } else if (codes.includes(35) || codes.includes(95)) {
      currentColor = "text-purple-400";
    } else if (codes.includes(36) || codes.includes(96)) {
      currentColor = "text-cyan-400";
    }

    lastIdx = regex.lastIndex;
  }

  if (lastIdx < processed.length) {
    segments.push({
      text: processed.slice(lastIdx),
      colorClass: currentColor,
    });
  }

  return segments;
}

export default function LiveTerminalPage() {
  const { data: servers = [] } = useGetServersQuery();
  const { data: sessions = [], refetch: refetchSessions } = useGetTerminalSessionsQuery(
    undefined,
    { pollingInterval: 5000 }
  );

  const [createSession, { isLoading: isConnecting }] = useCreateTerminalSessionMutation();
  const [writeInput] = useWriteTerminalInputMutation();
  const [closeSession] = useCloseTerminalSessionMutation();

  const [selectedTarget, setSelectedTarget] = useState<string>("LOCAL");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [buffers, setBuffers] = useState<Record<string, string>>({});
  const [offsets, setOffsets] = useState<Record<string, number>>({});
  const [commandInput, setCommandInput] = useState<string>("");
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const terminalViewportRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const offsetsRef = useRef<Record<string, number>>({});
  offsetsRef.current = offsets;

  // Auto-select first active session if none selected
  useEffect(() => {
    if (!activeSessionId && sessions.length > 0) {
      setActiveSessionId(sessions[0].session_id);
    } else if (
      activeSessionId &&
      sessions.length > 0 &&
      !sessions.some((s) => s.session_id === activeSessionId)
    ) {
      setActiveSessionId(sessions[0].session_id);
    }
  }, [sessions, activeSessionId]);

  // Poll incremental TTY output buffer for the active session
  const fetchIncrementalOutput = useCallback(async (sessionId: string) => {
    try {
      const currentOffset = offsetsRef.current[sessionId] ?? 0;
      const token = typeof window !== "undefined" ? localStorage.getItem("sr_token") : null;
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const res = await fetch(
        `/api/v1/executions/terminal/sessions/${sessionId}/output?offset=${currentOffset}`,
        {
          credentials: "include",
          headers,
        }
      );
      if (!res.ok) return;
      const data: {
        data: string;
        next_offset: number;
        status: string;
      } = await res.json();

      if (data.data && data.data.length > 0) {
        setBuffers((prev) => ({
          ...prev,
          [sessionId]: (prev[sessionId] || "") + data.data,
        }));
      }
      if (typeof data.next_offset === "number") {
        setOffsets((prev) => ({
          ...prev,
          [sessionId]: data.next_offset,
        }));
      }
    } catch {
      // ignore transient network errors during poll
    }
  }, []);

  useEffect(() => {
    if (!activeSessionId) return;
    fetchIncrementalOutput(activeSessionId);
    const interval = setInterval(() => {
      fetchIncrementalOutput(activeSessionId);
    }, 220);
    return () => clearInterval(interval);
  }, [activeSessionId, fetchIncrementalOutput]);

  // Auto-scroll viewport on new output
  useEffect(() => {
    if (terminalViewportRef.current) {
      terminalViewportRef.current.scrollTop = terminalViewportRef.current.scrollHeight;
    }
  }, [buffers, activeSessionId]);

  const handleOpenTerminal = async () => {
    setErrorBanner(null);
    try {
      const isLocal = selectedTarget === "LOCAL";
      const res = await createSession({
        server_id: isLocal ? undefined : selectedTarget,
        is_local: isLocal,
        cols: 120,
        rows: 34,
      }).unwrap();

      const session = res.session;
      setActiveSessionId(session.session_id);
      setOffsets((prev) => ({ ...prev, [session.session_id]: 0 }));
      setBuffers((prev) => ({ ...prev, [session.session_id]: "" }));
      setTimeout(() => {
        fetchIncrementalOutput(session.session_id);
        inputRef.current?.focus();
      }, 100);
    } catch (err: any) {
      setErrorBanner(
        err?.data?.message ||
          "Failed to establish SSH TTY session. Verify server SSH credentials or select Control Plane Local TTY."
      );
    }
  };

  const handleSendInput = async (rawInput: string) => {
    if (!activeSessionId) return;
    try {
      await writeInput({ session_id: activeSessionId, data: rawInput }).unwrap();
      setTimeout(() => fetchIncrementalOutput(activeSessionId), 80);
    } catch (err: any) {
      setErrorBanner(err?.data?.message || "Failed to write to TTY stream.");
    }
  };

  const handleCommandSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSessionId) return;

    const line = commandInput;
    if (line.trim()) {
      setCmdHistory((prev) => [line, ...prev.slice(0, 49)]);
    }
    setHistoryIdx(-1);
    setCommandInput("");
    await handleSendInput(line + "\n");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (cmdHistory.length > 0 && historyIdx < cmdHistory.length - 1) {
        const nextIdx = historyIdx + 1;
        setHistoryIdx(nextIdx);
        setCommandInput(cmdHistory[nextIdx]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIdx > 0) {
        const nextIdx = historyIdx - 1;
        setHistoryIdx(nextIdx);
        setCommandInput(cmdHistory[nextIdx]);
      } else if (historyIdx === 0) {
        setHistoryIdx(-1);
        setCommandInput("");
      }
    } else if (e.ctrlKey && e.key.toLowerCase() === "c") {
      e.preventDefault();
      handleSendInput("\x03");
    } else if (e.ctrlKey && e.key.toLowerCase() === "l") {
      e.preventDefault();
      if (activeSessionId) {
        setBuffers((prev) => ({ ...prev, [activeSessionId]: "" }));
      }
      handleSendInput("clear\n");
    }
  };

  const handleCloseTab = async (session: TerminalSessionInfo, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await closeSession(session.session_id).unwrap();
      if (activeSessionId === session.session_id) {
        const remaining = sessions.filter((s) => s.session_id !== session.session_id);
        setActiveSessionId(remaining.length > 0 ? remaining[0].session_id : null);
      }
    } catch {
      refetchSessions();
    }
  };

  const activeSession = sessions.find((s) => s.session_id === activeSessionId) || null;
  const activeRawBuffer = activeSessionId ? buffers[activeSessionId] || "" : "";
  const parsedSegments = parseAnsiOutput(activeRawBuffer);

  return (
    <div
      className={`space-y-4 ${
        isFullscreen ? "fixed inset-0 !m-0 z-50 bg-slate-950 p-6 flex flex-col" : ""
      }`}
    >
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Terminal className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold tracking-tight text-slate-100">
                Live SSH Terminal (Interactive TTY)
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                xterm-256color PTY
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Establish stateful interactive SSH pseudo-terminal (PTY) sessions to remote MTA nodes or the local Control Plane.
            </p>
          </div>
        </div>

        {/* Target Node Launcher */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1">
            <Server className="h-3.5 w-3.5 text-blue-400 mr-2 shrink-0" />
            <select
              value={selectedTarget}
              onChange={(e) => setSelectedTarget(e.target.value)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none pr-2"
            >
              <option value="LOCAL" className="bg-slate-900 text-slate-100">
                Control Plane Local TTY (127.0.0.1)
              </option>
              {servers.map((srv) => (
                <option key={srv.id} value={srv.id} className="bg-slate-900 text-slate-100">
                  {srv.name} — {srv.username || "root"}@{srv.hostname_or_ip}:{srv.ssh_port}
                </option>
              ))}
            </select>
          </div>

          <Button
            size="sm"
            onClick={handleOpenTerminal}
            disabled={isConnecting}
            className="gap-1.5"
          >
            {isConnecting ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Dialing SSH PTY...
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" />
                Open SSH Terminal
              </>
            )}
          </Button>

          <Link href="/executions">
            <Button variant="secondary" size="sm" className="gap-1.5">
              <Command className="h-3.5 w-3.5 text-blue-400" />
              Commands
            </Button>
          </Link>
          <Link href="/executions/scripts">
            <Button variant="secondary" size="sm" className="gap-1.5">
              <FileCode2 className="h-3.5 w-3.5 text-purple-400" />
              Scripts
            </Button>
          </Link>
        </div>
      </div>

      {errorBanner && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-between text-xs text-red-300 shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
            <span>{errorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="text-red-400 hover:text-red-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Terminal Window Container */}
      <Card className="border-slate-800 bg-[#090d16] shadow-2xl overflow-hidden flex-1 flex flex-col">
        {/* Top Chrome & Session Tab Bar */}
        <div className="bg-slate-900/95 border-b border-slate-800 px-3 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 overflow-x-auto">
            <div className="flex items-center gap-1.5 px-2 shrink-0">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
            </div>

            {sessions.length === 0 ? (
              <span className="text-xs font-mono text-slate-500 px-2">
                No active TTY sessions
              </span>
            ) : (
              sessions.map((sess) => {
                const isActive = sess.session_id === activeSessionId;
                return (
                  <div
                    key={sess.session_id}
                    onClick={() => setActiveSessionId(sess.session_id)}
                    className={`group flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono cursor-pointer border transition-colors ${
                      isActive
                        ? "bg-slate-950 text-emerald-300 border-emerald-500/40 shadow"
                        : "bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200"
                    }`}
                  >
                    <Radio
                      className={`h-3 w-3 ${
                        sess.status === "closed"
                          ? "text-slate-500"
                          : "text-emerald-400 animate-pulse"
                      }`}
                    />
                    <span className="truncate max-w-[180px]">{sess.server_name}</span>
                    <span className="text-[10px] text-slate-500">({sess.server_host})</span>
                    <button
                      type="button"
                      onClick={(e) => handleCloseTab(sess, e)}
                      className="p-0.5 rounded hover:bg-red-500/20 hover:text-red-300 text-slate-500"
                      title="Close SSH TTY Session"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {activeSession && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (activeSessionId) {
                      setBuffers((prev) => ({ ...prev, [activeSessionId]: "" }));
                    }
                  }}
                  className="px-2 py-1 rounded text-[11px] font-mono bg-slate-800/80 hover:bg-slate-800 text-slate-300 flex items-center gap-1"
                  title="Clear scrollback buffer (Ctrl+L)"
                >
                  <Eraser className="h-3 w-3" />
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => handleSendInput("\x03")}
                  className="px-2 py-1 rounded text-[11px] font-mono bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 flex items-center gap-1"
                  title="Send SIGINT (Ctrl+C)"
                >
                  <StopCircle className="h-3 w-3" />
                  Ctrl+C
                </button>
                <button
                  type="button"
                  onClick={() => handleCloseTab(activeSession)}
                  className="px-2 py-1 rounded text-[11px] font-mono bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 flex items-center gap-1"
                  title="Disconnect SSH session"
                >
                  <Trash2 className="h-3 w-3" />
                  Disconnect
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 rounded bg-slate-800/80 hover:bg-slate-800 text-slate-300"
              title="Toggle Fullscreen Terminal"
            >
              {isFullscreen ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Quick TTY Macro Toolbar */}
        {activeSession && (
          <div className="px-4 py-2 bg-slate-900/50 border-b border-slate-800/80 flex items-center gap-1.5 overflow-x-auto">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mr-1 shrink-0">
              Quick TTY Inject:
            </span>
            {TERMINAL_MACROS.map((m) => (
              <button
                key={m.label}
                type="button"
                onClick={() => handleSendInput(m.cmd)}
                className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-950 border border-slate-800 text-slate-300 hover:border-emerald-500/40 hover:text-emerald-300 transition-colors shrink-0"
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

        {/* Main Terminal Screen */}
        {!activeSession ? (
          <div className="flex-1 min-h-[440px] flex flex-col items-center justify-center p-8 text-center space-y-4">
            <div className="h-14 w-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Terminal className="h-7 w-7" />
            </div>
            <div className="max-w-md space-y-1.5">
              <h3 className="text-base font-bold text-slate-100">
                No Active SSH Terminal Session
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Select a target MTA server from the top bar (or use the{" "}
                <span className="text-emerald-300 font-mono">Control Plane Local TTY</span>) and click{" "}
                <strong>Open SSH Terminal</strong> to launch a live interactive shell.
              </p>
            </div>
            <Button onClick={handleOpenTerminal} disabled={isConnecting} className="gap-2">
              <Play className="h-4 w-4" />
              Launch Interactive TTY Session
            </Button>
          </div>
        ) : (
          <>
            <div
              ref={terminalViewportRef}
              onClick={() => inputRef.current?.focus()}
              className="flex-1 min-h-[420px] max-h-[540px] p-4 overflow-y-auto font-mono text-xs leading-relaxed select-text cursor-text bg-[#06090f]"
            >
              {parsedSegments.length === 0 ? (
                <div className="text-slate-500">
                  Initializing PTY stream for {activeSession.server_name} (
                  {activeSession.server_host})...
                </div>
              ) : (
                <pre className="whitespace-pre-wrap break-words font-mono">
                  {parsedSegments.map((seg, idx) => (
                    <span key={idx} className={seg.colorClass}>
                      {seg.text}
                    </span>
                  ))}
                  <span className="inline-block w-2 h-4 bg-emerald-400 animate-pulse align-middle ml-0.5" />
                </pre>
              )}
            </div>

            {/* Interactive TTY Command Input Bar */}
            <form
              onSubmit={handleCommandSubmit}
              className="border-t border-slate-800 bg-slate-900/90 px-4 py-2.5 flex items-center gap-3"
            >
              <span className="text-xs font-mono font-bold text-emerald-400 shrink-0 select-none flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5" />
                {activeSession.is_local
                  ? "local@control-plane:~#"
                  : `${activeSession.username || "root"}@${activeSession.server_name}:~#`}
              </span>

              <input
                ref={inputRef}
                type="text"
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type interactive shell command and press Enter (Up/Down for history, Ctrl+C to interrupt, Ctrl+L to clear)..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 font-mono text-xs text-emerald-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/60"
                autoFocus
              />

              <Button type="submit" size="sm" className="gap-1.5 shrink-0">
                <Send className="h-3.5 w-3.5" />
                Send
                <CornerDownLeft className="h-3 w-3 opacity-70" />
              </Button>
            </form>

            {/* Telemetry Status Bar */}
            <div className="px-4 py-1.5 bg-slate-950 border-t border-slate-900 flex flex-wrap items-center justify-between text-[11px] font-mono text-slate-500">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1 text-emerald-400">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {activeSession.is_local ? "LOCAL-PTY-SHELL" : "SSH-2.0-AES256-GCM"}
                </span>
                <span>Session ID: {activeSession.session_id}</span>
                <span>
                  Geometry: {activeSession.cols}x{activeSession.rows}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span>
                  Buffer: {(offsets[activeSession.session_id] || 0).toLocaleString()} bytes
                </span>
                <span>
                  Connected: {new Date(activeSession.created_at).toLocaleTimeString()}
                </span>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
