"use client";

import React, { useState } from "react";
import {
  Boxes,
  Plus,
  Search,
  RefreshCw,
  Edit2,
  CheckCircle2,
  XCircle,
  Network,
  Cpu,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useGetSendingIPPoolsQuery,
  useCreateSendingIPPoolMutation,
  useUpdateSendingIPPoolMutation,
  SendingIPPool,
} from "@/lib/store/api/lists-api";
import { notify } from "@/lib/notifications/notification-store";
import { confirmAction } from "@/lib/dialogs/confirm-dialog-service";

export default function SendingIPPoolsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const { data: poolsData, isLoading, isFetching, refetch } = useGetSendingIPPoolsQuery();

  const [createPool, { isLoading: isCreating }] = useCreateSendingIPPoolMutation();
  const [updatePool, { isLoading: isUpdating }] = useUpdateSendingIPPoolMutation();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPool, setEditingPool] = useState<SendingIPPool | null>(null);

  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);

  const pools = (poolsData?.pools || []).filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenCreate = () => {
    setEditingPool(null);
    setFormName("");
    setFormCode("");
    setFormDescription("");
    setFormIsActive(true);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (pool: SendingIPPool) => {
    setEditingPool(pool);
    setFormName(pool.name);
    setFormCode(pool.code);
    setFormDescription(pool.description || "");
    setFormIsActive(pool.is_active);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName) return;

    try {
      if (editingPool) {
        await updatePool({
          id: editingPool.id,
          name: formName.trim(),
          description: formDescription.trim() || undefined,
          is_active: formIsActive,
        }).unwrap();
        notify.success("IP pool updated successfully.");
      } else {
        if (!formCode) {
          notify.error("Pool code is required.");
          return;
        }
        await createPool({
          name: formName.trim(),
          code: formCode.trim().toLowerCase(),
          description: formDescription.trim() || undefined,
          is_active: formIsActive,
        }).unwrap();
        notify.success("IP pool created successfully.");
      }

      setIsModalOpen(false);
    } catch (err: any) {
      notify.error(err?.data?.error || "Failed to save IP pool.");
    }
  };

  const handleToggleStatus = async (pool: SendingIPPool) => {
    const nextState = !pool.is_active;
    const confirmed = await confirmAction({
      title: `${nextState ? "Activate" : "Deactivate"} IP Pool`,
      message: `Are you sure you want to ${nextState ? "activate" : "deactivate"} ${pool.name}?`,
      confirmLabel: nextState ? "Activate" : "Deactivate",
      variant: "default",
    });

    if (!confirmed) return;

    try {
      await updatePool({
        id: pool.id,
        is_active: nextState,
      }).unwrap();
      notify.success(`${pool.name} ${nextState ? "activated" : "deactivated"}.`);
    } catch (err: any) {
      notify.error(err?.data?.error || "Failed to update IP pool status.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2.5">
            <Boxes className="h-7 w-7 text-blue-500" />
            Sending IP Pools
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Organize sending IP addresses into virtual pools for reputation isolation, warmup ramps, and segmentation.
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
            Create Pool
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
              placeholder="Search IP pools..."
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
                <th className="px-4 py-3.5">Pool Name</th>
                <th className="px-4 py-3.5">Pool Code</th>
                <th className="px-4 py-3.5 text-center">Status</th>
                <th className="px-4 py-3.5 text-right">Assigned IPs</th>
                <th className="px-4 py-3.5">Created Date</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
                    Loading IP pools...
                  </td>
                </tr>
              ) : pools.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                    No sending IP pools configured.
                  </td>
                </tr>
              ) : (
                pools.map((pool) => (
                  <tr key={pool.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3.5 font-medium text-slate-100">
                      <div>{pool.name}</div>
                      {pool.description && (
                        <div className="text-xs text-slate-500 font-normal mt-0.5">{pool.description}</div>
                      )}
                    </td>

                    <td className="px-4 py-3.5 font-mono text-xs text-slate-300">
                      <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">{pool.code}</span>
                    </td>

                    <td className="px-4 py-3.5 text-center">
                      <button
                        onClick={() => handleToggleStatus(pool)}
                        className="inline-flex items-center gap-1.5 text-xs focus:outline-none"
                      >
                        {pool.is_active ? (
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

                    <td className="px-4 py-3.5 text-right font-mono font-medium text-slate-200">
                      {(pool.member_count ?? 0).toLocaleString()}
                    </td>

                    <td className="px-4 py-3.5 text-xs text-slate-400">
                      {new Date(pool.created_at).toLocaleDateString()}
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenEdit(pool)}
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
                <Boxes className="h-4 w-4 text-blue-500" />
                {editingPool ? "Edit IP Pool" : "Create Sending IP Pool"}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Pool Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Warmup Pool"
                  value={formName}
                  onChange={(e) => {
                    setFormName(e.target.value);
                    if (!editingPool && !formCode) {
                      setFormCode(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "-"));
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Pool Code *</label>
                <input
                  type="text"
                  required
                  disabled={!!editingPool}
                  placeholder="e.g. warmup-pool"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 font-mono disabled:opacity-60 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Description (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Intended rotation, volume throughput, or reputation policy..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="poolActive"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="rounded border-slate-800 text-blue-600 focus:ring-0"
                />
                <label htmlFor="poolActive" className="text-xs text-slate-300">
                  Pool is active and eligible for MTA VMTA grouping
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
                  {isCreating || isUpdating ? "Saving..." : "Save Pool"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
