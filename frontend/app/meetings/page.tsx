"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Users,
  Save,
  Send,
  Lock,
  Calendar,
  Clock,
  MapPin,
  UserCheck,
  ChevronUp,
  ChevronDown,
  LayoutGrid,
  Table2,
  Briefcase,
  Layers,
  Sparkles,
  CheckCircle2,
  Cloud,
  RefreshCw,
  AlertCircle,
  Plus,
  Trash2,
  Edit2,
  Check,
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
} from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import { SupervisorBar } from "@/components/supervisor-bar";
import {
  MEETING_METRICS,
  MeetingMetricType,
  MeetingActivityEntry,
  Report,
} from "@/types";
import { getDhakaToday, formatReadableDate, formatMinutes, formatEmployeeId } from "@/lib/utils";

/**
 * Determine default time slot based on current Dhaka local hour.
 */
function getDefaultDhakaSlot(): "slot_10_to_1" | "slot_2_to_5" | "slot_5_to_6" {
  try {
    const dhakaHourStr = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Dhaka",
      hour: "numeric",
      hour12: false,
    }).format(new Date());
    const hour = parseInt(dhakaHourStr, 10);
    if (hour < 14) return "slot_10_to_1";
    if (hour < 17) return "slot_2_to_5";
    return "slot_5_to_6";
  } catch {
    return "slot_10_to_1";
  }
}

/**
 * Mobile-friendly touch stepper input with prominent up/down increaser arrows.
 */
function MobileNumberInput({
  value,
  onChange,
  onStep,
  disabled,
  placeholder = "—",
  step = 1,
  borderColor = "border-slate-300",
  arrowColor = "text-slate-600 hover:text-slate-900",
  textSize = "text-base",
}: {
  value: number | null | undefined;
  onChange: (val: string) => void;
  onStep: (delta: number) => void;
  disabled?: boolean;
  placeholder?: string;
  step?: number;
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
        className={`w-full text-center pl-2 pr-7 py-2 ${textSize} font-bold bg-white border ${borderColor} rounded-xl focus:ring-2 focus:ring-green-600 focus:outline-none text-slate-900 shadow-2xs disabled:bg-slate-50 disabled:text-slate-500`}
      />
      <div className="absolute right-0.5 inset-y-0 flex flex-col justify-center -space-y-1">
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={(ev) => {
            ev.preventDefault();
            onStep(step);
          }}
          className={`px-1 py-0.5 ${arrowColor} hover:bg-slate-100 rounded active:scale-125 transition-all disabled:opacity-30`}
          title={`Increase by ${step}`}
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
            onStep(-step);
          }}
          className={`px-1 py-0.5 ${arrowColor} hover:bg-slate-100 rounded active:scale-125 transition-all disabled:opacity-30`}
          title={`Decrease by ${step}`}
          aria-label="Decrease"
        >
          <ChevronDown className="w-3.5 h-3.5 stroke-[2.5]" />
        </button>
      </div>
    </div>
  );
}

const METRIC_THEMES: Record<
  MeetingMetricType,
  {
    icon: typeof MapPin;
    iconBg: string;
    iconColor: string;
    badge: string;
    group: "outdoor" | "indoor" | "meetings";
  }
> = {
  outdoor_visit_count: {
    icon: MapPin,
    iconBg: "bg-emerald-100 text-emerald-800",
    iconColor: "text-emerald-700",
    badge: "bg-emerald-50 text-emerald-800 border border-emerald-200",
    group: "outdoor",
  },
  outdoor_time_minutes: {
    icon: Clock,
    iconBg: "bg-emerald-100 text-emerald-800",
    iconColor: "text-emerald-700",
    badge: "bg-emerald-50 text-emerald-800 border border-emerald-200",
    group: "outdoor",
  },
  indoor_cx_count: {
    icon: UserCheck,
    iconBg: "bg-blue-100 text-blue-800",
    iconColor: "text-blue-700",
    badge: "bg-blue-50 text-blue-800 border border-blue-200",
    group: "indoor",
  },
  indoor_cx_time_minutes: {
    icon: Clock,
    iconBg: "bg-blue-100 text-blue-800",
    iconColor: "text-blue-700",
    badge: "bg-blue-50 text-blue-800 border border-blue-200",
    group: "indoor",
  },
  mg_time_minutes: {
    icon: Briefcase,
    iconBg: "bg-amber-100 text-amber-800",
    iconColor: "text-amber-700",
    badge: "bg-amber-50 text-amber-800 border border-amber-200",
    group: "meetings",
  },
  team_meeting_time_minutes: {
    icon: Users,
    iconBg: "bg-purple-100 text-purple-800",
    iconColor: "text-purple-700",
    badge: "bg-purple-50 text-purple-800 border border-purple-200",
    group: "meetings",
  },
};

const FILTER_TABS = [
  { key: "all", label: "All Activities", count: 6 },
  { key: "outdoor", label: "Outdoor", count: 2 },
  { key: "indoor", label: "Indoor CX", count: 2 },
  { key: "meetings", label: "Meetings", count: 2 },
];

