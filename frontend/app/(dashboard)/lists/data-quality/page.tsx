"use client";

import React, { useState } from "react";
import {
  CheckCheck,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  UserX,
  Flame,
  HelpCircle,
  Database,
  BarChart2,
  FileCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useGetDataQualityReportQuery,
  useGetMailListsQuery,
} from "@/lib/store/api/lists-api";

export default function DataQualityPage() {
  const [selectedList, setSelectedList] = useState("");
  const { data: listsData } = useGetMailListsQuery({ per_page: 100 });
  const {
    data: report,
    isLoading,
    isFetching,
    refetch,
  } = useGetDataQualityReportQuery(selectedList ? { list_id: selectedList } : undefined);

  const total = report?.total_contacts || 0;
  const cleanRate = total > 0 ? Math.round(((report?.clean_contacts || 0) / total) * 100) : 100;
  const unsubRate = total > 0 ? (((report?.unsubscribed_contacts || 0) / total) * 100).toFixed(1) : "0.0";
  const bounceRate = total > 0 ? (((report?.hard_bounces || 0) / total) * 100).toFixed(1) : "0.0";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2.5">
            <CheckCheck className="h-7 w-7 text-blue-500" />
            Data Quality & List Hygiene
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Systematic audit of contact deliverability, missing profile attributes, hard bounces, and suppressions.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <select
            value={selectedList}
            onChange={(e) => setSelectedList(e.target.value)}
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-md text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="">Global (All Lists)</option>
            {listsData?.lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="border-slate-800 text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw className={cn("h-4 w-4 mr-1.5", isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Health Score Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900/60 border-slate-800">
          <CardContent className="p-5">
            <div className="text-xs font-medium text-slate-400">Total Audited Contacts</div>
            <div className="text-3xl font-bold text-slate-100 mt-1 font-mono">
              {isLoading ? "—" : total.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {selectedList ? "In selected segment" : "Across all stored mail lists"}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800">
          <CardContent className="p-5">
            <div className="text-xs font-medium text-emerald-400">Hygiene Score (Clean Rate)</div>
            <div className="text-3xl font-bold text-emerald-400 mt-1 font-mono">
              {isLoading ? "—" : `${cleanRate}%`}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {(report?.clean_contacts ?? 0).toLocaleString()} deliverable contacts
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800">
          <CardContent className="p-5">
            <div className="text-xs font-medium text-amber-400">Unsubscribe Rate</div>
            <div className="text-3xl font-bold text-amber-400 mt-1 font-mono">
              {isLoading ? "—" : `${unsubRate}%`}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {(report?.unsubscribed_contacts ?? 0).toLocaleString()} opt-outs/unsubs
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800">
          <CardContent className="p-5">
            <div className="text-xs font-medium text-rose-400">Hard Bounce Rate</div>
            <div className="text-3xl font-bold text-rose-400 mt-1 font-mono">
              {isLoading ? "—" : `${bounceRate}%`}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {(report?.hard_bounces ?? 0).toLocaleString()} delivery failures
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analysis Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Missing Fields Breakdown */}
        <Card className="bg-slate-900/60 border-slate-800">
          <CardContent className="p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              Missing Field Analysis
            </h3>
            <p className="text-xs text-slate-400">
              Audit contacts missing secondary personalization or geographic metadata.
            </p>

            <div className="space-y-3 pt-2">
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Missing First Name:</span>
                  <span className="font-mono">
                    {(report?.missing_first_name ?? 0).toLocaleString()} (
                    {total > 0 ? Math.round(((report?.missing_first_name || 0) / total) * 100) : 0}%)
                  </span>
                </div>
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                  <div
                    style={{
                      width: `${total > 0 ? ((report?.missing_first_name || 0) / total) * 100 : 0}%`,
                    }}
                    className="bg-amber-500 h-full"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Missing Country Code:</span>
                  <span className="font-mono">
                    {(report?.missing_country ?? 0).toLocaleString()} (
                    {total > 0 ? Math.round(((report?.missing_country || 0) / total) * 100) : 0}%)
                  </span>
                </div>
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                  <div
                    style={{
                      width: `${total > 0 ? ((report?.missing_country || 0) / total) * 100 : 0}%`,
                    }}
                    className="bg-blue-500 h-full"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Missing IP Address:</span>
                  <span className="font-mono">
                    {(report?.missing_ip ?? 0).toLocaleString()} (
                    {total > 0 ? Math.round(((report?.missing_ip || 0) / total) * 100) : 0}%)
                  </span>
                </div>
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                  <div
                    style={{
                      width: `${total > 0 ? ((report?.missing_ip || 0) / total) * 100 : 0}%`,
                    }}
                    className="bg-purple-500 h-full"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Suppression & Risk Distribution */}
        <Card className="bg-slate-900/60 border-slate-800">
          <CardContent className="p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              Suppression & Deliverability Protection
            </h3>
            <p className="text-xs text-slate-400">
              Active guards preventing email delivery to invalid or opted-out recipients.
            </p>

            <div className="space-y-3 pt-2 text-xs">
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-300">Total Enforced Suppressions:</span>
                <span className="font-mono font-bold text-slate-100">
                  {(report?.total_suppressions ?? 0).toLocaleString()}
                </span>
              </div>

              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-300">Hard Bounced Quarantine:</span>
                <span className="font-mono font-bold text-rose-400">
                  {(report?.hard_bounces ?? 0).toLocaleString()}
                </span>
              </div>

              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-300">Manual / Spam Blacklists:</span>
                <span className="font-mono font-bold text-red-400">
                  {(report?.blacklisted_contacts ?? 0).toLocaleString()}
                </span>
              </div>

              <div className="flex justify-between py-2">
                <span className="text-slate-300">Opt-outs & Unsubscribes:</span>
                <span className="font-mono font-bold text-amber-400">
                  {(report?.unsubscribed_contacts ?? 0).toLocaleString()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
