"use client";

import React, { useState } from "react";
import {
  Briefcase,
  Search,
  Plus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Tag,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useGetVerticalsQuery,
  useCreateVerticalMutation,
  useToggleVerticalMutation,
  Vertical,
} from "@/lib/store/api/lists-api";
import { notify } from "@/lib/notifications/notification-store";
import { confirmAction } from "@/lib/dialogs/confirm-dialog-service";

export default function VerticalsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const { data: verticalsData, isLoading, isFetching, refetch } = useGetVerticalsQuery();

  const [createVertical, { isLoading: isCreating }] = useCreateVerticalMutation();
  const [toggleVertical] = useToggleVerticalMutation();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formCode, setFormCode] = useState("");
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);

  const verticals = (verticalsData?.verticals || []).filter(
    (v) =>
      v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenAdd = () => {
    setFormCode("");
    setFormName("");
    setFormDescription("");
    setFormIsActive(true);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCode || !formName) {
      notify.error("Code and Name are required.");
      return;
    }

    try {
      await createVertical({
        code: formCode.trim().toLowerCase(),
        name: formName.trim(),
        description: formDescription.trim() || undefined,
        is_active: formIsActive,
      }).unwrap();

      notify.success("Vertical created successfully.");
      setIsModalOpen(false);
    } catch (err: any) {
      notify.error(err?.data?.error || "Failed to create vertical.");
    }
  };

  const handleToggle = async (v: Vertical) => {
    const nextState = !v.is_active;
    const confirmed = await confirmAction({
      title: `${nextState ? "Enable" : "Disable"} Vertical`,
      message: `Are you sure you want to ${nextState ? "enable" : "disable"} the "${v.name}" business vertical?`,
      confirmLabel: nextState ? "Enable" : "Disable",
      variant: "default",
    });

    if (!confirmed) return;

    try {
      await toggleVertical(v.code).unwrap();
      notify.success(`${v.name} is now ${nextState ? "active" : "inactive"}.`);
    } catch (err: any) {
      notify.error(err?.data?.error || "Failed to update vertical status.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2.5">
            <Briefcase className="h-7 w-7 text-blue-500" />
            Business Verticals
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Categorize lists and contact acquisition channels by industry verticals (retail, finance, travel, tech, etc.).
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

          <Button onClick={handleOpenAdd} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-4 w-4 mr-1.5" />
            Add Vertical
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
              placeholder="Search by vertical name or code..."
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
                <th className="px-4 py-3.5">Vertical Name</th>
                <th className="px-4 py-3.5">Code</th>
                <th className="px-4 py-3.5">Description</th>
                <th className="px-4 py-3.5 text-center">Status</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
                    Loading verticals...
                  </td>
                </tr>
              ) : verticals.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                    No verticals found.
                  </td>
                </tr>
              ) : (
                verticals.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3.5 font-medium text-slate-100">{v.name}</td>

                    <td className="px-4 py-3.5 font-mono text-xs text-slate-300">
                      <span className="px-2.5 py-0.5 rounded bg-slate-800 border border-slate-700">{v.code}</span>
                    </td>

                    <td className="px-4 py-3.5 text-xs text-slate-400 max-w-sm truncate">
                      {v.description || "—"}
                    </td>

                    <td className="px-4 py-3.5 text-center">
                      <button
                        onClick={() => handleToggle(v)}
                        className="inline-flex items-center gap-1.5 text-xs focus:outline-none"
                      >
                        {v.is_active ? (
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

                    <td className="px-4 py-3.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggle(v)}
                        className="h-8 px-2 text-xs text-slate-400 hover:text-white hover:bg-slate-800"
                      >
                        {v.is_active ? "Deactivate" : "Activate"}
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
                <Briefcase className="h-4 w-4 text-blue-500" />
                Add Business Vertical
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Vertical Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Travel & Hospitality"
                  value={formName}
                  onChange={(e) => {
                    setFormName(e.target.value);
                    if (!formCode) {
                      setFormCode(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "-"));
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Vertical Code *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. travel"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Description (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Industry sector context..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="verticalActive"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="rounded border-slate-800 text-blue-600 focus:ring-0"
                />
                <label htmlFor="verticalActive" className="text-xs text-slate-300">
                  Vertical is active and selectable in list configuration
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
                <Button type="submit" disabled={isCreating} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {isCreating ? "Adding..." : "Add Vertical"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
