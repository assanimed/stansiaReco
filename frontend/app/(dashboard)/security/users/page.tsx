"use client";

import React, { useState, useEffect } from "react";
import { 
  Users, 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Shield, 
  Check, 
  X, 
  AlertTriangle, 
  Lock, 
  Mail, 
  User as UserIcon,
  RefreshCw,
  Key
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useGetUsersQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useDeleteUserMutation,
} from "@/lib/store/api/users-api";

interface PermissionRule {
  resource: string;
  can_view: boolean;
  can_insert: boolean;
  can_update: boolean;
  can_delete: boolean;
}

interface UserItem {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
  permissions?: PermissionRule[];
}

const RESOURCES = [
  { slug: "dashboard", label: "Dashboard Overview" },
  { slug: "domains", label: "Domains Portfolio" },
  { slug: "dns", label: "DNS Records Management" },
  { slug: "servers", label: "Server Inventory" },
  { slug: "credentials", label: "SSH Credential Vault" },
  { slug: "scripts", label: "Script Registry" },
  { slug: "executions", label: "Remote Executions" },
  { slug: "settings", label: "Settings & API Keys" },
  { slug: "users", label: "User Management" },
  { slug: "audit", label: "Audit Logs" },
];

export default function UsersManagementPage() {
  const { data: users = [], isLoading: loading, error: queryError, refetch } = useGetUsersQuery();
  const [createUser] = useCreateUserMutation();
  const [updateUser] = useUpdateUserMutation();
  const [deleteUser] = useDeleteUserMutation();

  const [search, setSearch] = useState("");
  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserItem | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    password: "",
    role: "operator",
    is_active: true,
  });

  const [permissionsMatrix, setPermissionsMatrix] = useState<Record<string, { view: boolean; insert: boolean; update: boolean; delete: boolean }>>({});

  const showNotification = (text: string, type: "success" | "error" = "success") => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const initPermissionsForRole = (role: string, currentPerms?: PermissionRule[]) => {
    const matrix: Record<string, { view: boolean; insert: boolean; update: boolean; delete: boolean }> = {};
    
    RESOURCES.forEach((r) => {
      // Check if custom permissions already exist
      const existing = currentPerms?.find((p) => p.resource === r.slug);
      if (existing) {
        matrix[r.slug] = {
          view: existing.can_view,
          insert: existing.can_insert,
          update: existing.can_update,
          delete: existing.can_delete,
        };
      } else if (role === "admin") {
        matrix[r.slug] = { view: true, insert: true, update: true, delete: true };
      } else if (role === "operator") {
        matrix[r.slug] = {
          view: true,
          insert: ["servers", "dns", "executions", "credentials"].includes(r.slug),
          update: ["servers", "dns"].includes(r.slug),
          delete: ["executions"].includes(r.slug),
        };
      } else {
        // viewer
        matrix[r.slug] = { view: true, insert: false, update: false, delete: false };
      }
    });

    setPermissionsMatrix(matrix);
  };

  const openCreateModal = () => {
    setFormData({
      full_name: "",
      email: "",
      password: "",
      role: "operator",
      is_active: true,
    });
    initPermissionsForRole("operator");
    setShowCreateModal(true);
  };

  const openEditModal = (user: UserItem) => {
    setEditingUser(user);
    setFormData({
      full_name: user.full_name,
      email: user.email,
      password: "",
      role: user.role,
      is_active: user.is_active,
    });
    initPermissionsForRole(user.role, user.permissions);
  };

  const handleRoleChange = (newRole: string) => {
    setFormData((prev) => ({ ...prev, role: newRole }));
    initPermissionsForRole(newRole);
  };

  const togglePermission = (resource: string, action: "view" | "insert" | "update" | "delete") => {
    setPermissionsMatrix((prev) => {
      const current = prev[resource] || { view: false, insert: false, update: false, delete: false };
      return {
        ...prev,
        [resource]: {
          ...current,
          [action]: !current[action],
        },
      };
    });
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const permissionsArray: PermissionRule[] = Object.entries(permissionsMatrix).map(([res, actions]) => ({
        resource: res,
        can_view: actions.view,
        can_insert: actions.insert,
        can_update: actions.update,
        can_delete: actions.delete,
      }));

      await createUser({
        ...formData,
        permissions: permissionsArray,
      }).unwrap();

      setShowCreateModal(false);
      showNotification("User created successfully");
    } catch (err: any) {
      const errMsg = err?.data?.error?.message || err?.data?.message || err?.message || "Failed to create user";
      showNotification(errMsg, "error");
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      const permissionsArray: PermissionRule[] = Object.entries(permissionsMatrix).map(([res, actions]) => ({
        resource: res,
        can_view: actions.view,
        can_insert: actions.insert,
        can_update: actions.update,
        can_delete: actions.delete,
      }));

      const updatePayload: Record<string, any> = {
        full_name: formData.full_name,
        role: formData.role,
        is_active: formData.is_active,
        permissions: permissionsArray,
      };

      if (formData.password) {
        updatePayload.password = formData.password;
      }

      await updateUser({
        id: editingUser.id,
        payload: updatePayload,
      }).unwrap();

      setEditingUser(null);
      showNotification("User updated successfully");
    } catch (err: any) {
      const errMsg = err?.data?.error?.message || err?.data?.message || err?.message || "Failed to update user";
      showNotification(errMsg, "error");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingUser) return;

    try {
      await deleteUser(deletingUser.id).unwrap();
      setDeletingUser(null);
      showNotification("User deleted successfully");
    } catch (err: any) {
      const errMsg = err?.data?.error?.message || err?.data?.message || err?.message || "Failed to delete user";
      showNotification(errMsg, "error");
    }
  };

  const filteredUsers = users.filter((u) => 
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight text-slate-100">User Management</h2>
            <Badge variant="outline" className="text-xs">
              {users.length} {users.length === 1 ? "User" : "Users"}
            </Badge>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Manage administrative and operator accounts, credentials, and fine-grained permissions.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button size="sm" onClick={openCreateModal}>
            <Plus className="h-3.5 w-3.5" />
            Create User
          </Button>
        </div>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div className={cn(
          "p-3.5 rounded-lg border text-xs flex items-center justify-between",
          notification.type === "success" 
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
            : "bg-rose-500/10 border-rose-500/20 text-rose-400"
        )}>
          <span>{notification.text}</span>
          <button onClick={() => setNotification(null)} className="opacity-70 hover:opacity-100">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Search Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or role..."
            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Users Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/60 text-xs font-medium text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-6 py-3.5">User</th>
                  <th className="px-6 py-3.5">Role</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Created Date</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {loading && users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                      <RefreshCw className="h-6 w-6 mx-auto mb-2 text-slate-600 animate-spin" />
                      <p className="text-sm font-medium text-slate-300">Loading user accounts...</p>
                    </td>
                  </tr>
                ) : queryError ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-rose-400">
                      <AlertTriangle className="h-6 w-6 mx-auto mb-2" />
                      <p className="text-sm font-medium">
                        {(queryError as any)?.data?.error?.message || (queryError as any)?.data?.message || "Failed to load users"}
                      </p>
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                      <Users className="h-8 w-8 mx-auto mb-2 text-slate-600" />
                      <p className="text-sm font-medium text-slate-300">No users found</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {search ? "No users matching your search term." : "Click 'Create User' to add an operator or administrator."}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-semibold text-slate-200">
                            {user.full_name ? user.full_name.charAt(0).toUpperCase() : "U"}
                          </div>
                          <div>
                            <span className="font-medium text-slate-100 block">{user.full_name}</span>
                            <span className="text-xs text-slate-400 font-mono">{user.email}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge 
                          variant={
                            user.role === "admin" 
                              ? "default" 
                              : user.role === "operator" 
                              ? "warning" 
                              : "secondary"
                          }
                        >
                          {user.role.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        {user.is_active ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="destructive">Disabled</Badge>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-400">
                        {new Date(user.created_at).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditModal(user)}
                            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
                            title="Edit user and permissions"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeletingUser(user)}
                            className="p-1.5 rounded hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 transition-colors"
                            title="Delete user"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
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

      {/* CREATE USER MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 !m-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full p-6 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 shrink-0">
              <div>
                <h3 className="text-lg font-semibold text-slate-100">Create New User</h3>
                <p className="text-xs text-slate-400 mt-0.5">Provision an infrastructure operator or administrator</p>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="overflow-y-auto flex-1 space-y-4 py-4 pr-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Full Name</label>
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                      <input
                        type="text"
                        required
                        value={formData.full_name}
                        onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                        placeholder="Jane Doe"
                        className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="operator@company.com"
                        className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                      <input
                        type="password"
                        required
                        minLength={8}
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        placeholder="••••••••••••"
                        className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Role</label>
                    <select
                      value={formData.role}
                      onChange={(e) => handleRoleChange(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                    >
                      <option value="operator">Operator (Recommended)</option>
                      <option value="viewer">Viewer (Read-Only)</option>
                      <option value="admin">Administrator (Full Access)</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="create_is_active"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-0"
                  />
                  <label htmlFor="create_is_active" className="text-xs text-slate-300 select-none">
                    User account is active (can authenticate)
                  </label>
                </div>

                {/* Granular Permissions Matrix */}
                <div className="pt-2">
                  <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                    Granular Permission Rules Matrix (Per-Page & Category)
                  </label>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 overflow-hidden text-xs">
                    <table className="w-full text-left">
                      <thead className="bg-slate-900 border-b border-slate-800 text-[11px] text-slate-400">
                        <tr>
                          <th className="px-4 py-2 font-medium">Resource Category</th>
                          <th className="px-3 py-2 text-center font-medium">View</th>
                          <th className="px-3 py-2 text-center font-medium">Insert</th>
                          <th className="px-3 py-2 text-center font-medium">Update</th>
                          <th className="px-3 py-2 text-center font-medium">Delete</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {RESOURCES.map((r) => {
                          const rule = permissionsMatrix[r.slug] || { view: false, insert: false, update: false, delete: false };
                          return (
                            <tr key={r.slug} className="hover:bg-slate-900/30">
                              <td className="px-4 py-2 text-slate-300 font-medium">{r.label}</td>
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={rule.view}
                                  onChange={() => togglePermission(r.slug, "view")}
                                  className="rounded border-slate-700 bg-slate-900 text-blue-600"
                                />
                              </td>
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={rule.insert}
                                  onChange={() => togglePermission(r.slug, "insert")}
                                  className="rounded border-slate-700 bg-slate-900 text-blue-600"
                                />
                              </td>
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={rule.update}
                                  onChange={() => togglePermission(r.slug, "update")}
                                  className="rounded border-slate-700 bg-slate-900 text-blue-600"
                                />
                              </td>
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={rule.delete}
                                  onChange={() => togglePermission(r.slug, "delete")}
                                  className="rounded border-slate-700 bg-slate-900 text-blue-600"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800 shrink-0">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  Create User
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT USER MODAL */}
      {editingUser && (
        <div className="fixed inset-0 !m-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full p-6 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 shrink-0">
              <div>
                <h3 className="text-lg font-semibold text-slate-100">Edit User: {editingUser.email}</h3>
                <p className="text-xs text-slate-400 mt-0.5">Update details, reset password, or modify permission rules</p>
              </div>
              <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="overflow-y-auto flex-1 space-y-4 py-4 pr-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Full Name</label>
                    <input
                      type="text"
                      required
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Role</label>
                    <select
                      value={formData.role}
                      onChange={(e) => handleRoleChange(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                    >
                      <option value="operator">Operator</option>
                      <option value="viewer">Viewer</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Reset Password (leave empty to retain existing password)
                  </label>
                  <div className="relative">
                    <Key className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                    <input
                      type="password"
                      minLength={8}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="New password (optional)"
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="edit_is_active"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-0"
                  />
                  <label htmlFor="edit_is_active" className="text-xs text-slate-300 select-none">
                    User account is active
                  </label>
                </div>

                {/* Granular Permissions Matrix */}
                <div className="pt-2">
                  <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                    Granular Permission Rules Matrix
                  </label>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 overflow-hidden text-xs">
                    <table className="w-full text-left">
                      <thead className="bg-slate-900 border-b border-slate-800 text-[11px] text-slate-400">
                        <tr>
                          <th className="px-4 py-2 font-medium">Resource Category</th>
                          <th className="px-3 py-2 text-center font-medium">View</th>
                          <th className="px-3 py-2 text-center font-medium">Insert</th>
                          <th className="px-3 py-2 text-center font-medium">Update</th>
                          <th className="px-3 py-2 text-center font-medium">Delete</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {RESOURCES.map((r) => {
                          const rule = permissionsMatrix[r.slug] || { view: false, insert: false, update: false, delete: false };
                          return (
                            <tr key={r.slug} className="hover:bg-slate-900/30">
                              <td className="px-4 py-2 text-slate-300 font-medium">{r.label}</td>
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={rule.view}
                                  onChange={() => togglePermission(r.slug, "view")}
                                  className="rounded border-slate-700 bg-slate-900 text-blue-600"
                                />
                              </td>
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={rule.insert}
                                  onChange={() => togglePermission(r.slug, "insert")}
                                  className="rounded border-slate-700 bg-slate-900 text-blue-600"
                                />
                              </td>
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={rule.update}
                                  onChange={() => togglePermission(r.slug, "update")}
                                  className="rounded border-slate-700 bg-slate-900 text-blue-600"
                                />
                              </td>
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={rule.delete}
                                  onChange={() => togglePermission(r.slug, "delete")}
                                  className="rounded border-slate-700 bg-slate-900 text-blue-600"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800 shrink-0">
                <Button type="button" variant="outline" size="sm" onClick={() => setEditingUser(null)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  Save Changes
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingUser && (
        <div className="fixed inset-0 !m-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 rounded-full bg-rose-500/10 border border-rose-500/20">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-slate-100">Delete User Account</h3>
            </div>

            <p className="text-sm text-slate-300">
              Are you sure you want to permanently delete user <strong className="text-white">{deletingUser.full_name}</strong> (<span className="font-mono text-xs text-slate-400">{deletingUser.email}</span>)?
            </p>
            <p className="text-xs text-slate-400">
              All active sessions and custom permissions for this user will be revoked immediately.
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={() => setDeletingUser(null)}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDeleteConfirm}>
                Yes, Delete User
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
