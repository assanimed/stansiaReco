"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  Globe, 
  Server, 
  TerminalSquare, 
  Settings, 
  ShieldCheck, 
  Shield, 
  Users, 
  Palette, 
  ChevronDown, 
  ChevronRight,
  Activity,
  Building2,
  PlusCircle,
  Layers,
  ListOrdered,
  Network,
  Cpu,
  DownloadCloud,
  PlayCircle,
  Radio,
  ArrowLeftRight,
  Terminal,
  FileCode2,
  Command,
  Sparkles,
  Mail,
  Inbox,
  Send,
  Boxes,
  Contact,
  FileSpreadsheet,
  CheckCheck,
  UserX,
  History,
  Flag,
  Briefcase,
  Sliders,
  SendHorizontal,
  MailCheck
} from "lucide-react";
import { cn } from "@/lib/utils";

const mainNavigation = [
  { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { name: "Servers Providers", href: "/servers/providers", icon: Building2 },
];

const mailListsGroups = [
  {
    heading: "ESPs & Providers",
    items: [
      { name: "Mailbox Providers", href: "/lists/mailbox-providers", icon: Inbox },
      { name: "Sending ESPs", href: "/lists/sending-esps", icon: Send },
      { name: "Sending IP Pools", href: "/lists/ip-pools", icon: Boxes },
    ],
  },
  {
    heading: "Data Management",
    items: [
      { name: "All Lists", href: "/lists", icon: ListOrdered },
      { name: "Contacts", href: "/lists/contacts", icon: Contact },
      { name: "Import Jobs", href: "/lists/imports", icon: FileSpreadsheet },
      { name: "Data Quality", href: "/lists/data-quality", icon: CheckCheck },
      { name: "Suppressions", href: "/lists/suppressions", icon: UserX },
      { name: "Activity & Events", href: "/lists/activity", icon: History },
    ],
  },
  {
    heading: "Configuration",
    items: [
      { name: "Countries", href: "/lists/countries", icon: Flag },
      { name: "Verticals", href: "/lists/verticals", icon: Briefcase },
      { name: "Data Settings", href: "/lists/settings", icon: Sliders },
    ],
  },
];

const domainsSubNavigation = [
  { name: "Domains Providers", href: "/domains/providers", icon: Building2 },
  { name: "Domains List", href: "/domains", icon: Globe },
  { name: "DNS Records", href: "/domains/dns", icon: Layers },
  { name: "SPF & DKIM Studio", href: "/domains/dns/spf-studio", icon: Sparkles },
  { name: "DNS IP Replacement", href: "/domains/dns/ip-replace", icon: ArrowLeftRight },
];

const mtaSubNavigation = [
  { name: "Add MTA Servers", href: "/servers/mta/add", icon: PlusCircle },
  { name: "Add Multiple MTA Servers", href: "/servers/mta/add-bulk", icon: Layers },
  { name: "MTA Servers List", href: "/servers/mta", icon: ListOrdered },
  { name: "VMTAs List", href: "/servers/mta/vmtas", icon: Network },
  { name: "All Server IPs", href: "/servers/mta/configure-ips?server_id=all", icon: Network },
  { name: "Configure Additional IPs", href: "/servers/mta/configure-ips", icon: Cpu },
  { name: "Install MTA Servers", href: "/servers/mta/install", icon: DownloadCloud },
  { name: "Mta Servers Actions", href: "/servers/mta/actions", icon: PlayCircle },
  { name: "Manage Proxies Servers", href: "/servers/mta/proxies", icon: Radio },
];

const executionsSubNavigation = [
  { name: "Remote Commands", href: "/executions", icon: Command },
  { name: "Scripts", href: "/executions/scripts", icon: FileCode2 },
  { name: "Live Terminal", href: "/executions/terminal", icon: Terminal },
  { name: "iRedMail Servers", href: "/executions/iredmail", icon: Mail },
];

const campaignsSubNavigation = [
  { name: "All Campaigns", href: "/campaigns", icon: MailCheck },
  { name: "Create Campaign", href: "/campaigns/create", icon: PlusCircle },
];

const bottomNavigation = [
  { name: "Settings & Keys", href: "/settings", icon: Settings },
];

const securitySubNavigation = [
  { name: "Users", href: "/security/users", icon: Users },
  { name: "Theme", href: "/security/theme", icon: Palette },
];

export function Sidebar() {
  const pathname = usePathname();
  const isDomainsActive = pathname.startsWith("/domains");
  const isMtaActive = pathname.startsWith("/servers/mta");
  const isMailListsActive = pathname.startsWith("/lists");
  const isCampaignsActive = pathname.startsWith("/campaigns");
  const isExecutionsActive = pathname.startsWith("/executions");
  const isSecurityActive = pathname.startsWith("/security") || pathname === "/users";

  const [domainsOpen, setDomainsOpen] = useState(true);
  const [mtaOpen, setMtaOpen] = useState(true);
  const [mailListsOpen, setMailListsOpen] = useState(true);
  const [campaignsOpen, setCampaignsOpen] = useState(true);
  const [executionsOpen, setExecutionsOpen] = useState(true);
  const [securityOpen, setSecurityOpen] = useState(false);

  return (
    <aside className="w-64 border-r border-slate-800 bg-slate-900/60 backdrop-blur flex flex-col justify-between shrink-0">
      <div className="overflow-y-auto max-h-[calc(100vh-80px)]">
        <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-800 shrink-0">
          <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold shadow-lg shadow-blue-500/20">
            SR
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-100 leading-none">StansiaReco</h1>
            <span className="text-[11px] text-slate-400 font-mono">Control Plane v1.0</span>
          </div>
        </div>

        <nav className="p-4 space-y-1">
          <Link
            href="/dashboard"
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              pathname === "/dashboard"
                ? "bg-blue-600/10 text-blue-400 border border-blue-500/20"
                : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/50"
            )}
          >
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            Overview
          </Link>

          {/* Domains & DNS Expandable Group */}
          <div className="pt-0.5">
            <button
              onClick={() => setDomainsOpen(!domainsOpen)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isDomainsActive
                  ? "text-blue-400 bg-blue-600/10 border border-blue-500/20 font-semibold"
                  : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/50"
              )}
            >
              <div className="flex items-center gap-3">
                <Globe className="h-4 w-4 shrink-0 text-blue-400" />
                <span>Domains & DNS</span>
              </div>
              {domainsOpen ? (
                <ChevronDown className="h-4 w-4 text-slate-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-400" />
              )}
            </button>

            {domainsOpen && (
              <div className="pl-4 pt-1 space-y-0.5 border-l border-slate-800/80 ml-3.5 my-1">
                {domainsSubNavigation.map((subItem) => {
                  const isSubActive = pathname === subItem.href;
                  return (
                    <Link
                      key={subItem.name}
                      href={subItem.href}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                        isSubActive
                          ? "bg-blue-600/15 text-blue-300 font-semibold border border-blue-500/30"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                      )}
                    >
                      <subItem.icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{subItem.name}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <Link
            href="/servers/providers"
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              pathname === "/servers/providers"
                ? "bg-blue-600/10 text-blue-400 border border-blue-500/20"
                : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/50"
            )}
          >
            <Building2 className="h-4 w-4 shrink-0" />
            Servers Providers
          </Link>

          {/* MTA Servers Expandable Group */}
          <div className="pt-1">
            <button
              onClick={() => setMtaOpen(!mtaOpen)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isMtaActive
                  ? "text-blue-400 bg-blue-600/10 border border-blue-500/20 font-semibold"
                  : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/50"
              )}
            >
              <div className="flex items-center gap-3">
                <Server className="h-4 w-4 shrink-0 text-blue-400" />
                <span>MTA Servers</span>
              </div>
              {mtaOpen ? (
                <ChevronDown className="h-4 w-4 text-slate-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-400" />
              )}
            </button>

            {mtaOpen && (
              <div className="pl-4 pt-1 space-y-0.5 border-l border-slate-800/80 ml-3.5 my-1">
                {mtaSubNavigation.map((subItem) => {
                  const isSubActive = pathname === subItem.href;
                  return (
                    <Link
                      key={subItem.name}
                      href={subItem.href}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                        isSubActive
                          ? "bg-blue-600/15 text-blue-300 font-semibold border border-blue-500/30"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                      )}
                    >
                      <subItem.icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{subItem.name}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Mail Lists Expandable Group */}
          <div className="pt-1">
            <button
              onClick={() => setMailListsOpen(!mailListsOpen)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isMailListsActive
                  ? "text-blue-400 bg-blue-600/10 border border-blue-500/20 font-semibold"
                  : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/50"
              )}
            >
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 shrink-0 text-blue-400" />
                <span>Mail Lists</span>
              </div>
              {mailListsOpen ? (
                <ChevronDown className="h-4 w-4 text-slate-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-400" />
              )}
            </button>

            {mailListsOpen && (
              <div className="pl-4 pt-1 space-y-2 border-l border-slate-800/80 ml-3.5 my-1">
                {mailListsGroups.map((group) => (
                  <div key={group.heading} className="space-y-0.5">
                    <div className="px-3 pt-1 pb-0.5 text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                      {group.heading}
                    </div>
                    {group.items.map((subItem) => {
                      const isSubActive =
                        subItem.href === "/lists"
                          ? pathname === "/lists"
                          : pathname.startsWith(subItem.href);
                      return (
                        <Link
                          key={subItem.name}
                          href={subItem.href}
                          className={cn(
                            "flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                            isSubActive
                              ? "bg-blue-600/15 text-blue-300 font-semibold border border-blue-500/30"
                              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                          )}
                        >
                          <subItem.icon className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{subItem.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Campaigns & Mailing Expandable Group */}
          <div className="pt-1">
            <button
              onClick={() => setCampaignsOpen(!campaignsOpen)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isCampaignsActive
                  ? "text-blue-400 bg-blue-600/10 border border-blue-500/20 font-semibold"
                  : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/50"
              )}
            >
              <div className="flex items-center gap-3">
                <SendHorizontal className="h-4 w-4 shrink-0 text-blue-400" />
                <span>Campaigns</span>
              </div>
              {campaignsOpen ? (
                <ChevronDown className="h-4 w-4 text-slate-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-400" />
              )}
            </button>

            {campaignsOpen && (
              <div className="pl-4 pt-1 space-y-0.5 border-l border-slate-800/80 ml-3.5 my-1">
                {campaignsSubNavigation.map((subItem) => {
                  const isSubActive = pathname === subItem.href;
                  return (
                    <Link
                      key={subItem.name}
                      href={subItem.href}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                        isSubActive
                          ? "bg-blue-600/15 text-blue-300 font-semibold border border-blue-500/30"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                      )}
                    >
                      <subItem.icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{subItem.name}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Remote Executions Expandable Group */}
          <div className="pt-1">
            <button
              onClick={() => setExecutionsOpen(!executionsOpen)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isExecutionsActive
                  ? "text-blue-400 bg-blue-600/10 border border-blue-500/20 font-semibold"
                  : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/50"
              )}
            >
              <div className="flex items-center gap-3">
                <TerminalSquare className="h-4 w-4 shrink-0 text-blue-400" />
                <span>Remote Executions</span>
              </div>
              {executionsOpen ? (
                <ChevronDown className="h-4 w-4 text-slate-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-400" />
              )}
            </button>

            {executionsOpen && (
              <div className="pl-4 pt-1 space-y-0.5 border-l border-slate-800/80 ml-3.5 my-1">
                {executionsSubNavigation.map((subItem) => {
                  const isSubActive = pathname === subItem.href;
                  return (
                    <Link
                      key={subItem.name}
                      href={subItem.href}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                        isSubActive
                          ? "bg-blue-600/15 text-blue-300 font-semibold border border-blue-500/30"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                      )}
                    >
                      <subItem.icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{subItem.name}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {bottomNavigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-blue-600/10 text-blue-400 border border-blue-500/20"
                    : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/50"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.name}
              </Link>
            );
          })}

          {/* Security Group & Sub-menus */}
          <div className="pt-2">
            <button
              onClick={() => setSecurityOpen(!securityOpen)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isSecurityActive
                  ? "text-blue-400 bg-blue-600/5"
                  : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/50"
              )}
            >
              <div className="flex items-center gap-3">
                <Shield className="h-4 w-4 shrink-0 text-blue-400" />
                <span>Security</span>
              </div>
              {securityOpen ? (
                <ChevronDown className="h-4 w-4 text-slate-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-500" />
              )}
            </button>

            {securityOpen && (
              <div className="pl-4 pt-1 space-y-0.5 border-l border-slate-800/80 ml-3.5 my-1">
                {securitySubNavigation.map((subItem) => {
                  const isSubActive = pathname === subItem.href || (subItem.href === "/security/users" && pathname === "/users");
                  return (
                    <Link
                      key={subItem.name}
                      href={subItem.href}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                        isSubActive
                          ? "bg-blue-600/15 text-blue-300 font-semibold border border-blue-500/30"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                      )}
                    >
                      <subItem.icon className="h-3.5 w-3.5 shrink-0" />
                      {subItem.name}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </nav>
      </div>

      <div className="p-4 border-t border-slate-800 shrink-0">
        <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5 font-medium">
              <Activity className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
              API Status
            </span>
            <span className="text-emerald-400 font-mono text-[11px]">ONLINE</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <ShieldCheck className="h-3 w-3 text-slate-400" />
            <span>Strict SSRF & Host-Key Guard</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
