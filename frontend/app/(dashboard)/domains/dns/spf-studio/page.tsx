"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { 
  Sparkles, 
  Wand2, 
  Layers, 
  Plus, 
  Trash2, 
  GripVertical, 
  Check, 
  Copy, 
  AlertCircle, 
  ShieldCheck, 
  ShieldAlert, 
  Key, 
  Server, 
  Globe, 
  ArrowRight, 
  RefreshCw, 
  CheckSquare, 
  Square, 
  Search, 
  Code2,
  ChevronDown,
  RotateCcw,
  Zap,
  Info,
  X,
  ExternalLink
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  useGetDomainsQuery, 
  useGetDomainsSPFStatusQuery,
  useGetDNSRecordsQuery,
  useDeploySPFMutation,
  useDeployCustomRecordMutation,
  useSyncDomainMutation,
  DomainSPFStatus,
  DNSRecord
} from "@/lib/store/api/domains-api";
import { useGetServersQuery } from "@/lib/store/api/servers-api";
import { notify } from "@/lib/notifications/notification-store";

interface SPFMechanism {
  id: string;
  type: "include" | "macro" | "ip4" | "ip6" | "a" | "mx" | "ptr" | "exists" | "redirect";
  value: string;
}

const POPULAR_INCLUDES = [
  { name: "Google Workspace", value: "_spf.google.com" },
  { name: "Microsoft 365", value: "spf.protection.outlook.com" },
  { name: "SendGrid", value: "sendgrid.net" },
  { name: "Mailgun", value: "mailgun.org" },
  { name: "Postmark", value: "spf.postmarkapp.com" },
  { name: "Amazon SES", value: "amazonses.com" },
  { name: "Klaviyo", value: "_spf.klaviyo.com" },
  { name: "Brevo", value: "spf.brevo.com" },
];

const MACRO_PRESETS = [
  { label: "%{d} (Domain)", value: "%{d}" },
  { label: "%{i} (Client IP)", value: "%{i}" },
  { label: "%{s} (Sender Email)", value: "%{s}" },
  { label: "%{h} (HELO Host)", value: "%{h}" },
  { label: "%{l} (Local-Part)", value: "%{l}" },
  { label: "%{o} (Sender Domain)", value: "%{o}" },
];

const MACRO_TEMPLATES = [
  { label: "IP Dynamic Lookup (exists:%{i}._spf.%{d})", type: "exists" as const, value: "%{i}._spf.%{d}" },
  { label: "Domain-Delegated Include (include:%{d}._spf.relay.com)", type: "include" as const, value: "%{d}._spf.relay.com" },
  { label: "Subdomain SPF Include (include:_spf.%{d})", type: "include" as const, value: "_spf.%{d}" },
  { label: "SPF Policy Redirect (redirect=_spf.%{d})", type: "redirect" as const, value: "_spf.%{d}" },
];

function computeLookups(spf: string): number {
  if (!spf) return 0;
  const parts = spf.split(/\s+/).filter(Boolean);
  let count = 0;
  for (const p of parts) {
    const pLower = p.toLowerCase();
    if (
      pLower.startsWith("include:") ||
      pLower.startsWith("a:") || pLower === "a" ||
      pLower.startsWith("mx:") || pLower === "mx" ||
      pLower.startsWith("ptr:") || pLower === "ptr" ||
      pLower.startsWith("exists:") ||
      pLower.startsWith("redirect=")
    ) {
      count++;
    }
  }
  return count;
}

