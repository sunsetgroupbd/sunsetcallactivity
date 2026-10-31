"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import {
  Target,
  Sliders,
  Plus,
  Edit2,
  Trash2,
  Users,
  CheckCircle2,
  Calendar,
  PhoneCall,
  Banknote,
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
import { api, ApiError } from "@/lib/api";
import { DailyTarget, User } from "@/types";
import { formatBDT, getDhakaToday, formatReadableDate, formatEmployeeId } from "@/lib/utils";

function SettingsContent() {
  // Targets state
  const [targets, setTargets] = useState<DailyTarget[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Target Modal State
  const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<DailyTarget | null>(null);

  // Target Form fields
  const [targetEmployeeId, setTargetEmployeeId] = useState<number | "global">("global");
  const [targetDate, setTargetDate] = useState<string>("");
  const [dialedTarget, setDialedTarget] = useState<string>("200");
  const [connectedTarget, setConnectedTarget] = useState<string>("100");
  const [callDurationTarget, setCallDurationTarget] = useState<string>("120");
  const [outdoorTarget, setOutdoorTarget] = useState<string>("3");
  const [meetingTarget, setMeetingTarget] = useState<string>("180");
  const [salesTarget, setSalesTarget] = useState<string>("16667");
  const [tbTarget, setTbTarget] = useState<string>("6667");
  const [emiTarget, setEmiTarget] = useState<string>("10000");
  const [targetInputMode, setTargetInputMode] = useState<"daily" | "monthly">("daily");

  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [deletingTarget, setDeletingTarget] = useState(false);

  // KPI Credit Rules State (Once-Per-Day)
  const [indoorCredit, setIndoorCredit] = useState<string>("35");
  const [outdoorCredit, setOutdoorCredit] = useState<string>("70");
  const [savingKpiRules, setSavingKpiRules] = useState(false);

  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const [targetsData, employeesData, kpiRules] = await Promise.all([
        api.settings.getTargets(),
        api.employees.list({ is_active: true }),
        api.settings.getSystemSettings("kpi_rules").catch(() => []),
      ]);
      setTargets(Array.isArray(targetsData) ? targetsData : []);
      setEmployees(Array.isArray(employeesData) ? employeesData : []);
      if (Array.isArray(kpiRules)) {
        const indoor = kpiRules.find((r) => r.key === "indoor_cx_call_credit");
        const outdoor = kpiRules.find((r) => r.key === "outdoor_visit_call_credit");
        if (indoor?.value) setIndoorCredit(indoor.value);
        if (outdoor?.value) setOutdoorCredit(outdoor.value);
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setStatusMessage({ type: "error", text: err.message });
      } else {
        setStatusMessage({
          type: "error",
          text: "Failed to load system settings and targets.",
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreateTarget = () => {
    const today = getDhakaToday();
    setEditingTarget(null);
    setTargetEmployeeId("global");
    setTargetDate(today);
    setDialedTarget("200");
    setConnectedTarget("100");
    setCallDurationTarget("120");
    setOutdoorTarget("3");
    setMeetingTarget("180");
    setSalesTarget("16667");
    setTbTarget("6667");
    setEmiTarget("10000");
    setTargetInputMode("daily");
    setFormError(null);
    setIsTargetModalOpen(true);
  };

  const openEditTarget = (t: DailyTarget) => {
    const today = getDhakaToday();
    setEditingTarget(t);
    setTargetEmployeeId(t.employee_id ? t.employee_id : "global");
    setTargetDate(t.target_date || t.effective_from || today);
    setDialedTarget(t.dialed_calls_target ? String(t.dialed_calls_target) : "");
    setConnectedTarget(t.connected_calls_target ? String(t.connected_calls_target) : "");
    setCallDurationTarget(t.call_duration_minutes_target ? String(t.call_duration_minutes_target) : "");
    
    const outdoorVal = t.outdoor_visits_target ?? t.outdoor_visit_target;
    setOutdoorTarget(outdoorVal ? String(outdoorVal) : "");
    
    let meetingVal = t.meeting_minutes_target;
    if (meetingVal == null && t.meeting_hours_target != null) {
      meetingVal = Math.round(Number(t.meeting_hours_target) * 60);
    }
    setMeetingTarget(meetingVal ? String(meetingVal) : "");

    const salesVal = t.sales_amount_target ?? t.sales_target;
    setSalesTarget(salesVal ? String(salesVal) : "");

    const tbVal = t.tb_target ?? t.collection_amount_target;
    setTbTarget(tbVal ? String(tbVal) : "");

    const emiVal = t.emi_target;
    setEmiTarget(emiVal ? String(emiVal) : "");
    setTargetInputMode("daily");
    setFormError(null);
    setIsTargetModalOpen(true);
  };

  const handleTargetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormError(null);

    const effDate = targetDate || getDhakaToday();
    const payload: Partial<DailyTarget> = {
      employee_id: targetEmployeeId === "global" ? null : Number(targetEmployeeId),
      effective_from: effDate,
      target_date: effDate,
      dialed_calls_target: dialedTarget ? parseInt(dialedTarget, 10) : null,
      connected_calls_target: connectedTarget ? parseInt(connectedTarget, 10) : null,
      call_duration_minutes_target: callDurationTarget ? parseInt(callDurationTarget, 10) : null,
      outdoor_visit_target: outdoorTarget ? parseInt(outdoorTarget, 10) : null,
      outdoor_visits_target: outdoorTarget ? parseInt(outdoorTarget, 10) : null,
      meeting_hours_target: meetingTarget ? parseFloat((parseInt(meetingTarget, 10) / 60).toFixed(2)) : null,
      meeting_minutes_target: meetingTarget ? parseInt(meetingTarget, 10) : null,
      sales_target: salesTarget ? parseFloat(salesTarget) : null,
      sales_amount_target: salesTarget ? parseFloat(salesTarget) : null,
      tb_target: tbTarget ? parseFloat(tbTarget) : null,
      collection_amount_target: tbTarget ? parseFloat(tbTarget) : null,
      emi_target: emiTarget ? parseFloat(emiTarget) : null,
    };

    try {
      if (editingTarget) {
        const updated = await api.settings.updateTarget(editingTarget.id, payload);
        setTargets((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item))
        );
        setStatusMessage({
          type: "success",
          text: "Daily target successfully updated.",
        });
      } else {
        const created = await api.settings.createTarget(payload);
        setTargets((prev) => [created, ...prev]);
        setStatusMessage({
          type: "success",
          text: "New performance target established successfully.",
        });
      }
      setIsTargetModalOpen(false);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("Failed to save target. Please try again.");
      }
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteTarget = async (id: number) => {
    setDeletingTarget(true);
    try {
      await api.settings.deleteTarget(id);
      setTargets((prev) => prev.filter((t) => t.id !== id));
      setDeleteTargetId(null);
      setStatusMessage({
        type: "success",
        text: "Target removed successfully.",
      });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setStatusMessage({ type: "error", text: err.message });
      } else {
        setStatusMessage({ type: "error", text: "Failed to delete target." });
      }
    } finally {
      setDeletingTarget(false);
    }
  };

  const handleSaveKpiRules = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingKpiRules(true);
    setStatusMessage(null);
    try {
      await Promise.all([
        api.settings.updateSystemSetting({
          namespace: "kpi_rules",
          key: "indoor_cx_call_credit",
          value: indoorCredit || "35",
          description: "Calls deducted from target per day with indoor CX meeting (Once-Per-Day)",
        }),
        api.settings.updateSystemSetting({
          namespace: "kpi_rules",
          key: "outdoor_visit_call_credit",
          value: outdoorCredit || "70",
          description: "Calls deducted from target per day with outdoor visit (Once-Per-Day)",
        }),
      ]);
      setStatusMessage({
        type: "success",
        text: "KPI Call Quota Credit rules updated successfully (Once-Per-Day active).",
      });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setStatusMessage({ type: "error", text: err.message });
      } else {
        setStatusMessage({ type: "error", text: "Failed to update KPI credit rules." });
      }
    } finally {
      setSavingKpiRules(false);
    }
  };

  return (
    <DashboardLayout
      title="Settings & Targets"
      subtitle="Configure daily employee KPI targets, business parameters, and system labels"
      adminOnly
    >
      <div className="space-y-6">
        {/* ── Status Feedback Alert ────────────────────────────────────────── */}
        {statusMessage && (
          <Alert
            type={statusMessage.type}
            onDismiss={() => setStatusMessage(null)}
          >
            {statusMessage.text}
          </Alert>
        )}

        {/* ── Daily Performance Targets Section ───────────────────────────── */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 p-4 sm:p-5">
              <div>
                <CardTitle className="text-sm sm:text-base font-bold flex items-center gap-2 text-slate-900">
                  <Target className="w-4 h-4 text-emerald-700" />
                  Daily KPI Targets
                </CardTitle>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                  Quotas & leaderboard benchmarks
                </p>
              </div>
              <Button variant="primary" size="sm" onClick={openCreateTarget} className="shrink-0">
                <Plus className="w-3.5 h-3.5 mr-1" />
                Set Target
              </Button>
            </CardHeader>

            {/* ── Mobile App Cards View (< md) ─────────────────────────────── */}
            <div className="md:hidden space-y-3 p-3 sm:p-4">
              {loading ? (
                <div className="py-8 text-center text-slate-400 text-xs">Loading targets...</div>
              ) : !Array.isArray(targets) || targets.length === 0 ? (
                <div className="py-6 px-4 text-center text-slate-500 text-xs bg-slate-50/50 rounded-xl border border-slate-200/80 space-y-1">
                  <p className="font-semibold text-slate-700">No Custom Targets</p>
                  <p className="text-[11px] text-slate-400">Global defaults are active for all staff.</p>
                </div>
              ) : (
                  targets.map((t) => {
                    const emp = employees.find((e) => e.id === t.employee_id);
                    return (
                      <div
                        key={t.id}
                        className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-3 transition-all hover:border-slate-300"
                      >
                        {/* Scope / Employee Header & Action Buttons */}
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            {emp ? (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Users className="w-3.5 h-3.5 text-emerald-700" />
                                <span className="font-bold text-slate-900 text-xs">{emp.full_name}</span>
                                <span className="font-mono text-[9px] font-bold bg-slate-100 text-slate-700 border border-slate-200 px-1 py-0.2 rounded">
                                  {formatEmployeeId(emp.id)}
                                </span>
                                <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                                  emp.role === "tl" ? "bg-amber-100 text-amber-900 border-amber-300" :
                                  emp.role === "co" ? "bg-sky-100 text-sky-900 border-sky-300" :
                                  "bg-slate-100 text-slate-700 border-slate-200"
                                }`}>
                                  {emp.role === "tl" ? "TL" : emp.role === "co" ? "CO" : "Exec"}
                                </span>
                              </div>
                            ) : (
                              <Badge variant="neutral" className="text-[10px]">Global Default</Badge>
                            )}
                            <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              <span>
                                {t.target_date || t.effective_from
                                  ? formatReadableDate(t.target_date || t.effective_from || "")
                                  : "All Dates"}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openEditTarget(t)}
                              className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
                              title="Edit Target"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteTargetId(t.id)}
                              className="p-1.5 text-rose-500 hover:text-rose-700 bg-rose-50/70 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors"
                              title="Delete Target"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Metric Grid: 2 columns on phone */}
                        <div className="grid grid-cols-2 gap-2 text-xs pt-2.5 border-t border-slate-100">
                          {/* Calls Target */}
                          <div className="bg-slate-50/70 p-2.5 rounded-lg border border-slate-200/70 space-y-0.5">
                            <div className="flex items-center gap-1 text-[10px] text-slate-500 font-semibold uppercase">
                              <PhoneCall className="w-3 h-3 text-slate-400" />
                              <span>Calls Target</span>
                            </div>
                            <div className="font-bold text-slate-900 text-xs">
                              {t.dialed_calls_target ? `${t.dialed_calls_target} dialed` : "—"}
                            </div>
                            <div className="text-[10px] text-emerald-700 font-medium">
                              {t.connected_calls_target ? `${t.connected_calls_target} connected` : ""}
                            </div>
                          </div>

                          {/* Visits & Meetings */}
                          <div className="bg-slate-50/70 p-2.5 rounded-lg border border-slate-200/70 space-y-0.5">
                            <div className="flex items-center gap-1 text-[10px] text-slate-500 font-semibold uppercase">
                              <Target className="w-3 h-3 text-slate-400" />
                              <span>Visits & Time</span>
                            </div>
                            <div className="font-bold text-slate-900 text-xs">
                              {(t.outdoor_visits_target ?? t.outdoor_visit_target) != null
                                ? `${t.outdoor_visits_target ?? t.outdoor_visit_target} visits`
                                : "—"}
                            </div>
                            <div className="text-[10px] text-slate-600 font-medium">
                              {t.meeting_minutes_target
                                ? `${t.meeting_minutes_target}m meet`
                                : t.meeting_hours_target
                                ? `${Math.round(Number(t.meeting_hours_target) * 60)}m meet`
                                : ""}
                            </div>
                          </div>

                          {/* 1. Daily New Sales Target */}
                          <div className="bg-slate-50/70 p-2.5 rounded-lg border border-slate-200/70 space-y-0.5">
                            <div className="flex items-center gap-1 text-[10px] text-slate-500 font-semibold uppercase">
                              <Banknote className="w-3 h-3 text-blue-500" />
                              <span>New Sales</span>
                            </div>
                            <div className="font-extrabold text-slate-900 text-xs">
                              {(t.sales_amount_target ?? t.sales_target) != null
                                ? formatBDT(t.sales_amount_target ?? t.sales_target!)
                                : "—"}
                            </div>
                            <div className="text-[10px] text-slate-400">/day</div>
                          </div>

                          {/* 2. Token to Booking (TB) Target */}
                          <div className="bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-200/70 space-y-0.5">
                            <div className="flex items-center gap-1 text-[10px] text-emerald-700 font-semibold uppercase">
                              <Banknote className="w-3 h-3 text-emerald-600" />
                              <span>TB Target</span>
                            </div>
                            <div className="font-extrabold text-emerald-800 text-xs">
                              {(t.tb_target ?? t.collection_amount_target) != null
                                ? formatBDT(t.tb_target ?? t.collection_amount_target!)
                                : "—"}
                            </div>
                            <div className="text-[10px] text-emerald-600">/day</div>
                          </div>

                          {/* 3. EMI Collection Target */}
                          <div className="col-span-2 bg-indigo-50/50 p-2.5 rounded-lg border border-indigo-200/70 space-y-0.5">
                            <div className="flex items-center gap-1 text-[10px] text-indigo-700 font-semibold uppercase">
                              <Banknote className="w-3 h-3 text-indigo-600" />
                              <span>EMI Collection Target</span>
                            </div>
                            <div className="font-extrabold text-indigo-900 text-xs">
                              {t.emi_target != null
                                ? `${formatBDT(t.emi_target)} /day`
                                : "—"}
                            </div>
                            <div className="text-[10px] text-indigo-600">
                              {t.emi_target != null ? `~ ${formatBDT(t.emi_target * 30)} /mo` : ""}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* ── Desktop Table View (>= md) ───────────────────────────────── */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-700 text-[11px] font-semibold">
                      <th className="py-2.5 px-4">Scope</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3 text-right">Dialed</th>
                      <th className="py-2.5 px-3 text-right">Connected</th>
                      <th className="py-2.5 px-3 text-right">Visits</th>
                      <th className="py-2.5 px-3 text-right">Meetings</th>
                      <th className="py-2.5 px-3 text-right">New Sales</th>
                      <th className="py-2.5 px-3 text-right">TB Target</th>
                      <th className="py-2.5 px-3 text-right">EMI Target</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan={10} className="py-10 text-center text-slate-400">
                          Loading targets...
                        </td>
                      </tr>
                    ) : !Array.isArray(targets) || targets.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-10 text-center text-slate-400">
                          No custom targets configured yet. Global defaults are active.
                        </td>
                      </tr>
                    ) : (
                      targets.map((t) => {
                        const emp = employees.find((e) => e.id === t.employee_id);
                        return (
                          <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-4 font-semibold text-slate-900">
                              {emp ? (
                                <span className="flex items-center gap-1.5 flex-wrap">
                                  <Users className="w-3.5 h-3.5 text-green-700" />
                                  <span>{emp.full_name}</span>
                                  <span className="font-mono text-[9px] font-bold bg-slate-100 text-slate-700 border border-slate-200 px-1 py-0.2 rounded">
                                    {formatEmployeeId(emp.id)}
                                  </span>
                                  <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                                    emp.role === "tl" ? "bg-amber-100 text-amber-900 border-amber-300" :
                                    emp.role === "co" ? "bg-sky-100 text-sky-900 border-sky-300" :
                                    "bg-slate-100 text-slate-700 border-slate-200"
                                  }`}>
                                    {emp.role === "tl" ? "TL" : emp.role === "co" ? "CO" : "Exec"}
                                  </span>
                                </span>
                              ) : (
                                <Badge variant="neutral">Global Default</Badge>
                              )}
                            </td>
                            <td className="py-3 px-3 text-slate-600">
                              {t.target_date || t.effective_from
                                ? formatReadableDate(t.target_date || t.effective_from || "")
                                : "All Dates"}
                            </td>
                            <td className="py-3 px-3 text-right font-medium text-slate-900">
                              {t.dialed_calls_target ? (
                                <div>
                                  <div>{t.dialed_calls_target} <span className="text-[10px] text-slate-400 font-normal">/day</span></div>
                                  <div className="text-[10px] text-slate-500 font-normal">~{t.dialed_calls_target * 30} /mo</div>
                                </div>
                              ) : "—"}
                            </td>
                            <td className="py-3 px-3 text-right font-medium text-emerald-700">
                              {t.connected_calls_target ? (
                                <div>
                                  <div>{t.connected_calls_target} <span className="text-[10px] text-emerald-600 font-normal">/day</span></div>
                                  <div className="text-[10px] text-emerald-600 font-normal">~{t.connected_calls_target * 30} /mo</div>
                                </div>
                              ) : "—"}
                            </td>
                            <td className="py-3 px-3 text-right text-slate-700">
                              {(t.outdoor_visits_target ?? t.outdoor_visit_target) ? (
                                <div>
                                  <div>{(t.outdoor_visits_target ?? t.outdoor_visit_target)} <span className="text-[10px] text-slate-400 font-normal">/day</span></div>
                                  <div className="text-[10px] text-slate-500 font-normal">~{(t.outdoor_visits_target ?? t.outdoor_visit_target)! * 30} /mo</div>
                                </div>
                              ) : "—"}
                            </td>
                            <td className="py-3 px-3 text-right text-slate-700">
                              {t.meeting_minutes_target
                                ? `${t.meeting_minutes_target}m`
                                : t.meeting_hours_target
                                ? `${Math.round(Number(t.meeting_hours_target) * 60)}m`
                                : "—"}
                            </td>
                            <td className="py-3 px-3 text-right font-semibold text-slate-900">
                              {(t.sales_amount_target ?? t.sales_target) != null ? (
                                <div>
                                  <div>{formatBDT(t.sales_amount_target ?? t.sales_target!)} <span className="text-[10px] text-slate-400 font-normal">/day</span></div>
                                  <div className="text-[10px] text-slate-500 font-normal">~{formatBDT((t.sales_amount_target ?? t.sales_target!) * 30)} /mo</div>
                                </div>
                              ) : "—"}
                            </td>
                            <td className="py-3 px-3 text-right font-semibold text-emerald-800">
                              {(t.tb_target ?? t.collection_amount_target) != null ? (
                                <div>
                                  <div>{formatBDT(t.tb_target ?? t.collection_amount_target!)} <span className="text-[10px] text-emerald-600 font-normal">/day</span></div>
                                  <div className="text-[10px] text-emerald-600 font-normal">~{formatBDT((t.tb_target ?? t.collection_amount_target!) * 30)} /mo</div>
                                </div>
                              ) : "—"}
                            </td>
                            <td className="py-3 px-3 text-right font-semibold text-indigo-900">
                              {t.emi_target != null ? (
                                <div>
                                  <div>{formatBDT(t.emi_target)} <span className="text-[10px] text-indigo-600 font-normal">/day</span></div>
                                  <div className="text-[10px] text-indigo-600 font-normal">~{formatBDT(t.emi_target * 30)} /mo</div>
                                </div>
                              ) : "—"}
                            </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEditTarget(t)}
                              className="p-1 text-slate-400 hover:text-green-700 rounded transition-colors"
                              title="Edit Target"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteTargetId(t.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                              title="Delete Target"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

        {/* ── Meeting Call Quota Credit Rules (Once-Per-Day) ─────────────── */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <PhoneCall className="w-4 h-4 text-emerald-700" />
                  Meeting Call Quota Credit Rules
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure call reduction credits granted for customer meetings & outdoor visits
                </p>
              </div>
              <Badge variant="success" className="text-[10px] w-fit">
                Once-Per-Day Rule Enforced
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveKpiRules} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-slate-900">Indoor CX Meeting Credit</label>
                    <span className="text-[10px] text-slate-500">calls deducted / day</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="500"
                    value={indoorCredit}
                    onChange={(e) => setIndoorCredit(e.target.value)}
                    placeholder="35"
                    className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold font-mono text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-500">
                    Granted once per day if the salesperson conducts one or more Indoor CX customer meetings.
                  </p>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-slate-900">Outdoor Visit Credit</label>
                    <span className="text-[10px] text-slate-500">calls deducted / day</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="500"
                    value={outdoorCredit}
                    onChange={(e) => setOutdoorCredit(e.target.value)}
                    placeholder="70"
                    className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold font-mono text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-500">
                    Granted once per day if the salesperson conducts one or more Outdoor site visits.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                <p className="text-[11px] text-slate-500">
                  Rules apply automatically to daily report targets and leaderboard KPI score calculations.
                </p>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={savingKpiRules}
                  disabled={savingKpiRules}
                >
                  Save Credit Rules
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* ── Business Hours & System Parameters Section ──────────────────── */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-green-700" />
                Operational System Configuration
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Time slots, business timezone, and lead status definitions
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <p className="font-semibold text-slate-900">Reporting Time Slots</p>
                <div className="space-y-1 text-slate-600">
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span>Morning Slot</span>
                    <span className="font-mono font-medium">10:00 AM – 01:00 PM</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span>Afternoon Slot</span>
                    <span className="font-mono font-medium">02:00 PM – 05:00 PM</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>Evening Slot</span>
                    <span className="font-mono font-medium">05:00 PM – 06:00 PM</span>
                  </div>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <p className="font-semibold text-slate-900">Business Timezone & Currency</p>
                <div className="space-y-1 text-slate-600">
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span>Operating Timezone</span>
                    <span className="font-mono font-medium">Asia/Dhaka (UTC+6)</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span>Standard Currency</span>
                    <span className="font-mono font-medium">BDT (৳)</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>Report Lock Status</span>
                    <span className="font-medium text-emerald-700">Enforced on Submit</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Target Edit Modal ────────────────────────────────────────────── */}
        <Modal
          isOpen={isTargetModalOpen}
          onClose={() => setIsTargetModalOpen(false)}
          title={editingTarget ? "Edit Target" : "Establish Performance Target"}
          description="Set daily quotas and monthly targets."
        >
          <form onSubmit={handleTargetSubmit} className="space-y-4">
            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800">
                {formError}
              </div>
            )}

            {/* Compact note */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 border border-emerald-200/70 rounded-md text-[11px] text-emerald-900 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Global fallback and daily deficit carry-forward are active.</span>
            </div>

            {/* Mode Switcher */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs font-semibold">
              <button
                type="button"
                onClick={() => setTargetInputMode("daily")}
                className={`flex-1 py-1 px-3 rounded-md transition-all text-center ${
                  targetInputMode === "daily"
                    ? "bg-white text-emerald-900 shadow-xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Daily Quota
              </button>
              <button
                type="button"
                onClick={() => setTargetInputMode("monthly")}
                className={`flex-1 py-1 px-3 rounded-md transition-all text-center ${
                  targetInputMode === "monthly"
                    ? "bg-white text-emerald-900 shadow-xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Monthly Target
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Scope
                </label>
                <select
                  value={targetEmployeeId}
                  onChange={(e) =>
                    setTargetEmployeeId(
                      e.target.value === "global" ? "global" : Number(e.target.value)
                    )
                  }
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
                >
                  <option value="global">Global Default (All Employees)</option>
                  {employees.map((emp) => {
                    const roleTag =
                      emp.role === "tl"
                        ? "TL"
                        : emp.role === "co"
                        ? "CO"
                        : emp.role === "admin"
                        ? "Admin"
                        : emp.role === "sub_admin"
                        ? "Sub-Admin"
                        : "Exec";
                    return (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name} ({formatEmployeeId(emp.id)} • {roleTag})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Target Date
                </label>
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Dialed Calls
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder={targetInputMode === "daily" ? "e.g. 200" : "e.g. 6000"}
                  value={
                    targetInputMode === "daily"
                      ? dialedTarget
                      : dialedTarget ? String(parseInt(dialedTarget, 10) * 30) : ""
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (targetInputMode === "daily") {
                      setDialedTarget(val);
                    } else {
                      setDialedTarget(val ? String(Math.round(parseInt(val, 10) / 30)) : "");
                    }
                  }}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-500 focus:ring-1 focus:ring-green-600 focus:outline-none"
                />
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  {targetInputMode === "daily"
                    ? dialedTarget ? `~ ${parseInt(dialedTarget, 10) * 30}/mo` : ""
                    : dialedTarget ? `~ ${dialedTarget}/day` : ""}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Connected Calls
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder={targetInputMode === "daily" ? "e.g. 100" : "e.g. 3000"}
                  value={
                    targetInputMode === "daily"
                      ? connectedTarget
                      : connectedTarget ? String(parseInt(connectedTarget, 10) * 30) : ""
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (targetInputMode === "daily") {
                      setConnectedTarget(val);
                    } else {
                      setConnectedTarget(val ? String(Math.round(parseInt(val, 10) / 30)) : "");
                    }
                  }}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-500 focus:ring-1 focus:ring-green-600 focus:outline-none"
                />
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  {targetInputMode === "daily"
                    ? connectedTarget ? `~ ${parseInt(connectedTarget, 10) * 30}/mo` : ""
                    : connectedTarget ? `~ ${connectedTarget}/day` : ""}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Outdoor Visits
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder={targetInputMode === "daily" ? "e.g. 3" : "e.g. 90"}
                  value={
                    targetInputMode === "daily"
                      ? outdoorTarget
                      : outdoorTarget ? String(parseInt(outdoorTarget, 10) * 30) : ""
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (targetInputMode === "daily") {
                      setOutdoorTarget(val);
                    } else {
                      setOutdoorTarget(val ? String(Math.round(parseInt(val, 10) / 30)) : "");
                    }
                  }}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-500 focus:ring-1 focus:ring-green-600 focus:outline-none"
                />
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  {targetInputMode === "daily"
                    ? outdoorTarget ? `~ ${parseInt(outdoorTarget, 10) * 30}/mo` : ""
                    : outdoorTarget ? `~ ${outdoorTarget}/day` : ""}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Meeting Minutes
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder={targetInputMode === "daily" ? "e.g. 180" : "e.g. 5400"}
                  value={
                    targetInputMode === "daily"
                      ? meetingTarget
                      : meetingTarget ? String(parseInt(meetingTarget, 10) * 30) : ""
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (targetInputMode === "daily") {
                      setMeetingTarget(val);
                    } else {
                      setMeetingTarget(val ? String(Math.round(parseInt(val, 10) / 30)) : "");
                    }
                  }}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-500 focus:ring-1 focus:ring-green-600 focus:outline-none"
                />
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  {targetInputMode === "daily"
                    ? meetingTarget ? `~ ${((parseInt(meetingTarget, 10) * 30) / 60).toFixed(1)} hrs/mo` : ""
                    : meetingTarget ? `~ ${(parseInt(meetingTarget, 10) / 60).toFixed(1)} hrs/day` : ""}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  New Sales (BDT)
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder={targetInputMode === "daily" ? "e.g. 16667" : "e.g. 500000"}
                  value={
                    targetInputMode === "daily"
                      ? salesTarget
                      : salesTarget ? String(Math.round(parseFloat(salesTarget) * 30)) : ""
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (targetInputMode === "daily") {
                      setSalesTarget(val);
                    } else {
                      setSalesTarget(val ? String(Math.round(parseFloat(val) / 30)) : "");
                    }
                  }}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-500 focus:ring-1 focus:ring-green-600 focus:outline-none"
                />
                <span className="text-[10px] text-slate-500 block mt-0.5 font-medium">
                  {targetInputMode === "daily"
                    ? salesTarget ? `~ ৳${(parseFloat(salesTarget) * 30).toLocaleString()}/mo` : ""
                    : salesTarget ? `~ ৳${parseFloat(salesTarget).toLocaleString()}/day` : ""}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  TB Target (BDT)
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder={targetInputMode === "daily" ? "e.g. 6667" : "e.g. 200000"}
                  value={
                    targetInputMode === "daily"
                      ? tbTarget
                      : tbTarget ? String(Math.round(parseFloat(tbTarget) * 30)) : ""
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (targetInputMode === "daily") {
                      setTbTarget(val);
                    } else {
                      setTbTarget(val ? String(Math.round(parseFloat(val) / 30)) : "");
                    }
                  }}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-500 focus:ring-1 focus:ring-green-600 focus:outline-none"
                />
                <span className="text-[10px] text-emerald-600 block mt-0.5 font-medium">
                  {targetInputMode === "daily"
                    ? tbTarget ? `~ ৳${(parseFloat(tbTarget) * 30).toLocaleString()}/mo` : ""
                    : tbTarget ? `~ ৳${parseFloat(tbTarget).toLocaleString()}/day` : ""}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  EMI Target (BDT)
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder={targetInputMode === "daily" ? "e.g. 10000" : "e.g. 300000"}
                  value={
                    targetInputMode === "daily"
                      ? emiTarget
                      : emiTarget ? String(Math.round(parseFloat(emiTarget) * 30)) : ""
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (targetInputMode === "daily") {
                      setEmiTarget(val);
                    } else {
                      setEmiTarget(val ? String(Math.round(parseFloat(val) / 30)) : "");
                    }
                  }}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-500 focus:ring-1 focus:ring-green-600 focus:outline-none"
                />
                <span className="text-[10px] text-indigo-600 block mt-0.5 font-medium">
                  {targetInputMode === "daily"
                    ? emiTarget ? `~ ৳${(parseFloat(emiTarget) * 30).toLocaleString()}/mo` : ""
                    : emiTarget ? `~ ৳${parseFloat(emiTarget).toLocaleString()}/day` : ""}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsTargetModalOpen(false)}
                disabled={formSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={formSubmitting}>
                Save Target
              </Button>
            </div>
          </form>
        </Modal>

        {/* ── Delete Target Confirmation Modal ─────────────────────────────── */}
        <Modal
          isOpen={deleteTargetId !== null}
          onClose={() => setDeleteTargetId(null)}
          title="Confirm Delete Target"
          description="Are you sure you want to remove this KPI target?"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-600">
              This target configuration will be permanently removed. The employee or system will revert to default global targets.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteTargetId(null)}
                disabled={deletingTarget}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={deletingTarget}
                onClick={() => deleteTargetId && handleDeleteTarget(deleteTargetId)}
              >
                Delete Target
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-sm text-slate-500">
          Loading Settings & Targets...
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