function MeetingTimeDailyContent() {
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
    router.replace(`/meetings?date=${reportDate}&employee_id=${empId}`);
  }, [reportDate, router]);

  // State
  const [report, setReport] = useState<Report | null>(null);
  const isLocked = report?.is_submitted ?? false;
  const [entries, setEntries] = useState<Record<MeetingMetricType, MeetingActivityEntry>>(() => {
    const init: Record<string, MeetingActivityEntry> = {};
    for (const m of MEETING_METRICS) {
      init[m.key] = {
        metric_type: m.key,
        till_today: null,
        slot_10_to_1: null,
        slot_2_to_5: null,
        slot_5_to_6: null,
      };
    }
    return init as Record<MeetingMetricType, MeetingActivityEntry>;
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  // Auto-Save State & Timers
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "unsaved" | "saving" | "saved" | "error">("idle");
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const isInitialMount = useRef(true);
  const isDirtyRef = useRef(false);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // View Mode: Table on PC (>= 768px), Cards on mobile (< 768px)
  const [viewMode, setViewMode] = useState<"cards" | "table">("table");
  const [hasUserSwitchedView, setHasUserSwitchedView] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>("all");

  // Quick Log Modal State (Fast 1-tap mobile entry)
  const [isQuickModalOpen, setIsQuickModalOpen] = useState(false);
  const [quickCategory, setQuickCategory] = useState<"outdoor" | "indoor" | "team" | "mg">("outdoor");
  const [quickSlot, setQuickSlot] = useState<"slot_10_to_1" | "slot_2_to_5" | "slot_5_to_6">("slot_10_to_1");
  const [quickDuration, setQuickDuration] = useState<number>(60);
  const [quickCount, setQuickCount] = useState<number>(1);
  const [quickSaving, setQuickSaving] = useState(false);
  const [showDetailedCards, setShowDetailedCards] = useState(false);

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

  // Load report & meeting entries
  const loadMeetingData = useCallback(async (dateStr: string, empId?: number) => {
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
          r = await api.reports.create(dateStr, empId);
        } else {
          throw err;
        }
      }
      setReport(r);

      const meetingData = await api.meetings.get(r.id);
      if (meetingData && meetingData.entries && meetingData.entries.length > 0) {
        const loaded: Record<string, MeetingActivityEntry> = {};
        for (const m of MEETING_METRICS) {
          const found = meetingData.entries.find((e) => e.metric_type === m.key);
          loaded[m.key] = found || {
            metric_type: m.key,
            till_today: null,
            slot_10_to_1: null,
            slot_2_to_5: null,
            slot_5_to_6: null,
          };
        }
        setEntries(loaded as Record<MeetingMetricType, MeetingActivityEntry>);
      } else {
        const reset: Record<string, MeetingActivityEntry> = {};
        for (const m of MEETING_METRICS) {
          reset[m.key] = {
            metric_type: m.key,
            till_today: null,
            slot_10_to_1: null,
            slot_2_to_5: null,
            slot_5_to_6: null,
          };
        }
        setEntries(reset as Record<MeetingMetricType, MeetingActivityEntry>);
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setStatusMessage({ type: "error", text: err.message });
      } else {
        setStatusMessage({
          type: "error",
          text: "Failed to load meeting activities for this date.",
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
    loadMeetingData(reportDate, isSupervisor ? selectedEmpId : undefined);
  }, [reportDate, selectedEmpId, isSupervisor, loadMeetingData]);

  const handleCellChange = (
    metricKey: MeetingMetricType,
    field: keyof MeetingActivityEntry,
    valStr: string
  ) => {
    if (report?.is_submitted) return;

    isDirtyRef.current = true;
    setAutoSaveStatus("unsaved");

    const trimmed = valStr.trim();
    const num = trimmed === "" ? null : Math.max(0, parseInt(trimmed, 10));
    setEntries((prev) => ({
      ...prev,
      [metricKey]: {
        ...prev[metricKey],
        [field]: isNaN(num as number) ? null : num,
      },
    }));
  };

  const handleStep = (
    metricKey: MeetingMetricType,
    field: keyof MeetingActivityEntry,
    delta: number
  ) => {
    if (report?.is_submitted) return;
    isDirtyRef.current = true;
    setAutoSaveStatus("unsaved");
    const current = entries[metricKey]?.[field];
    const curNum = typeof current === "number" ? current : 0;
    const next = Math.max(0, curNum + delta);
    handleCellChange(metricKey, field, String(next));
  };

  // Calculations: Separate count totals from minutes totals
  const totals = useMemo(() => {
    const getRowSum = (key: MeetingMetricType) => {
      const e = entries[key];
      if (!e) return 0;
      return (e.slot_10_to_1 || 0) + (e.slot_2_to_5 || 0) + (e.slot_5_to_6 || 0);
    };

    const outdoorVisits = getRowSum("outdoor_visit_count");
    const outdoorMinutes = getRowSum("outdoor_time_minutes");
    const indoorCxCount = getRowSum("indoor_cx_count");
    const indoorMinutes = getRowSum("indoor_cx_time_minutes");
    const mgMinutes = getRowSum("mg_time_minutes");
    const teamMeetingMinutes = getRowSum("team_meeting_time_minutes");

    const totalMeetingMinutes =
      outdoorMinutes + indoorMinutes + mgMinutes + teamMeetingMinutes;

    return {
      outdoorVisits,
      outdoorMinutes,
      indoorCxCount,
      indoorMinutes,
      mgMinutes,
      teamMeetingMinutes,
      totalMeetingMinutes,
      formattedTotalTime: formatMinutes(totalMeetingMinutes),
    };
  }, [entries]);

  const handleSaveDraft = async () => {
    if (!report) return;
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    setSaving(true);
    setAutoSaveStatus("saving");
    setStatusMessage(null);
    try {
      const payload: MeetingActivityEntry[] = MEETING_METRICS.map(
        (m) => entries[m.key]
      );
      await api.meetings.upsert(report.id, payload);
      isDirtyRef.current = false;
      setAutoSaveStatus("saved");
      const now = new Date();
      setLastSavedTime(
        now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );
      setStatusMessage({
        type: "success",
        text: "Meeting activity draft saved successfully.",
      });
    } catch (err: unknown) {
      setAutoSaveStatus("error");
      if (err instanceof ApiError) {
        setStatusMessage({ type: "error", text: err.message });
      } else {
        setStatusMessage({
          type: "error",
          text: "Failed to save meeting draft. Your entries are retained.",
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
        const payload: MeetingActivityEntry[] = MEETING_METRICS.map(
          (m) => entries[m.key]
        );
        await api.meetings.upsert(report.id, payload);

        isDirtyRef.current = false;
        setAutoSaveStatus("saved");
        const now = new Date();
        setLastSavedTime(
          now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        );
      } catch (err) {
        console.error("Auto-save failed for meetings:", err);
        setAutoSaveStatus("error");
      }
    }, 1500);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [entries, report?.id, isLocked, loading]);

  // Prevent accidental loss if user leaves with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current && !isLocked) {
        e.preventDefault();
        e.returnValue = "You have unsaved changes in your meeting report. Are you sure you want to leave?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isLocked]);

  const handleSubmitReport = async () => {
    if (!report) return;
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    setSubmitting(true);
    setStatusMessage(null);
    try {
      const payload: MeetingActivityEntry[] = MEETING_METRICS.map(
        (m) => entries[m.key]
      );
      await api.meetings.upsert(report.id, payload);

      const updated = await api.reports.submit(report.id);
      setReport(updated);
      isDirtyRef.current = false;
      setAutoSaveStatus("saved");
      setSubmitModalOpen(false);
      setStatusMessage({
        type: "success",
        text: "Report finalized and submitted! Meeting activities are now locked.",
      });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setStatusMessage({ type: "error", text: err.message });
      } else {
        setStatusMessage({
          type: "error",
          text: "Failed to submit report. Please review your entries.",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Quick Log Handlers
  const handleOpenQuickModal = (category: "outdoor" | "indoor" | "team" | "mg" = "outdoor") => {
    setQuickCategory(category);
    setQuickSlot(getDefaultDhakaSlot());
    setQuickDuration(category === "outdoor" ? 60 : 30);
    setQuickCount(1);
    setIsQuickModalOpen(true);
  };

  const handleEditActivity = (act: {
    category: "outdoor" | "indoor" | "team" | "mg";
    slotKey: "slot_10_to_1" | "slot_2_to_5" | "slot_5_to_6";
    durationMinutes: number;
    count?: number;
  }) => {
    setQuickCategory(act.category);
    setQuickSlot(act.slotKey);
    setQuickDuration(act.durationMinutes || 30);
    setQuickCount(act.count || 1);
    setIsQuickModalOpen(true);
  };

  const handleSaveQuickActivity = async () => {
    if (isLocked || !report) return;

    setQuickSaving(true);
    const nextEntries = { ...entries };

    if (quickCategory === "outdoor") {
      nextEntries.outdoor_visit_count = {
        ...nextEntries.outdoor_visit_count,
        [quickSlot]: quickCount > 0 ? quickCount : 1,
      };
      nextEntries.outdoor_time_minutes = {
        ...nextEntries.outdoor_time_minutes,
        [quickSlot]: quickDuration > 0 ? quickDuration : 0,
      };
    } else if (quickCategory === "indoor") {
      nextEntries.indoor_cx_count = {
        ...nextEntries.indoor_cx_count,
        [quickSlot]: quickCount > 0 ? quickCount : 1,
      };
      nextEntries.indoor_cx_time_minutes = {
        ...nextEntries.indoor_cx_time_minutes,
        [quickSlot]: quickDuration > 0 ? quickDuration : 0,
      };
    } else if (quickCategory === "team") {
      nextEntries.team_meeting_time_minutes = {
        ...nextEntries.team_meeting_time_minutes,
        [quickSlot]: quickDuration > 0 ? quickDuration : 0,
      };
    } else if (quickCategory === "mg") {
      nextEntries.mg_time_minutes = {
        ...nextEntries.mg_time_minutes,
        [quickSlot]: quickDuration > 0 ? quickDuration : 0,
      };
    }

    setEntries(nextEntries);
    isDirtyRef.current = true;
    setAutoSaveStatus("saving");

    try {
      const payload: MeetingActivityEntry[] = MEETING_METRICS.map(
        (m) => nextEntries[m.key]
      );
      await api.meetings.upsert(report.id, payload);
      isDirtyRef.current = false;
      setAutoSaveStatus("saved");
      const now = new Date();
      setLastSavedTime(
        now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );
      const catLabel =
        quickCategory === "outdoor"
          ? "Outdoor Visit"
          : quickCategory === "indoor"
          ? "Indoor CX Meeting"
          : quickCategory === "team"
          ? "Team Meeting"
          : "Management (MG) Meeting";
      setStatusMessage({
        type: "success",
        text: `Saved ${catLabel} (${quickDuration}m) successfully!`,
      });
      setIsQuickModalOpen(false);
    } catch (err: unknown) {
      setAutoSaveStatus("error");
      if (err instanceof ApiError) {
        setStatusMessage({ type: "error", text: err.message });
      } else {
        setStatusMessage({
          type: "error",
          text: "Failed to save meeting draft. Your entries are retained.",
        });
      }
    } finally {
      setQuickSaving(false);
    }
  };

  const handleClearActivity = async (act: {
    category: "outdoor" | "indoor" | "team" | "mg";
    slotKey: "slot_10_to_1" | "slot_2_to_5" | "slot_5_to_6";
    title: string;
    slotLabel: string;
  }) => {
    if (isLocked || !report) return;

    const nextEntries = { ...entries };

    if (act.category === "outdoor") {
      nextEntries.outdoor_visit_count = {
        ...nextEntries.outdoor_visit_count,
        [act.slotKey]: null,
      };
      nextEntries.outdoor_time_minutes = {
        ...nextEntries.outdoor_time_minutes,
        [act.slotKey]: null,
      };
    } else if (act.category === "indoor") {
      nextEntries.indoor_cx_count = {
        ...nextEntries.indoor_cx_count,
        [act.slotKey]: null,
      };
      nextEntries.indoor_cx_time_minutes = {
        ...nextEntries.indoor_cx_time_minutes,
        [act.slotKey]: null,
      };
    } else if (act.category === "team") {
      nextEntries.team_meeting_time_minutes = {
        ...nextEntries.team_meeting_time_minutes,
        [act.slotKey]: null,
      };
    } else if (act.category === "mg") {
      nextEntries.mg_time_minutes = {
        ...nextEntries.mg_time_minutes,
        [act.slotKey]: null,
      };
    }

    setEntries(nextEntries);
    isDirtyRef.current = true;
    setAutoSaveStatus("saving");

    try {
      const payload: MeetingActivityEntry[] = MEETING_METRICS.map(
        (m) => nextEntries[m.key]
      );
      await api.meetings.upsert(report.id, payload);
      isDirtyRef.current = false;
      setAutoSaveStatus("saved");
      const now = new Date();
      setLastSavedTime(
        now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );
      setStatusMessage({
        type: "info",
        text: `Cleared ${act.title} for ${act.slotLabel}.`,
      });
    } catch {
      setAutoSaveStatus("error");
    }
  };

  const loggedActivities = useMemo(() => {
    const list: Array<{
      id: string;
      category: "outdoor" | "indoor" | "team" | "mg";
      title: string;
      slotKey: "slot_10_to_1" | "slot_2_to_5" | "slot_5_to_6";
      slotLabel: string;
      durationMinutes: number;
      count?: number;
      icon: typeof MapPin;
      colorClass: string;
      badgeBg: string;
    }> = [];

    const slots: Array<{
      key: "slot_10_to_1" | "slot_2_to_5" | "slot_5_to_6";
      label: string;
    }> = [
      { key: "slot_10_to_1", label: "10am – 1pm" },
      { key: "slot_2_to_5", label: "2pm – 5pm" },
      { key: "slot_5_to_6", label: "5pm – 6pm" },
    ];

    slots.forEach((s) => {
      // Outdoor
      const outdoorMins = entries.outdoor_time_minutes?.[s.key] || 0;
      const outdoorCnt = entries.outdoor_visit_count?.[s.key] || 0;
      if (outdoorMins > 0 || outdoorCnt > 0) {
        list.push({
          id: `outdoor-${s.key}`,
          category: "outdoor",
          title: "Outdoor Client Visit",
          slotKey: s.key,
          slotLabel: s.label,
          durationMinutes: outdoorMins,
          count: outdoorCnt,
          icon: MapPin,
          colorClass: "text-emerald-700",
          badgeBg: "bg-emerald-100 text-emerald-800",
        });
      }

      // Indoor
      const indoorMins = entries.indoor_cx_time_minutes?.[s.key] || 0;
      const indoorCnt = entries.indoor_cx_count?.[s.key] || 0;
      if (indoorMins > 0 || indoorCnt > 0) {
        list.push({
          id: `indoor-${s.key}`,
          category: "indoor",
          title: "Indoor Customer Meeting",
          slotKey: s.key,
          slotLabel: s.label,
          durationMinutes: indoorMins,
          count: indoorCnt,
          icon: UserCheck,
          colorClass: "text-blue-700",
          badgeBg: "bg-blue-100 text-blue-800",
        });
      }

      // Team Meeting
      const teamMins = entries.team_meeting_time_minutes?.[s.key] || 0;
      if (teamMins > 0) {
        list.push({
          id: `team-${s.key}`,
          category: "team",
          title: "Internal Team Meeting",
          slotKey: s.key,
          slotLabel: s.label,
          durationMinutes: teamMins,
          icon: Users,
          colorClass: "text-purple-700",
          badgeBg: "bg-purple-100 text-purple-800",
        });
      }

      // MG Meeting
      const mgMins = entries.mg_time_minutes?.[s.key] || 0;
      if (mgMins > 0) {
        list.push({
          id: `mg-${s.key}`,
          category: "mg",
          title: "Management (MG) Meeting",
          slotKey: s.key,
          slotLabel: s.label,
          durationMinutes: mgMins,
          icon: Briefcase,
          colorClass: "text-amber-700",
          badgeBg: "bg-amber-100 text-amber-800",
        });
      }
    });

    return list;
  }, [entries]);

  const filteredMetrics = useMemo(() => {
    if (activeFilter === "all") return MEETING_METRICS;
    return MEETING_METRICS.filter(
      (m) => METRIC_THEMES[m.key]?.group === activeFilter
    );
  }, [activeFilter]);

  return (
    <DashboardLayout
      title="Meeting Time Daily"
      subtitle={isSupervisor ? "Supervisor Review: Monitor and audit employee customer meetings and outdoor site visits" : "Customer meetings, outdoor site visits, and team coordination tracking"}
    >
      <div className="space-y-6 pb-20 sm:pb-6">
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
            currentPage="meetings"
          />
        )}
        {/* ── Header Controls Card ────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-green-700" />
                  <span className="text-xs font-semibold text-slate-700 uppercase">Date:</span>
                  <input
                    type="date"
                    value={reportDate}
                    onChange={(e) => {
                      setReportDate(e.target.value);
                      const empQuery = (isSupervisor ? selectedEmpId : undefined) ? `&employee_id=${selectedEmpId}` : "";
                      router.replace(`/meetings?date=${e.target.value}${empQuery}`);
                    }}
                    className="border border-slate-300 rounded px-2.5 py-1 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-green-600 bg-white"
                  />
                </div>

                <Badge variant={isLocked ? "success" : "warning"}>
                  {isLocked ? "Finalized / Submitted" : "Draft (Editable)"}
                </Badge>
              </div>

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
                        ? "bg-white text-green-800 shadow-2xs font-bold"
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
                        ? "bg-white text-green-800 shadow-2xs font-bold"
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
                      variant="primary"
                      size="sm"
                      onClick={() => handleOpenQuickModal("outdoor")}
                      disabled={loading || saving}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                    >
                      <Plus className="w-4 h-4 mr-1.5 stroke-[2.5]" />
                      Log Meeting
                    </Button>
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
              </div>
            </div>

            {isLocked && (
              <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600 flex items-center gap-2">
                <Lock className="w-4 h-4 text-slate-500 shrink-0" />
                <span>
                  This daily report has been finalized and submitted. Editing is disabled.
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

        {/* ═══════════════════════════════════════════════════════════════════
            MOBILE APP-STYLE CARD VIEW (Optimized for fast phone data entry)
           ═══════════════════════════════════════════════════════════════════ */}
        {viewMode === "cards" && (
          <div className="space-y-4">
            {/* Quick Entry Hero Banner */}
            <div className="bg-emerald-800 text-white rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-base sm:text-lg font-extrabold tracking-tight">Record Meeting or Client Visit</h3>
                <p className="text-xs text-emerald-100">
                  Log visits & meetings in seconds.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={isLocked || loading}
                onClick={() => handleOpenQuickModal("outdoor")}
                className="w-full sm:w-auto font-bold bg-white text-emerald-900 hover:bg-emerald-50 shadow-xs text-xs sm:text-sm py-2.5 px-4 shrink-0 rounded-xl"
              >
                <Plus className="w-4 h-4 mr-1.5 stroke-[2.5]" />
                Log Meeting / Field Visit
              </Button>
            </div>

            {/* ── Key Metric Summary Cards (Live Overview) ────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              <Card className="p-3.5 sm:p-4">
                <div className="flex items-center gap-1.5 text-slate-700 mb-1">
                  <MapPin className="w-3.5 h-3.5 text-green-700" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    Outdoor Visits
                  </span>
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {totals.outdoorVisits}
                </div>
                <p className="text-xs text-slate-600 font-medium mt-0.5">
                  Duration: {formatMinutes(totals.outdoorMinutes)}
                </p>
              </Card>

              <Card className="p-3.5 sm:p-4">
                <div className="flex items-center gap-1.5 text-slate-700 mb-1">
                  <UserCheck className="w-3.5 h-3.5 text-green-700" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    Indoor Customers (CX)
                  </span>
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {totals.indoorCxCount}
                </div>
                <p className="text-xs text-slate-600 font-medium mt-0.5">
                  Duration: {formatMinutes(totals.indoorMinutes)}
                </p>
              </Card>

              <Card className="p-3.5 sm:p-4">
                <div className="flex items-center gap-1.5 text-slate-700 mb-1">
                  <Users className="w-3.5 h-3.5 text-green-700" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    Internal Meetings
                  </span>
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {formatMinutes(totals.mgMinutes + totals.teamMeetingMinutes)}
                </div>
                <p className="text-xs text-slate-600 font-medium mt-0.5">
                  MG ({totals.mgMinutes}m) + Team ({totals.teamMeetingMinutes}m)
                </p>
              </Card>

              <Card className="p-3.5 sm:p-4 bg-green-50/40 border-green-200">
                <div className="flex items-center gap-1.5 text-green-800 mb-1">
                  <Clock className="w-3.5 h-3.5 text-green-700" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    Total Meeting Time
                  </span>
                </div>
                <div className="text-2xl font-extrabold text-green-900">
                  {totals.formattedTotalTime}
                </div>
                <p className="text-xs text-green-800 font-medium mt-0.5">
                  {totals.totalMeetingMinutes} total minutes today
                </p>
              </Card>
            </div>

            {/* ── Today's Recorded Activities Stream ────────────────────────── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Today's Recorded Activities ({loggedActivities.length})
                </span>
                {!isLocked && loggedActivities.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleOpenQuickModal("outdoor")}
                    className="text-xs font-bold text-green-700 hover:text-green-800 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Add Another</span>
                  </button>
                )}
              </div>

              {loggedActivities.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-4 sm:p-5 text-center">
                  <div className="w-10 h-10 bg-emerald-50 text-emerald-700 rounded-xl flex items-center justify-center mx-auto mb-2">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <h4 className="font-bold text-slate-800 text-xs sm:text-sm mb-1">No activities logged today</h4>
                  <p className="text-[11px] sm:text-xs text-slate-400 mb-3">
                    Tap below to log a visit or meeting.
                  </p>
                  <Button
                    type="button"
                    variant="primary"
                    disabled={isLocked || loading}
                    onClick={() => handleOpenQuickModal("outdoor")}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl px-3.5 py-1.5"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1 stroke-[2.5]" />
                    Log Meeting / Visit
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5">
                  {loggedActivities.map((act) => {
                    const ActIcon = act.icon;
                    return (
                      <div
                        key={act.id}
                        className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-2xs flex items-center justify-between gap-3 hover:border-slate-300 transition-all"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${act.badgeBg}`}>
                            <ActIcon className={`w-5 h-5 ${act.colorClass}`} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-900 text-sm truncate">
                                {act.title}
                              </span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                                {act.slotLabel}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-slate-600 flex-wrap">
                              <span className="font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                                ⏱ {formatMinutes(act.durationMinutes)} ({act.durationMinutes} min)
                              </span>
                              {act.count !== undefined && (
                                <span className="font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200/60">
                                  👥 {act.count} {act.count === 1 ? "visit" : "visits"}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {!isLocked && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleEditActivity(act)}
                              className="p-2 text-slate-500 hover:text-green-700 hover:bg-green-50 rounded-lg transition-all"
                              title="Edit duration or slot"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleClearActivity(act)}
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                              title="Clear activity"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Collapsible Raw Detail Cards & Till Today (Power User Mode) ── */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowDetailedCards((prev) => !prev)}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-2xs"
              >
                <div className="flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4 text-green-700" />
                  <span>
                    {showDetailedCards
                      ? "Hide Raw Inputs & Cumulative (Till Today)"
                      : "Need manual slot editing or cumulative inputs? Show All 6 Raw Detail Cards"}
                  </span>
                </div>
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-200 ${
                    showDetailedCards ? "rotate-180" : ""
                  }`}
                />
              </button>

              {showDetailedCards && (
                <div className="mt-4 space-y-4">
                  {/* Quick Filter Pill Buttons */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                    {FILTER_TABS.map((tab) => {
                      const isActive = activeFilter === tab.key;
                      return (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setActiveFilter(tab.key)}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                            isActive
                              ? "bg-green-700 text-white shadow-xs"
                              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          <span>{tab.label}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                              isActive
                                ? "bg-green-800 text-green-100"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {tab.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Mobile Metric Cards Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredMetrics.map((metric) => {
                      const e = entries[metric.key];
                      const theme = METRIC_THEMES[metric.key];
                      const Icon = theme.icon;
                      const isMinutes = metric.unit === "minutes";
                      const rowSum =
                        (e.slot_10_to_1 || 0) +
                        (e.slot_2_to_5 || 0) +
                        (e.slot_5_to_6 || 0);

                      return (
                        <div
                          key={metric.key}
                          className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden transition-all hover:border-slate-300"
                        >
                          {/* Header */}
                          <div className="p-3.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${theme.iconBg}`}
                              >
                                <Icon className={`w-4 h-4 ${theme.iconColor}`} />
                              </div>
                              <div>
                                <h3 className="font-bold text-slate-900 text-sm">
                                  {metric.label}
                                </h3>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span
                                    className={`text-[10px] font-semibold px-2 py-0.2 rounded-full ${theme.badge}`}
                                  >
                                    {isMinutes ? "Minutes" : "Count"}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                                Total Today
                              </span>
                              <span className="font-extrabold text-sm text-slate-900">
                                {rowSum > 0
                                  ? isMinutes
                                    ? `${rowSum} min`
                                    : `${rowSum}`
                                  : "—"}
                              </span>
                            </div>
                          </div>

                          <div className="p-4 space-y-4">
                            {/* Till Today (Cumulative prior entry) */}
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 flex items-center justify-between gap-3">
                              <div>
                                <span className="text-xs font-bold text-slate-700 block">
                                  Till Today
                                </span>
                                <span className="text-[10px] text-slate-500">
                                  {isMinutes ? "Cumulative prior minutes" : "Cumulative prior count"}
                                </span>
                              </div>
                              <div className="w-28 sm:w-32">
                                <MobileNumberInput
                                  value={e.till_today}
                                  disabled={isLocked || loading}
                                  onChange={(val) =>
                                    handleCellChange(metric.key, "till_today", val)
                                  }
                                  onStep={(delta) =>
                                    handleStep(metric.key, "till_today", delta)
                                  }
                                  placeholder="0"
                                  step={isMinutes ? 5 : 1}
                                  textSize="text-sm"
                                />
                              </div>
                            </div>

                            {/* Today's 3 Time Slots */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                                  <Clock className="w-3.5 h-3.5 text-green-700" />
                                  Today's Time Slots
                                </label>
                                <span className="text-[10px] text-slate-500">
                                  {isMinutes ? "Minutes spent" : "Visits done"}
                                </span>
                              </div>

                              <div className="grid grid-cols-3 gap-2">
                                {/* 10am – 1pm */}
                                <div className="bg-green-50/40 p-2 sm:p-2.5 rounded-xl border border-green-200/70 text-center flex flex-col justify-between">
                                  <span className="text-[10px] font-bold uppercase text-slate-700 block mb-1">
                                    10am – 1pm
                                  </span>
                                  <MobileNumberInput
                                    value={e.slot_10_to_1}
                                    disabled={isLocked || loading}
                                    onChange={(val) =>
                                      handleCellChange(metric.key, "slot_10_to_1", val)
                                    }
                                    onStep={(delta) =>
                                      handleStep(metric.key, "slot_10_to_1", delta)
                                    }
                                    placeholder="0"
                                    step={isMinutes ? 5 : 1}
                                    borderColor="border-green-300"
                                    arrowColor="text-green-800 hover:text-green-950"
                                    textSize="text-base"
                                  />
                                  {isMinutes && !isLocked && (
                                    <div className="flex justify-center gap-1 mt-1.5">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleStep(metric.key, "slot_10_to_1", 15)
                                        }
                                        className="text-[9px] font-bold px-1.5 py-0.5 bg-green-100/80 hover:bg-green-200 text-green-900 rounded active:scale-95 transition-all"
                                        title="Add 15 minutes"
                                      >
                                        +15m
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleStep(metric.key, "slot_10_to_1", 30)
                                        }
                                        className="text-[9px] font-bold px-1.5 py-0.5 bg-green-100/80 hover:bg-green-200 text-green-900 rounded active:scale-95 transition-all"
                                        title="Add 30 minutes"
                                      >
                                        +30m
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {/* 2pm – 5pm */}
                                <div className="bg-green-50/40 p-2 sm:p-2.5 rounded-xl border border-green-200/70 text-center flex flex-col justify-between">
                                  <span className="text-[10px] font-bold uppercase text-slate-700 block mb-1">
                                    2pm – 5pm
                                  </span>
                                  <MobileNumberInput
                                    value={e.slot_2_to_5}
                                    disabled={isLocked || loading}
                                    onChange={(val) =>
                                      handleCellChange(metric.key, "slot_2_to_5", val)
                                    }
                                    onStep={(delta) =>
                                      handleStep(metric.key, "slot_2_to_5", delta)
                                    }
                                    placeholder="0"
                                    step={isMinutes ? 5 : 1}
                                    borderColor="border-green-300"
                                    arrowColor="text-green-800 hover:text-green-950"
                                    textSize="text-base"
                                  />
                                  {isMinutes && !isLocked && (
                                    <div className="flex justify-center gap-1 mt-1.5">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleStep(metric.key, "slot_2_to_5", 15)
                                        }
                                        className="text-[9px] font-bold px-1.5 py-0.5 bg-green-100/80 hover:bg-green-200 text-green-900 rounded active:scale-95 transition-all"
                                        title="Add 15 minutes"
                                      >
                                        +15m
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleStep(metric.key, "slot_2_to_5", 30)
                                        }
                                        className="text-[9px] font-bold px-1.5 py-0.5 bg-green-100/80 hover:bg-green-200 text-green-900 rounded active:scale-95 transition-all"
                                        title="Add 30 minutes"
                                      >
                                        +30m
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {/* 5pm – 6pm */}
                                <div className="bg-green-50/40 p-2 sm:p-2.5 rounded-xl border border-green-200/70 text-center flex flex-col justify-between">
                                  <span className="text-[10px] font-bold uppercase text-slate-700 block mb-1">
                                    5pm – 6pm
                                  </span>
                                  <MobileNumberInput
                                    value={e.slot_5_to_6}
                                    disabled={isLocked || loading}
                                    onChange={(val) =>
                                      handleCellChange(metric.key, "slot_5_to_6", val)
                                    }
                                    onStep={(delta) =>
                                      handleStep(metric.key, "slot_5_to_6", delta)
                                    }
                                    placeholder="0"
                                    step={isMinutes ? 5 : 1}
                                    borderColor="border-green-300"
                                    arrowColor="text-green-800 hover:text-green-950"
                                    textSize="text-base"
                                  />
                                  {isMinutes && !isLocked && (
                                    <div className="flex justify-center gap-1 mt-1.5">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleStep(metric.key, "slot_5_to_6", 15)
                                        }
                                        className="text-[9px] font-bold px-1.5 py-0.5 bg-green-100/80 hover:bg-green-200 text-green-900 rounded active:scale-95 transition-all"
                                        title="Add 15 minutes"
                                      >
                                        +15m
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleStep(metric.key, "slot_5_to_6", 30)
                                        }
                                        className="text-[9px] font-bold px-1.5 py-0.5 bg-green-100/80 hover:bg-green-200 text-green-900 rounded active:scale-95 transition-all"
                                        title="Add 30 minutes"
                                      >
                                        +30m
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Card Footer: Summary of this metric */}
                            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                              <span className="text-slate-500 font-medium">
                                {isMinutes ? "Today's Duration:" : "Today's Visits:"}
                              </span>
                              <span className="font-extrabold text-green-950 bg-green-50 px-2.5 py-1 rounded-lg border border-green-200">
                                {isMinutes
                                  ? `${rowSum} min (${formatMinutes(rowSum)})`
                                  : `${rowSum} visits`}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            PC SPREADSHEET TABLE VIEW (Unchanged, Excel-style for desktop)
           ═══════════════════════════════════════════════════════════════════ */}
        {viewMode === "table" && (
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-green-700" />
                  Meeting Time Daily Breakdown
                </CardTitle>
                <span className="text-xs text-slate-500">
                  {formatReadableDate(reportDate)}
                </span>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-700 text-[11px] font-semibold">
                    <th className="py-2.5 px-4 min-w-[220px]">Activity Metric</th>
                    <th className="py-2.5 px-3 text-center w-28">Unit</th>
                    <th className="py-2.5 px-3 text-center w-28">Till Today</th>
                    <th className="py-2.5 px-3 text-center w-28 bg-green-50/50">10am – 1pm</th>
                    <th className="py-2.5 px-3 text-center w-28 bg-green-50/50">2pm – 5pm</th>
                    <th className="py-2.5 px-3 text-center w-28 bg-green-50/50">5pm – 6pm</th>
                    <th className="py-2.5 px-3 text-center w-28 bg-slate-50 font-bold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {MEETING_METRICS.map((metric) => {
                    const e = entries[metric.key];
                    const rowSum =
                      (e.slot_10_to_1 || 0) +
                      (e.slot_2_to_5 || 0) +
                      (e.slot_5_to_6 || 0);

                    return (
                      <tr
                        key={metric.key}
                        className="hover:bg-slate-50/80 transition-colors"
                      >
                        <td className="py-2.5 px-4 font-semibold text-slate-900">
                          {metric.label}
                        </td>

                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                              metric.unit === "minutes"
                                ? "bg-green-50 text-green-800 border border-green-200"
                                : "bg-slate-100 text-slate-700 border border-slate-200"
                            }`}
                          >
                            {metric.unit === "minutes" ? "Minutes" : "Count"}
                          </span>
                        </td>

                        {/* Till Today */}
                        <td className="p-1.5 text-center">
                          <input
                            type="number"
                            min="0"
                            disabled={isLocked || loading}
                            value={e.till_today ?? ""}
                            onChange={(ev) =>
                              handleCellChange(metric.key, "till_today", ev.target.value)
                            }
                            placeholder="—"
                            className="w-full text-center py-1 border border-slate-300 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                          />
                        </td>

                        {/* 10 AM to 1 PM */}
                        <td className="p-1.5 text-center bg-green-50/20">
                          <input
                            type="number"
                            min="0"
                            disabled={isLocked || loading}
                            value={e.slot_10_to_1 ?? ""}
                            onChange={(ev) =>
                              handleCellChange(metric.key, "slot_10_to_1", ev.target.value)
                            }
                            placeholder="—"
                            className="w-full text-center py-1 border border-slate-300 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                          />
                        </td>

                        {/* 2 PM to 5 PM */}
                        <td className="p-1.5 text-center bg-green-50/20">
                          <input
                            type="number"
                            min="0"
                            disabled={isLocked || loading}
                            value={e.slot_2_to_5 ?? ""}
                            onChange={(ev) =>
                              handleCellChange(metric.key, "slot_2_to_5", ev.target.value)
                            }
                            placeholder="—"
                            className="w-full text-center py-1 border border-slate-300 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                          />
                        </td>

                        {/* 5 PM to 6 PM */}
                        <td className="p-1.5 text-center bg-green-50/20">
                          <input
                            type="number"
                            min="0"
                            disabled={isLocked || loading}
                            value={e.slot_5_to_6 ?? ""}
                            onChange={(ev) =>
                              handleCellChange(metric.key, "slot_5_to_6", ev.target.value)
                            }
                            placeholder="—"
                            className="w-full text-center py-1 border border-slate-300 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                          />
                        </td>

                        {/* Row Total */}
                        <td className="py-2.5 px-3 text-center font-bold text-slate-900 bg-slate-50">
                          {rowSum > 0
                            ? metric.unit === "minutes"
                              ? `${rowSum} min`
                              : rowSum
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* ── Key Metric Summary Cards (Shown for Table View) ─────────────── */}
        {viewMode === "table" && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-1.5 text-slate-700 mb-1">
                <MapPin className="w-3.5 h-3.5 text-green-700" />
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  Outdoor Visits
                </span>
              </div>
              <div className="text-2xl font-bold text-slate-900">
                {totals.outdoorVisits}
              </div>
              <p className="text-xs text-slate-600 font-medium mt-0.5">
                Duration: {formatMinutes(totals.outdoorMinutes)}
              </p>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-1.5 text-slate-700 mb-1">
                <UserCheck className="w-3.5 h-3.5 text-green-700" />
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  Indoor Customers (CX)
                </span>
              </div>
              <div className="text-2xl font-bold text-slate-900">
                {totals.indoorCxCount}
              </div>
              <p className="text-xs text-slate-600 font-medium mt-0.5">
                Duration: {formatMinutes(totals.indoorMinutes)}
              </p>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-1.5 text-slate-700 mb-1">
                <Users className="w-3.5 h-3.5 text-green-700" />
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  Internal Meetings
                </span>
              </div>
              <div className="text-2xl font-bold text-slate-900">
                {formatMinutes(totals.mgMinutes + totals.teamMeetingMinutes)}
              </div>
              <p className="text-xs text-slate-600 font-medium mt-0.5">
                MG ({totals.mgMinutes}m) + Team ({totals.teamMeetingMinutes}m)
              </p>
            </Card>

            <Card className="p-4 bg-green-50/40 border-green-200">
              <div className="flex items-center gap-1.5 text-green-800 mb-1">
                <Clock className="w-3.5 h-3.5 text-green-700" />
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  Total Meeting Time
                </span>
              </div>
              <div className="text-2xl font-extrabold text-green-900">
                {totals.formattedTotalTime}
              </div>
              <p className="text-xs text-green-800 font-medium mt-0.5">
                {totals.totalMeetingMinutes} total minutes today
              </p>
            </Card>
          </div>
        )}

        {/* ── Quick Log Meeting / Visit Modal ─────────────────────────────── */}
        <Modal
          isOpen={isQuickModalOpen}
          onClose={() => setIsQuickModalOpen(false)}
          title="Log Meeting or Field Visit"
          description={`Record your activity for ${formatReadableDate(reportDate)} in seconds.`}
          maxWidth="max-w-lg"
        >
          <div className="space-y-4">
            {/* 1. Activity Type */}
            <div>
              <label className="text-[11px] sm:text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                1. Select Activity Type
              </label>
              <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                {[
                  {
                    key: "outdoor" as const,
                    title: "Outdoor Visit",
                    desc: "Client / site visit",
                    icon: MapPin,
                    color: "text-emerald-700",
                    bg: "bg-emerald-50",
                    border: "border-emerald-200",
                    activeBg: "bg-emerald-100 border-emerald-600 text-emerald-950 ring-2 ring-emerald-600/30",
                  },
                  {
                    key: "indoor" as const,
                    title: "Indoor CX Meeting",
                    desc: "Client visited office",
                    icon: UserCheck,
                    color: "text-blue-700",
                    bg: "bg-blue-50",
                    border: "border-blue-200",
                    activeBg: "bg-blue-100 border-blue-600 text-blue-950 ring-2 ring-blue-600/30",
                  },
                  {
                    key: "team" as const,
                    title: "Team Meeting",
                    desc: "Internal staff sync",
                    icon: Users,
                    color: "text-purple-700",
                    bg: "bg-purple-50",
                    border: "border-purple-200",
                    activeBg: "bg-purple-100 border-purple-600 text-purple-950 ring-2 ring-purple-600/30",
                  },
                  {
                    key: "mg" as const,
                    title: "Management (MG)",
                    desc: "Meeting with HOD / MG",
                    icon: Briefcase,
                    color: "text-amber-700",
                    bg: "bg-amber-50",
                    border: "border-amber-200",
                    activeBg: "bg-amber-100 border-amber-600 text-amber-950 ring-2 ring-amber-600/30",
                  },
                ].map((item) => {
                  const isSelected = quickCategory === item.key;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setQuickCategory(item.key);
                        if (item.key === "outdoor") {
                          if (quickDuration === 30) setQuickDuration(60);
                        } else if (item.key === "team" || item.key === "mg") {
                          if (quickDuration === 60) setQuickDuration(30);
                        }
                      }}
                      className={`p-2 sm:p-2.5 rounded-xl border text-left flex items-start gap-1.5 sm:gap-2 transition-all ${
                        isSelected ? item.activeBg : `${item.bg} ${item.border} hover:opacity-90`
                      }`}
                    >
                      <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 bg-white shadow-2xs ${item.color}`}>
                        <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[11px] sm:text-xs text-slate-900 leading-tight block break-words">
                            {item.title}
                          </span>
                          {isSelected && <Check className="w-3 h-3 text-emerald-700 shrink-0 stroke-[3] ml-1" />}
                        </div>
                        <span className="text-[9px] sm:text-[10px] text-slate-500 leading-tight block mt-0.5 break-words">
                          {item.desc}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Time Slot */}
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">
                2. Shift / Time Slot
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: "slot_10_to_1" as const, label: "10am – 1pm", period: "Morning" },
                  { key: "slot_2_to_5" as const, label: "2pm – 5pm", period: "Afternoon" },
                  { key: "slot_5_to_6" as const, label: "5pm – 6pm", period: "Evening" },
                ].map((s) => {
                  const isSelected = quickSlot === s.key;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setQuickSlot(s.key)}
                      className={`py-2 px-2 rounded-xl text-center border text-xs font-bold transition-all ${
                        isSelected
                          ? "bg-green-800 text-white border-green-800 shadow-xs ring-2 ring-green-600/30"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <span className="block text-[10px] opacity-75 uppercase font-medium">{s.period}</span>
                      <span className="block mt-0.5">{s.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Duration */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  3. Duration: <span className="text-green-800 font-extrabold text-sm">{formatMinutes(quickDuration)} ({quickDuration} min)</span>
                </label>
                <span className="text-[10px] text-slate-500">Tap preset or adjust</span>
              </div>

              {/* Preset Duration Chips */}
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {[15, 30, 45, 60, 90, 120, 180].map((mins) => {
                  const isSelected = quickDuration === mins;
                  return (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setQuickDuration(mins)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        isSelected
                          ? "bg-green-700 text-white shadow-2xs"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      {mins >= 60 ? `${mins / 60}h` : `${mins}m`}
                      {mins === 60 ? " (1 hr)" : mins === 120 ? " (2 hrs)" : ""}
                    </button>
                  );
                })}
              </div>

              {/* Custom Duration Stepper */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuickDuration((prev) => Math.max(0, prev - 15))}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-sm active:scale-95 transition-all"
                >
                  −15m
                </button>
                <div className="relative flex-1">
                  <input
                    type="number"
                    min="0"
                    step="5"
                    value={quickDuration}
                    onChange={(e) => setQuickDuration(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="w-full text-center py-2 px-3 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:ring-2 focus:ring-green-600 focus:outline-none"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-medium pointer-events-none">
                    mins
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setQuickDuration((prev) => prev + 15)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-sm active:scale-95 transition-all"
                >
                  +15m
                </button>
              </div>
            </div>

            {/* 4. Number of Visits (Only for Outdoor & Indoor) */}
            {(quickCategory === "outdoor" || quickCategory === "indoor") && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    4. Number of {quickCategory === "outdoor" ? "Visits" : "Customers"}
                  </label>
                  <span className="text-green-800 font-extrabold text-sm">{quickCount} {quickCount === 1 ? "Visit" : "Visits"}</span>
                </div>

                <div className="grid grid-cols-4 gap-2 mb-2">
                  {[1, 2, 3, 4].map((cnt) => {
                    const isSelected = quickCount === cnt;
                    return (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => setQuickCount(cnt)}
                        className={`py-2 rounded-lg text-xs font-bold transition-all text-center ${
                          isSelected
                            ? "bg-green-700 text-white shadow-2xs"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {cnt} {cnt === 1 ? "Visit" : "Visits"}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQuickCount((prev) => Math.max(1, prev - 1))}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-xs active:scale-95 transition-all"
                  >
                    −1
                  </button>
                  <input
                    type="number"
                    min="1"
                    value={quickCount}
                    onChange={(e) => setQuickCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full text-center py-1.5 px-3 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-green-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setQuickCount((prev) => prev + 1)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-xs active:scale-95 transition-all"
                  >
                    +1
                  </button>
                </div>
              </div>
            )}

            {/* Live Preview Summary */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex items-center justify-between text-slate-700">
              <span className="text-slate-500">Summary:</span>
              <span className="font-bold text-slate-900">
                {quickCategory === "outdoor" ? "Outdoor Visit" : quickCategory === "indoor" ? "Indoor CX" : quickCategory === "team" ? "Team Meeting" : "Management Meeting"} · {quickSlot === "slot_10_to_1" ? "10am–1pm" : quickSlot === "slot_2_to_5" ? "2pm–5pm" : "5pm–6pm"} · {formatMinutes(quickDuration)}
                {(quickCategory === "outdoor" || quickCategory === "indoor") ? ` (${quickCount} visits)` : ""}
              </span>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsQuickModalOpen(false)}
                disabled={quickSaving}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveQuickActivity}
                loading={quickSaving}
                className="font-bold bg-green-700 hover:bg-green-800 text-white px-5"
              >
                <Check className="w-4 h-4 mr-1.5 stroke-[2.5]" />
                Save & Record Activity
              </Button>
            </div>
          </div>
        </Modal>

        {/* ── Submit Modal ─────────────────────────────────────────────────── */}
        <Modal
          isOpen={submitModalOpen}
          onClose={() => setSubmitModalOpen(false)}
          title="Submit Daily Meeting Activity Report"
          description={`Finalizing meeting report for ${formatReadableDate(reportDate)}`}
        >
          <div className="space-y-4">
            <div className="p-3 bg-green-50 border border-green-200 rounded text-xs text-green-900">
              Submitting will lock this report permanently. Make sure your outdoor visits and customer hours are exact.
            </div>

            <div className="bg-slate-50 p-3 rounded border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Outdoor Visits:</span>
                <span className="font-bold text-slate-900">{totals.outdoorVisits}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Indoor Customers:</span>
                <span className="font-bold text-slate-900">{totals.indoorCxCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Meeting Time:</span>
                <span className="font-bold text-green-800">{totals.formattedTotalTime}</span>
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

        {/* ── Mobile Sticky Bottom Action Bar (Sits above bottom nav) ──────────────── */}
        {!isLocked && (
          <div className="sm:hidden fixed bottom-14 left-0 right-0 p-3 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-lg z-30 flex items-center justify-between gap-2">
            {/* Mobile Auto-Save Status */}
            <div className="shrink-0">
              {autoSaveStatus === "saving" && (
                <span className="flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 animate-pulse">
                  <RefreshCw className="w-2.5 h-2.5 animate-spin text-amber-600" />
                  Saving
                </span>
              )}
              {autoSaveStatus === "saved" && (
                <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                  Saved
                </span>
              )}
              {autoSaveStatus === "unsaved" && (
                <span className="flex items-center gap-1 text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Unsaved
                </span>
              )}
              {autoSaveStatus === "error" && (
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  className="flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200"
                >
                  <AlertCircle className="w-2.5 h-2.5 text-rose-600" />
                  Retry
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-1 justify-end">
              <Button
                variant="primary"
                size="sm"
                className="font-bold text-xs px-3 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => handleOpenQuickModal("outdoor")}
                disabled={loading || saving}
              >
                <Plus className="w-3.5 h-3.5 mr-1 stroke-[2.5]" />
                Log
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="font-semibold text-xs px-2.5"
                onClick={handleSaveDraft}
                loading={saving}
                disabled={loading}
                title="Manual draft save fallback"
              >
                <Save className="w-3.5 h-3.5 mr-1" />
                Save
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="font-semibold text-xs px-3"
                onClick={() => setSubmitModalOpen(true)}
                disabled={loading || saving}
              >
                <Send className="w-3.5 h-3.5 mr-1" />
                Submit
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default function MeetingTimeDailyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-sm text-slate-500">
          Loading Meeting Activity...
        </div>
      }
    >
      <MeetingTimeDailyContent />
    </Suspense>
  );
}
