"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  PhoneCall,
  Save,
  Send,
  Lock,
  Calendar,
  AlertCircle,
  Trash2,
  Printer,
  LayoutGrid,
  Table2,
  Flame,
  Target,
  Clock,
  XCircle,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Users,
  UserPlus,
  Phone,
  Edit2,
  CheckCircle2,
  Cloud,
  RefreshCw,
  FileSpreadsheet,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
  Modal,
  Alert,
  Tooltip,
} from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import { SupervisorBar } from "@/components/supervisor-bar";
import {
  LEAD_CATEGORIES,
  LeadCategory,
  CallActivityEntry,
  MeetingActivityEntry,
  Report,
  ClientContactEntry,
} from "@/types";
import { getDhakaToday, formatReadableDate, formatEmployeeId } from "@/lib/utils";
import { exportFullReportToCSV } from "@/lib/export-report-csv";

/**
 * Mobile-friendly touch stepper input with prominent up/down increaser arrows.
 */
function MobileNumberInput({
  value,
  onChange,
  onStep,
  disabled,
  placeholder = "0",
  borderColor = "border-slate-300",
  arrowColor = "text-slate-600 hover:text-slate-900",
  textSize = "text-base",
}: {
  value: number | null | undefined;
  onChange: (val: string) => void;
  onStep: (delta: number) => void;
  disabled?: boolean;
  placeholder?: string;
  borderColor?: string;
  arrowColor?: string;
  textSize?: string;
}) {
  return (
    <div className="relative flex items-center w-full">
      <input
        type="number"
        min="0"
        disabled={disabled}
        value={value ?? ""}
        onChange={(ev) => onChange(ev.target.value)}
        placeholder={placeholder}
        className={`w-full text-center pl-1 pr-6 py-2 ${textSize} font-bold bg-white border ${borderColor} rounded-lg focus:ring-2 focus:ring-emerald-600 focus:outline-none text-slate-900 shadow-2xs disabled:bg-slate-50 disabled:text-slate-500`}
      />
      <div className="absolute right-0.5 inset-y-0 flex flex-col justify-center -space-y-1">
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={(ev) => {
            ev.preventDefault();
            onStep(1);
          }}
          className={`px-1 py-0.5 ${arrowColor} hover:bg-slate-100 rounded active:scale-125 transition-all disabled:opacity-30`}
          title="Increase amount"
          aria-label="Increase"
        >
          <ChevronUp className="w-3.5 h-3.5 stroke-[2.5]" />
        </button>
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={(ev) => {
            ev.preventDefault();
            onStep(-1);
          }}
          className={`px-1 py-0.5 ${arrowColor} hover:bg-slate-100 rounded active:scale-125 transition-all disabled:opacity-30`}
          title="Decrease amount"
          aria-label="Decrease"
        >
          <ChevronDown className="w-3.5 h-3.5 stroke-[2.5]" />
        </button>
      </div>
    </div>
  );
}

function DailyCallActivityContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, isAdmin, isSubAdmin } = useAuth();
  const isSupervisor = isAdmin || isSubAdmin;

  const today = getDhakaToday();
  const initialDate = searchParams.get("date") || today;
  const paramEmpId = searchParams.get("employee_id");
  const [selectedEmpId, setSelectedEmpId] = useState<number | undefined>(
    paramEmpId ? Number(paramEmpId) : undefined
  );

  useEffect(() => {
    if (paramEmpId) {
      setSelectedEmpId(Number(paramEmpId));
    }
  }, [paramEmpId]);

  const [reportDate, setReportDate] = useState<string>(initialDate);

  const handleSelectEmployee = useCallback((empId: number) => {
    setSelectedEmpId(empId);
    router.replace(`/calls?date=${reportDate}&employee_id=${empId}`);
  }, [reportDate, router]);

  // Report state
  const [report, setReport] = useState<Report | null>(null);
  const isLocked = report?.is_submitted ?? false;

  const [entries, setEntries] = useState<Record<LeadCategory, CallActivityEntry>>(() => {
    const init: Record<string, CallActivityEntry> = {};
    for (const cat of LEAD_CATEGORIES) {
      init[cat.key] = {
        lead_category: cat.key,
        till_today_status: null,
        slot_10_to_1: null,
        slot_2_to_5: null,
        slot_5_to_6: null,
        total_dialed: null,
        total_connected: null,
        hp_count: null,
        p_count: null,
        fub_count: null,
        ni_count: null,
      };
    }
    return init as Record<LeadCategory, CallActivityEntry>;
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const [adminDeleteModalOpen, setAdminDeleteModalOpen] = useState(false);
  const [deletingReport, setDeletingReport] = useState(false);
  const [downloadingCsv, setDownloadingCsv] = useState(false);

  // Auto-Save State & Timers
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "unsaved" | "saving" | "saved" | "error">("idle");
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const isInitialMount = useRef(true);
  const isDirtyRef = useRef(false);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Mobile App View vs Spreadsheet Table: Default to "table" on PC, "cards" on mobile
  const [viewMode, setViewMode] = useState<"cards" | "table">("table");
  const [hasUserSwitchedView, setHasUserSwitchedView] = useState(false);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>("all");

  // Automatically adjust view mode on mount based on screen width (Table on PC >= 768px, Cards on Mobile < 768px)
  // Stops auto-adjusting once user manually toggles
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => {
      if (!hasUserSwitchedView) {
        const isMobile = window.innerWidth < 768;
        setViewMode(isMobile ? "cards" : "table");
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [hasUserSwitchedView]);

  // Priority Client Follow-Up Directory (HP / FUB / P Leads)
  const [clientContacts, setClientContacts] = useState<ClientContactEntry[]>([]);
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [editingClientIndex, setEditingClientIndex] = useState<number | null>(null);
  const [clientFormName, setClientFormName] = useState("");
  const [clientFormPhone, setClientFormPhone] = useState("");
  const [clientFormCategory, setClientFormCategory] = useState<"HP" | "P" | "FUB" | "NI" | "CX" | "Other">("HP");
  const [clientFormFollowUp, setClientFormFollowUp] = useState("");
  const [clientFormNotes, setClientFormNotes] = useState("");
  const [rawReportNotes, setRawReportNotes] = useState("");

  const openAddClientModal = () => {
    setEditingClientIndex(null);
    setClientFormName("");
    setClientFormPhone("");
    setClientFormCategory("HP");
    setClientFormFollowUp("");
    setClientFormNotes("");
    setClientModalOpen(true);
  };

  const openEditClientModal = (idx: number) => {
    const c = clientContacts[idx];
    if (!c) return;
    setEditingClientIndex(idx);
    setClientFormName(c.client_name);
    setClientFormPhone(c.phone_number || "");
    setClientFormCategory(c.category);
    setClientFormFollowUp(c.follow_up_date || "");
    setClientFormNotes(c.discussion_notes || "");
    setClientModalOpen(true);
  };

  const handleSaveClientContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientFormName.trim()) return;

    const newContact: ClientContactEntry = {
      id:
        editingClientIndex !== null && clientContacts[editingClientIndex]?.id
          ? clientContacts[editingClientIndex].id
          : `client_${Date.now()}`,
      client_name: clientFormName.trim(),
      phone_number: clientFormPhone.trim() || undefined,
      category: clientFormCategory,
      follow_up_date: clientFormFollowUp || undefined,
      discussion_notes: clientFormNotes.trim() || undefined,
    };

    if (editingClientIndex !== null) {
      setClientContacts((prev) => {
        const next = [...prev];
        next[editingClientIndex] = newContact;
        return next;
      });
    } else {
      setClientContacts((prev) => [...prev, newContact]);
    }
    isDirtyRef.current = true;
    setAutoSaveStatus("unsaved");
    setClientModalOpen(false);
  };

  const handleDeleteClientContact = (idx: number) => {
    isDirtyRef.current = true;
    setAutoSaveStatus("unsaved");
    setClientContacts((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleDateStep = (days: number) => {
    try {
      const parts = reportDate.split("-").map(Number);
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      d.setDate(d.getDate() + days);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const nextDate = `${yyyy}-${mm}-${dd}`;
      setReportDate(nextDate);
      const empQuery = (isSupervisor ? selectedEmpId : undefined) ? `&employee_id=${selectedEmpId}` : "";
      router.replace(`/calls?date=${nextDate}${empQuery}`);
    } catch {
      // fallback
    }
  };

  // Load or initialize report for the selected date
  const loadReport = useCallback(async (dateStr: string, empId?: number) => {
    setLoading(true);
    setStatusMessage(null);
    isInitialMount.current = true;
    isDirtyRef.current = false;
    setAutoSaveStatus("idle");
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    try {
      let r: Report;
      try {
        r = await api.reports.getByDate(dateStr, empId);
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 404) {
          // Create draft report for date
          r = await api.reports.create(dateStr, empId);
        } else {
          throw err;
        }
      }
      setReport(r);

      // Parse client contacts from report.notes
      let parsedContacts: ClientContactEntry[] = [];
      let legacyNotes = "";
      if (r.notes) {
        try {
          const parsed = JSON.parse(r.notes);
          if (Array.isArray(parsed?.client_contacts)) {
            parsedContacts = parsed.client_contacts;
          }
          legacyNotes = parsed?.general_notes || "";
        } catch {
          legacyNotes = r.notes;
        }
      }
      setClientContacts(parsedContacts);
      setRawReportNotes(legacyNotes);

      // Load call activity entries
      const callData = await api.calls.get(r.id);

      if (callData && callData.entries && callData.entries.length > 0) {
        const loaded: Record<string, CallActivityEntry> = {};
        for (const cat of LEAD_CATEGORIES) {
          const found = callData.entries.find(
            (e) => e.lead_category === cat.key || e.lead_category === cat.label
          );
          const cf =
            callData.carry_forward?.categories?.[cat.key] ||
            callData.carry_forward?.categories?.[cat.label];
          const fallbackStart = cf?.prev_till_today ?? null;

          loaded[cat.key] = found
            ? {
                ...found,
                till_today_status: found.till_today_status ?? fallbackStart,
              }
            : {
                lead_category: cat.key,
                till_today_status: fallbackStart,
                slot_10_to_1: null,
                slot_2_to_5: null,
                slot_5_to_6: null,
                total_connected: null,
                hp_count: null,
                p_count: null,
                fub_count: null,
                ni_count: null,
              };
        }
        setEntries(loaded as Record<LeadCategory, CallActivityEntry>);
      } else {
        const reset: Record<string, CallActivityEntry> = {};
        for (const cat of LEAD_CATEGORIES) {
          const cf =
            callData?.carry_forward?.categories?.[cat.key] ||
            callData?.carry_forward?.categories?.[cat.label];
          reset[cat.key] = {
            lead_category: cat.key,
            till_today_status: cf?.prev_till_today ?? null,
            slot_10_to_1: null,
            slot_2_to_5: null,
            slot_5_to_6: null,
            total_connected: null,
            hp_count: null,
            p_count: null,
            fub_count: null,
            ni_count: null,
          };
        }
        setEntries(reset as Record<LeadCategory, CallActivityEntry>);
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setStatusMessage({ type: "error", text: err.message });
      } else {
        setStatusMessage({
          type: "error",
          text: "Failed to load report. Please verify connection to backend.",
        });
      }
    } finally {
      setLoading(false);
      setTimeout(() => {
        isInitialMount.current = false;
      }, 600);
    }
  }, []);

  useEffect(() => {
    if (isSupervisor && !selectedEmpId) return;
    loadReport(reportDate, isSupervisor ? selectedEmpId : undefined);
  }, [reportDate, selectedEmpId, isSupervisor, loadReport]);

  const handleCellChange = (
    category: LeadCategory,
    field: keyof CallActivityEntry,
    valStr: string
  ) => {
    if (report?.is_submitted) return;

    isDirtyRef.current = true;
    setAutoSaveStatus("unsaved");

    const trimmed = valStr.trim();
    const num = trimmed === "" ? null : Math.max(0, parseInt(trimmed, 10));
    setEntries((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [field]: isNaN(num as number) ? null : num,
      },
    }));
  };

  const handleStep = (
    category: LeadCategory,
    field: keyof CallActivityEntry,
    delta: number
  ) => {
    if (report?.is_submitted) return;
    isDirtyRef.current = true;
    setAutoSaveStatus("unsaved");
    const current = entries[category]?.[field];
    const curNum = typeof current === "number" ? current : 0;
    const next = Math.max(0, curNum + delta);
    handleCellChange(category, field, String(next));
  };

  // Status mapping for transfer calculations
  const CATEGORY_TO_STATUS: Record<string, "hp" | "p" | "fub" | "ni"> = useMemo(
    () => ({
      high_potential: "hp",
      potential: "p",
      follow_up: "fub",
      other_not_reached: "ni",
    }),
    []
  );

  // Automatic lead status transfer and remaining totals calculation
  const categoryCalculations = useMemo(() => {
    const res: Record<
      string,
      {
        start: number;
        movedOut: number;
        movedIn: number;
        finalTotal: number;
      }
    > = {};

    // 1. Starting leads and moved out for each category
    for (const cat of LEAD_CATEGORIES) {
      const e = entries[cat.key];
      const start = e?.till_today_status ?? 0;
      const hp = e?.hp_count ?? 0;
      const p = e?.p_count ?? 0;
      const fub = e?.fub_count ?? 0;
      const ni = e?.ni_count ?? 0;
      const selfStatus = CATEGORY_TO_STATUS[cat.key];

      let movedOut = 0;
      if (selfStatus) {
        if (selfStatus !== "hp") movedOut += hp;
        if (selfStatus !== "p") movedOut += p;
        if (selfStatus !== "fub") movedOut += fub;
        if (selfStatus !== "ni") movedOut += ni;
      } else {
        movedOut = hp + p + fub + ni;
      }

      res[cat.key] = {
        start,
        movedOut,
        movedIn: 0,
        finalTotal: start - movedOut,
      };
    }

    // 2. Moved in from other categories to status categories
    for (const cat of LEAD_CATEGORIES) {
      const selfStatus = CATEGORY_TO_STATUS[cat.key];
      if (selfStatus) {
        let movedIn = 0;
        for (const otherCat of LEAD_CATEGORIES) {
          if (otherCat.key !== cat.key) {
            const oe = entries[otherCat.key];
            if (selfStatus === "hp") movedIn += oe?.hp_count ?? 0;
            else if (selfStatus === "p") movedIn += oe?.p_count ?? 0;
            else if (selfStatus === "fub") movedIn += oe?.fub_count ?? 0;
            else if (selfStatus === "ni") movedIn += oe?.ni_count ?? 0;
          }
        }
        res[cat.key].movedIn = movedIn;
        res[cat.key].finalTotal = Math.max(0, res[cat.key].start - res[cat.key].movedOut + movedIn);
      } else {
        res[cat.key].finalTotal = Math.max(0, res[cat.key].start - res[cat.key].movedOut);
      }
    }

    return res;
  }, [entries, CATEGORY_TO_STATUS]);

  // Calculated totals across all categories (Call Activity)
  const totals = useMemo(() => {
    let slot1 = 0;
    let slot2 = 0;
    let slot3 = 0;
    let tillToday = 0;
    let hp = 0;
    let p = 0;
    let fub = 0;
    let ni = 0;
    let totalConnected = 0;
    let totalUpdatedLeads = 0;

    for (const cat of LEAD_CATEGORIES) {
      const e = entries[cat.key];
      if (e) {
        if (e.slot_10_to_1) slot1 += e.slot_10_to_1;
        if (e.slot_2_to_5) slot2 += e.slot_2_to_5;
        if (e.slot_5_to_6) slot3 += e.slot_5_to_6;
        if (e.till_today_status) tillToday += e.till_today_status;
        if (e.hp_count) hp += e.hp_count;
        if (e.p_count) p += e.p_count;
        if (e.fub_count) fub += e.fub_count;
        if (e.ni_count) ni += e.ni_count;

        const rowConn =
          e.total_connected !== null && e.total_connected !== undefined
            ? e.total_connected
            : (e.hp_count || 0) + (e.p_count || 0) + (e.fub_count || 0) + (e.ni_count || 0);
        totalConnected += rowConn;
      }
      totalUpdatedLeads += categoryCalculations[cat.key]?.finalTotal ?? 0;
    }

    const slotDials = slot1 + slot2 + slot3;
    const totalDialed = Math.max(slotDials, totalConnected);
    const connectionRate =
      totalDialed > 0 ? Math.round((totalConnected / totalDialed) * 100) : 0;

    return {
      slot1,
      slot2,
      slot3,
      totalDialed,
      totalConnected,
      connectionRate,
      tillToday,
      totalUpdatedLeads,
      hp,
      p,
      fub,
      ni,
    };
  }, [entries, categoryCalculations]);

  // Build API upsert payload from current state
  const buildPayload = (): CallActivityEntry[] => {
    return LEAD_CATEGORIES.map((cat) => {
      const e = entries[cat.key];
      const rowConnected =
        e.total_connected !== null && e.total_connected !== undefined
          ? e.total_connected
          : ((e.hp_count || 0) + (e.p_count || 0) + (e.fub_count || 0) + (e.ni_count || 0));
      const slotDials = (e.slot_10_to_1 || 0) + (e.slot_2_to_5 || 0) + (e.slot_5_to_6 || 0);
      const rowDialed = Math.max(slotDials, rowConnected);

      return {
        lead_category: cat.key,
        till_today_status: e.till_today_status ?? null,
        slot_10_to_1: e.slot_10_to_1 ?? null,
        slot_2_to_5: e.slot_2_to_5 ?? null,
        slot_5_to_6: e.slot_5_to_6 ?? null,
        total_dialed: rowDialed > 0 ? rowDialed : null,
        total_connected: rowConnected > 0 ? rowConnected : null,
        hp_count: e.hp_count ?? null,
        p_count: e.p_count ?? null,
        fub_count: e.fub_count ?? null,
        ni_count: e.ni_count ?? null,
        notes: e.notes || null,
      };
    });
  };

  // Save Draft (Manual fallback)
  const handleSaveDraft = async () => {
    if (!report) return;
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    setSaving(true);
    setAutoSaveStatus("saving");
    setStatusMessage(null);
    try {
      const payload = buildPayload();
      await api.calls.upsert(report.id, payload);

      // Persist client contacts in report notes
      const serializedNotes = JSON.stringify({
        client_contacts: clientContacts,
        general_notes: rawReportNotes || null,
      });
      const updatedRep = await api.reports.update(report.id, { notes: serializedNotes });
      setReport(updatedRep);

      isDirtyRef.current = false;
      setAutoSaveStatus("saved");
      const now = new Date();
      setLastSavedTime(
        now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );

      setStatusMessage({
        type: "success",
        text: "Daily call activity and client directory draft saved successfully.",
      });
    } catch (err: unknown) {
      setAutoSaveStatus("error");
      if (err instanceof ApiError) {
        setStatusMessage({ type: "error", text: err.message });
      } else {
        setStatusMessage({
          type: "error",
          text: "Failed to save draft. Your entered data is preserved locally.",
        });
      }
    } finally {
      setSaving(false);
    }
  };

  // Debounced Auto-Save Effect (1.5 seconds)
  useEffect(() => {
    if (isInitialMount.current || loading || !report || isLocked) return;
    if (!isDirtyRef.current) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        setAutoSaveStatus("saving");
        const payload = buildPayload();
        await api.calls.upsert(report.id, payload);

        const serializedNotes = JSON.stringify({
          client_contacts: clientContacts,
          general_notes: rawReportNotes || null,
        });
        const updatedRep = await api.reports.update(report.id, { notes: serializedNotes });
        setReport(updatedRep);

        isDirtyRef.current = false;
        setAutoSaveStatus("saved");
        const now = new Date();
        setLastSavedTime(
          now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        );
      } catch (err) {
        console.error("Auto-save failed:", err);
        setAutoSaveStatus("error");
      }
    }, 1500);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [entries, clientContacts, rawReportNotes, report?.id, isLocked, loading]);

  // Prevent accidental loss if user navigates away with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current && !isLocked) {
        e.preventDefault();
        e.returnValue = "You have unsaved changes in your report. Are you sure you want to leave?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isLocked]);

  // Submit Final Report
  const handleSubmitReport = async () => {
    if (!report) return;
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    setSubmitting(true);
    setStatusMessage(null);
    try {
      // First save entries
      const payload = buildPayload();
      await api.calls.upsert(report.id, payload);

      // Save client directory
      const serializedNotes = JSON.stringify({
        client_contacts: clientContacts,
        general_notes: rawReportNotes || null,
      });
      await api.reports.update(report.id, { notes: serializedNotes });

      // Then submit report
      const updated = await api.reports.submit(report.id);
      setReport(updated);
      isDirtyRef.current = false;
      setAutoSaveStatus("saved");
      setSubmitModalOpen(false);
      setStatusMessage({
        type: "success",
        text: "Report submitted successfully! The report is now locked.",
      });

    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setStatusMessage({ type: "error", text: err.message });
      } else {
        setStatusMessage({
          type: "error",
          text: "Failed to submit report. Please review your entries and try again.",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdminDeleteReport = async () => {
    if (!report) return;
    setDeletingReport(true);
    try {
      await api.reports.delete(report.id);
      setAdminDeleteModalOpen(false);
      setStatusMessage({
        type: "success",
        text: "Daily report deleted by admin.",
      });
      setTimeout(() => {
        router.replace(`/calls?date=${today}`);
        window.location.reload();
      }, 500);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setStatusMessage({ type: "error", text: err.message });
      } else {
        setStatusMessage({ type: "error", text: "Failed to delete report." });
      }
    } finally {
      setDeletingReport(false);
    }
  };

  return (
    <DashboardLayout
      title="Daily Call Activity"
      subtitle={isSupervisor ? "Supervisor Review: Monitor and audit employee call dial sheets" : "Structured dial activity tracking and lead qualification by time slot"}
    >
      <div className="space-y-6 pb-24 md:pb-6">
        {/* Supervisor Review Mode Bar */}
        {isSupervisor && (
          <SupervisorBar
            isAdmin={isAdmin}
            isSubAdmin={isSubAdmin}
            selectedEmployeeId={selectedEmpId}
            onSelectEmployee={handleSelectEmployee}
            reportDate={reportDate}
            report={report}
            onReportUnlocked={(updated) => setReport(updated)}
            currentPage="calls"
          />
        )}
        {/* ── Header Controls Card ────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* Left: Date selector & Status */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-green-700" />
                  <span className="text-xs font-semibold text-slate-700 uppercase hidden sm:inline">Date:</span>
                  <button
                    type="button"
                    onClick={() => handleDateStep(-1)}
                    className="p-1 rounded hover:bg-slate-100 border border-slate-200 text-slate-600 active:scale-95 transition-transform"
                    title="Previous day"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <input
                    type="date"
                    value={reportDate}
                    onChange={(e) => {
                      setReportDate(e.target.value);
                      const empQuery = (isSupervisor ? selectedEmpId : undefined) ? `&employee_id=${selectedEmpId}` : "";
                      router.replace(`/calls?date=${e.target.value}${empQuery}`);
                    }}
                    className="border border-slate-300 rounded px-2.5 py-1 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-green-600 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => handleDateStep(1)}
                    className="p-1 rounded hover:bg-slate-100 border border-slate-200 text-slate-600 active:scale-95 transition-transform"
                    title="Next day"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="h-4 w-px bg-slate-200 hidden sm:block" />

                <div className="text-xs text-slate-600 flex items-center gap-1.5 flex-wrap">
                  <span className="text-slate-400">Employee: </span>
                  <span className="font-semibold text-slate-900">{report?.employee_name || (isSupervisor ? "Select Employee" : user?.full_name)}</span>
                  <span className="font-mono text-[10px] font-bold bg-green-50 text-green-800 border border-green-200 px-1.5 py-0.2 rounded">
                    {formatEmployeeId(report?.employee_id || selectedEmpId || user?.id)}
                  </span>
                </div>

                <Badge variant={isLocked ? "success" : "warning"}>
                  {isLocked ? "Finalized / Submitted" : "Draft (Editable)"}
                </Badge>
              </div>

              {/* Right: View Toggle & Save/Submit Actions */}
              <div className="flex flex-wrap items-center gap-2">
                {/* View Mode Toggle */}
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => {
                      setHasUserSwitchedView(true);
                      setViewMode("cards");
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                      viewMode === "cards"
                        ? "bg-white text-emerald-800 shadow-2xs font-bold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                    title="Mobile-friendly card view"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>Cards</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHasUserSwitchedView(true);
                      setViewMode("table");
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                      viewMode === "table"
                        ? "bg-white text-emerald-800 shadow-2xs font-bold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                    title="Desktop spreadsheet table"
                  >
                    <Table2 className="w-3.5 h-3.5" />
                    <span>Table</span>
                  </button>
                </div>

                <div className="h-4 w-px bg-slate-200 hidden sm:block" />

                {!isLocked && (
                  <div className="hidden sm:flex items-center gap-2.5">
                    {/* Live Auto-Save Status Indicator */}
                    <div className="flex items-center">
                      {autoSaveStatus === "saving" && (
                        <span className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200 animate-pulse font-medium">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-600" />
                          Auto-saving...
                        </span>
                      )}
                      {autoSaveStatus === "saved" && (
                        <span className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Saved {lastSavedTime ? `at ${lastSavedTime}` : "automatically"}
                        </span>
                      )}
                      {autoSaveStatus === "unsaved" && (
                        <span className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200 font-medium">
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                          Unsaved changes
                        </span>
                      )}
                      {autoSaveStatus === "error" && (
                        <button
                          type="button"
                          onClick={handleSaveDraft}
                          className="flex items-center gap-1.5 text-xs text-rose-700 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200 font-medium hover:bg-rose-100"
                          title="Click to retry saving"
                        >
                          <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                          Auto-save failed (Retry)
                        </button>
                      )}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSaveDraft}
                      loading={saving}
                      disabled={loading}
                      title="Manual draft save fallback"
                    >
                      <Save className="w-4 h-4 mr-1.5" />
                      Save Draft
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setSubmitModalOpen(true)}
                      disabled={loading || saving}
                    >
                      <Send className="w-4 h-4 mr-1.5" />
                      Submit Report
                    </Button>
                  </div>
                )}
                {isLocked && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded border border-emerald-200 font-medium">
                    <Lock className="w-3.5 h-3.5" />
                    Locked for Edits
                  </div>
                )}
                {report && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(`/reports/${report.id}/print`, "_blank")}
                      title="Print / Save PDF Report"
                    >
                      <Printer className="w-4 h-4 mr-1.5" />
                      Print PDF
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        if (!report) return;
                        try {
                          setDownloadingCsv(true);
                          const [sumRes, meetRes, salesRes] = await Promise.allSettled([
                            api.reports.getSummary(report.id),
                            api.meetings.get(report.id),
                            api.sales.get(report.id),
                          ]);

                          const summaryData = sumRes.status === "fulfilled" ? sumRes.value : null;
                          const rawMeet = meetRes.status === "fulfilled" ? meetRes.value : [];
                          const meetList = Array.isArray(rawMeet)
                            ? rawMeet
                            : (rawMeet as unknown as { entries?: MeetingActivityEntry[] })?.entries || [];
                          const salesList =
                            salesRes.status === "fulfilled"
                              ? salesRes.value?.entries || []
                              : [];

                          exportFullReportToCSV({
                            report: {
                              ...report,
                              employee_name: report.employee_name || user?.full_name,
                            },
                            summary: summaryData,
                            callEntries: Object.values(entries),
                            clientContacts,
                            meetingEntries: meetList,
                            salesEntries: salesList,
                          });
                        } catch (err) {
                          console.error("Failed to download CSV:", err);
                        } finally {
                          setDownloadingCsv(false);
                        }
                      }}
                      loading={downloadingCsv}
                      title="Download Complete Daily Report Data as Excel/CSV"
                    >
                      <FileSpreadsheet className="w-4 h-4 mr-1.5 text-emerald-700" />
                      Download CSV
                    </Button>
                  </>
                )}
                {isAdmin && report && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setAdminDeleteModalOpen(true)}
                    title="Admin: Permanently delete this daily report"
                  >
                    <Trash2 className="w-4 h-4 mr-1.5" />
                    Delete Report
                  </Button>
                )}
              </div>
            </div>

            {/* Locked notification banner */}
            {isLocked && (
              <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600 flex items-center gap-2">
                <Lock className="w-4 h-4 text-slate-500 shrink-0" />
                <span>
                  This daily report has been finalized and submitted to management. In accordance with
                  company policy, submitted records cannot be modified.
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Status Feedback Alert ────────────────────────────────────────── */}
        {statusMessage && (
          <Alert
            type={statusMessage.type}
            onDismiss={() => setStatusMessage(null)}
          >
            {statusMessage.text}
          </Alert>
        )}

        {/* ── Mobile App Cards View ───────────────────────────────────────── */}
        {viewMode === "cards" && (
          <div className="space-y-4">
            {/* Category Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
              <button
                type="button"
                onClick={() => setActiveCategoryFilter("all")}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all shadow-2xs ${
                  activeCategoryFilter === "all"
                    ? "bg-emerald-700 text-white shadow-xs"
                    : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                All Categories ({LEAD_CATEGORIES.length})
              </button>
              {LEAD_CATEGORIES.map((cat) => {
                const e = entries[cat.key];
                const rowConnected =
                  e.total_connected !== null && e.total_connected !== undefined
                    ? e.total_connected
                    : (e.hp_count || 0) + (e.p_count || 0) + (e.fub_count || 0) + (e.ni_count || 0);
                const isActive = activeCategoryFilter === cat.key;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setActiveCategoryFilter(cat.key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 shadow-2xs ${
                      isActive
                        ? "bg-emerald-700 text-white shadow-xs"
                        : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span>{cat.label}</span>
                    {rowConnected > 0 && (
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                          isActive
                            ? "bg-emerald-900/60 text-white"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {rowConnected}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Mobile Cards Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {(activeCategoryFilter === "all"
                ? LEAD_CATEGORIES
                : LEAD_CATEGORIES.filter((c) => c.key === activeCategoryFilter)
              ).map((cat) => {
                const e = entries[cat.key];
                const rowConnected =
                  e.total_connected !== null && e.total_connected !== undefined
                    ? e.total_connected
                    : (e.hp_count || 0) + (e.p_count || 0) + (e.fub_count || 0) + (e.ni_count || 0);
                const slotDials =
                  (e.slot_10_to_1 || 0) +
                  (e.slot_2_to_5 || 0) +
                  (e.slot_5_to_6 || 0);
                const rowDialed = Math.max(slotDials, rowConnected);

                return (
                  <div
                    key={cat.key}
                    className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden transition-all hover:border-slate-300"
                  >
                    {/* Header */}
                    <div className="p-4 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-3 h-3 rounded-full bg-emerald-600 ring-4 ring-emerald-50" />
                        <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                          {cat.label}
                        </h3>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold">
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md text-[11px] font-bold border border-slate-200">
                          Dialed: {rowDialed}
                        </span>
                        <span className="bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-md text-[11px] font-bold border border-emerald-200">
                          Conn: {rowConnected}
                        </span>
                      </div>
                    </div>

                    {/* Starting Leads & Updated Leads Pill */}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-600 font-semibold">Start Leads:</span>
                        <div className="w-24">
                          <MobileNumberInput
                            value={e.till_today_status}
                            disabled={isLocked || loading}
                            onChange={(val) =>
                              handleCellChange(cat.key, "till_today_status", val)
                            }
                            onStep={(delta) =>
                              handleStep(cat.key, "till_today_status", delta)
                            }
                            placeholder="0"
                            borderColor="border-slate-300"
                            arrowColor="text-slate-600 hover:text-emerald-700"
                            textSize="text-xs"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 font-medium">Updated:</span>
                        <span
                          className="px-2.5 py-1 rounded bg-emerald-100 text-emerald-950 font-bold text-xs"
                          title={`Start: ${categoryCalculations[cat.key]?.start ?? 0} | Out: -${categoryCalculations[cat.key]?.movedOut ?? 0} | In: +${categoryCalculations[cat.key]?.movedIn ?? 0}`}
                        >
                          {categoryCalculations[cat.key]?.finalTotal ?? 0}
                        </span>
                      </div>
                    </div>

                    <div className="p-4 space-y-4">
                      {/* Section 1: Time Slots */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            Calls Dialed by Time Block
                          </label>
                          <span className="text-xs font-bold text-slate-700">
                            Total: <strong className="text-green-800">{rowDialed}</strong>
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-green-50/40 p-2.5 rounded-xl border border-green-200/70 text-center">
                            <span className="text-[10px] font-bold uppercase text-slate-600 block mb-1">
                              10am – 1pm
                            </span>
                            <MobileNumberInput
                              value={e.slot_10_to_1}
                              disabled={isLocked || loading}
                              onChange={(val) =>
                                handleCellChange(cat.key, "slot_10_to_1", val)
                              }
                              onStep={(delta) =>
                                handleStep(cat.key, "slot_10_to_1", delta)
                              }
                              placeholder="0"
                              borderColor="border-green-300"
                              arrowColor="text-green-800 hover:text-green-950"
                            />
                          </div>

                          <div className="bg-green-50/40 p-2.5 rounded-xl border border-green-200/70 text-center">
                            <span className="text-[10px] font-bold uppercase text-slate-600 block mb-1">
                              2pm – 5pm
                            </span>
                            <MobileNumberInput
                              value={e.slot_2_to_5}
                              disabled={isLocked || loading}
                              onChange={(val) =>
                                handleCellChange(cat.key, "slot_2_to_5", val)
                              }
                              onStep={(delta) =>
                                handleStep(cat.key, "slot_2_to_5", delta)
                              }
                              placeholder="0"
                              borderColor="border-green-300"
                              arrowColor="text-green-800 hover:text-green-950"
                            />
                          </div>

                          <div className="bg-green-50/40 p-2.5 rounded-xl border border-green-200/70 text-center">
                            <span className="text-[10px] font-bold uppercase text-slate-600 block mb-1">
                              5pm – 6pm
                            </span>
                            <MobileNumberInput
                              value={e.slot_5_to_6}
                              disabled={isLocked || loading}
                              onChange={(val) =>
                                handleCellChange(cat.key, "slot_5_to_6", val)
                              }
                              onStep={(delta) =>
                                handleStep(cat.key, "slot_5_to_6", delta)
                              }
                              placeholder="0"
                              borderColor="border-green-300"
                              arrowColor="text-green-800 hover:text-green-950"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Section 2: Lead Classification */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            Lead Classification
                          </label>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                          {/* HP Box */}
                          <div className="bg-emerald-50/50 p-2.5 rounded-xl border border-emerald-200 flex flex-col justify-between shadow-2xs">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-bold text-emerald-950 flex items-center gap-1">
                                <Flame className="w-3.5 h-3.5 text-emerald-600" /> HP
                              </span>
                            </div>
                            <MobileNumberInput
                              value={e.hp_count}
                              disabled={isLocked || loading}
                              onChange={(val) =>
                                handleCellChange(cat.key, "hp_count", val)
                              }
                              onStep={(delta) =>
                                handleStep(cat.key, "hp_count", delta)
                              }
                              placeholder="0"
                              borderColor="border-emerald-300"
                              arrowColor="text-emerald-800 hover:text-emerald-950"
                              textSize="text-lg"
                            />
                            <div className="text-[10px] text-emerald-800 text-center font-medium mt-1">
                              High Potential
                            </div>
                          </div>

                          {/* P Box */}
                          <div className="bg-blue-50/50 p-2.5 rounded-xl border border-blue-200 flex flex-col justify-between shadow-2xs">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-bold text-blue-950 flex items-center gap-1">
                                <Target className="w-3.5 h-3.5 text-blue-600" /> P
                              </span>
                            </div>
                            <MobileNumberInput
                              value={e.p_count}
                              disabled={isLocked || loading}
                              onChange={(val) =>
                                handleCellChange(cat.key, "p_count", val)
                              }
                              onStep={(delta) =>
                                handleStep(cat.key, "p_count", delta)
                              }
                              placeholder="0"
                              borderColor="border-blue-300"
                              arrowColor="text-blue-800 hover:text-blue-950"
                              textSize="text-lg"
                            />
                            <div className="text-[10px] text-blue-800 text-center font-medium mt-1">
                              Potential
                            </div>
                          </div>

                          {/* Fub Box */}
                          <div className="bg-amber-50/50 p-2.5 rounded-xl border border-amber-200 flex flex-col justify-between shadow-2xs">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-bold text-amber-950 flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 text-amber-600" /> Fub
                              </span>
                            </div>
                            <MobileNumberInput
                              value={e.fub_count}
                              disabled={isLocked || loading}
                              onChange={(val) =>
                                handleCellChange(cat.key, "fub_count", val)
                              }
                              onStep={(delta) =>
                                handleStep(cat.key, "fub_count", delta)
                              }
                              placeholder="0"
                              borderColor="border-amber-300"
                              arrowColor="text-amber-800 hover:text-amber-950"
                              textSize="text-lg"
                            />
                            <div className="text-[10px] text-amber-800 text-center font-medium mt-1">
                              Follow-Up
                            </div>
                          </div>

                          {/* NI Box */}
                          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex flex-col justify-between shadow-2xs">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                                <XCircle className="w-3.5 h-3.5 text-slate-500" /> NI
                              </span>
                            </div>
                            <MobileNumberInput
                              value={e.ni_count}
                              disabled={isLocked || loading}
                              onChange={(val) =>
                                handleCellChange(cat.key, "ni_count", val)
                              }
                              onStep={(delta) =>
                                handleStep(cat.key, "ni_count", delta)
                              }
                              placeholder="0"
                              borderColor="border-slate-300"
                              arrowColor="text-slate-600 hover:text-slate-900"
                              textSize="text-lg"
                            />
                            <div className="text-[10px] text-slate-600 text-center font-medium mt-1">
                              Not Interested
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Section 3: Carries forward to next day */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                        <span className="text-slate-500 font-medium">Carries forward to next day:</span>
                        <span className="font-extrabold text-emerald-900 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200">
                          {categoryCalculations[cat.key]?.finalTotal ?? 0} leads
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Daily Dialed Spreadsheet Table View ──────────────────────────── */}
        {viewMode === "table" && (
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <PhoneCall className="w-4 h-4 text-green-700" />
                  Daily Dialed & Lead Classification Table
                </CardTitle>
                <div className="text-xs text-slate-500">
                  <span>{formatReadableDate(reportDate)}</span>
                </div>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-700 text-[11px] font-semibold">
                    <th className="py-2.5 px-3 min-w-[160px] sticky left-0 bg-slate-100/90 z-10">
                      Lead Category
                    </th>
                    <th className="py-2.5 px-2 text-center w-24">
                      <Tooltip content="Starting Leads" subcontent="Starting leads for today (automatically carried forward or entered manually).">
                        <span className="border-b border-dotted border-slate-400 hover:text-slate-900 font-bold">Start Leads</span>
                      </Tooltip>
                    </th>
                    <th className="py-2.5 px-2 text-center w-24 bg-green-50/50">
                      <Tooltip content="10:00 AM – 1:00 PM" subcontent="Morning call block dials.">
                        <span className="border-b border-dotted border-slate-400 hover:text-slate-900">10am-1pm</span>
                      </Tooltip>
                    </th>
                    <th className="py-2.5 px-2 text-center w-24 bg-green-50/50">
                      <Tooltip content="2:00 PM – 5:00 PM" subcontent="Afternoon call block dials.">
                        <span className="border-b border-dotted border-slate-400 hover:text-slate-900">2pm-5pm</span>
                      </Tooltip>
                    </th>
                    <th className="py-2.5 px-2 text-center w-24 bg-green-50/50">
                      <Tooltip content="5:00 PM – 6:00 PM" subcontent="Late afternoon wrap-up call block dials.">
                        <span className="border-b border-dotted border-slate-400 hover:text-slate-900">5pm-6pm</span>
                      </Tooltip>
                    </th>
                    <th className="py-2.5 px-2 text-center w-24 bg-slate-50 font-bold">
                      <Tooltip content="Total Dialed" subcontent="Sum of calls dialed across all 3 time blocks today.">
                        <span className="border-b border-dotted border-slate-500 font-bold text-slate-900">Total Dialed</span>
                      </Tooltip>
                    </th>
                    <th className="py-2.5 px-2 text-center w-20">
                      <Tooltip content="HP — High Potential" subcontent="Highly interested client ready for booking.">
                        <span className="font-bold text-emerald-800 border-b border-dotted border-emerald-600 hover:text-emerald-950">HP</span>
                      </Tooltip>
                    </th>
                    <th className="py-2.5 px-2 text-center w-20">
                      <Tooltip content="P — Potential" subcontent="General interested client.">
                        <span className="font-bold text-slate-800 border-b border-dotted border-slate-500 hover:text-slate-950">P</span>
                      </Tooltip>
                    </th>
                    <th className="py-2.5 px-2 text-center w-20">
                      <Tooltip content="Fub — Follow-Up Booked" subcontent="Scheduled call back.">
                        <span className="font-bold text-slate-800 border-b border-dotted border-slate-500 hover:text-slate-950">Fub</span>
                      </Tooltip>
                    </th>
                    <th className="py-2.5 px-2 text-center w-20">
                      <Tooltip content="NI — Not Interested" subcontent="Client declined or wrong number.">
                        <span className="font-bold text-slate-600 border-b border-dotted border-slate-400 hover:text-slate-900">NI</span>
                      </Tooltip>
                    </th>
                    <th className="py-2.5 px-2 text-center w-24 bg-emerald-50/50 font-bold">
                      <Tooltip content="Connected Calls" subcontent="Total productive calls connected today." align="right">
                        <span className="font-bold text-emerald-900 border-b border-dotted border-emerald-700 hover:text-emerald-950">Connected</span>
                      </Tooltip>
                    </th>
                    <th className="py-2.5 px-2 text-center w-24 bg-emerald-50/70 font-bold">
                      <Tooltip content="Updated Total Leads" subcontent="Remaining leads after transfers and classification. Carries forward to next day.">
                        <span className="font-bold text-emerald-950 border-b border-dotted border-emerald-700">Updated Total</span>
                      </Tooltip>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {LEAD_CATEGORIES.map((cat) => {
                    const e = entries[cat.key];
                    const rowConnected =
                      e.total_connected !== null && e.total_connected !== undefined
                        ? e.total_connected
                        : (e.hp_count || 0) + (e.p_count || 0) + (e.fub_count || 0) + (e.ni_count || 0);
                    const slotDials =
                      (e.slot_10_to_1 || 0) +
                      (e.slot_2_to_5 || 0) +
                      (e.slot_5_to_6 || 0);
                    const rowDialed = Math.max(slotDials, rowConnected);

                    return (
                      <tr
                        key={cat.key}
                        className="hover:bg-slate-50/80 transition-colors"
                      >
                        {/* Category Label */}
                        <td className="py-2.5 px-3 font-semibold text-slate-900 sticky left-0 bg-white z-10 border-r border-slate-100 align-middle">
                          <div className="font-medium text-slate-900">{cat.label}</div>
                        </td>

                        {/* Starting Leads */}
                        <td className="p-1 text-center align-middle">
                          <input
                            type="number"
                            min="0"
                            disabled={isLocked || loading}
                            value={e.till_today_status ?? ""}
                            onChange={(ev) =>
                              handleCellChange(cat.key, "till_today_status", ev.target.value)
                            }
                            placeholder="—"
                            className="w-full text-center py-1 border border-slate-300 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                          />
                        </td>

                        {/* 10 AM to 1 PM */}
                        <td className="p-1 text-center bg-green-50/20 align-middle">
                          <input
                            type="number"
                            min="0"
                            disabled={isLocked || loading}
                            value={e.slot_10_to_1 ?? ""}
                            onChange={(ev) =>
                              handleCellChange(cat.key, "slot_10_to_1", ev.target.value)
                            }
                            placeholder="—"
                            className="w-full text-center py-1 border border-slate-300 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                          />
                        </td>

                        {/* 2 PM to 5 PM */}
                        <td className="p-1 text-center bg-green-50/20 align-middle">
                          <input
                            type="number"
                            min="0"
                            disabled={isLocked || loading}
                            value={e.slot_2_to_5 ?? ""}
                            onChange={(ev) =>
                              handleCellChange(cat.key, "slot_2_to_5", ev.target.value)
                            }
                            placeholder="—"
                            className="w-full text-center py-1 border border-slate-300 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                          />
                        </td>

                        {/* 5 PM to 6 PM */}
                        <td className="p-1 text-center bg-green-50/20 align-middle">
                          <input
                            type="number"
                            min="0"
                            disabled={isLocked || loading}
                            value={e.slot_5_to_6 ?? ""}
                            onChange={(ev) =>
                              handleCellChange(cat.key, "slot_5_to_6", ev.target.value)
                            }
                            placeholder="—"
                            className="w-full text-center py-1 border border-slate-300 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                          />
                        </td>

                        {/* Row Total Dialed */}
                        <td className="py-2.5 px-2.5 text-center font-bold text-slate-900 bg-slate-50/80 align-middle">
                          {rowDialed > 0 ? rowDialed : "—"}
                        </td>

                        {/* HP */}
                        <td className="p-1 text-center align-middle">
                          <input
                            type="number"
                            min="0"
                            disabled={isLocked || loading}
                            value={e.hp_count ?? ""}
                            onChange={(ev) =>
                              handleCellChange(cat.key, "hp_count", ev.target.value)
                            }
                            placeholder="—"
                            className="w-full text-center py-1 border border-slate-300 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                          />
                        </td>

                        {/* P */}
                        <td className="p-1 text-center align-middle">
                          <input
                            type="number"
                            min="0"
                            disabled={isLocked || loading}
                            value={e.p_count ?? ""}
                            onChange={(ev) =>
                              handleCellChange(cat.key, "p_count", ev.target.value)
                            }
                            placeholder="—"
                            className="w-full text-center py-1 border border-slate-300 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                          />
                        </td>

                        {/* Fub */}
                        <td className="p-1 text-center align-middle">
                          <input
                            type="number"
                            min="0"
                            disabled={isLocked || loading}
                            value={e.fub_count ?? ""}
                            onChange={(ev) =>
                              handleCellChange(cat.key, "fub_count", ev.target.value)
                            }
                            placeholder="—"
                            className="w-full text-center py-1 border border-slate-300 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                          />
                        </td>

                        {/* NI */}
                        <td className="p-1 text-center align-middle">
                          <input
                            type="number"
                            min="0"
                            disabled={isLocked || loading}
                            value={e.ni_count ?? ""}
                            onChange={(ev) =>
                              handleCellChange(cat.key, "ni_count", ev.target.value)
                            }
                            placeholder="—"
                            className="w-full text-center py-1 border border-slate-300 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                          />
                        </td>

                        {/* Row Total Connected */}
                        <td className="py-2.5 px-2.5 text-center font-bold text-emerald-700 bg-emerald-50/30 align-middle">
                          <input
                            type="number"
                            min="0"
                            disabled={isLocked || loading}
                            value={e.total_connected ?? ""}
                            onChange={(ev) =>
                              handleCellChange(cat.key, "total_connected", ev.target.value)
                            }
                            placeholder={rowConnected > 0 ? String(rowConnected) : "—"}
                            className="w-full text-center py-1 border border-emerald-300 rounded text-xs font-bold text-emerald-900 placeholder:text-slate-400 focus:ring-1 focus:ring-emerald-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                          />
                        </td>

                        {/* Updated Total */}
                        <td className="py-2.5 px-2 text-center font-bold text-emerald-900 bg-emerald-50/40 align-middle">
                          <span
                            className="inline-flex items-center justify-center px-2 py-0.5 rounded bg-emerald-100 text-emerald-950 font-bold text-xs"
                            title={`Start: ${categoryCalculations[cat.key]?.start ?? 0} | Moved Out: -${categoryCalculations[cat.key]?.movedOut ?? 0} | Moved In: +${categoryCalculations[cat.key]?.movedIn ?? 0}`}
                          >
                            {categoryCalculations[cat.key]?.finalTotal ?? 0}
                          </span>
                        </td>
                      </tr>
                    );
                  })}

                  {/* ── Summary Totals Row ─────────────────────────────────── */}
                  <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                    <td className="py-3 px-3 uppercase tracking-wider text-[11px] sticky left-0 bg-slate-100 z-10 border-r border-slate-200">
                      Grand Total
                    </td>
                    <td className="py-3 px-2 text-center text-slate-700">{totals.tillToday || 0}</td>
                    <td className="py-3 px-2 text-center text-green-800 bg-green-100/50">{totals.slot1 || 0}</td>
                    <td className="py-3 px-2 text-center text-green-800 bg-green-100/50">{totals.slot2 || 0}</td>
                    <td className="py-3 px-2 text-center text-green-800 bg-green-100/50">{totals.slot3 || 0}</td>
                    <td className="py-3 px-2.5 text-center text-base font-extrabold text-green-900 bg-slate-200/80">
                      {totals.totalDialed || 0}
                    </td>
                    <td className="py-2.5 px-2 text-center text-slate-700 font-bold">{totals.hp || 0}</td>
                    <td className="py-2.5 px-2 text-center text-slate-700 font-bold">{totals.p || 0}</td>
                    <td className="py-2.5 px-2 text-center text-slate-700 font-bold">{totals.fub || 0}</td>
                    <td className="py-2.5 px-2 text-center text-slate-700 font-bold">{totals.ni || 0}</td>
                    <td className="py-2.5 px-2.5 text-center text-base font-extrabold text-emerald-800 bg-emerald-100/50">
                      {totals.totalConnected || 0}
                    </td>
                    <td className="py-2.5 px-2.5 text-center text-base font-extrabold text-emerald-950 bg-emerald-100/80">
                      {totals.totalUpdatedLeads || 0}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* ── Hot & Follow-Up Client Directory (Priority Contacts) ───────────── */}
        <Card className="overflow-hidden border-slate-200">

          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 p-4">
            <div>
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span className="p-1 rounded bg-amber-100 text-amber-800">
                  <Flame className="w-4 h-4 text-orange-600" />
                </span>
                Hot & Follow-Up Leads
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Key contacts & follow-up schedules
              </p>
            </div>
            {!isLocked && (
              <Button
                variant="primary"
                size="sm"
                onClick={openAddClientModal}
                className="flex items-center gap-1.5 text-xs font-bold"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Add Client Lead
              </Button>
            )}
          </CardHeader>

          <CardContent className="p-0">
            {clientContacts.length === 0 ? (
              <div className="p-5 text-center text-slate-500 text-xs">
                <Users className="w-7 h-7 text-slate-300 mx-auto mb-1.5" />
                <p className="font-semibold text-slate-700">No Priority Clients Logged</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Log high priority leads & follow-ups here.
                </p>
                {!isLocked && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openAddClientModal}
                    className="mt-2.5 text-xs"
                  >
                    <UserPlus className="w-3.5 h-3.5 mr-1 text-green-700" />
                    Add Client Lead
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-700 font-bold text-[11px] uppercase tracking-wider">
                      <th className="py-2.5 px-3">Customer Name</th>
                      <th className="py-2.5 px-3">Phone</th>
                      <th className="py-2.5 px-2 text-center">Status</th>
                      <th className="py-2.5 px-3">Next Follow-Up</th>
                      <th className="py-2.5 px-3">Discussion / Requirement</th>
                      {!isLocked && <th className="py-2.5 px-3 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {clientContacts.map((c, idx) => (
                      <tr key={c.id || idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-slate-900">
                          {c.client_name}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 font-mono text-[11px]">
                          {c.phone_number ? (
                            <a
                              href={`tel:${c.phone_number}`}
                              className="text-green-800 hover:underline flex items-center gap-1 font-semibold"
                            >
                              <Phone className="w-3 h-3 text-green-700" />
                              {c.phone_number}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span
                            className={`inline-block font-extrabold text-[10px] px-2 py-0.5 rounded ${
                              c.category === "HP"
                                ? "bg-red-100 text-red-800 border border-red-200"
                                : c.category === "FUB"
                                ? "bg-blue-100 text-blue-800 border border-blue-200"
                                : c.category === "P"
                                ? "bg-amber-100 text-amber-800 border border-amber-200"
                                : c.category === "CX"
                                ? "bg-purple-100 text-purple-800 border border-purple-200"
                                : "bg-slate-100 text-slate-700 border border-slate-200"
                            }`}
                          >
                            {c.category}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 font-medium">
                          {c.follow_up_date ? (
                            <span className="flex items-center gap-1 text-[11px]">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              {formatReadableDate(c.follow_up_date)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate">
                          {c.discussion_notes || "—"}
                        </td>
                        {!isLocked && (
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => openEditClientModal(idx)}
                                className="p-1 text-slate-400 hover:text-green-700 rounded transition-colors"
                                title="Edit client"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteClientContact(idx)}
                                className="p-1 text-slate-400 hover:text-red-700 rounded transition-colors"
                                title="Remove client"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Bottom Summary Breakdown Cards ───────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

          <Card className="p-4">
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
              Total Dialed Today
            </span>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {totals.totalDialed}
            </div>
            <p className="text-xs text-slate-600 font-medium mt-0.5">Sum of all 3 slots</p>
          </Card>

          <Card className="p-4">
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
              Total Connected
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <div className="text-2xl font-bold text-emerald-700">
                {totals.totalConnected}
              </div>
            </div>
            <p className="text-xs text-slate-600 font-medium mt-0.5">
              Productive calls connected
            </p>
          </Card>

          <Card className="p-4">
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
              Connection Rate
            </span>
            <div className="text-2xl font-bold text-green-700 mt-1">
              {totals.connectionRate}%
            </div>
            <p className="text-xs text-slate-600 font-medium mt-0.5">Target: 40%+</p>
          </Card>

          <Card className="p-4">
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
              Updated Lead Stock
            </span>
            <div className="text-2xl font-bold text-emerald-800 mt-1">
              {totals.totalUpdatedLeads}
            </div>
            <p className="text-xs text-slate-600 font-medium mt-0.5">
              Carried forward to next day
            </p>
          </Card>
        </div>

        {/* ── Fixed Mobile App Sticky Bottom Bar (Mobile Only - sits above bottom nav) ──────────────── */}
        <div className="md:hidden fixed bottom-14 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 px-4 py-2.5 shadow-lg flex items-center justify-between gap-3">
          <div className="flex flex-col text-xs leading-tight">
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <span>Dialed: <strong className="text-green-800">{totals.totalDialed}</strong></span>
              <span>•</span>
              <span>Conn: <strong className="text-emerald-700">{totals.totalConnected}</strong></span>
            </div>
            <div className="text-[11px] text-slate-600 font-medium">
              Updated Stock: <strong className="text-emerald-800">{totals.totalUpdatedLeads}</strong>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {!isLocked && (
              <>
                {/* Mobile Auto-Save Status */}
                <div className="mr-0.5">
                  {autoSaveStatus === "saving" && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 animate-pulse">
                      <RefreshCw className="w-2.5 h-2.5 animate-spin text-amber-600" />
                      Saving
                    </span>
                  )}
                  {autoSaveStatus === "saved" && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                      Saved
                    </span>
                  )}
                  {autoSaveStatus === "unsaved" && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      Unsaved
                    </span>
                  )}
                  {autoSaveStatus === "error" && (
                    <button
                      type="button"
                      onClick={handleSaveDraft}
                      className="flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200"
                    >
                      <AlertCircle className="w-2.5 h-2.5 text-rose-600" />
                      Retry
                    </button>
                  )}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveDraft}
                  loading={saving}
                  disabled={loading}
                  className="text-xs px-2.5 py-1.5 font-bold"
                  title="Manual Save"
                >
                  <Save className="w-3.5 h-3.5 mr-1" />
                  Save
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setSubmitModalOpen(true)}
                  disabled={loading || saving}
                  className="text-xs px-3 py-1.5 font-bold"
                >
                  <Send className="w-3.5 h-3.5 mr-1" />
                  Submit
                </Button>
              </>
            )}
            {isLocked && (
              <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200 flex items-center gap-1">
                <Lock className="w-3 h-3" /> Locked
              </span>
            )}
          </div>
        </div>

        {/* ── Submit Confirmation Modal ────────────────────────────────────── */}
        <Modal
          isOpen={submitModalOpen}
          onClose={() => setSubmitModalOpen(false)}
          title="Submit Daily Call Activity Report"
          description={`Finalizing report for ${formatReadableDate(reportDate)}`}
        >
          <div className="space-y-4">
            <div className="p-3 bg-green-50 border border-green-200 rounded text-xs text-green-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-green-700 mt-0.5" />
              <div>
                <p className="font-semibold">Important Confirmation</p>
                <p className="mt-0.5">
                  Submitting will lock this report. You will no longer be able to edit call slots, meeting times, or collections for this date.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Total Dialed:</span>
                <span className="font-bold text-slate-900">{totals.totalDialed}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Connected:</span>
                <span className="font-bold text-emerald-700">{totals.totalConnected}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Connection Rate:</span>
                <span className="font-bold text-slate-900">{totals.connectionRate}%</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSubmitModalOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmitReport}
                loading={submitting}
              >
                Confirm & Submit Report
              </Button>
            </div>
          </div>
        </Modal>

        {/* ── Admin: Delete Daily Report Modal ─────────────────────────────── */}
        <Modal
          isOpen={adminDeleteModalOpen}
          onClose={() => setAdminDeleteModalOpen(false)}
          title="Admin: Delete Daily Report"
          description={`Are you sure you want to permanently delete the report for ${formatReadableDate(reportDate)}?`}
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-600">
              This will permanently delete this daily activity report, all hourly call data,
              and associated logs. This action is restricted to administrators and cannot be recovered.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAdminDeleteModalOpen(false)}
                disabled={deletingReport}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={deletingReport}
                onClick={handleAdminDeleteReport}
              >
                Delete Report
              </Button>
            </div>
          </div>
        </Modal>

        {/* ── Add / Edit Client Contact Modal ───────────────────────────────── */}
        <Modal
          isOpen={clientModalOpen}
          onClose={() => setClientModalOpen(false)}
          title={editingClientIndex !== null ? "Edit Client Lead Details" : "Add Priority Client Lead"}
          description="Log important customer details and follow-up schedules discussed today."
        >
          <form onSubmit={handleSaveClientContact} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Customer / Client Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Mr. Mizanur Rahman"
                value={clientFormName}
                onChange={(e) => setClientFormName(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  placeholder="e.g. 01711-xxxxxx"
                  value={clientFormPhone}
                  onChange={(e) => setClientFormPhone(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Lead Classification *
                </label>
                <select
                  value={clientFormCategory}
                  onChange={(e) => setClientFormCategory(e.target.value as any)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none"
                >
                  <option value="HP">HP — High Potential</option>
                  <option value="P">P — Potential</option>
                  <option value="FUB">FUB — Follow-Up Booked</option>
                  <option value="CX">CX — Indoor CX / Site Meeting</option>
                  <option value="NI">NI — Not Interested</option>
                  <option value="Other">Other Lead</option>
                </select>

              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Next Follow-Up Date
              </label>
              <input
                type="date"
                value={clientFormFollowUp}
                onChange={(e) => setClientFormFollowUp(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Discussion Topic / Requirements
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Interested in 3-katha south plot, requested visit next Saturday."
                value={clientFormNotes}
                onChange={(e) => setClientFormNotes(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setClientModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm">
                Save Client Lead
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </DashboardLayout>

  );
}

export default function DailyCallActivityPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-sm text-slate-500">
          Loading Daily Call Activity...
        </div>
      }
    >
      <DailyCallActivityContent />
    </Suspense>
  );
}