export default function SPFStudioPage() {
  // Only 2 tabs: SPF and DKIM
  const [activeTab, setActiveTab] = useState<"spf" | "dkim">("spf");

  // Load domains, SPF status, and MTA servers
  const { data: domains = [], isLoading: isLoadingDomains } = useGetDomainsQuery();
  const { data: spfStatusList = [], refetch: refetchSPFStatus, isLoading: isLoadingSPF } = useGetDomainsSPFStatusQuery();
  const { data: servers = [] } = useGetServersQuery();

  const [deploySPF, { isLoading: isDeployingSPF }] = useDeploySPFMutation();
  const [deployCustomRecord, { isLoading: isDeployingCustom }] = useDeployCustomRecordMutation();
  const [syncDomain, { isLoading: isSyncingDomain }] = useSyncDomainMutation();

  const handleSyncFromProvider = async () => {
    if (!selectedSingleDomainId) {
      notify.error("Please select a domain first");
      return;
    }
    const loadingId = notify.loading(`Fetching latest host records for ${currentDomainItem?.domain_name || "domain"}...`);
    try {
      const res = await syncDomain(selectedSingleDomainId).unwrap();
      notify.dismiss(loadingId);
      notify.success(res.message || `Synchronized host records from provider for ${currentDomainItem?.domain_name}`);
      await refetchDNSRecords();
      const updated = await refetchSPFStatus().unwrap();
      const match = (updated || []).find((s) => s.domain_id === selectedSingleDomainId);
      if (match?.has_spf && match.spf_record) {
        notify.success(`Loaded SPF record: ${match.spf_record}`);
      }
    } catch (err: any) {
      notify.dismiss(loadingId);
      notify.error(err, {
        title: "Provider Sync Failed",
        fallbackMessage: "Failed to sync records from domain provider",
        openDialog: true,
      });
    }
  };

  // Fast lookup map for SPF status by domain_id
  const spfStatusMap = useMemo(() => {
    const map = new Map<string, DomainSPFStatus>();
    for (const s of spfStatusList) {
      map.set(s.domain_id, s);
    }
    return map;
  }, [spfStatusList]);

  // ---------------------------------------------------------------------------
  // Target Domain Selection State for SPF
  // ---------------------------------------------------------------------------
  const [spfDomainMode, setSpfDomainMode] = useState<"single" | "multi">("single");
  const [selectedSingleDomainId, setSelectedSingleDomainId] = useState<string>("");
  const [selectedMultiDomainIds, setSelectedMultiDomainIds] = useState<string[]>([]);
  const [domainSearchFilter, setDomainSearchFilter] = useState("");
  const [spfDeployMode, setSpfDeployMode] = useState<"merge" | "replace">("merge");

  // Auto-select first domain for single mode on load
  useEffect(() => {
    if (!selectedSingleDomainId && domains.length > 0) {
      setSelectedSingleDomainId(domains[0].id);
    }
  }, [domains, selectedSingleDomainId]);

  // Current single domain details
  const currentDomainItem = useMemo(() => {
    return domains.find((d) => d.id === selectedSingleDomainId) || null;
  }, [domains, selectedSingleDomainId]);

  const currentDomainSPFStatus = useMemo(() => {
    if (!selectedSingleDomainId) return null;
    return spfStatusMap.get(selectedSingleDomainId) || null;
  }, [selectedSingleDomainId, spfStatusMap]);

  // Fetch the active domain's DNS records directly (identical to /domains/dns records table)
  const { 
    data: domainDNSRecords = [], 
    isLoading: isLoadingDNSRecords,
    refetch: refetchDNSRecords 
  } = useGetDNSRecordsQuery(selectedSingleDomainId, {
    skip: !selectedSingleDomainId,
  });

  // Find SPF record directly from domain's DNS records table
  const dnsTableSPFRecord = useMemo(() => {
    if (!domainDNSRecords || domainDNSRecords.length === 0) return null;
    const match = domainDNSRecords.find((r) => {
      const val = (r.record_value || "").toLowerCase();
      const type = (r.record_type || "").toUpperCase();
      return val.includes("v=spf1") || type === "SPF";
    });
    if (!match) return null;
    return (match.record_value || "").replace(/^["']|["']$/g, "").trim();
  }, [domainDNSRecords]);

  // Combined active existing SPF record for the selected domain
  const activeExistingSPF = useMemo(() => {
    if (dnsTableSPFRecord) {
      return dnsTableSPFRecord;
    }
    if (currentDomainSPFStatus?.has_spf && currentDomainSPFStatus.spf_record) {
      return currentDomainSPFStatus.spf_record;
    }
    return null;
  }, [dnsTableSPFRecord, currentDomainSPFStatus]);

  const hasActiveSPF = Boolean(activeExistingSPF);

  // ---------------------------------------------------------------------------
  // SPF Visual Pipeline Canvas State
  // ---------------------------------------------------------------------------
  const [mechanisms, setMechanisms] = useState<SPFMechanism[]>([
    { id: "mech-1", type: "a", value: "" },
    { id: "mech-2", type: "mx", value: "" },
    { id: "mech-3", type: "include", value: "abc.com" },
  ]);
  const [qualifier, setQualifier] = useState<"~all" | "-all" | "?all" | "+all">("~all");

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // New Mechanism Input
  const [newMechType, setNewMechType] = useState<"include" | "macro" | "ip4" | "ip6" | "a" | "mx" | "exists" | "redirect">("include");
  const [newMechValue, setNewMechValue] = useState("");

  // Bulk Includes Modal
  const [showBulkIncludeModal, setShowBulkIncludeModal] = useState(false);
  const [bulkDomainsInput, setBulkDomainsInput] = useState("");

  // Copy feedback
  const [copiedSPF, setCopiedSPF] = useState(false);

  // ---------------------------------------------------------------------------
  // DKIM State (Tab 2)
  // ---------------------------------------------------------------------------
  const [dkimSelector, setDkimSelector] = useState("default");
  const [dkimKeyContent, setDkimKeyContent] = useState("");
  const [dkimTTL, setDkimTTL] = useState(1800);
  const [dkimTargetScope, setDkimTargetScope] = useState<"all" | "selected">("all");
  const [dkimSelectedDomainIds, setDkimSelectedDomainIds] = useState<string[]>([]);
  const [dkimSearchFilter, setDkimSearchFilter] = useState("");
  const [dkimOverwrite, setDkimOverwrite] = useState(true);

  // ---------------------------------------------------------------------------
  // Derived RFC 7208 SPF String
  // ---------------------------------------------------------------------------
  const generatedSPFString = useMemo(() => {
    const parts = ["v=spf1"];
    for (const m of mechanisms) {
      if (m.type === "a") {
        parts.push(m.value ? `a:${m.value}` : "a");
      } else if (m.type === "mx") {
        parts.push(m.value ? `mx:${m.value}` : "mx");
      } else if (m.type === "include") {
        if (m.value.trim()) parts.push(`include:${m.value.trim()}`);
      } else if (m.type === "ip4") {
        if (m.value.trim()) parts.push(`ip4:${m.value.trim()}`);
      } else if (m.type === "ip6") {
        if (m.value.trim()) parts.push(`ip6:${m.value.trim()}`);
      } else if (m.type === "exists") {
        if (m.value.trim()) parts.push(`exists:${m.value.trim()}`);
      } else if (m.type === "redirect") {
        if (m.value.trim()) parts.push(`redirect=${m.value.trim()}`);
      } else if (m.type === "macro") {
        if (m.value.trim()) parts.push(m.value.trim());
      } else if (m.value.trim()) {
        parts.push(`${m.type}:${m.value.trim()}`);
      }
    }
    parts.push(qualifier);
    return parts.join(" ");
  }, [mechanisms, qualifier]);

  // RFC 7208 DNS Lookup Count
  const dnsLookupCount = useMemo(() => {
    let count = 0;
    for (const m of mechanisms) {
      if (
        m.type === "include" || 
        m.type === "a" || 
        m.type === "mx" || 
        m.type === "ptr" || 
        m.type === "exists" || 
        m.type === "redirect"
      ) {
        count++;
      } else if (m.type === "macro") {
        const val = m.value.toLowerCase();
        if (val.startsWith("include:") || val.startsWith("exists:") || val.startsWith("redirect=") || val.startsWith("a:") || val.startsWith("mx:")) {
          count++;
        }
      }
    }
    return count;
  }, [mechanisms]);

  const charLength = generatedSPFString.length;

  // Real-time preview of merged SPF for Single Domain mode
  const previewMergedSPF = useMemo(() => {
    if (!activeExistingSPF || spfDeployMode === "replace") {
      return generatedSPFString;
    }
    const existingParts = activeExistingSPF.split(/\s+/).filter((p) => p && p.toLowerCase() !== "v=spf1");
    const newParts = generatedSPFString.split(/\s+/).filter((p) => p && p.toLowerCase() !== "v=spf1");

    const seen = new Set<string>();
    const finalMechs: string[] = [];
    let allModifier = qualifier;

    const addPart = (p: string) => {
      const pClean = p.toLowerCase();
      if (pClean === "~all" || pClean === "-all" || pClean === "?all" || pClean === "+all" || pClean === "all") {
        allModifier = pClean as any;
        return;
      }
      if (!seen.has(pClean)) {
        seen.add(pClean);
        finalMechs.push(p);
      }
    };

    existingParts.forEach(addPart);
    newParts.forEach(addPart);

    return `v=spf1 ${finalMechs.join(" ")} ${allModifier}`;
  }, [activeExistingSPF, spfDeployMode, generatedSPFString, qualifier]);

  // ---------------------------------------------------------------------------
  // Load existing domain SPF into canvas
  // ---------------------------------------------------------------------------
  const handleLoadDomainSPF = (spfVal: string) => {
    if (!spfVal) return;
    const parts = spfVal.split(/\s+/).filter(Boolean);
    const newMechs: SPFMechanism[] = [];
    let detectedQualifier: "~all" | "-all" | "?all" | "+all" = "~all";

    parts.forEach((p, idx) => {
      const pLower = p.toLowerCase();
      if (pLower === "v=spf1") return;

      if (pLower === "~all" || pLower === "-all" || pLower === "?all" || pLower === "+all") {
        detectedQualifier = pLower as any;
        return;
      }

      if (pLower === "a" || pLower.startsWith("a:")) {
        newMechs.push({
          id: `load-${idx}-${Math.random().toString(36).substring(2, 5)}`,
          type: "a",
          value: pLower === "a" ? "" : p.substring(2),
        });
      } else if (pLower === "mx" || pLower.startsWith("mx:")) {
        newMechs.push({
          id: `load-${idx}-${Math.random().toString(36).substring(2, 5)}`,
          type: "mx",
          value: pLower === "mx" ? "" : p.substring(3),
        });
      } else if (pLower.startsWith("include:")) {
        newMechs.push({
          id: `load-${idx}-${Math.random().toString(36).substring(2, 5)}`,
          type: "include",
          value: p.substring(8),
        });
      } else if (pLower.startsWith("ip4:")) {
        newMechs.push({
          id: `load-${idx}-${Math.random().toString(36).substring(2, 5)}`,
          type: "ip4",
          value: p.substring(4),
        });
      } else if (pLower.startsWith("ip6:")) {
        newMechs.push({
          id: `load-${idx}-${Math.random().toString(36).substring(2, 5)}`,
          type: "ip6",
          value: p.substring(4),
        });
      } else if (pLower.startsWith("exists:")) {
        newMechs.push({
          id: `load-${idx}-${Math.random().toString(36).substring(2, 5)}`,
          type: "exists",
          value: p.substring(7),
        });
      } else if (pLower.startsWith("redirect=")) {
        newMechs.push({
          id: `load-${idx}-${Math.random().toString(36).substring(2, 5)}`,
          type: "redirect",
          value: p.substring(9),
        });
      } else if (pLower.includes("%{")) {
        newMechs.push({
          id: `load-${idx}-${Math.random().toString(36).substring(2, 5)}`,
          type: "macro",
          value: p,
        });
      } else {
        newMechs.push({
          id: `load-${idx}-${Math.random().toString(36).substring(2, 5)}`,
          type: "include",
          value: p,
        });
      }
    });

    setMechanisms(newMechs);
    setQualifier(detectedQualifier);
    notify.success("Loaded existing domain SPF mechanisms into Studio!");
  };

  // ---------------------------------------------------------------------------
  // Drag and Drop Handlers
  // ---------------------------------------------------------------------------
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (index: number) => {
    if (draggedIndex === null || draggedIndex === index) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }
    const updated = [...mechanisms];
    const [moved] = updated.splice(draggedIndex, 1);
    updated.splice(index, 0, moved);
    setMechanisms(updated);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Add mechanism
  const handleAddMechanism = () => {
    if (
      (newMechType === "include" || newMechType === "ip4" || newMechType === "ip6" || newMechType === "macro" || newMechType === "exists" || newMechType === "redirect") &&
      !newMechValue.trim()
    ) {
      notify.error("Please provide a value for this mechanism");
      return;
    }

    let cleanVal = newMechValue.trim();
    if (newMechType === "include") {
      cleanVal = cleanVal.replace(/^include:/i, "");
    } else if (newMechType === "ip4") {
      cleanVal = cleanVal.replace(/^ip4:/i, "");
    } else if (newMechType === "ip6") {
      cleanVal = cleanVal.replace(/^ip6:/i, "");
    } else if (newMechType === "exists") {
      cleanVal = cleanVal.replace(/^exists:/i, "");
    } else if (newMechType === "redirect") {
      cleanVal = cleanVal.replace(/^redirect=/i, "");
    }

    setMechanisms((prev) => [
      ...prev,
      {
        id: `mech-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        type: newMechType,
        value: cleanVal,
      },
    ]);
    setNewMechValue("");
  };

  // Quick Add an Include Domain
  const handleQuickAddInclude = (domainVal: string) => {
    const exists = mechanisms.some((m) => m.type === "include" && m.value.toLowerCase() === domainVal.toLowerCase());
    if (exists) {
      notify.info(`include:${domainVal} is already in the canvas`);
      return;
    }
    setMechanisms((prev) => [
      ...prev,
      {
        id: `inc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        type: "include",
        value: domainVal,
      },
    ]);
    notify.success(`Added include:${domainVal}`);
  };

  // Quick Add a Macro Template
  const handleQuickAddMacroTemplate = (type: "include" | "exists" | "redirect", val: string) => {
    setMechanisms((prev) => [
      ...prev,
      {
        id: `macro-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        type,
        value: val,
      },
    ]);
    notify.success(`Added macro: ${type === "redirect" ? "redirect=" : type + ":"}${val}`);
  };

  // Insert macro placeholder token into input
  const handleInsertMacroToken = (token: string) => {
    setNewMechValue((prev) => (prev ? `${prev}.${token}` : token));
    if (newMechType !== "macro" && newMechType !== "include" && newMechType !== "exists") {
      setNewMechType("macro");
    }
  };

  // Remove mechanism
  const handleRemoveMechanism = (id: string) => {
    setMechanisms((prev) => prev.filter((m) => m.id !== id));
  };

  // Clear all mechanisms
  const handleClearAllMechanisms = () => {
    setMechanisms([]);
  };

  // Bulk add include domains
  const handleApplyBulkIncludes = () => {
    if (!bulkDomainsInput.trim()) return;

    const rawList = bulkDomainsInput.split(/[\n,;\s]+/);
    const validDomains = rawList
      .map((d) => d.trim().replace(/^include:/i, ""))
      .filter((d) => d.length > 2 && (d.includes(".") || d.includes("%{")));

    if (validDomains.length === 0) {
      notify.error("No valid domains detected in input");
      return;
    }

    const newMechs: SPFMechanism[] = validDomains.map((dom) => ({
      id: `bulk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type: "include",
      value: dom,
    }));

    setMechanisms((prev) => [...prev, ...newMechs]);
    setBulkDomainsInput("");
    setShowBulkIncludeModal(false);
    notify.success(`Added ${newMechs.length} include domain(s) to SPF record!`);
  };

  // Import MTA Server IPs into SPF as ip4:
  const handleImportServerIPs = () => {
    const uniqueIPs = new Set<string>();
    servers.forEach((s) => {
      if (s.main_ip && s.main_ip.includes(".")) {
        uniqueIPs.add(s.main_ip);
      }
    });

    if (uniqueIPs.size === 0) {
      notify.error("No MTA server IPs found to import");
      return;
    }

    const newIPMechs: SPFMechanism[] = [];
    uniqueIPs.forEach((ip) => {
      const exists = mechanisms.some((m) => m.type === "ip4" && m.value === ip);
      if (!exists) {
        newIPMechs.push({
          id: `ip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          type: "ip4",
          value: ip,
        });
      }
    });

    if (newIPMechs.length === 0) {
      notify.error("All MTA server IPs are already in your SPF record");
      return;
    }

    setMechanisms((prev) => [...prev, ...newIPMechs]);
    notify.success(`Imported ${newIPMechs.length} MTA server IP(s) into SPF!`);
  };

  // Copy SPF
  const handleCopySPF = () => {
    navigator.clipboard.writeText(generatedSPFString);
    setCopiedSPF(true);
    notify.success("SPF record copied to clipboard!");
    setTimeout(() => setCopiedSPF(false), 2000);
  };

  // Deploy SPF
  const handleDeploySPF = async () => {
    if (dnsLookupCount > 10) {
      if (!confirm(`Warning: Your SPF record uses ${dnsLookupCount} DNS lookups, which exceeds the RFC 7208 limit of 10. Receiving mail servers may throw a PermError. Do you still wish to deploy?`)) {
        return;
      }
    }

    let targetIDs: string[] = [];
    if (spfDomainMode === "single") {
      if (!selectedSingleDomainId) {
        notify.error("Please select a domain to apply SPF");
        return;
      }
      targetIDs = [selectedSingleDomainId];
    } else {
      if (selectedMultiDomainIds.length === 0) {
        notify.error("Please select at least one domain from the list menu");
        return;
      }
      targetIDs = selectedMultiDomainIds;
    }

    try {
      const res = await deploySPF({
        domain_ids: targetIDs,
        spf_record: generatedSPFString,
        mode: spfDeployMode,
        ttl: 1800,
      }).unwrap();

      notify.success(
        `SPF applied to ${res.total_targeted} domain(s) (${res.updated_count} updated, ${res.created_count} created)`
      );
      refetchSPFStatus();
    } catch (err: any) {
      notify.error(err?.data?.error?.message || err?.message || "Failed to deploy SPF record");
    }
  };

  // Multi-domain selection toggles
  const filteredDomainsForSPF = useMemo(() => {
    if (!domainSearchFilter.trim()) return domains;
    const q = domainSearchFilter.toLowerCase();
    return domains.filter((d) => d.domain_name.toLowerCase().includes(q));
  }, [domains, domainSearchFilter]);

  const toggleSelectAllMultiSPF = () => {
    if (selectedMultiDomainIds.length === domains.length) {
      setSelectedMultiDomainIds([]);
    } else {
      setSelectedMultiDomainIds(domains.map((d) => d.id));
    }
  };

  const toggleSelectDomainMultiSPF = (id: string) => {
    setSelectedMultiDomainIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // ---------------------------------------------------------------------------
  // DKIM Deployer Logic (Tab 2)
  // ---------------------------------------------------------------------------
  const derivedDKIMRecord = useMemo(() => {
    const sel = dkimSelector.trim() || "default";
    let key = dkimKeyContent.trim();
    if (key && !key.includes("v=DKIM1")) {
      key = key.replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "").replace(/\s+/g, "");
      key = `v=DKIM1; k=rsa; p=${key}`;
    }
    return {
      type: "TXT",
      host: `${sel}._domainkey`,
      value: key,
    };
  }, [dkimSelector, dkimKeyContent]);

  const filteredDomainsForDKIM = useMemo(() => {
    if (!dkimSearchFilter.trim()) return domains;
    const q = dkimSearchFilter.toLowerCase();
    return domains.filter((d) => d.domain_name.toLowerCase().includes(q));
  }, [domains, dkimSearchFilter]);

  const toggleSelectAllDKIM = () => {
    if (dkimSelectedDomainIds.length === domains.length) {
      setDkimSelectedDomainIds([]);
    } else {
      setDkimSelectedDomainIds(domains.map((d) => d.id));
    }
  };

  const toggleSelectDomainDKIM = (id: string) => {
    setDkimSelectedDomainIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleDeployDKIM = async () => {
    if (!derivedDKIMRecord.value) {
      notify.error("DKIM public key content cannot be empty");
      return;
    }

    const targetIDs = dkimTargetScope === "all" ? [] : dkimSelectedDomainIds;
    if (dkimTargetScope === "selected" && targetIDs.length === 0) {
      notify.error("Please select at least one domain to deploy DKIM");
      return;
    }

    try {
      const res = await deployCustomRecord({
        domain_ids: targetIDs.length > 0 ? targetIDs : undefined,
        record_type: "TXT",
        host_name: derivedDKIMRecord.host,
        record_value: derivedDKIMRecord.value,
        ttl: Number(dkimTTL) || 1800,
        overwrite: dkimOverwrite,
      }).unwrap();

      notify.success(
        `DKIM deployed to ${res.total_targeted} domain(s) (${res.created_count} created, ${res.updated_count} updated, ${res.skipped_count} skipped)`
      );
    } catch (err: any) {
      notify.error(err?.data?.error?.message || err?.message || "Failed to deploy DKIM record");
    }
  };

  return (
    <div className="space-y-6">
      {/* Studio Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 shadow-md shadow-blue-500/20">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-100">
              DNS Authentication Studio
            </h1>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Choose macros and includes to add to domain SPF records with visual drag-and-drop, or deploy DKIM public keys.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/domains/dns">
            <Button variant="outline" size="sm" className="border-slate-800 text-slate-300 hover:bg-slate-800 text-xs">
              <Layers className="h-3.5 w-3.5 mr-1 text-slate-400" />
              Standard DNS Manager
            </Button>
          </Link>
        </div>
      </div>

      {/* Primary Navigation Tabs: ONLY 2 TABS (SPF and DKIM) */}
      <div className="flex items-center gap-2 p-1 rounded-xl bg-slate-900 border border-slate-800 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("spf")}
          className={`px-5 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
            activeTab === "spf"
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          }`}
        >
          <Wand2 className="h-4 w-4" />
          SPF Studio
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("dkim")}
          className={`px-5 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
            activeTab === "dkim"
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          }`}
        >
          <Key className="h-4 w-4" />
          DKIM Deployer
        </button>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: SPF STUDIO                                                      */}
      {/* ===================================================================== */}
      {activeTab === "spf" && (
        <div className="space-y-6">
          {/* Top Domain Selection & Existing SPF Inspector Card */}
          <Card className="border-slate-800 bg-slate-900/70 shadow-xl backdrop-blur">
            <CardContent className="p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <Globe className="h-4 w-4 text-blue-400" />
                  <div>
                    <h3 className="font-semibold text-slate-100 text-sm">
                      Target Domain(s) &amp; Existing SPF
                    </h3>
                    <p className="text-xs text-slate-400">
                      Choose a domain from the list menu to inspect and add macros/includes to its SPF, or select multiple domains to apply additions in bulk.
                    </p>
                  </div>
                </div>

                {/* Scope Mode Switcher */}
                <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg shrink-0">
                  <button
                    type="button"
                    onClick={() => setSpfDomainMode("single")}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                      spfDomainMode === "single"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Single Domain
                  </button>
                  <button
                    type="button"
                    onClick={() => setSpfDomainMode("multi")}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                      spfDomainMode === "multi"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Multiple Domains ({selectedMultiDomainIds.length})
                  </button>
                </div>
              </div>

              {/* Single Domain Select Menu & Inspection */}
              {spfDomainMode === "single" && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                  <div className="md:col-span-5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold uppercase text-slate-400">
                        Select Domain:
                      </label>
                      <button
                        type="button"
                        onClick={handleSyncFromProvider}
                        disabled={isSyncingDomain || !selectedSingleDomainId}
                        className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors disabled:opacity-50"
                        title="Fetch & sync latest host records directly from domain provider (Namecheap) or live DNS"
                      >
                        <RefreshCw className={`h-3 w-3 ${isSyncingDomain ? "animate-spin text-blue-400" : ""}`} />
                        {isSyncingDomain ? "Syncing..." : "Sync from Provider"}
                      </button>
                    </div>
                    <div className="relative">
                      <select
                        value={selectedSingleDomainId}
                        onChange={(e) => setSelectedSingleDomainId(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm font-mono font-semibold text-slate-100 focus:outline-none focus:border-blue-500 cursor-pointer"
                      >
                        {domains.length === 0 ? (
                          <option value="">No domains found</option>
                        ) : (
                          domains.map((d) => {
                            const status = spfStatusMap.get(d.id);
                            const isCurrentSelected = d.id === selectedSingleDomainId;
                            const hasSPF = (isCurrentSelected && hasActiveSPF) ? true : status?.has_spf;
                            return (
                              <option key={d.id} value={d.id}>
                                {d.domain_name} {hasSPF ? "(Active SPF)" : "(No SPF)"}
                              </option>
                            );
                          })
                        )}
                      </select>
                    </div>
                  </div>

                  <div className="md:col-span-7 p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                        <Info className="h-3.5 w-3.5 text-blue-400" />
                        Current Published SPF on{" "}
                        <span className="text-slate-200 font-mono underline decoration-blue-500/40">
                          {currentDomainItem?.domain_name || "Domain"}
                        </span>
                        :
                      </span>

                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            refetchDNSRecords();
                            refetchSPFStatus();
                            notify.success("Reloaded records from local DNS cache");
                          }}
                          className="text-slate-400 hover:text-slate-200 hover:bg-slate-900 text-xs h-7 py-0 px-2"
                          title="Reload records from local DNS cache"
                        >
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Reload
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleSyncFromProvider}
                          disabled={isSyncingDomain}
                          className="text-blue-400 hover:text-blue-300 hover:bg-slate-900 text-xs h-7 py-0 px-2"
                          title="Fetch latest DNS records from domain provider"
                        >
                          <RefreshCw className={`h-3 w-3 mr-1 ${isSyncingDomain ? "animate-spin text-blue-400" : ""}`} />
                          Sync Provider
                        </Button>

                        {hasActiveSPF && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleLoadDomainSPF(activeExistingSPF || "")}
                            className="text-emerald-400 hover:text-emerald-300 hover:bg-slate-900 text-xs h-7 py-0 px-2"
                          >
                            <Wand2 className="h-3 w-3 mr-1" />
                            Load into Canvas
                          </Button>
                        )}
                      </div>
                    </div>

                    {hasActiveSPF ? (
                      <div className="space-y-2">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono">
                          <span className="text-slate-200 break-all select-all font-semibold">
                            {activeExistingSPF}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold shrink-0 bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            {computeLookups(activeExistingSPF || "")} / 10 lookups
                          </span>
                        </div>

                        {/* Single Domain Strategy Selector */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
                          <div className="text-[11px] text-slate-400">
                            <span className="font-semibold text-slate-300">Alter Mode:</span>{" "}
                            {spfDeployMode === "merge"
                              ? "Smart Merge keeps existing mechanisms on this domain and appends the new includes/macros."
                              : "Replace overwrites this domain's SPF record completely with what is currently on the canvas."}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => setSpfDeployMode("merge")}
                              className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                                spfDeployMode === "merge"
                                  ? "bg-blue-600 text-white shadow-sm"
                                  : "bg-slate-900 text-slate-400 hover:text-slate-200"
                              }`}
                            >
                              Smart Merge (Keep &amp; Add)
                            </button>
                            <button
                              type="button"
                              onClick={() => setSpfDeployMode("replace")}
                              className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                                spfDeployMode === "replace"
                                  ? "bg-rose-600 text-white shadow-sm"
                                  : "bg-slate-900 text-slate-400 hover:text-slate-200"
                              }`}
                            >
                              Replace
                            </button>
                          </div>
                        </div>

                        {/* Resulting Merged Preview */}
                        {spfDeployMode === "merge" && (
                          <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs font-mono space-y-1">
                            <div className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1">
                              <Check className="h-3 w-3" />
                              Resulting SPF on {currentDomainItem?.domain_name} (Existing Kept + New Added):
                            </div>
                            <div className="text-emerald-300 break-all select-all font-semibold">
                              {previewMergedSPF}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-3 rounded-lg bg-slate-900/60 border border-dashed border-slate-800 space-y-2 text-xs">
                        <div className="text-slate-400 flex items-center justify-between">
                          <span>
                            No SPF record currently found in DNS cache for{" "}
                            <span className="text-slate-200 font-mono font-semibold">{currentDomainItem?.domain_name}</span>.
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              refetchDNSRecords();
                              refetchSPFStatus();
                              notify.success("Reloaded records from local DNS cache");
                            }}
                            className="text-xs text-blue-400 hover:bg-slate-800 h-7 px-2"
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Reload Records
                          </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={handleSyncFromProvider}
                            disabled={isSyncingDomain}
                            className="border-blue-500/40 text-blue-400 hover:bg-blue-500/10 text-xs h-8"
                          >
                            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isSyncingDomain ? "animate-spin" : ""}`} />
                            {isSyncingDomain ? "Fetching from Provider..." : "Fetch & Sync SPF from Namecheap"}
                          </Button>
                          <span className="text-[11px] text-slate-500">
                            Pulls live host records directly from Namecheap / registrar
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Multiple Domains Select Menu & Checklist */}
              {spfDomainMode === "multi" && (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-md">
                      <Search className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-3" />
                      <input
                        type="text"
                        placeholder="Search domain list..."
                        value={domainSearchFilter}
                        onChange={(e) => setDomainSearchFilter(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400 font-mono">
                        {selectedMultiDomainIds.length} of {domains.length} domains selected
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={toggleSelectAllMultiSPF}
                        className="text-xs border-slate-800 text-blue-400 hover:bg-slate-800 h-8"
                      >
                        {selectedMultiDomainIds.length === domains.length ? "Deselect All" : "Select All"}
                      </Button>
                    </div>
                  </div>

                  {/* Multi-Domain Scrollable List Menu */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    {filteredDomainsForSPF.map((d) => {
                      const isSelected = selectedMultiDomainIds.includes(d.id);
                      const status = spfStatusMap.get(d.id);
                      return (
                        <div
                          key={d.id}
                          onClick={() => toggleSelectDomainMultiSPF(d.id)}
                          className={`flex items-center justify-between p-2 rounded-lg cursor-pointer text-xs transition-colors border ${
                            isSelected
                              ? "bg-blue-600/10 border-blue-500/40 text-blue-200"
                              : "bg-slate-900/50 border-slate-800/80 hover:bg-slate-900 text-slate-300"
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            {isSelected ? (
                              <CheckSquare className="h-4 w-4 text-blue-400 shrink-0" />
                            ) : (
                              <Square className="h-4 w-4 text-slate-600 shrink-0" />
                            )}
                            <span className="font-mono truncate">{d.domain_name}</span>
                          </div>

                          {status?.has_spf ? (
                            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded shrink-0">
                              Active
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono text-slate-500 shrink-0">
                              None
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Multi Deploy Strategy */}
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="font-semibold text-slate-200">
                        Multi-Domain Strategy:
                      </span>
                      <span className="text-slate-400 ml-2">
                        {spfDeployMode === "merge"
                          ? "Smart Merge: Appends/merges newly chosen macros and includes into each domain's existing SPF without wiping previous rules."
                          : "Replace: Overwrites each selected domain's SPF record completely with the canvas record."}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setSpfDeployMode("merge")}
                        className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                          spfDeployMode === "merge"
                            ? "bg-blue-600 text-white"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        Smart Merge (Recommended)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSpfDeployMode("replace")}
                        className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                          spfDeployMode === "replace"
                            ? "bg-rose-600 text-white"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        Replace
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Main Interactive Studio Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Visual Canvas & Addition Controls (2 Cols) */}
            <div className="lg:col-span-2 space-y-6">
              <Card className="border-slate-800 bg-slate-900/60 shadow-xl backdrop-blur">
                <CardContent className="p-6 space-y-6">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                    <div className="flex items-center gap-2">
                      <Wand2 className="h-4 w-4 text-blue-400" />
                      <h3 className="font-semibold text-slate-100 text-sm">
                        Interactive Visual Pipeline Canvas
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleClearAllMechanisms}
                        className="text-xs text-slate-400 hover:text-rose-400 h-7 px-2"
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Clear Canvas
                      </Button>
                      <span className="text-[11px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                        Drag items to reorder left-to-right evaluation
                      </span>
                    </div>
                  </div>

                  {/* Drag-and-Drop Pipeline */}
                  <div className="p-5 rounded-xl bg-slate-950 border border-slate-800/80 space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                      <span>SPF Evaluation Sequence:</span>
                      <span className="text-[11px] text-slate-500 font-normal">
                        Evaluated strictly left-to-right until first match
                      </span>
                    </div>

                    {/* Flow Canvas */}
                    <div className="flex flex-wrap items-center gap-2.5 min-h-16 p-3 rounded-lg bg-slate-900/40 border border-dashed border-slate-800">
                      {/* Fixed Prefix */}
                      <div className="px-3 py-2 rounded-lg bg-slate-800 text-slate-200 text-xs font-mono font-semibold border border-slate-700 shadow-sm flex items-center gap-1.5 select-none">
                        <Code2 className="h-3.5 w-3.5 text-blue-400" />
                        v=spf1
                      </div>

                      <ArrowRight className="h-3.5 w-3.5 text-slate-600 shrink-0" />

                      {/* Draggable Mechanisms */}
                      {mechanisms.map((mech, idx) => {
                        const isDragged = draggedIndex === idx;
                        const isOver = dragOverIndex === idx;

                        let colorClasses = "bg-indigo-500/10 text-indigo-300 border-indigo-500/30 hover:border-indigo-400";
                        let typeLabel = "include";

                        if (mech.type === "ip4") {
                          colorClasses = "bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:border-emerald-400";
                          typeLabel = "ip4";
                        } else if (mech.type === "ip6") {
                          colorClasses = "bg-teal-500/10 text-teal-300 border-teal-500/30 hover:border-teal-400";
                          typeLabel = "ip6";
                        } else if (mech.type === "a") {
                          colorClasses = "bg-amber-500/10 text-amber-300 border-amber-500/30 hover:border-amber-400";
                          typeLabel = "a";
                        } else if (mech.type === "mx") {
                          colorClasses = "bg-orange-500/10 text-orange-300 border-orange-500/30 hover:border-orange-400";
                          typeLabel = "mx";
                        } else if (mech.type === "macro" || mech.type === "exists") {
                          colorClasses = "bg-purple-500/10 text-purple-300 border-purple-500/30 hover:border-purple-400";
                          typeLabel = mech.type;
                        } else if (mech.type === "redirect") {
                          colorClasses = "bg-sky-500/10 text-sky-300 border-sky-500/30 hover:border-sky-400";
                          typeLabel = "redirect";
                        }

                        return (
                          <React.Fragment key={mech.id}>
                            <div
                              draggable
                              onDragStart={() => handleDragStart(idx)}
                              onDragOver={(e) => handleDragOver(e, idx)}
                              onDrop={() => handleDrop(idx)}
                              className={`group relative flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono font-medium border shadow-sm transition-all cursor-grab active:cursor-grabbing ${colorClasses} ${
                                isDragged ? "opacity-30 scale-95" : ""
                              } ${isOver ? "border-blue-400 ring-2 ring-blue-500/20" : ""}`}
                            >
                              <GripVertical className="h-3.5 w-3.5 text-slate-500 group-hover:text-slate-300 shrink-0" />
                              <span className="font-semibold uppercase text-[10px] opacity-75">{typeLabel}:</span>
                              <span className="font-bold">{mech.value || "default"}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveMechanism(mech.id)}
                                className="ml-1 text-slate-500 hover:text-rose-400 p-0.5 rounded transition-colors"
                                title="Remove mechanism"
                              >
                                &times;
                              </button>
                            </div>

                            {idx < mechanisms.length - 1 && (
                              <ArrowRight className="h-3.5 w-3.5 text-slate-600 shrink-0" />
                            )}
                          </React.Fragment>
                        );
                      })}

                      <ArrowRight className="h-3.5 w-3.5 text-slate-600 shrink-0" />

                      {/* Fixed Qualifier */}
                      <div className="px-3 py-2 rounded-lg bg-rose-500/10 text-rose-300 text-xs font-mono font-bold border border-rose-500/30 shadow-sm flex items-center gap-1.5 select-none">
                        <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />
                        {qualifier}
                      </div>
                    </div>

                    {/* Add Mechanism Controls */}
                    <div className="space-y-3 pt-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={newMechType}
                          onChange={(e) => setNewMechType(e.target.value as any)}
                          className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                        >
                          <option value="include">include: (Domain)</option>
                          <option value="macro">macro (SPF Dynamic Macro)</option>
                          <option value="exists">exists: (Query Macro)</option>
                          <option value="ip4">ip4: (IPv4 / CIDR)</option>
                          <option value="ip6">ip6: (IPv6 / CIDR)</option>
                          <option value="a">a (Domain A Record)</option>
                          <option value="mx">mx (Domain MX Record)</option>
                          <option value="redirect">redirect= (Pointer)</option>
                        </select>

                        {newMechType !== "a" && newMechType !== "mx" ? (
                          <input
                            type="text"
                            placeholder={
                              newMechType === "include"
                                ? "e.g. abc.com or mailgun.org"
                                : newMechType === "macro"
                                ? "e.g. %{d} or exists:%{i}._spf.%{d}"
                                : newMechType === "exists"
                                ? "e.g. %{i}._spf.%{d}"
                                : newMechType === "redirect"
                                ? "e.g. _spf.%{d}"
                                : "e.g. 185.253.54.100 or /24"
                            }
                            value={newMechValue}
                            onChange={(e) => setNewMechValue(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddMechanism())}
                            className="flex-1 min-w-[200px] px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 font-mono"
                          />
                        ) : (
                          <span className="flex-1 text-xs text-slate-500 italic pl-1">
                            Applies domain-level {newMechType.toUpperCase()} target
                          </span>
                        )}

                        <Button
                          type="button"
                          size="sm"
                          onClick={handleAddMechanism}
                          className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-9 shrink-0"
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add Block
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowBulkIncludeModal(true)}
                          className="border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 text-xs h-9 shrink-0"
                        >
                          <Layers className="h-3.5 w-3.5 mr-1" />
                          Bulk Include
                        </Button>

                        {servers.length > 0 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleImportServerIPs}
                            className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-xs h-9 shrink-0"
                            title="Import main IPs from registered MTA servers"
                          >
                            <Server className="h-3.5 w-3.5 mr-1" />
                            Import MTA Server IPs
                          </Button>
                        )}
                      </div>

                      {/* Macro Presets & Quick Tag Buttons */}
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-purple-400 uppercase tracking-wider flex items-center gap-1">
                            <Zap className="h-3 w-3" />
                            SPF Macros:
                          </span>
                          <span className="text-[11px] text-slate-500">
                            Click tag to insert into value input:
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {MACRO_PRESETS.map((m) => (
                            <button
                              key={m.value}
                              type="button"
                              onClick={() => handleInsertMacroToken(m.value)}
                              className="px-2 py-1 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30 hover:bg-purple-500/20 text-[11px] font-mono transition-colors"
                              title={`Insert ${m.value}`}
                            >
                              {m.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Macro Pre-built Templates */}
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                          Pre-built Dynamic Macro Templates:
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {MACRO_TEMPLATES.map((tmpl) => (
                            <button
                              key={tmpl.label}
                              type="button"
                              onClick={() => handleQuickAddMacroTemplate(tmpl.type, tmpl.value)}
                              className="px-2 py-1 rounded bg-slate-900 text-slate-300 border border-slate-800 hover:border-purple-400/50 hover:text-purple-300 text-[11px] font-mono transition-colors"
                            >
                              + {tmpl.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Quick Include Presets */}
                      <div className="space-y-1.5 pt-1 border-t border-slate-800/60">
                        <span className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider block">
                          Popular ESP Include Presets (Click to add):
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {POPULAR_INCLUDES.map((item) => (
                            <button
                              key={item.value}
                              type="button"
                              onClick={() => handleQuickAddInclude(item.value)}
                              className="px-2.5 py-1 rounded-md bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/20 text-xs font-mono transition-colors"
                            >
                              + {item.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Qualifier Settings */}
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <span className="text-xs font-semibold text-slate-200 block">
                        Default Policy Qualifier (~all vs -all)
                      </span>
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        Specifies action for unlisted IPs. (~all SoftFail is industry standard during delivery &amp; warmup).
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 p-1 rounded-lg bg-slate-900 border border-slate-800">
                      <button
                        type="button"
                        onClick={() => setQualifier("~all")}
                        className={`px-2.5 py-1.5 rounded-md text-xs font-mono font-semibold transition-colors ${
                          qualifier === "~all" ? "bg-amber-600 text-white" : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        ~all (SoftFail)
                      </button>
                      <button
                        type="button"
                        onClick={() => setQualifier("-all")}
                        className={`px-2.5 py-1.5 rounded-md text-xs font-mono font-semibold transition-colors ${
                          qualifier === "-all" ? "bg-rose-600 text-white" : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        -all (HardFail)
                      </button>
                      <button
                        type="button"
                        onClick={() => setQualifier("?all")}
                        className={`px-2.5 py-1.5 rounded-md text-xs font-mono font-semibold transition-colors ${
                          qualifier === "?all" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        ?all (Neutral)
                      </button>
                    </div>
                  </div>

                  {/* Real-time Generated Output */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold uppercase text-slate-400">
                        Generated RFC-Compliant SPF TXT Record:
                      </span>
                      <button
                        type="button"
                        onClick={handleCopySPF}
                        className="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-xs"
                      >
                        {copiedSPF ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                        {copiedSPF ? "Copied!" : "Copy String"}
                      </button>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-950 border border-blue-500/30 text-blue-300 font-mono text-xs break-all select-all">
                      {generatedSPFString}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Column: RFC 7208 Inspector & Deployment Action */}
            <div className="space-y-6">
              {/* RFC 7208 Health Meter */}
              <Card className="border-slate-800 bg-slate-900/60 shadow-xl backdrop-blur">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-400" />
                      <h3 className="font-semibold text-slate-100 text-sm">RFC 7208 Standards Guard</h3>
                    </div>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                      dnsLookupCount <= 7
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                        : dnsLookupCount <= 10
                        ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                        : "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                    }`}>
                      {dnsLookupCount <= 10 ? "RFC Compliant" : "Lookups Exceeded"}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-medium">DNS Lookup Budget:</span>
                      <span className="font-mono font-bold text-slate-200">
                        {dnsLookupCount} / 10 lookups
                      </span>
                    </div>

                    <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                      <div
                        className={`h-full transition-all ${
                          dnsLookupCount <= 7
                            ? "bg-emerald-500"
                            : dnsLookupCount <= 10
                            ? "bg-amber-500"
                            : "bg-rose-500"
                        }`}
                        style={{ width: `${Math.min(100, (dnsLookupCount / 10) * 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/60 text-slate-400">
                    <span>Character Length:</span>
                    <span className="font-mono text-slate-300">{charLength} / 255 chars</span>
                  </div>

                  {dnsLookupCount > 10 && (
                    <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                      <span>
                        Critical: Major inbox providers (Gmail, Outlook) will throw an SPF PermError when DNS query lookups exceed 10. Consider consolidating includes.
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Action / Apply Card */}
              <Card className="border-slate-800 bg-slate-900/60 shadow-xl backdrop-blur">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-blue-400" />
                      <h3 className="font-semibold text-slate-100 text-sm">Deployment Target</h3>
                    </div>
                    <span className="text-xs text-slate-400 font-mono">
                      {spfDomainMode === "single"
                        ? (currentDomainItem?.domain_name || "Single Domain")
                        : `${selectedMultiDomainIds.length} Domains`}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-2">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Target Scope:</span>
                      <span className="font-semibold text-slate-200">
                        {spfDomainMode === "single"
                          ? currentDomainItem?.domain_name || "1 Domain"
                          : `${selectedMultiDomainIds.length} Selected Domain(s)`}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-400">
                      <span>Sync Target:</span>
                      <span className="text-emerald-400 font-mono">Host @ (TXT Record)</span>
                    </div>

                    <div className="flex items-center justify-between text-slate-400">
                      <span>Alter Strategy:</span>
                      <span className={`font-semibold ${spfDeployMode === "merge" ? "text-emerald-400" : "text-amber-400"}`}>
                        {spfDeployMode === "merge" ? "Smart Merge (Keep & Add)" : "Replace (Overwrite)"}
                      </span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    disabled={
                      isDeployingSPF || 
                      (spfDomainMode === "single" && !selectedSingleDomainId) ||
                      (spfDomainMode === "multi" && selectedMultiDomainIds.length === 0)
                    }
                    onClick={handleDeploySPF}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs h-10 shadow-lg shadow-blue-600/20"
                  >
                    {isDeployingSPF ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2 text-white" />
                    )}
                    {spfDomainMode === "single"
                      ? `Apply & Save to ${currentDomainItem?.domain_name || "Domain"}`
                      : `Apply & Save to ${selectedMultiDomainIds.length} Domains`}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: DKIM DEPLOYER                                                   */}
      {/* ===================================================================== */}
      {activeTab === "dkim" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main DKIM Configuration Form (2 Cols) */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-slate-800 bg-slate-900/60 shadow-xl backdrop-blur">
              <CardContent className="p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4 text-emerald-400" />
                    <h3 className="font-semibold text-slate-100 text-sm">
                      Deploy DKIM Public Key Record
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    Synchronizes directly with Namecheap DNS
                  </span>
                </div>

                <div className="space-y-4 p-4 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                        DKIM Selector Name <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. default, k1, mail"
                        value={dkimSelector}
                        onChange={(e) => setDkimSelector(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                      />
                      <span className="text-[11px] text-slate-500 mt-1 block">
                        Creates DNS record at host: <code className="text-blue-400">{dkimSelector.trim() || "default"}._domainkey</code>
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                        Key Specification &amp; Algorithm
                      </label>
                      <div className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-400">
                        RSA (k=rsa) • RFC 6376 Standards Compliant
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                      DKIM Public Key Content <span className="text-rose-400">*</span>
                    </label>
                    <textarea
                      rows={5}
                      required
                      placeholder="MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC3... (paste raw base64 or PEM or full v=DKIM1 string)"
                      value={dkimKeyContent}
                      onChange={(e) => setDkimKeyContent(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                    />
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      Raw base64 keys or PEM blocks will automatically be formatted as <code className="text-emerald-400">v=DKIM1; k=rsa; p=...</code>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div>
                      <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                        TTL (Seconds)
                      </label>
                      <input
                        type="number"
                        value={dkimTTL}
                        onChange={(e) => setDkimTTL(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Live Preview Box */}
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase text-slate-400 block">
                    Live Record Preview:
                  </span>
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono space-y-1.5">
                    <div className="text-slate-400 flex items-center gap-3">
                      <span>Type: <span className="text-blue-400 font-bold">TXT</span></span>
                      <span>•</span>
                      <span>Host: <span className="text-emerald-400 font-bold">{derivedDKIMRecord.host}</span></span>
                    </div>
                    <div className="text-slate-200 break-all bg-slate-900 p-2.5 rounded border border-slate-800/80">
                      {derivedDKIMRecord.value || "(Record value will appear here once key is entered)"}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Scope & Submit Column */}
          <div className="space-y-6">
            <Card className="border-slate-800 bg-slate-900/60 shadow-xl backdrop-blur">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-emerald-400" />
                    <h3 className="font-semibold text-slate-100 text-sm">Target Scope</h3>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    {dkimTargetScope === "all" ? `${domains.length} Domains` : `${dkimSelectedDomainIds.length} Selected`}
                  </span>
                </div>

                {/* Scope Radio Tabs */}
                <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-slate-950 border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setDkimTargetScope("all")}
                    className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors ${
                      dkimTargetScope === "all"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    All Domains ({domains.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDkimTargetScope("selected")}
                    className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors ${
                      dkimTargetScope === "selected"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Selected ({dkimSelectedDomainIds.length})
                  </button>
                </div>

                {dkimTargetScope === "selected" && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="relative flex-1">
                        <Search className="h-3.5 w-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                        <input
                          type="text"
                          placeholder="Search domains..."
                          value={dkimSearchFilter}
                          onChange={(e) => setDkimSearchFilter(e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={toggleSelectAllDKIM}
                        className="text-xs text-blue-400 hover:bg-slate-800 h-8"
                      >
                        {dkimSelectedDomainIds.length === domains.length ? "Deselect All" : "Select All"}
                      </Button>
                    </div>

                    <div className="max-h-56 overflow-y-auto space-y-1.5 p-2 rounded-lg bg-slate-950 border border-slate-800/80">
                      {filteredDomainsForDKIM.map((d) => {
                        const isSelected = dkimSelectedDomainIds.includes(d.id);
                        return (
                          <div
                            key={d.id}
                            onClick={() => toggleSelectDomainDKIM(d.id)}
                            className={`flex items-center justify-between p-2 rounded-md cursor-pointer text-xs transition-colors ${
                              isSelected ? "bg-blue-600/10 border border-blue-500/30 text-blue-200" : "hover:bg-slate-900 text-slate-300"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {isSelected ? (
                                <CheckSquare className="h-4 w-4 text-blue-400 shrink-0" />
                              ) : (
                                <Square className="h-4 w-4 text-slate-600 shrink-0" />
                              )}
                              <span className="font-mono">{d.domain_name}</span>
                            </div>
                            <span className="text-[10px] text-slate-500 uppercase">{d.status}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Overwrite Toggle */}
                <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dkimOverwrite}
                      onChange={(e) => setDkimOverwrite(e.target.checked)}
                      className="mt-0.5 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <div>
                      <span className="text-xs font-semibold text-slate-200">
                        Overwrite Existing Selector Record
                      </span>
                      <span className="block text-[11px] text-slate-400 mt-0.5">
                        If a record at <code className="text-blue-400">{dkimSelector}._domainkey</code> already exists on a domain, replace its key.
                      </span>
                    </div>
                  </label>
                </div>

                <Button
                  type="button"
                  disabled={isDeployingCustom}
                  onClick={handleDeployDKIM}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs h-10 shadow-lg shadow-emerald-600/20"
                >
                  {isDeployingCustom ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Key className="h-4 w-4 mr-2 text-white" />
                  )}
                  Deploy DKIM Key to {dkimTargetScope === "all" ? `All ${domains.length} Domains` : `${dkimSelectedDomainIds.length} Domains`}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* BULK INCLUDE DOMAINS MODAL                                             */}
      {/* ===================================================================== */}
      {showBulkIncludeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-4 !m-0 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-indigo-400" />
                <h3 className="font-semibold text-slate-100 text-base">Bulk Add Domains to Include</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkIncludeModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Paste a list of partner, relay, or warmup domains below. Each domain will be parsed into an interactive draggable <code className="text-indigo-400">include:domain</code> mechanism.
            </p>

            <textarea
              rows={6}
              placeholder="abc.com&#10;relay.net&#10;warmup-domain.org&#10;mailgun.org"
              value={bulkDomainsInput}
              onChange={(e) => setBulkDomainsInput(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
            />

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowBulkIncludeModal(false)}
                className="border-slate-800 text-slate-400 hover:bg-slate-800 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleApplyBulkIncludes}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add All Domains
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
