import React from "react";
import { Key, Shield, Database, Radio } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-100">Settings & Integrations</h2>
        <p className="text-sm text-slate-400 mt-1">
          Manage Namecheap API credentials, SSH key vaults, security policies, and system settings.
        </p>
      </div>

      {/* Namecheap API Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Namecheap API Integration</CardTitle>
              <CardDescription>
                Configure registrar API keys to enable domain synchronization and DNS management.
              </CardDescription>
            </div>
            <span className="text-xs font-mono text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded border border-amber-500/20">
              Not Configured
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">API User</label>
              <input
                type="text"
                placeholder="e.g. namecheap_username"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Account Username</label>
              <input
                type="text"
                placeholder="e.g. account_username"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">API Key (Encrypted in Vault)</label>
            <input
              type="password"
              placeholder="••••••••••••••••••••••••••••••••"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-400">
              Environment: <span className="text-slate-200 font-medium">Sandbox (Testing)</span>
            </span>
            <div className="flex gap-2.5">
              <Button variant="outline" size="sm">Test Connection</Button>
              <Button size="sm">Save Configuration</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security Policies */}
      <Card>
        <CardHeader>
          <CardTitle>Security & Outbound Network Policy</CardTitle>
          <CardDescription>
            Defend against SSRF, unauthorized internal network dials, and DNS rebinding attacks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <div className="text-xs">
              <span className="font-semibold text-slate-200">Block RFC 1918 Private Ranges</span>
              <p className="text-slate-400 mt-0.5">Prevent connections to 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16</p>
            </div>
            <span className="text-xs text-emerald-400 font-mono">ENABLED</span>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <div className="text-xs">
              <span className="font-semibold text-slate-200">Block Cloud Metadata (169.254.169.254)</span>
              <p className="text-slate-400 mt-0.5">Prevent link-local IP exfiltration</p>
            </div>
            <span className="text-xs text-emerald-400 font-mono">ENABLED</span>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <div className="text-xs">
              <span className="font-semibold text-slate-200">Enforce SSH Host-Key Verification</span>
              <p className="text-slate-400 mt-0.5">Strict host-key pinning; prevent MITM attacks</p>
            </div>
            <span className="text-xs text-emerald-400 font-mono">ENABLED</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
