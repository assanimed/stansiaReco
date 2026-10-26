"use client";

import React from "react";
import Link from "next/link";
import { useGetProvidersQuery, useGetServersQuery } from "@/lib/store/api/servers-api";
import { 
  Building2, 
  Server, 
  PlusCircle, 
  Layers, 
  Network, 
  Cpu, 
  DownloadCloud, 
  PlayCircle, 
  Radio, 
  CheckCircle2, 
  ArrowRight,
  ShieldCheck,
  RefreshCw
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ServersHubPage() {
  const { data: providers = [] } = useGetProvidersQuery();
  const { data: servers = [], isLoading, refetch } = useGetServersQuery();

  const openPort25Providers = providers.filter((p) => p.port_25_open).length;
  const verifiedPort25Servers = servers.filter((s) => s.port_25_status === "open").length;
  const totalVMTAs = servers.reduce((acc, s) => acc + (s.vmta_count || 0), 0);

  const hubNavigation = [
    {
      title: "Servers Providers",
      description: "Manage dedicated and cloud hosting providers with outbound Port 25 status visibility.",
      href: "/servers/providers",
      icon: Building2,
      badge: `${providers.length} Providers (${openPort25Providers} Port 25 Open)`,
      color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    },
    {
      title: "MTA Servers List",
      description: "View, filter, test SSH connection, and check port 25 email delivery availability.",
      href: "/servers/mta",
      icon: Server,
      badge: `${servers.length} Registered Nodes`,
      color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    },
    {
      title: "Add MTA Servers",
      description: "Add a single server with credentials and SSH authentication options (password, key, PEM).",
      href: "/servers/mta/add",
      icon: PlusCircle,
      badge: "Single Onboarding",
      color: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    },
    {
      title: "Add Multiple MTA Servers",
      description: "Bulk import multiple MTA nodes via multi-line format with live parser preview.",
      href: "/servers/mta/add-bulk",
      icon: Layers,
      badge: "Batch Import",
      color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    },
    {
      title: "VMTAs List",
      description: "Virtual MTA routing pools, IP-to-domain bindings, and Postfix/PowerMTA config export.",
      href: "/servers/mta/vmtas",
      icon: Network,
      badge: `${totalVMTAs} Virtual Pools`,
      color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    },
    {
      title: "Configure Additional IPs",
      description: "Add secondary IPs and generate automated NetworkManager nmcli bash setup scripts.",
      href: "/servers/mta/configure-ips",
      icon: Cpu,
      badge: "nmcli Automation",
      color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
    },
    {
      title: "Install MTA Servers",
      description: "Generate automated installation and hardening scripts for Postfix or PowerMTA.",
      href: "/servers/mta/install",
      icon: DownloadCloud,
      badge: "Postfix & PowerMTA",
      color: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    },
    {
      title: "Manage Proxies Servers",
      description: "Configure Squid HTTP proxy and Dante SOCKS5 proxy with custom ports and credentials.",
      href: "/servers/mta/proxies",
      icon: Radio,
      badge: "Squid & Dante",
      color: "text-teal-400 bg-teal-500/10 border-teal-500/20",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-100">Server & Infrastructure Inventory</h2>
          <p className="text-sm text-slate-400 mt-1">
            End-to-end control plane for server providers, MTA nodes, secondary IP aliases, and proxy routing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()}
            className="border-slate-800 text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
          <Link href="/servers/mta/add">
            <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white">
              <PlusCircle className="h-3.5 w-3.5 mr-1.5" />
              Add MTA Server
            </Button>
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur">
          <span className="text-xs text-slate-400 block">Total Providers</span>
          <p className="text-2xl font-bold text-slate-100 mt-1">{providers.length}</p>
          <span className="text-xs text-emerald-400 font-semibold block mt-0.5">
            {openPort25Providers} with Port 25 Open
          </span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur">
          <span className="text-xs text-slate-400 block">Active MTA Servers</span>
          <p className="text-2xl font-bold text-blue-400 mt-1">{servers.length}</p>
          <span className="text-xs text-slate-400 block mt-0.5">
            {verifiedPort25Servers} Verified Port 25
          </span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur">
          <span className="text-xs text-slate-400 block">Total VMTAs</span>
          <p className="text-2xl font-bold text-amber-400 mt-1">{totalVMTAs}</p>
          <span className="text-xs text-slate-400 block mt-0.5">
            Dedicated Outbound Pools
          </span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur">
          <span className="text-xs text-slate-400 block">Credential Vault</span>
          <p className="text-2xl font-bold text-emerald-400 mt-1">AES-256</p>
          <span className="text-xs text-slate-400 block mt-0.5">
            GCM Envelope Encryption
          </span>
        </div>
      </div>

      {/* Hub Navigation Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {hubNavigation.map((item) => (
          <Link key={item.title} href={item.href} className="group">
            <Card className="h-full border-slate-800 bg-slate-900/60 shadow-lg backdrop-blur hover:border-slate-700 hover:bg-slate-900/90 transition-all">
              <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className={`p-2 rounded-lg border ${item.color}`}>
                      <item.icon className="h-5 w-5" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
                  </div>

                  <div>
                    <h3 className="font-semibold text-slate-100 text-sm group-hover:text-blue-400 transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800/80">
                  <span className="text-[11px] font-semibold text-slate-400 font-mono">
                    {item.badge}
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Recent MTA Servers Table Preview */}
      <Card className="border-slate-800 bg-slate-900/60 shadow-xl backdrop-blur">
        <CardContent className="p-0">
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-blue-400" />
              <h3 className="font-semibold text-slate-100 text-sm">Recently Added MTA Servers</h3>
            </div>
            <Link href="/servers/mta" className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1">
              View all MTA servers <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/80 text-xs font-semibold text-slate-400 border-b border-slate-800 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Name / Main IP</th>
                  <th className="px-6 py-3.5">Provider</th>
                  <th className="px-6 py-3.5">Port 25 Status</th>
                  <th className="px-6 py-3.5">Software</th>
                  <th className="px-6 py-3.5 text-center">IPs / VMTAs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      Loading servers...
                    </td>
                  </tr>
                ) : servers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      No MTA servers registered yet.
                    </td>
                  </tr>
                ) : (
                  servers.slice(0, 5).map((srv) => (
                    <tr key={srv.id} className="hover:bg-slate-800/30">
                      <td className="px-6 py-3.5 font-semibold text-slate-200">
                        {srv.name} <span className="font-mono text-xs text-slate-400 font-normal">({srv.main_ip})</span>
                      </td>
                      <td className="px-6 py-3.5 text-xs text-slate-300">
                        {srv.provider_name || "Self-hosted"}
                      </td>
                      <td className="px-6 py-3.5">
                        {srv.port_25_status === "open" ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Port 25 Open
                          </span>
                        ) : srv.port_25_status === "closed" ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            Port 25 Blocked
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400">
                            Untested
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-xs uppercase font-mono text-slate-300">
                        {srv.mta_software}
                      </td>
                      <td className="px-6 py-3.5 text-center text-xs font-mono text-slate-400">
                        {srv.ip_count} IPs / {srv.vmta_count} VMTAs
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
