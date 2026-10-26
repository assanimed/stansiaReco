import React from "react";
import { 
  Globe, 
  Server, 
  TerminalSquare, 
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  ArrowUpRight
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-100">Infrastructure Overview</h2>
        <p className="text-sm text-slate-400 mt-1">
          Real-time health, domains synchronization, server inventory, and execution telemetry.
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Domains</span>
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <Globe className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-100">0</div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-400">
              <span className="text-emerald-400 font-medium">Sync Ready</span>
              <span>• Namecheap</span>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Expiring Soon</span>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-100">0</div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-400">
              <span>Within next 30 days</span>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Registered Servers</span>
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
              <Server className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-100">0</div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-400">
              <span className="text-emerald-400 font-medium">0 Connected</span>
              <span>• SSH</span>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Recent Executions</span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <TerminalSquare className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-100">0</div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-400">
              <span>0% failure rate</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle>Recent Script Executions</CardTitle>
              <CardDescription>Latest approved diagnostic runs across remote nodes</CardDescription>
            </div>
            <Link
              href="/executions"
              className="text-xs font-medium text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              View all <ArrowUpRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-8 text-center">
              <TerminalSquare className="h-8 w-8 text-slate-600 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-300">No executions recorded yet</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Once remote servers are configured, approved diagnostic scripts will display execution telemetry and logs here.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Security & Control Status</CardTitle>
            <CardDescription>Policy verification & runtime guard</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-950/40 border border-slate-800">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-semibold text-slate-200">Anti-SSRF & DNS Rebinding</span>
                <p className="text-slate-400 mt-0.5">Enforced. Outbound dial to RFC 1918 & metadata ranges blocked.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-950/40 border border-slate-800">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-semibold text-slate-200">Credential Vault</span>
                <p className="text-slate-400 mt-0.5">AES-256-GCM authenticated envelope encryption active.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-950/40 border border-slate-800">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-semibold text-slate-200">SSH Host-Key Pinning</span>
                <p className="text-slate-400 mt-0.5">Strict verification. Insecure host-key ignore rejected.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
