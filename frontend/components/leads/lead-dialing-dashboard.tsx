"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Phone,
  PhoneCall,
  Search,
  Plus,
  RefreshCw,
  Clock,
  Calendar,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Flame,
  Star,
  Users,
  Building,
  UserCheck,
  Tag,
  ArrowRight,
  ChevronRight,
  ExternalLink,
  MessageSquare,
  ShieldAlert,
  Loader2,
  Globe,
  Building2,
  Snowflake,
  Handshake,
  Trash2,
  History,
  AlertCircle,
  X,
} from "lucide-react";
import {
  WorkflowLead,
  WorkflowLeadSource,
  WorkflowLeadStatus,
  LeadCallLog,
  LeadSummaryResponse,
  CreateLeadPayload,
  User as UserType,
} from "@/types";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatReadableDate, cn, formatEmployeeId } from "@/lib/utils";

interface LeadDialingDashboardProps {
  selectedEmployeeId?: number;
  onCallLogged?: () => void;
}

const SOURCES: {
  key: WorkflowLeadSource;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  activeBg: string;
  badgeActiveBg: string;
  iconColor: string;
}[] = [
  {
    key: "fb_lead",
    label: "FB Lead",
    icon: Globe,
    activeBg: "bg-blue-600 border-blue-600 text-white",
    badgeActiveBg: "bg-blue-700 text-white border-blue-500",
    iconColor: "text-blue-600",
  },
  {
    key: "fair_lead",
    label: "Fair Lead",
    icon: Building2,
    activeBg: "bg-purple-700 border-purple-700 text-white",
    badgeActiveBg: "bg-purple-800 text-white border-purple-600",
    iconColor: "text-purple-700",
  },
  {
    key: "cold_lead",
    label: "Cold Lead",
    icon: Snowflake,
    activeBg: "bg-sky-700 border-sky-700 text-white",
    badgeActiveBg: "bg-sky-800 text-white border-sky-600",
    iconColor: "text-sky-700",
  },
  {
    key: "reference",
    label: "Reference",
    icon: Handshake,
    activeBg: "bg-amber-600 border-amber-600 text-white",
    badgeActiveBg: "bg-amber-700 text-white border-amber-500",
    iconColor: "text-amber-600",
  },
];

const STATUSES: { key: WorkflowLeadStatus; label: string; fullLabel: string; badgeClass: string; chipBg: string }[] = [
  {
    key: "hp",
    label: "HP",
    fullLabel: "High Potential",
    badgeClass: "bg-emerald-500/15 text-emerald-700 border-emerald-300",
    chipBg: "border-emerald-500 bg-emerald-50 text-emerald-900",
  },
  {
    key: "p",
    label: "P",
    fullLabel: "Potential",
    badgeClass: "bg-blue-500/15 text-blue-700 border-blue-300",
    chipBg: "border-blue-500 bg-blue-50 text-blue-900",
  },
  {
    key: "fup",
    label: "FUP",
    fullLabel: "Follow Up",
    badgeClass: "bg-amber-500/15 text-amber-700 border-amber-300",
    chipBg: "border-amber-500 bg-amber-50 text-amber-900",
  },
];

const ALL_OUTCOME_STATUSES: {
  key: WorkflowLeadStatus;
  label: string;
  badge: string;
  desc: string;
  color: string;
}[] = [
  {
    key: "hp",
    label: "HP (High Potential)",
    badge: "HP",
    desc: "Very interested client, ready for meeting or site visit",
    color: "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600",
  },
  {
    key: "p",
    label: "P (Potential)",
    badge: "P",
    desc: "Interested client, needs ongoing nurture & info",
    color: "bg-blue-600 hover:bg-blue-700 text-white border-blue-600",
  },
  {
    key: "fup",
    label: "FUP (Follow Up)",
    badge: "FUP",
    desc: "Call back later, schedule another call session",
    color: "bg-amber-600 hover:bg-amber-700 text-white border-amber-600",
  },
  {
    key: "ni",
    label: "NI (Not Interested)",
    badge: "NI",
    desc: "Client explicitly declined or rejected",
    color: "bg-rose-600 hover:bg-rose-700 text-white border-rose-600",
  },
  {
    key: "nr",
    label: "NR (Not Reached)",
    badge: "NR",
    desc: "Unanswered, busy, or switched off (remains in pool)",
    color: "bg-slate-600 hover:bg-slate-700 text-white border-slate-600",
  },
];

