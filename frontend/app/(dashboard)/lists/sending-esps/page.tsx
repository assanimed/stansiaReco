"use client";

import React, { useState } from "react";
import {
  Send,
  Plus,
  Search,
  RefreshCw,
  Edit2,
  CheckCircle2,
  XCircle,
  Server,
  Cloud,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useGetSendingESPsQuery,
  useCreateSendingESPMutation,
  useUpdateSendingESPMutation,
  SendingESP,
} from "@/lib/store/api/lists-api";
import { notify } from "@/lib/notifications/notification-store";
import { confirmAction } from "@/lib/dialogs/confirm-dialog-service";

export default function SendingESPsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const { data: espsData, isLoading, isFetching, refetch } = useGetSendingESPsQuery();

  const [createESP, { isLoading: isCreating }] = useCreateSendingESPMutation();
  const [updateESP, { isLoading: isUpdating }] = useUpdateSendingESPMutation();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingESP, setEditingESP] = useState<SendingESP | null>(null);

  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formType, setFormType] = useState("powermta");
  const [formDescription, setFormDescription] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);

  const esps = (espsData?.esps || []).filter(
    (e) =>
      e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.provider_type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenCreate = () => {
    setEditingESP(null);
    setFormName("");
    setFormCode("");
    setFormType("powermta");
    setFormDescription("");
    setFormIsActive(true);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (esp: SendingESP) => {
    setEditingESP(esp);
    setFormName(esp.name);
    setFormCode(esp.code);
    setFormType(esp.provider_type);
    setFormDescription(esp.description || "");
    setFormIsActive(esp.is_active);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName) return;

    try {
      if (editingESP) {
        await updateESP({
          id: editingESP.id,
          name: formName.trim(),
          provider_type: formType,
          description: formDescription.trim() || undefined,
          is_active: formIsActive,
        }).unwrap();
        notify.success("Sending ESP updated successfully.");
      } else {
        if (!formCode) {
          notify.error("ESP code is required.");
          return;
        }
        await createESP({
          name: formName.trim(),
          code: formCode.trim().toLowerCase(),
          provider_type: formType,
          description: formDescription.trim() || undefined,
          is_active: formIsActive,
        }).unwrap();
        notify.success("Sending ESP created successfully.");
      }

      setIsModalOpen(false);
    } catch (err: any) {
      notify.error(err?.data?.error || "Failed to save sending ESP.");
    }
  };

  const handleToggleStatus = async (esp: SendingESP) => {
    const nextState = !esp.is_active;
    const confirmed = await confirmAction({
      title: `${nextState ? "Activate" : "Deactivate"} Sending ESP`,
      message: `Are you sure you want to ${nextState ? "activate" : "deactivate"} ${esp.name}?`,
      confirmLabel: nextState ? "Activate" : "Deactivate",
      variant: "default",
    });

    if (!confirmed) return;

    try {
      await updateESP({
        id: esp.id,
        is_active: nextState,
      }).unwrap();
      notify.success(`${esp.name} ${nextState ? "activated" : "deactivated"}.`);
    } catch (err: any) {
      notify.error(err?.data?.error || "Failed to update ESP status.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2.5">
            <Send className="h-7 w-7 text-blue-500" />
            Sending ESPs
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage external email service providers and on-premise PowerMTA relays separately from mailbox destinations.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
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

          <Button onClick={handleOpenCreate} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-4 w-4 mr-1.5" />
            Add Sending ESP
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card className="bg-slate-900/60 border-slate-800">
        <CardContent className="p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search sending ESPs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-950/70 border border-slate-800 rounded-md text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-slate-900/60 border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-xs font-semibold uppercase text-slate-400 tracking-wider">
              <tr>
                <th className="px-4 py-3.5">ESP Name</th>
                <th className="px-4 py-3.5">Code</th>
                <th className="px-4 py-3.5">Provider Type</th>
                <th className="px-4 py-3.5 text-center">Status</th>
                <th className="px-4 py-3.5">Created Date</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
                    Loading sending ESPs...
                  </td>
                </tr>
              ) : esps.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                    No sending ESPs configured.
                  </td>
                </tr>
              ) : (
                esps.map((esp) => (
                  <tr key={esp.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3.5 font-medium text-slate-100">
                      <div>{esp.name}</div>
                      {esp.description && <div className="text-xs text-slate-500 font-normal mt-0.5">{esp.description}</div>}
                    </td>

                    <td className="px-4 py-3.5 font-mono text-xs text-slate-300">
                      <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">{esp.code}</span>
                    </td>

                    <td className="px-4 py-3.5">
                      <span className="px-2 py-0.5 rounded text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono capitalize">
                        {esp.provider_type}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-center">
                      <button
                        onClick={() => handleToggleStatus(esp)}
                        className="inline-flex items-center gap-1.5 text-xs focus:outline-none"
                      >
                        {esp.is_active ? (
                          <span className="inline-flex items-center text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700 font-medium">
                            <XCircle className="h-3.5 w-3.5 mr-1" />
                            Inactive
                          </span>
                        )}
                      </button>
                    </td>

                    <td className="px-4 py-3.5 text-xs text-slate-400">
                      {new Date(esp.created_at).toLocaleDateString()}
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenEdit(esp)}
                        className="h-8 px-2 text-slate-400 hover:text-white hover:bg-slate-800"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <Send className="h-4 w-4 text-blue-500" />
                {editingESP ? "Edit Sending ESP" : "Add Sending ESP"}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">ESP Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Amazon SES US-East-1"
                  value={formName}
                  onChange={(e) => {
                    setFormName(e.target.value);
                    if (!editingESP && !formCode) {
                      setFormCode(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "-"));
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Code *</label>
                <input
                  type="text"
                  required
                  disabled={!!editingESP}
                  placeholder="e.g. ses-useast1"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 font-mono disabled:opacity-60 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Provider Type *</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="powermta">PowerMTA (On-Premises / Cluster)</option>
                  <option value="ses">Amazon SES</option>
                  <option value="sendgrid">SendGrid</option>
                  <option value="mailgun">Mailgun</option>
                  <option value="sparkpost">SparkPost</option>
                  <option value="postmark">Postmark</option>
                  <option value="smtp_relay">Custom SMTP Relay</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Description (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Configuration context, region, or pool notes..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="espActive"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="rounded border-slate-800 text-blue-600 focus:ring-0"
                />
                <label htmlFor="espActive" className="text-xs text-slate-300">
                  Sending ESP is enabled for outbound traffic
                </label>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  className="border-slate-800 text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isCreating || isUpdating} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {isCreating || isUpdating ? "Saving..." : "Save ESP"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
