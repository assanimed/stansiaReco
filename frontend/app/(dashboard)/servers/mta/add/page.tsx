"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useGetProvidersQuery, useCreateServerMutation } from "@/lib/store/api/servers-api";
import { useGetCredentialsQuery, useDeleteCredentialMutation } from "@/lib/store/api/credentials-api";
import { 
  Server, 
  Key, 
  Lock, 
  FileText, 
  ShieldAlert, 
  ArrowLeft, 
  Check, 
  AlertCircle,
  Eye, 
  EyeOff,
  Bookmark,
  Plus,
  ShieldCheck,
  Trash2
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreateMTAServerPayload } from "@/lib/api/servers";

export default function AddMTAServerPage() {
  const router = useRouter();

  // Basic Information
  const [name, setName] = useState("");
  const [hostnameOrIP, setHostnameOrIP] = useState("");
  const [sshPort, setSshPort] = useState(22);
  const [providerId, setProviderId] = useState("");
  const [mtaSoftware, setMtaSoftware] = useState<"postfix" | "powermta">("postfix");
  const [environment, setEnvironment] = useState("prod");
  const [description, setDescription] = useState("");
  const [allowPrivateIP, setAllowPrivateIP] = useState(false);

  // SSH Authentication Options: "password" | "key" | "pem"
  const [authType, setAuthType] = useState<"password" | "key" | "pem">("key");
  const [username, setUsername] = useState("root");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Key source mode: "saved" | "paste"
  const [keySource, setKeySource] = useState<"saved" | "paste">("saved");
  const [selectedCredentialId, setSelectedCredentialId] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [saveKeyToVault, setSaveKeyToVault] = useState(true);
  const [savedKeyName, setSavedKeyName] = useState("");

  const [formError, setFormError] = useState("");

  // Load providers and credentials
  const { data: providers = [] } = useGetProvidersQuery();
  const { 
    data: savedCredentials = [], 
    isLoading: isLoadingCredentials 
  } = useGetCredentialsQuery({ type: "private_key" });
  
  const [createServer, { isLoading: isCreating }] = useCreateServerMutation();
  const [deleteCredential] = useDeleteCredentialMutation();

  // If credentials exist, preselect the first one if none selected; otherwise fallback to paste
  useEffect(() => {
    if (!isLoadingCredentials) {
      if (savedCredentials.length > 0) {
        if (!selectedCredentialId) {
          setSelectedCredentialId(savedCredentials[0].id);
          if (savedCredentials[0].username) {
            setUsername(savedCredentials[0].username);
          }
        }
      } else {
        setKeySource("paste");
      }
    }
  }, [isLoadingCredentials, savedCredentials, selectedCredentialId]);

  const selectedCred = savedCredentials.find((c) => c.id === selectedCredentialId);

  const handleSelectCredential = (credId: string) => {
    setSelectedCredentialId(credId);
    const found = savedCredentials.find((c) => c.id === credId);
    if (found && found.username) {
      setUsername(found.username);
    }
  };

  const handleDeleteCredential = async (credId: string) => {
    if (!confirm("Are you sure you want to remove this key from the vault?")) {
      return;
    }
    try {
      await deleteCredential(credId).unwrap();
      if (selectedCredentialId === credId) {
        setSelectedCredentialId("");
      }
    } catch (err: any) {
      alert(err?.data?.error?.message || err?.message || "Failed to delete credential (it may still be in use by active servers).");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!hostnameOrIP.trim()) {
      setFormError("Hostname or IP address is required");
      return;
    }
    if (!username.trim()) {
      setFormError("SSH username is required");
      return;
    }

    if (authType === "password" && !password) {
      setFormError("Password is required for password authentication");
      return;
    }

    if (authType === "key" || authType === "pem") {
      if (keySource === "saved") {
        if (!selectedCredentialId) {
          setFormError("Please select a saved SSH key or switch to 'Paste New Key'");
          return;
        }
      } else {
        if (!privateKey.trim()) {
          setFormError("Private key content is required");
          return;
        }
      }
    }

    const payload: CreateMTAServerPayload = {
      name: name.trim() || hostnameOrIP.trim(),
      hostname_or_ip: hostnameOrIP.trim(),
      ssh_port: Number(sshPort) || 22,
      provider_id: providerId || undefined,
      server_type: "mta",
      mta_software: mtaSoftware,
      environment,
      description: description.trim(),
      allow_private_ip: allowPrivateIP,
      auth_type: authType,
      username: username.trim(),
    };

    if (authType === "password") {
      payload.password = password;
    } else if (authType === "key" || authType === "pem") {
      if (keySource === "saved") {
        payload.credential_id = selectedCredentialId;
      } else {
        payload.private_key = privateKey.trim();
        payload.passphrase = authType === "pem" ? passphrase : undefined;
        if (saveKeyToVault && savedKeyName.trim()) {
          payload.credential_name = savedKeyName.trim();
        }
      }
    }

    try {
      await createServer(payload).unwrap();
      router.push("/servers/mta");
    } catch (err: any) {
      setFormError(err?.data?.error?.message || err?.message || "Failed to add MTA server");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/servers/mta">
          <Button variant="outline" size="sm" className="border-slate-800 text-slate-400 hover:text-slate-100 hover:bg-slate-800">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to MTAs
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-100">Add MTA Server</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Register a single mail transfer server with reusable encrypted SSH credentials.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {formError && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-2.5">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {/* Section 1: Server Details */}
        <Card className="border-slate-800 bg-slate-900/60 shadow-xl backdrop-blur">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <Server className="h-4 w-4 text-blue-400" />
              <h3 className="font-semibold text-slate-100 text-sm">Server Identification & Network</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Server Friendly Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. MTA-Node-01 (or leaves empty to use IP)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Main IP or Hostname <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="198.51.100.25 or mta1.domain.com"
                  value={hostnameOrIP}
                  onChange={(e) => setHostnameOrIP(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  SSH Port
                </label>
                <input
                  type="number"
                  value={sshPort}
                  onChange={(e) => setSshPort(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Infrastructure Provider
                </label>
                <select
                  value={providerId}
                  onChange={(e) => setProviderId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select Provider (Optional)</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.port_25_open ? "— [Port 25 Open]" : "— [Port 25 Blocked]"}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  MTA Software
                </label>
                <select
                  value={mtaSoftware}
                  onChange={(e) => setMtaSoftware(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="postfix">Postfix (Standard Open-Source MTA)</option>
                  <option value="powermta">PowerMTA (High-Throughput Enterprise MTA)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Environment
                </label>
                <select
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="prod">Production</option>
                  <option value="staging">Staging</option>
                  <option value="dev">Development</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                Description & Notes
              </label>
              <textarea
                rows={2}
                placeholder="Optional operational notes or provider ticket reference..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
              />
            </div>
          </CardContent>
        </Card>

        {/* Section 2: SSH Authentication Options */}
        <Card className="border-slate-800 bg-slate-900/60 shadow-xl backdrop-blur">
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-emerald-400" />
                <h3 className="font-semibold text-slate-100 text-sm">SSH Authentication Options</h3>
              </div>
              <span className="text-[11px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                AES-256-GCM Vault Encrypted
              </span>
            </div>

            {/* Auth Type Tabs */}
            <div className="grid grid-cols-3 gap-2 p-1 rounded-lg bg-slate-950 border border-slate-800">
              <button
                type="button"
                onClick={() => setAuthType("key")}
                className={`py-2 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                  authType === "key"
                    ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                Public / Private Key
              </button>

              <button
                type="button"
                onClick={() => setAuthType("password")}
                className={`py-2 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                  authType === "password"
                    ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                }`}
              >
                <Lock className="h-3.5 w-3.5" />
                Password (PWD)
              </button>

              <button
                type="button"
                onClick={() => setAuthType("pem")}
                className={`py-2 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                  authType === "pem"
                    ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                }`}
              >
                <Key className="h-3.5 w-3.5" />
                Encrypted PEM / Key
              </button>
            </div>

            {/* Username */}
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                SSH Username <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="root, ubuntu, debian..."
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            {/* Password Auth Mode */}
            {authType === "password" && (
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  SSH Password <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="Enter root/sudo password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 pr-10 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Key / PEM Auth Modes: Choose Existing vs Paste New */}
            {(authType === "key" || authType === "pem") && (
              <div className="space-y-4">
                {/* Segmented Sub-Toggle */}
                <div className="flex items-center justify-between bg-slate-950 p-1.5 rounded-lg border border-slate-800">
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setKeySource("saved")}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                        keySource === "saved"
                          ? "bg-blue-600 text-white shadow-sm"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                      }`}
                    >
                      <Bookmark className="h-3.5 w-3.5" />
                      Choose Existing Saved Key {savedCredentials.length > 0 ? `(${savedCredentials.length})` : ""}
                    </button>
                    <button
                      type="button"
                      onClick={() => setKeySource("paste")}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                        keySource === "paste"
                          ? "bg-blue-600 text-white shadow-sm"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                      }`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Paste New Key
                    </button>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono pr-2 hidden sm:inline-block">
                    {keySource === "saved" ? "Reusing Vaulted Key" : "Direct Key Entry"}
                  </span>
                </div>

                {/* Sub-Mode 1: Choose Saved Key */}
                {keySource === "saved" && (
                  <div className="space-y-3">
                    {savedCredentials.length === 0 ? (
                      <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 text-center space-y-2">
                        <Bookmark className="h-6 w-6 text-blue-400 mx-auto" />
                        <p className="text-sm font-medium text-slate-200">No saved SSH keys found in your vault yet</p>
                        <p className="text-xs text-slate-400 max-w-md mx-auto">
                          Paste your private key once and enable &ldquo;Save to Vault&rdquo;. All future servers can then use it with one click.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setKeySource("paste")}
                          className="mt-2 border-blue-500/30 text-blue-400 hover:bg-blue-500/10 text-xs"
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Paste & Save New Key
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div>
                          <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                            Select Saved SSH Key <span className="text-rose-400">*</span>
                          </label>
                          <select
                            value={selectedCredentialId}
                            onChange={(e) => handleSelectCredential(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                          >
                            <option value="">-- Choose a Saved SSH Key --</option>
                            {savedCredentials.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} ({c.username}@) — {c.fingerprint} {c.server_count > 0 ? `[${c.server_count} servers]` : ""}
                              </option>
                            ))}
                          </select>
                        </div>

                        {selectedCred && (
                          <div className="p-4 rounded-xl bg-slate-950/80 border border-blue-500/20 text-xs space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                                <span className="font-semibold text-slate-200 text-sm">{selectedCred.name}</span>
                                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  Vault Active
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteCredential(selectedCred.id)}
                                className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                                title="Delete key from vault"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-slate-400 pt-2 border-t border-slate-800/80">
                              <div>
                                <span className="text-slate-500 block text-[10px] uppercase font-mono">Associated User</span>
                                <span className="font-mono text-slate-200">{selectedCred.username}</span>
                              </div>
                              <div>
                                <span className="text-slate-500 block text-[10px] uppercase font-mono">Fingerprint</span>
                                <span className="font-mono text-slate-300">{selectedCred.fingerprint}</span>
                              </div>
                              <div>
                                <span className="text-slate-500 block text-[10px] uppercase font-mono">Active Usage</span>
                                <span className="text-slate-300">{selectedCred.server_count} linked server(s)</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Sub-Mode 2: Paste New Key */}
                {keySource === "paste" && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                        {authType === "pem" ? "PEM / RSA Encrypted Key Content" : "OpenSSH Private Key Content"}{" "}
                        <span className="text-rose-400">*</span>
                      </label>
                      <textarea
                        rows={5}
                        required
                        placeholder={
                          authType === "pem"
                            ? "-----BEGIN RSA PRIVATE KEY-----\nProc-Type: 4,ENCRYPTED\n...\n-----END RSA PRIVATE KEY-----"
                            : "-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----"
                        }
                        value={privateKey}
                        onChange={(e) => setPrivateKey(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    {authType === "pem" && (
                      <div>
                        <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                          PEM Key Passphrase
                        </label>
                        <input
                          type="password"
                          placeholder="Passphrase to decrypt this key"
                          value={passphrase}
                          onChange={(e) => setPassphrase(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                        />
                      </div>
                    )}

                    {/* Save to Vault Option */}
                    <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-3">
                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={saveKeyToVault}
                          onChange={(e) => setSaveKeyToVault(e.target.checked)}
                          className="mt-0.5 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500 h-4 w-4"
                        />
                        <div>
                          <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                            <Bookmark className="h-3.5 w-3.5 text-blue-400" />
                            Save this key to Vault for future servers
                          </span>
                          <span className="block text-[11px] text-slate-400 mt-0.5">
                            Encrypted with AES-256-GCM. You won&apos;t have to paste this key again when adding next servers.
                          </span>
                        </div>
                      </label>

                      {saveKeyToVault && (
                        <div className="pl-6 pt-1">
                          <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                            Saved Key Name / Label
                          </label>
                          <input
                            type="text"
                            placeholder={name.trim() ? `${name.trim()} Root Key` : "e.g. Primary Production SSH Key"}
                            value={savedKeyName}
                            onChange={(e) => setSavedKeyName(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SSRF Private IP Bypass Toggle */}
            <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <ShieldAlert className="h-4 w-4 text-amber-400" />
                  <span className="text-sm font-semibold text-slate-200">Allow Private/Intranet IP</span>
                </div>
                <span className="text-xs text-slate-400 block mt-0.5">
                  Allow connection to RFC1918 addresses (10.x, 172.16-31.x, 192.168.x). Bypasses SSRF guard for internal nodes.
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowPrivateIP}
                  onChange={(e) => setAllowPrivateIP(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Submit Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link href="/servers/mta">
            <Button type="button" variant="outline" className="border-slate-800 text-slate-400 hover:bg-slate-800">
              Cancel
            </Button>
          </Link>
          <Button 
            type="submit" 
            disabled={isCreating}
            className="bg-blue-600 hover:bg-blue-500 text-white min-w-32"
          >
            {isCreating ? "Connecting & Saving..." : "Add MTA Server"}
          </Button>
        </div>
      </form>
    </div>
  );
}
