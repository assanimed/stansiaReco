"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Activity,
  Search,
  Filter,
  RefreshCw,
  Clock,
  ChevronLeft,
  ChevronRight,
  Eye,
  Database,
  Mail,
  Flame,
  MousePointerClick,
  UserX,
  FileSpreadsheet,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useGetContactEventsQuery,
  useGetMailListsQuery,
  ContactEvent,
} from "@/lib/store/api/lists-api";

export default function ActivityEventsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [selectedList, setSelectedList] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 25;

  const [selectedEvent, setSelectedEvent] = useState<ContactEvent | null>(null);

  const { data: listsData } = useGetMailListsQuery({ per_page: 100 });
  const {
    data: eventsData,
    isLoading,
    isFetching,
    refetch,
  } = useGetContactEventsQuery({
    email: searchTerm || undefined,
    event_type: selectedType || undefined,
    list_id: selectedList || undefined,
    page,
    per_page: perPage,
  });

  const events = eventsData?.events || [];
  const total = eventsData?.total || 0;
  const totalPages = Math.ceil(total / perPage) || 1;

  const eventTypeBadges: Record<string, { label: string; class: string }> = {
    import: { label: "Imported", class: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
    open: { label: "Opened", class: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
    click: { label: "Clicked", class: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" },
    bounce: { label: "Hard Bounce", class: "bg-rose-500/10 text-rose-400 border-rose-500/20" },
    unsubscribe: { label: "Unsubscribe", class: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
    optout: { label: "Opt-out", class: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
    suppressed: { label: "Suppressed", class: "bg-red-600/15 text-red-300 border-red-600/30" },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2.5">
            <Activity className="h-7 w-7 text-blue-500" />
            Activity & Contact Events
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time auditable telemetry stream of opens, clicks, unsubscribes, bounces, and import ingestions.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="border-slate-800 text-slate-300 hover:bg-slate-800 self-start sm:self-auto"
        >
          <RefreshCw className={cn("h-4 w-4 mr-1.5", isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <Card className="bg-slate-900/60 border-slate-800">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search by recipient email..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-9 pr-3 py-2 bg-slate-950/70 border border-slate-800 rounded-md text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <select
                value={selectedType}
                onChange={(e) => {
                  setSelectedType(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 bg-slate-950/70 border border-slate-800 rounded-md text-sm text-slate-300 focus:outline-none focus:border-blue-500"
              >
                <option value="">All Event Types</option>
                <option value="import">Import Event</option>
                <option value="open">Message Open</option>
                <option value="click">Link Click</option>
                <option value="bounce">Hard Bounce</option>
                <option value="unsubscribe">Unsubscribe</option>
                <option value="optout">Opt-out</option>
                <option value="suppressed">Suppression Hit</option>
              </select>
            </div>

            <div>
              <select
                value={selectedList}
                onChange={(e) => {
                  setSelectedList(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 bg-slate-950/70 border border-slate-800 rounded-md text-sm text-slate-300 focus:outline-none focus:border-blue-500"
              >
                <option value="">All Mail Lists</option>
                {listsData?.lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-slate-900/60 border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-[11px] font-semibold uppercase text-slate-400 tracking-wider">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Event Type</th>
                <th className="px-4 py-3">Recipient Email</th>
                <th className="px-4 py-3">Mail List</th>
                <th className="px-4 py-3">IP Address</th>
                <th className="px-4 py-3">User Agent</th>
                <th className="px-4 py-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
                    Loading events stream...
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                    No activity recorded matching criteria.
                  </td>
                </tr>
              ) : (
                events.map((ev) => {
                  const badge = eventTypeBadges[ev.event_type] || {
                    label: ev.event_type,
                    class: "bg-slate-800 text-slate-300 border-slate-700",
                  };

                  return (
                    <tr key={ev.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">
                        {new Date(ev.created_at).toLocaleString()}
                      </td>

                      <td className="px-4 py-2.5">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-medium border uppercase font-mono",
                            badge.class
                          )}
                        >
                          {badge.label}
                        </span>
                      </td>

                      <td className="px-4 py-2.5 font-mono text-slate-100 font-medium">{ev.email}</td>

                      <td className="px-4 py-2.5">
                        <Link
                          href={`/lists/${ev.list_id}`}
                          className="text-slate-300 hover:text-blue-400 hover:underline"
                        >
                          {ev.list_name || "List"}
                        </Link>
                      </td>

                      <td className="px-4 py-2.5 font-mono text-slate-400 text-[11px]">{ev.ip_address || "—"}</td>

                      <td className="px-4 py-2.5 text-slate-500 truncate max-w-xs">{ev.user_agent || "—"}</td>

                      <td className="px-4 py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedEvent(ev)}
                          className="h-7 px-2 text-slate-400 hover:text-white hover:bg-slate-800"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Server-side Pagination Footer */}
        <div className="px-4 py-3 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div>
            Showing <span className="font-semibold text-slate-200">{events.length > 0 ? (page - 1) * perPage + 1 : 0}</span> to{" "}
            <span className="font-semibold text-slate-200">{Math.min(page * perPage, total)}</span> of{" "}
            <span className="font-semibold text-slate-200">{total}</span> events
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isFetching}
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              className="h-7 px-2 border-slate-800 text-slate-300 hover:bg-slate-800"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-2 font-mono">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isFetching}
              onClick={() => setPage((p) => p + 1)}
              className="h-7 px-2 border-slate-800 text-slate-300 hover:bg-slate-800"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Metadata Inspector Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-500" />
                Event Metadata Inspector
              </h2>
              <button onClick={() => setSelectedEvent(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-950 p-3 rounded border border-slate-800 space-y-1">
                <div>
                  Recipient: <strong className="font-mono text-slate-100">{selectedEvent.email}</strong>
                </div>
                <div>
                  Event Type: <strong className="font-mono text-blue-400 uppercase">{selectedEvent.event_type}</strong>
                </div>
                <div>
                  Recorded: <span className="text-slate-400">{new Date(selectedEvent.created_at).toLocaleString()}</span>
                </div>
                <div>
                  IP: <span className="font-mono text-slate-400">{selectedEvent.ip_address || "None"}</span>
                </div>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">Payload Metadata JSON:</span>
                <pre className="bg-slate-950 p-3 rounded border border-slate-800 font-mono text-[11px] text-slate-300 max-h-48 overflow-y-auto">
                  {JSON.stringify(selectedEvent.metadata, null, 2)}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedEvent(null)}
                className="border-slate-800 text-slate-300 hover:bg-slate-800"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