export function LeadDialingDashboard({
  selectedEmployeeId,
  onCallLogged,
}: LeadDialingDashboardProps) {
  const { user, isAdmin, isSubAdmin } = useAuth();
  const isSupervisor = isAdmin || isSubAdmin;

  // Selected Category & Sub-status filter
  const [selectedSource, setSelectedSource] = useState<WorkflowLeadSource>("fb_lead");
  const [selectedStatus, setSelectedStatus] = useState<WorkflowLeadStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Data states
  const [summary, setSummary] = useState<LeadSummaryResponse | null>(null);
  const [leads, setLeads] = useState<WorkflowLead[]>([]);
  const [totalLeads, setTotalLeads] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calling & Modal states
  const [activeCallLead, setActiveCallLead] = useState<WorkflowLead | null>(null);
  const [callOutcomeModalOpen, setCallOutcomeModalOpen] = useState(false);
  const [selectedOutcomeStatus, setSelectedOutcomeStatus] = useState<WorkflowLeadStatus>("fup");
  const [callNotes, setCallNotes] = useState("");
  const [callDurationSeconds, setCallDurationSeconds] = useState<number | undefined>(undefined);
  const [submittingOutcome, setSubmittingOutcome] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // New Lead Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateLeadPayload>({
    name: "",
    phone: "",
    source: "fb_lead",
    status: "fup",
    assigned_to_id: selectedEmployeeId || user?.id,
    notes: "",
  });
  const [creatingLead, setCreatingLead] = useState(false);
  const [executivesList, setExecutivesList] = useState<UserType[]>([]);

  // Delete Lead state (Admin / Sub-Admin only)
  const [leadToDelete, setLeadToDelete] = useState<WorkflowLead | null>(null);
  const [deletingLead, setDeletingLead] = useState(false);

  // Remarks & Call History Modal state
  const [historyModalLead, setHistoryModalLead] = useState<WorkflowLead | null>(null);
  const [historyLogs, setHistoryLogs] = useState<LeadCallLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Track pending native phone call
  const pendingCallRef = useRef<{
    lead: WorkflowLead;
    startedAt: number;
  } | null>(null);

  // ─── 1. Fetch Summary Counts ───────────────────────────────────────────────
  const fetchSummary = useCallback(async () => {
    try {
      const data = await api.leadWorkflow.getSummary(selectedEmployeeId);
      setSummary(data);
    } catch (err: any) {
      console.error("Failed to load lead summary:", err);
    }
  }, [selectedEmployeeId]);

  // ─── 2. Fetch Leads List ───────────────────────────────────────────────────
  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.leadWorkflow.getLeads({
        source: selectedSource,
        status: selectedStatus === "all" ? undefined : selectedStatus,
        search: searchQuery.trim() || undefined,
        employee_id: selectedEmployeeId,
        limit: 150,
      });
      setLeads(res.items);
      setTotalLeads(res.total);
    } catch (err: any) {
      console.error("Failed to load leads:", err);
      setError(err?.message || "Failed to load leads list.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedSource, selectedStatus, searchQuery, selectedEmployeeId]);

  // Load on mount and when filters change
  useEffect(() => {
    fetchSummary();
    fetchLeads();
  }, [fetchSummary, fetchLeads]);

  // Load employee list for admin assignment dropdown
  useEffect(() => {
    if (isSupervisor) {
      api.employees
        .list({ limit: 200, is_active: true })
        .then((res) => {
          setExecutivesList(Array.isArray(res) ? res : []);
        })
        .catch((err) => console.warn("Could not fetch executives list:", err));
    }
  }, [isSupervisor]);

  // ─── 3. Android Call Detection Event Listeners ─────────────────────────────
  useEffect(() => {
    const handleVisibilityChange = () => {
      // When executive returns to the app from the phone's native dialer
      if (document.visibilityState === "visible" && pendingCallRef.current) {
        const pending = pendingCallRef.current;
        const elapsed = Math.round((Date.now() - pending.startedAt) / 1000);
        pendingCallRef.current = null;

        // Open After-Call Status Modal automatically
        setActiveCallLead(pending.lead);
        setSelectedOutcomeStatus(pending.lead.status || "fup");
        setCallDurationSeconds(elapsed > 0 ? elapsed : undefined);
        setCallNotes("");
        setCallOutcomeModalOpen(true);
      }
    };

    const handleWindowFocus = () => {
      if (pendingCallRef.current) {
        handleVisibilityChange();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, []);

  // ─── 4. Initiate Call via Native Dialer ────────────────────────────────────
  const handleDial = (lead: WorkflowLead) => {
    // Clean phone number: remove spaces and dashes
    const cleanPhone = lead.phone.replace(/[^0-9+]/g, "");

    // Record pending call context for visibility return trigger
    pendingCallRef.current = {
      lead,
      startedAt: Date.now(),
    };

    // Open phone's native dialer
    window.location.href = `tel:${cleanPhone}`;
  };

  // Remarks & Activity History viewer
  const handleOpenHistory = async (lead: WorkflowLead) => {
    setHistoryModalLead(lead);
    setHistoryLogs(lead.call_logs || []);
    try {
      setHistoryLoading(true);
      const logs = await api.leadWorkflow.getCallLogs(lead.id);
      setHistoryLogs(logs);
    } catch (err: any) {
      console.error("Failed to load call logs:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Manual Trigger in case auto-return is missed
  const handleOpenOutcomeManually = (lead: WorkflowLead) => {
    setActiveCallLead(lead);
    setSelectedOutcomeStatus(lead.status || "fup");
    setCallDurationSeconds(undefined);
    setCallNotes("");
    setCallOutcomeModalOpen(true);
  };

  // ─── 5. Submit Call Outcome & Move Status ──────────────────────────────────
  const handleConfirmOutcome = async () => {
    if (!activeCallLead) return;

    // Call Remarks / Customer Feedback is mandatory for all statuses except NR
    if (selectedOutcomeStatus !== "nr" && !callNotes.trim()) {
      alert("Call Remarks / Customer Feedback is required for this status.");
      return;
    }

    try {
      setSubmittingOutcome(true);
      const updatedLead = await api.leadWorkflow.recordCallOutcome(activeCallLead.id, {
        new_status: selectedOutcomeStatus,
        call_duration_seconds: callDurationSeconds,
        notes: callNotes.trim() || undefined,
      });

      // Show success toast
      const statusLabel =
        ALL_OUTCOME_STATUSES.find((s) => s.key === selectedOutcomeStatus)?.badge ||
        selectedOutcomeStatus.toUpperCase();
      setSuccessToast(
        `✓ Call saved! Lead moved to ${statusLabel} & daily call report updated.`
      );
      setTimeout(() => setSuccessToast(null), 4500);

      // Close modal
      setCallOutcomeModalOpen(false);
      setActiveCallLead(null);

      // Refresh list & summary counts
      await Promise.all([fetchSummary(), fetchLeads()]);

      // Notify parent to refresh daily sheet
      if (onCallLogged) {
        onCallLogged();
      }
    } catch (err: any) {
      alert(`Error saving call outcome: ${err?.message || "Unknown error"}`);
    } finally {
      setSubmittingOutcome(false);
    }
  };

  // ─── 6. Create New Lead ────────────────────────────────────────────────────
  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim() || !createForm.phone.trim()) {
      alert("Please provide both customer name and phone number.");
      return;
    }

    try {
      setCreatingLead(true);
      await api.leadWorkflow.createLead({
        ...createForm,
        assigned_to_id: isSupervisor
          ? createForm.assigned_to_id || selectedEmployeeId || user?.id
          : user?.id,
      });

      setCreateModalOpen(false);
      setCreateForm({
        name: "",
        phone: "",
        source: selectedSource,
        status: "fup",
        assigned_to_id: selectedEmployeeId || user?.id,
        notes: "",
      });

      setSuccessToast("✓ Lead created successfully!");
      setTimeout(() => setSuccessToast(null), 3500);

      await Promise.all([fetchSummary(), fetchLeads()]);
    } catch (err: any) {
      alert(`Failed to create lead: ${err?.message || "Unknown error"}`);
    } finally {
      setCreatingLead(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!leadToDelete) return;
    try {
      setDeletingLead(true);
      await api.leadWorkflow.deleteLead(leadToDelete.id);
      setSuccessToast(`✓ Lead "${leadToDelete.name}" deleted successfully.`);
      setTimeout(() => setSuccessToast(null), 3500);
      setLeadToDelete(null);
      await Promise.all([fetchSummary(), fetchLeads()]);
      onCallLogged?.();
    } catch (err: any) {
      alert(`Failed to delete lead: ${err?.message || "Unknown error"}`);
    } finally {
      setDeletingLead(false);
    }
  };

  // Current category counts helper
  const currentCategoryCounts = summary ? summary[selectedSource] : null;

  return (
    <div className="space-y-5">
      {/* ── Toast Notification ────────────────────────────────────────────── */}
      {successToast && (
        <div className="fixed top-4 right-4 z-50 animate-in fade-in slide-in-from-top-3 duration-200">
          <div className="bg-emerald-800 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 border border-emerald-600 text-xs sm:text-sm font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
            <span>{successToast}</span>
          </div>
        </div>
      )}

      {/* ── Top Bar: Title & Action Button ─────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
            <PhoneCall className="w-5 h-5 text-emerald-600" />
            <span>Lead Dialing & Calling Workflow</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            1-Click dial leads, auto-record call outcomes, and update daily reporting seamlessly.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setRefreshing(true);
              Promise.all([fetchSummary(), fetchLeads()]);
            }}
            disabled={refreshing}
            className="p-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition text-xs font-semibold flex items-center gap-1.5"
            title="Refresh list and counts"
          >
            <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCreateForm((prev) => ({
                ...prev,
                source: selectedSource,
                assigned_to_id: selectedEmployeeId || user?.id,
              }));
              setCreateModalOpen(true);
            }}
            className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white px-3.5 py-2 rounded-xl transition text-xs font-bold flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>New Lead</span>
          </button>
        </div>
      </div>

      {/* ── 1. Category Switcher (4 Sources) ─────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {SOURCES.map((src) => {
          const isSelected = selectedSource === src.key;
          const counts = summary ? summary[src.key] : null;
          const total = counts ? counts.total : 0;
          const Icon = src.icon;

          return (
            <button
              key={src.key}
              type="button"
              onClick={() => {
                setSelectedSource(src.key);
                setSelectedStatus("all"); // reset status filter when switching source
              }}
              className={cn(
                "p-3.5 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between group",
                isSelected
                  ? src.activeBg + " shadow-md"
                  : "bg-white hover:bg-slate-50 text-slate-800 border-slate-200"
              )}
            >
              <div className="flex items-center justify-between w-full">
                <div
                  className={cn(
                    "w-8 h-8 rounded-xl flex items-center justify-center transition-colors",
                    isSelected ? "bg-white/20 text-white" : "bg-slate-100 " + src.iconColor
                  )}
                >
                  <Icon className="w-4.5 h-4.5" />
                </div>
                <span
                  className={cn(
                    "text-xs font-extrabold px-2.5 py-0.5 rounded-full border",
                    isSelected
                      ? src.badgeActiveBg
                      : "bg-slate-100 text-slate-700 border-slate-200"
                  )}
                >
                  {total} Leads
                </span>
              </div>

              <div className="mt-3">
                <span
                  className={cn(
                    "text-xs sm:text-sm font-bold block",
                    isSelected ? "text-white" : "text-slate-900"
                  )}
                >
                  {src.label}
                </span>
                <span
                  className={cn(
                    "text-[11px] block truncate mt-0.5 font-medium",
                    isSelected ? "text-white/85" : "text-slate-500"
                  )}
                >
                  HP: {counts?.hp || 0} • P: {counts?.p || 0} • FUP: {counts?.fup || 0}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── 2. Inside Category: HP, P, FUP Status Chips with Live Counts ─────── */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-slate-600 mr-1">Status Pool:</span>

            {/* All Statuses Chip */}
            <button
              type="button"
              onClick={() => setSelectedStatus("all")}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5",
                selectedStatus === "all"
                  ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-200"
              )}
            >
              <span>All Active</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/25">
                {currentCategoryCounts?.total || 0}
              </span>
            </button>

            {/* HP, P, FUP Chips */}
            {STATUSES.map((st) => {
              const isActive = selectedStatus === st.key;
              const count = currentCategoryCounts ? currentCategoryCounts[st.key] : 0;

              return (
                <button
                  key={st.key}
                  type="button"
                  onClick={() => setSelectedStatus(st.key)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5",
                    isActive
                      ? st.chipBg + " shadow-xs"
                      : "bg-white text-slate-700 hover:bg-slate-50 border-slate-200"
                  )}
                >
                  <span>{st.fullLabel}</span>
                  <span
                    className={cn(
                      "text-[10px] font-extrabold px-1.5 py-0.2 rounded-full",
                      isActive ? "bg-black/10" : "bg-slate-100 text-slate-700"
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name or phone..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900"
            />
          </div>
        </div>

        {/* ── 3. Leads List (Cards & Table) ─────────────────────────────────── */}
        {loading ? (
          <div className="py-12 text-center text-slate-500 space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600 mx-auto" />
            <p className="text-xs">Loading leads...</p>
          </div>
        ) : error ? (
          <div className="p-4 bg-rose-50 text-rose-700 text-xs rounded-xl border border-rose-200 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : leads.length === 0 ? (
          <div className="py-12 text-center text-slate-500 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 space-y-2">
            <Users className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs font-semibold text-slate-700">No leads found in this pool</p>
            <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
              Click &quot;New Lead&quot; above to create a lead under this category, or switch status.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
            {leads.map((lead) => {
              const statusBadge =
                STATUSES.find((s) => s.key === lead.status) || {
                  label: lead.status?.toUpperCase() || "NEW",
                  badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
                };

              return (
                <div
                  key={lead.id}
                  className="p-3 sm:p-3.5 hover:bg-slate-50/70 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  {/* Customer Info */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-900 truncate">
                        {lead.name}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] font-extrabold px-2 py-0.5 rounded-full border",
                          statusBadge.badgeClass
                        )}
                      >
                        {statusBadge.label}
                      </span>
                      <span className="text-[10.5px] text-slate-500 font-mono bg-slate-100 px-1.5 py-0.2 rounded">
                        {lead.phone}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>Added: {lead.lead_date}</span>
                      </span>

                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>
                          {lead.last_called_at
                            ? `Called: ${new Date(lead.last_called_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                            : "Not called yet"}
                        </span>
                      </span>

                      <span className="text-slate-400 font-medium">
                        Dials: <strong className="text-slate-700">{lead.total_calls_count}</strong>
                      </span>

                      {lead.assigned_to_name && (
                        <span className="text-slate-500">
                          Owner: <strong className="text-slate-700">{lead.assigned_to_name}</strong>
                        </span>
                      )}
                    </div>

                    {/* Latest Remark Preview */}
                    {lead.call_logs && lead.call_logs.length > 0 && lead.call_logs[0]?.notes ? (
                      <div className="text-[11px] text-slate-700 bg-slate-50 p-2 rounded-xl border border-slate-200 flex items-start gap-1.5 mt-1">
                        <MessageSquare className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-slate-800">Latest Remark: </span>
                          <span className="italic text-slate-700">&quot;{lead.call_logs[0].notes}&quot;</span>
                          {lead.call_logs[0].called_at && (
                            <span className="text-[10px] text-slate-400 block mt-0.5">
                              by {lead.call_logs[0].caller_name || "Executive"} •{" "}
                              {new Date(lead.call_logs[0].called_at).toLocaleString([], {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : lead.notes ? (
                      <p className="text-[11px] text-slate-600 italic bg-amber-50/60 p-1.5 rounded-lg border border-amber-100/60 mt-1">
                        &quot;{lead.notes}&quot;
                      </p>
                    ) : null}
                  </div>

                  {/* Actions: Remarks History, Log Status, Dial Button */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center flex-wrap">
                    {/* View Remarks Button */}
                    <button
                      type="button"
                      onClick={() => handleOpenHistory(lead)}
                      className="px-2.5 py-1.5 text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition text-xs font-semibold flex items-center gap-1.5"
                      title="View all remarks & call history"
                    >
                      <History className="w-3.5 h-3.5 text-slate-500" />
                      <span className="hidden sm:inline">Remarks</span>
                      <span className="sm:hidden">Notes</span>
                      {lead.call_logs && lead.call_logs.length > 0 && (
                        <span className="text-[10px] bg-slate-200 text-slate-800 font-extrabold px-1.5 py-0.2 rounded-full">
                          {lead.call_logs.length}
                        </span>
                      )}
                    </button>

                    {/* Lead Stage Update button */}
                    <button
                      type="button"
                      onClick={() => handleOpenOutcomeManually(lead)}
                      className="px-2.5 py-1.5 text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition text-xs font-semibold"
                      title="Update lead stage and call status"
                    >
                      Lead Stage Update
                    </button>

                    {/* Dial Button */}
                    <button
                      type="button"
                      onClick={() => handleDial(lead)}
                      className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white px-3.5 py-1.5 rounded-xl transition text-xs font-bold flex items-center gap-1.5 shadow-sm"
                    >
                      <Phone className="w-3.5 h-3.5 fill-current" />
                      <span>Dial</span>
                    </button>

                    {/* Admin Delete Lead button */}
                    {isSupervisor && (
                      <button
                        type="button"
                        onClick={() => setLeadToDelete(lead)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition text-xs"
                        title="Delete Lead (Admin Only)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 4. After-Call Outcome Modal ──────────────────────────────────────── */}
      {callOutcomeModalOpen && activeCallLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4 text-slate-900">
            {/* Modal Header */}
            <div className="border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs uppercase tracking-wider mb-1">
                <PhoneCall className="w-3.5 h-3.5" />
                <span>Lead Stage Update</span>
              </div>
              <h3 className="text-base font-bold text-slate-900">
                {activeCallLead.name}
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                {activeCallLead.phone}
                {callDurationSeconds !== undefined && (
                  <span className="ml-2 font-sans font-semibold text-emerald-600">
                    (~{callDurationSeconds}s elapsed)
                  </span>
                )}
              </p>
            </div>

            {/* Status Selectors (5 Options: HP, P, FUP, NI, NR) */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                Select Lead Stage / Status:
              </label>

              <div className="grid grid-cols-1 gap-2">
                {ALL_OUTCOME_STATUSES.map((st) => {
                  const isSelected = selectedOutcomeStatus === st.key;

                  return (
                    <button
                      key={st.key}
                      type="button"
                      onClick={() => setSelectedOutcomeStatus(st.key)}
                      className={cn(
                        "p-2.5 rounded-xl border text-left transition flex items-center justify-between",
                        isSelected
                          ? st.color + " shadow-sm font-bold"
                          : "bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={cn(
                            "w-8 h-7 rounded-lg flex items-center justify-center font-extrabold text-xs shrink-0 border",
                            isSelected
                              ? "bg-white/20 text-white border-white/30"
                              : "bg-white text-slate-800 border-slate-300"
                          )}
                        >
                          {st.badge}
                        </span>
                        <div className="min-w-0">
                          <span className="text-xs font-bold block truncate">
                            {st.label}
                          </span>
                          <span
                            className={cn(
                              "text-[10px] block truncate",
                              isSelected ? "text-white/80" : "text-slate-500"
                            )}
                          >
                            {st.desc}
                          </span>
                        </div>
                      </div>

                      {isSelected && <CheckCircle2 className="w-4 h-4 shrink-0 text-white" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick Call Note */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                  <span>Call Remarks / Customer Feedback</span>
                  {selectedOutcomeStatus === "nr" ? (
                    <span className="text-slate-400 font-normal text-[11px]">(Optional for NR)</span>
                  ) : (
                    <span className="text-rose-600 font-bold text-xs">* (Required)</span>
                  )}
                </label>
              </div>
              <textarea
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
                placeholder={
                  selectedOutcomeStatus === "nr"
                    ? "Optional notes for Not Reached (e.g. Ringing, phone switched off, line busy)..."
                    : "Mandatory: Enter client feedback, discussion points, budget, next steps..."
                }
                rows={3}
                required={selectedOutcomeStatus !== "nr"}
                className={cn(
                  "w-full p-2.5 text-xs bg-slate-50 border rounded-xl focus:outline-none focus:ring-2 text-slate-900 transition",
                  selectedOutcomeStatus !== "nr" && !callNotes.trim()
                    ? "border-rose-300 focus:ring-rose-400 bg-rose-50/20"
                    : "border-slate-200 focus:ring-emerald-500"
                )}
              />
              {selectedOutcomeStatus !== "nr" && !callNotes.trim() && (
                <p className="text-[11px] text-rose-600 mt-1 flex items-center gap-1 font-medium">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Remarks are mandatory for {selectedOutcomeStatus.toUpperCase()} status.</span>
                </p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setCallOutcomeModalOpen(false);
                  setActiveCallLead(null);
                }}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 rounded-xl transition"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmOutcome}
                disabled={submittingOutcome || (selectedOutcomeStatus !== "nr" && !callNotes.trim())}
                className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white px-4 py-2 rounded-xl transition text-xs font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {submittingOutcome ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Confirm & Update Stage</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 5. Create Lead Modal ─────────────────────────────────────────────── */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4 text-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Create New Lead</h3>
                <p className="text-xs text-slate-500">
                  Add a prospective customer to your dialing inventory
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateLead} className="space-y-3.5">
              {/* Customer Name */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Customer Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="e.g. Mr. Rafiqul Islam"
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900"
                />
              </div>

              {/* Phone Number */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Phone Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={createForm.phone}
                  onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                  placeholder="01XXXXXXXXX"
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900"
                />
              </div>

              {/* Source & Initial Status Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Lead Source
                  </label>
                  <select
                    value={createForm.source}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        source: e.target.value as WorkflowLeadSource,
                      })
                    }
                    className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900"
                  >
                    {SOURCES.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Initial Status
                  </label>
                  <select
                    value={createForm.status}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        status: e.target.value as WorkflowLeadStatus,
                      })
                    }
                    className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900"
                  >
                    <option value="fup">FUP (Follow Up)</option>
                    <option value="p">P (Potential)</option>
                    <option value="hp">HP (High Potential)</option>
                  </select>
                </div>
              </div>

              {/* Admin: Assign to Executive dropdown */}
              {isSupervisor && (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Assign to Sales Executive
                  </label>
                  <select
                    value={createForm.assigned_to_id || user?.id}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        assigned_to_id: Number(e.target.value),
                      })
                    }
                    className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 font-medium"
                  >
                    {executivesList.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name} ({formatEmployeeId(emp.id, emp.created_at)}) -{" "}
                        {emp.designation || emp.role}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Initial Remarks */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Initial Notes (Optional)
                </label>
                <textarea
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  placeholder="e.g. Inquired about Kuakata luxury resort project..."
                  rows={2}
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 rounded-xl transition"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={creatingLead}
                  className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white px-4 py-2 rounded-xl transition text-xs font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  {creatingLead ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Create Lead</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 6. Admin Delete Confirmation Modal ────────────────────────────── */}
      {leadToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4 text-slate-900">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Lead</h3>
                <p className="text-xs text-slate-500">Admin Action</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete lead <strong className="text-slate-900">{leadToDelete.name}</strong> (<span className="font-mono">{leadToDelete.phone}</span>)? This will permanently remove this lead from the calling workflow.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setLeadToDelete(null)}
                disabled={deletingLead}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deletingLead}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-95 rounded-xl transition flex items-center gap-1.5 shadow-sm disabled:opacity-60"
              >
                {deletingLead ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Permanently</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 7. Lead Remarks & Activity History Modal (Mobile & Desktop) ────── */}
      {historyModalLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 text-slate-900 overflow-hidden">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-start justify-between gap-3 bg-slate-50/70 shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-base font-bold text-slate-900 truncate">
                    {historyModalLead.name}
                  </span>
                  {(() => {
                    const st = STATUSES.find((s) => s.key === historyModalLead.status);
                    return (
                      <span
                        className={cn(
                          "text-[10px] font-extrabold px-2 py-0.5 rounded-full border",
                          st ? st.badgeClass : "bg-slate-100 text-slate-700 border-slate-200"
                        )}
                      >
                        {st?.label || historyModalLead.status.toUpperCase()}
                      </span>
                    );
                  })()}
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-600 font-mono">
                  <span>{historyModalLead.phone}</span>
                  <a
                    href={`tel:${historyModalLead.phone}`}
                    className="inline-flex items-center gap-1 text-[11px] font-sans font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200"
                  >
                    <Phone className="w-3 h-3 fill-current" />
                    <span>Call Now</span>
                  </a>
                </div>

                <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-2 flex-wrap">
                  {historyModalLead.assigned_to_name && (
                    <span className="flex items-center gap-1">
                      <UserCheck className="w-3 h-3 text-slate-400" />
                      <span>
                        Executive: <strong className="text-slate-700">{historyModalLead.assigned_to_name}</strong>
                      </span>
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    <span>Added: {historyModalLead.lead_date}</span>
                  </span>
                  <span>
                    Dials: <strong className="text-slate-700">{historyModalLead.total_calls_count}</strong>
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setHistoryModalLead(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Remarks Timeline */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1 min-h-[180px]">
              {historyLoading ? (
                <div className="py-8 text-center text-slate-500 space-y-2">
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-600 mx-auto" />
                  <p className="text-xs">Loading remarks history...</p>
                </div>
              ) : historyLogs.length === 0 ? (
                <div className="py-8 text-center text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200 p-4 space-y-2">
                  <MessageSquare className="w-6 h-6 text-slate-300 mx-auto" />
                  <p className="text-xs font-semibold text-slate-700">No call remarks recorded yet</p>
                  <p className="text-[11px] text-slate-400">
                    When calls are placed and status is logged, detailed customer feedback and timestamps will appear here.
                  </p>
                  {historyModalLead.notes && (
                    <div className="text-left mt-3 pt-3 border-t border-slate-200 text-xs">
                      <p className="text-[11px] font-bold text-slate-500 uppercase">Initial Note on Creation:</p>
                      <p className="text-slate-700 italic bg-white p-2 rounded-lg border border-slate-200 mt-1">
                        &quot;{historyModalLead.notes}&quot;
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500 pb-1 border-b border-slate-100">
                    <span className="font-bold text-slate-700">
                      All Customer Remarks &amp; Updates ({historyLogs.length})
                    </span>
                    <span className="text-[11px]">Newest first</span>
                  </div>

                  {historyLogs.map((log) => {
                    const toStatusObj = ALL_OUTCOME_STATUSES.find((s) => s.key === log.to_status);
                    const fromStatusObj = ALL_OUTCOME_STATUSES.find((s) => s.key === log.from_status);

                    return (
                      <div
                        key={log.id}
                        className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 space-y-2 hover:bg-slate-50 transition"
                      >
                        {/* Top line: Date, Time & Caller */}
                        <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                          <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>
                              {log.called_at
                                ? new Date(log.called_at).toLocaleString([], {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "N/A"}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 text-[11px] text-slate-600 font-medium">
                            <UserCheck className="w-3 h-3 text-slate-400" />
                            <span>{log.caller_name || "Sales Executive"}</span>
                          </div>
                        </div>

                        {/* Middle line: Status Transition & Duration */}
                        <div className="flex items-center gap-2 flex-wrap text-[11px]">
                          <span className="text-slate-500">Status:</span>
                          {log.from_status && (
                            <>
                              <span className="font-bold text-slate-600 bg-slate-200 px-1.5 py-0.5 rounded">
                                {fromStatusObj?.badge || log.from_status.toUpperCase()}
                              </span>
                              <ArrowRight className="w-3 h-3 text-slate-400" />
                            </>
                          )}
                          <span
                            className={cn(
                              "font-bold px-2 py-0.5 rounded text-white text-[11px]",
                              toStatusObj?.key === "hp"
                                ? "bg-emerald-600"
                                : toStatusObj?.key === "p"
                                ? "bg-blue-600"
                                : toStatusObj?.key === "fup"
                                ? "bg-amber-600"
                                : toStatusObj?.key === "ni"
                                ? "bg-rose-600"
                                : "bg-slate-600"
                            )}
                          >
                            {toStatusObj?.badge || log.to_status.toUpperCase()} - {toStatusObj?.label || ""}
                          </span>

                          {log.call_duration_seconds !== null &&
                            log.call_duration_seconds !== undefined &&
                            log.call_duration_seconds > 0 && (
                              <span className="text-slate-400 font-mono text-[10.5px]">
                                ({log.call_duration_seconds}s)
                              </span>
                            )}
                        </div>

                        {/* Bottom: Remarks text */}
                        {log.notes ? (
                          <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 leading-relaxed font-sans">
                            <span className="font-bold text-slate-500 text-[10.5px] uppercase block mb-0.5">
                              Remarks / Feedback:
                            </span>
                            &quot;{log.notes}&quot;
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-400 italic">
                            No remarks recorded (e.g. Not Reached).
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer with Quick Log Action */}
            <div className="p-3 sm:p-4 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setHistoryModalLead(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-xl transition"
              >
                Close
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const lead = historyModalLead;
                    setHistoryModalLead(null);
                    handleOpenOutcomeManually(lead);
                  }}
                  className="px-3.5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition flex items-center gap-1.5 shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Lead Stage Update</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const lead = historyModalLead;
                    setHistoryModalLead(null);
                    handleDial(lead);
                  }}
                  className="px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition flex items-center gap-1.5 shadow-sm"
                >
                  <Phone className="w-3.5 h-3.5 fill-current" />
                  <span>Dial Now</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
