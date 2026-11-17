"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button, Card, CardContent, Badge, TakaIcon } from "@/components/ui";
import { formatBDT, formatReadableDate, cn, formatEmployeeId } from "@/lib/utils";
import type {
  MonthlyScorecardResponse,
  ScorecardPeriodRow,
  ScorecardCustomer,
  ScorecardCustomerCreateRequest,
  ScorecardCustomerUpdateRequest,
  MonthlyScorecardUpdateRequest,
  User,
} from "@/types";
import {
  Award,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Printer,
  Plus,
  Trash2,
  Edit2,
  Lock,
  CheckCircle2,
  AlertCircle,
  Users,
  TrendingUp,
  Sparkles,
  PhoneCall,
  Clock,
  Layers,
  ChevronDown,
  Save,
  X,
  Target,
  FileSpreadsheet,
} from "lucide-react";

export default function ScorecardPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading Scorecard...</div>}>
      <ScorecardContent />
    </Suspense>
  );
}

function ScorecardContent() {
  const { user, isAdmin, isSubAdmin, canSupervise } = useAuth();

  // Current Date / Month standard Asia/Dhaka
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  // Selected Employee ID (Supervisors / Admins can switch between subordinates)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [employeesList, setEmployeesList] = useState<User[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState<boolean>(false);

  // Scorecard state
  const [scorecard, setScorecard] = useState<MonthlyScorecardResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Editable Manual States (Table 1 inputs)
  const [editManual, setEditManual] = useState<MonthlyScorecardUpdateRequest>({});
  const [savingManual, setSavingManual] = useState<boolean>(false);

  // Customer Modal States (Table 2)
  const [customerModalOpen, setCustomerModalOpen] = useState<boolean>(false);
  const [editingCustomer, setEditingCustomer] = useState<ScorecardCustomer | null>(null);
  const [customerForm, setCustomerForm] = useState<ScorecardCustomerCreateRequest>({
    customer_name: "",
    paid_amount: 0,
    unpaid_amount: 0,
    collection_date: "",
    next_collection_date: "",
    next_collection_date_2: "",
    in_out_plan: "Office / Call",
    date_1: "",
    date_2: "",
    new_sales_amount: 0,
    tb_amount: 0,
    emi_amount: 0,
    new_lead_status: "P",
    collection_probability: 50,
    remarks: "",
  });
  const [savingCustomer, setSavingCustomer] = useState<boolean>(false);

  // Close Month confirmation state
  const [closingMonth, setClosingMonth] = useState<boolean>(false);

  // Active view tab for mobile: "table1" | "table2" | "portfolio"
  const [mobileTab, setMobileTab] = useState<"table1" | "table2" | "portfolio">("table1");

  // Determine current effective employee ID
  const effectiveEmployeeId = useMemo(() => {
    if (selectedEmployeeId) return selectedEmployeeId;
    if (user?.role === "admin" || user?.role === "sub_admin") {
      // Pick first staff member if admin hasn't selected one
      return employeesList[0]?.id || null;
    }
    return user?.id || null;
  }, [selectedEmployeeId, user, employeesList]);

  // Load employee list for supervisor switcher
  useEffect(() => {
    if (isAdmin || isSubAdmin || canSupervise) {
      setLoadingEmployees(true);
      api.employees
        .list({ is_active: true })
        .then((data) => {
          const staff = data.filter((e) => e.role === "employee" || e.role === "tl" || e.role === "co");
          setEmployeesList(staff);
          if (!selectedEmployeeId && staff.length > 0) {
            setSelectedEmployeeId(staff[0].id);
          }
        })
        .catch((err) => {
          console.error("Failed to load staff list for scorecard supervisor selector:", err);
        })
        .finally(() => setLoadingEmployees(false));
    }
  }, [isAdmin, isSubAdmin, canSupervise]);

  // Fetch Scorecard Data
  const loadScorecard = async () => {
    if (!effectiveEmployeeId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.scorecard.get(effectiveEmployeeId, selectedMonth);
      setScorecard(data);
      // Initialize edit manual form
      setEditManual({
        prediction_amount: data.prediction_amount,
        planned_leave: data.planned_leave,
        unauthorized_leave: data.unauthorized_leave,
        emi_due_monthly: data.portfolio.emi_due_monthly,
        emi_client_count: data.portfolio.emi_client_count,
        emi_hold_count: data.portfolio.emi_hold_count,
        emi_cancel_count: data.portfolio.emi_cancel_count,
        tb_due_amount: data.portfolio.tb_due_amount,
        tb_client_count: data.portfolio.tb_client_count,
        tb_share_count: data.portfolio.tb_share_count,
        tb_hold_count: data.portfolio.tb_hold_count,
        tb_cancel_count: data.portfolio.tb_cancel_count,
        sheet_score: data.sheet_score,
        call_score: data.call_score,
        marking: data.marking,
        supervisor_notes: data.supervisor_notes,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "Failed to load scorecard");
      } else {
        setError("Unable to connect to scorecard service");
      }
      setScorecard(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadScorecard();
  }, [effectiveEmployeeId, selectedMonth]);

  // Handle Month Navigation
  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const prevDate = new Date(y, m - 2, 1);
    setSelectedMonth(
      `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`
    );
  };

  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const nextDate = new Date(y, m, 1);
    setSelectedMonth(
      `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`
    );
  };

  // Save manual / supervisor updates
  const handleSaveManual = async () => {
    if (!effectiveEmployeeId || !scorecard) return;
    setSavingManual(true);
    setSuccessMsg(null);
    setError(null);
    try {
      const updated = await api.scorecard.update(effectiveEmployeeId, selectedMonth, editManual);
      setScorecard(updated);
      setSuccessMsg("Scorecard updated successfully.");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err?.message || "Failed to update scorecard");
    } finally {
      setSavingManual(false);
    }
  };

  // Close Month & Freeze Snapshot
  const handleCloseMonth = async () => {
    if (!effectiveEmployeeId || !scorecard) return;
    if (!window.confirm("Are you sure you want to CLOSE and FREEZE this month's scorecard? Once closed, all numbers and customer rows become permanent and locked against future edits.")) {
      return;
    }
    setClosingMonth(true);
    setError(null);
    try {
      const closed = await api.scorecard.close(effectiveEmployeeId, selectedMonth);
      setScorecard(closed);
      setSuccessMsg("Month closed and locked successfully.");
    } catch (err: any) {
      setError(err?.message || "Failed to close month");
    } finally {
      setClosingMonth(false);
    }
  };

  // Customer Plan Modal Handlers
  const openAddCustomerModal = () => {
    setEditingCustomer(null);
    setCustomerForm({
      customer_name: "",
      paid_amount: 0,
      unpaid_amount: 0,
      collection_date: "",
      next_collection_date: "",
      next_collection_date_2: "",
      in_out_plan: "Office / Call",
      date_1: "",
      date_2: "",
      new_sales_amount: 0,
      tb_amount: 0,
      emi_amount: 0,
      new_lead_status: "P",
      collection_probability: 50,
      remarks: "",
    });
    setCustomerModalOpen(true);
  };

  const openEditCustomerModal = (cust: ScorecardCustomer) => {
    setEditingCustomer(cust);
    setCustomerForm({
      customer_name: cust.customer_name,
      paid_amount: cust.paid_amount,
      unpaid_amount: cust.unpaid_amount,
      collection_date: cust.collection_date || "",
      next_collection_date: cust.next_collection_date || "",
      next_collection_date_2: cust.next_collection_date_2 || "",
      in_out_plan: cust.in_out_plan || "Office / Call",
      date_1: cust.date_1 || "",
      date_2: cust.date_2 || "",
      new_sales_amount: cust.new_sales_amount,
      tb_amount: cust.tb_amount,
      emi_amount: cust.emi_amount,
      new_lead_status: cust.new_lead_status,
      collection_probability: cust.collection_probability,
      remarks: cust.remarks || "",
    });
    setCustomerModalOpen(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scorecard) return;
    setSavingCustomer(true);
    setError(null);
    try {
      const sanitizedPayload = {
        ...customerForm,
        collection_date: customerForm.collection_date?.trim() ? customerForm.collection_date : null,
        next_collection_date: customerForm.next_collection_date?.trim() ? customerForm.next_collection_date : null,
        next_collection_date_2: customerForm.next_collection_date_2?.trim() ? customerForm.next_collection_date_2 : null,
        date_1: customerForm.date_1?.trim() ? customerForm.date_1 : null,
        date_2: customerForm.date_2?.trim() ? customerForm.date_2 : null,
      };

      if (editingCustomer) {
        await api.scorecard.updateCustomer(editingCustomer.id, sanitizedPayload, scorecard.id);
      } else {
        await api.scorecard.addCustomer(scorecard.id, sanitizedPayload);
      }
      setCustomerModalOpen(false);
      await loadScorecard();
    } catch (err: any) {
      setError(err?.message || "Failed to save customer plan row");
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleDeleteCustomer = async (cust: ScorecardCustomer) => {
    if (!scorecard) return;
    if (!window.confirm(`Delete collection plan row for ${cust.customer_name}?`)) return;
    try {
      await api.scorecard.deleteCustomer(cust.id, scorecard.id);
      await loadScorecard();
    } catch (err: any) {
      setError(err?.message || "Failed to delete customer row");
    }
  };

  // Helper for certainty badge colors matching Sales & Collection page
  const renderCertaintyBadge = (prob: number) => {
    let colorClass = "bg-sky-50 text-sky-800 border-sky-300";
    if (prob >= 80) {
      colorClass = "bg-emerald-50 text-emerald-800 border-emerald-300";
    } else if (prob >= 50) {
      colorClass = "bg-amber-50 text-amber-850 border-amber-300";
    }
    return (
      <span className={`inline-flex items-center gap-0.5 text-[10px] font-extrabold px-1.5 py-0.5 rounded border font-mono ${colorClass}`}>
        {prob}%
      </span>
    );
  };

  const isClosed = scorecard?.status === "closed";

  return (
    <DashboardLayout title="Monthly Scorecard">
      <div className="space-y-6 pb-12">
        {/* ─── Top Control Header & Month Picker ─────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 md:p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-green-50 text-green-700 border border-green-200">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
                  Monthly Executive Scorecard
                </h1>
                {scorecard && (
                  <Badge variant={isClosed ? "neutral" : "success"}>
                    {isClosed ? (
                      <span className="flex items-center gap-1 font-semibold">
                        <Lock className="w-3 h-3" /> Closed / Frozen
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 font-semibold">
                        <Sparkles className="w-3 h-3" /> Active Draft
                      </span>
                    )}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Digitized monthly performance scorecard and customer recovery ledger.
              </p>
            </div>
          </div>

          {/* Month Picker & Print Button */}
          <div className="flex items-center gap-2.5 self-start md:self-auto">
            <div className="flex items-center bg-slate-50 border border-slate-300 rounded-lg p-0.5 shadow-sm">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded transition"
                title="Previous Month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="px-3 py-1 text-sm font-bold text-slate-800 font-mono select-none">
                {selectedMonth}
              </div>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded transition"
                title="Next Month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {effectiveEmployeeId && (
              <Link
                href={`/scorecard/print?employee_id=${effectiveEmployeeId}&month=${selectedMonth}`}
                target="_blank"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-sm transition"
              >
                <Printer className="w-4 h-4 text-slate-600" />
                <span className="hidden sm:inline">Print A4</span>
              </Link>
            )}

            {scorecard?.can_close && !isClosed && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCloseMonth}
                disabled={closingMonth}
                className="border-rose-300 text-rose-700 hover:bg-rose-50"
              >
                <Lock className="w-3.5 h-3.5 mr-1" />
                Close Month
              </Button>
            )}
          </div>
        </div>

        {/* ─── Supervisor / Admin Employee Switcher Bar ──────────────────────── */}
        {(isAdmin || isSubAdmin || canSupervise) && employeesList.length > 0 && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
              <Users className="w-4 h-4 text-green-700" />
              <span>Supervisor Scope: Viewing Scorecard for:</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={effectiveEmployeeId || ""}
                onChange={(e) => setSelectedEmployeeId(Number(e.target.value))}
                className="bg-white border border-slate-300 rounded-lg text-xs font-semibold px-3 py-1.5 text-slate-800 shadow-xs focus:ring-2 focus:ring-green-600 focus:outline-none"
              >
                {employeesList.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name} ({formatEmployeeId(emp.id, emp.created_at)}) — {emp.role.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Alerts & Notifications */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-lg p-3 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-3 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* ─── Form Header Information Card ─────────────────────────────────── */}
        {scorecard && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5 shadow-sm space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Executive Name
                </span>
                <span className="text-sm font-bold text-slate-900 block mt-0.5">
                  {scorecard.header.employee_name}
                </span>
                <span className="text-[10px] font-mono text-slate-500 font-semibold">
                  ID: #{scorecard.header.employee_formatted_id}
                </span>
              </div>

              <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Designation / Team
                </span>
                <span className="text-sm font-bold text-slate-800 block mt-0.5">
                  {scorecard.header.position || "Executive"}
                </span>
                <span className="text-[10px] text-green-700 font-medium">
                  {scorecard.header.team_name || "General Sales"}
                </span>
              </div>

              <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Team Leader (T.L.)
                </span>
                <span className="text-sm font-semibold text-slate-800 block mt-0.5">
                  {scorecard.header.tl_name || "—"}
                </span>
              </div>

              <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Coordinator (C.O.)
                </span>
                <span className="text-sm font-semibold text-slate-800 block mt-0.5">
                  {scorecard.header.co_name || "—"}
                </span>
              </div>
            </div>

            {/* Attendance & Forecast Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-100 text-xs">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">Employee Monthly Prediction:</span>
                  <span className="font-extrabold text-slate-900 font-mono">
                    {formatBDT(scorecard.prediction_amount)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Planned Leave:</span>
                  <span className="font-bold text-slate-800 font-mono">
                    {scorecard.planned_leave} days
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Un-Authorize Leave:</span>
                  <span className="font-bold text-rose-700 font-mono">
                    {scorecard.unauthorized_leave} days
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">Sheet Score:</span>
                  <span className="font-bold text-slate-800 font-mono">
                    {scorecard.sheet_score ?? "—"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">Call Score:</span>
                  <span className="font-bold text-slate-800 font-mono">
                    {scorecard.call_score ?? "—"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  <span className="text-amber-900 font-semibold">Marking:</span>
                  <span className="font-extrabold text-amber-900 font-mono">
                    {scorecard.marking !== null && scorecard.marking !== undefined ? `${scorecard.marking} / 100` : "Not Entered"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Mobile View Tabs ─────────────────────────────────────────────── */}
        <div className="flex md:hidden border-b border-slate-200 bg-white rounded-t-xl overflow-x-auto text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMobileTab("table1")}
            className={cn(
              "flex-1 py-3 px-4 text-center border-b-2 whitespace-nowrap",
              mobileTab === "table1"
                ? "border-green-700 text-green-700 bg-green-50/50"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            Table 1: Performance Matrix
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("table2")}
            className={cn(
              "flex-1 py-3 px-4 text-center border-b-2 whitespace-nowrap",
              mobileTab === "table2"
                ? "border-green-700 text-green-700 bg-green-50/50"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            Table 2: Customer Recovery Plan ({scorecard?.customers.length || 0})
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("portfolio")}
            className={cn(
              "flex-1 py-3 px-4 text-center border-b-2 whitespace-nowrap",
              mobileTab === "portfolio"
                ? "border-green-700 text-green-700 bg-green-50/50"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            Portfolio Snapshot
          </button>
        </div>

        {/* ─── Table 1: Performance by Period (Spreadsheet Style) ────────────── */}
        {scorecard && (
          <div className={cn("space-y-3", mobileTab !== "table1" && "hidden md:block")}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-green-700" />
                Table 1: Performance by Period
              </h2>
              <span className="text-[11px] text-slate-500">
                Derived cumulative totals as of Dhaka cutoff days
              </span>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                      <th className="py-2.5 px-3 sticky left-0 bg-slate-100 z-10 isolate font-bold border-r border-slate-200 min-w-[120px]">
                        Period / Date
                      </th>
                      <th className="py-2.5 px-2.5 text-right font-bold min-w-[90px]">TG (Sales)</th>
                      <th className="py-2.5 px-2.5 text-right font-bold text-emerald-800 bg-emerald-50/50 min-w-[90px]">New Sales</th>
                      <th className="py-2.5 px-2.5 text-right font-bold text-emerald-800 bg-emerald-50/50 min-w-[85px]">TB</th>
                      <th className="py-2.5 px-2.5 text-right font-bold text-emerald-800 bg-emerald-50/50 min-w-[85px]">EMI</th>
                      <th className="py-2.5 px-2.5 text-right font-bold text-emerald-900 bg-emerald-100/60 min-w-[95px]">Total Collec</th>
                      <th className="py-2.5 px-2 text-center font-bold min-w-[60px]">Tot Lead</th>
                      <th className="py-2.5 px-2 text-center font-bold min-w-[60px]">Fair Lead</th>
                      <th className="py-2.5 px-2 text-center font-bold min-w-[60px]">FB Lead</th>
                      <th className="py-2.5 px-2 text-center font-bold text-emerald-700 min-w-[45px]">HP</th>
                      <th className="py-2.5 px-2 text-center font-bold text-amber-700 min-w-[45px]">P</th>
                      <th className="py-2.5 px-2 text-center font-bold text-sky-700 min-w-[45px]">Fup</th>
                      <th className="py-2.5 px-2 text-center font-bold min-w-[65px]">Calls Dial</th>
                      <th className="py-2.5 px-2 text-center font-bold text-rose-700 min-w-[60px]">Hold</th>
                      <th className="py-2.5 px-2 text-center font-bold text-rose-700 min-w-[60px]">Cancel</th>
                      <th className="py-2.5 px-2 text-center font-bold min-w-[55px]">In Done</th>
                      <th className="py-2.5 px-2 text-center font-bold min-w-[55px]">Out Done</th>
                      <th className="py-2.5 px-2 text-right font-bold text-slate-600 min-w-[75px]">Sold Fair</th>
                      <th className="py-2.5 px-2 text-right font-bold text-slate-600 min-w-[75px]">Sold FB</th>
                      <th className="py-2.5 px-2 text-right font-bold text-slate-600 min-w-[75px]">Sold Other</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {scorecard.periods.map((row, idx) => {
                      const isPrev = row.row_type === "previous_month";
                      return (
                        <tr
                          key={idx}
                          className={cn(
                            "hover:bg-slate-50/80 transition-colors font-mono text-[11.5px]",
                            isPrev ? "bg-slate-50/60 text-slate-600 italic" : "text-slate-800"
                          )}
                        >
                          <td className="py-2 px-3 sticky left-0 bg-white font-sans font-bold border-r border-slate-200 whitespace-nowrap z-10 isolate">
                            {row.label}
                          </td>
                          <td className="py-2 px-2.5 text-right font-medium text-slate-600">
                            {formatBDT(row.tg_sales)}
                          </td>
                          <td className="py-2 px-2.5 text-right font-bold text-emerald-700 bg-emerald-50/30">
                            {formatBDT(row.new_sales)}
                          </td>
                          <td className="py-2 px-2.5 text-right font-bold text-emerald-700 bg-emerald-50/30">
                            {formatBDT(row.tb)}
                          </td>
                          <td className="py-2 px-2.5 text-right font-bold text-emerald-700 bg-emerald-50/30">
                            {formatBDT(row.emi)}
                          </td>
                          <td className="py-2 px-2.5 text-right font-extrabold text-emerald-900 bg-emerald-100/40">
                            {formatBDT(row.total_collection)}
                          </td>
                          <td className="py-2 px-2 text-center font-semibold text-slate-700">
                            {row.total_lead}
                          </td>
                          <td className="py-2 px-2 text-center font-semibold text-slate-700">
                            {row.current_fair_lead}
                          </td>
                          <td className="py-2 px-2 text-center font-semibold text-slate-700">
                            {row.current_fb_lead}
                          </td>
                          <td className="py-2 px-2 text-center font-bold text-emerald-700">
                            {row.hp}
                          </td>
                          <td className="py-2 px-2 text-center font-bold text-amber-700">
                            {row.p}
                          </td>
                          <td className="py-2 px-2 text-center font-bold text-sky-700">
                            {row.fup}
                          </td>
                          <td className="py-2 px-2 text-center font-semibold text-slate-700">
                            {row.total_calls_dialed}
                          </td>
                          <td className="py-2 px-2 text-center text-rose-600">
                            {row.hold_amount > 0 ? formatBDT(row.hold_amount) : "0"}
                          </td>
                          <td className="py-2 px-2 text-center text-rose-600">
                            {row.cancel_amount > 0 ? formatBDT(row.cancel_amount) : "0"}
                          </td>
                          <td className="py-2 px-2 text-center font-medium">
                            {row.in_done}
                          </td>
                          <td className="py-2 px-2 text-center font-medium">
                            {row.out_done}
                          </td>
                          <td className="py-2 px-2 text-right text-slate-600">
                            {formatBDT(row.sold_fair)}
                          </td>
                          <td className="py-2 px-2 text-right text-slate-600">
                            {formatBDT(row.sold_fb)}
                          </td>
                          <td className="py-2 px-2 text-right text-slate-600">
                            {formatBDT(row.sold_other)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ─── Table 2: Customer Collection Plan ────────────────────────────── */}
        {scorecard && (
          <div className={cn("space-y-3", mobileTab !== "table2" && "hidden md:block")}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-green-700" />
                  Table 2: Customer Collection Plan
                </h2>
                <span className="text-[11px] text-slate-500">
                  Targeted customer-by-customer commitments, next collection dates & probability
                </span>
              </div>
              {!isClosed && (
                <Button size="sm" onClick={openAddCustomerModal} className="self-start sm:self-auto">
                  <Plus className="w-4 h-4 mr-1" />
                  Add Customer Row
                </Button>
              )}
            </div>

            {/* Desktop Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden hidden md:block">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                      <th className="py-2.5 px-3 min-w-[140px]">Customer Name</th>
                      <th className="py-2.5 px-2 text-right min-w-[80px]">Paid</th>
                      <th className="py-2.5 px-2 text-right min-w-[80px]">Unpaid</th>
                      <th className="py-2.5 px-2 min-w-[90px]">Collec Date</th>
                      <th className="py-2.5 px-2 min-w-[95px]">Next Collec 1</th>
                      <th className="py-2.5 px-2 min-w-[95px]">Next Collec 2</th>
                      <th className="py-2.5 px-2 min-w-[90px]">IN/Out Plan</th>
                      <th className="py-2.5 px-2 min-w-[80px]">Date-1</th>
                      <th className="py-2.5 px-2 min-w-[80px]">Date 2</th>
                      <th className="py-2.5 px-2 text-right min-w-[85px]">New Sales</th>
                      <th className="py-2.5 px-2 text-right min-w-[80px]">TB</th>
                      <th className="py-2.5 px-2 text-right min-w-[80px]">EMI</th>
                      <th className="py-2.5 px-2 text-right font-extrabold text-emerald-900 bg-emerald-50 min-w-[95px]">Total Expected</th>
                      <th className="py-2.5 px-2 text-center min-w-[50px]">Status</th>
                      <th className="py-2.5 px-2 text-center min-w-[65px]">Prob %</th>
                      <th className="py-2.5 px-3 min-w-[130px]">Remarks</th>
                      {!isClosed && <th className="py-2.5 px-2 text-center w-16">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {scorecard.customers.length === 0 ? (
                      <tr>
                        <td
                          colSpan={17}
                          className="py-8 text-center text-slate-400 italic font-sans"
                        >
                          No customer recovery plans logged for this month yet. Click &quot;Add Customer Row&quot; above to create one.
                        </td>
                      </tr>
                    ) : (
                      scorecard.customers.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50/80 font-mono text-[11px]">
                          <td className="py-2.5 px-3 font-sans font-bold text-slate-900">
                            {c.customer_name}
                          </td>
                          <td className="py-2.5 px-2 text-right text-slate-600 font-semibold">
                            {formatBDT(c.paid_amount)}
                          </td>
                          <td className="py-2.5 px-2 text-right text-rose-700 font-semibold">
                            {formatBDT(c.unpaid_amount)}
                          </td>
                          <td className="py-2.5 px-2 text-slate-600 font-sans">
                            {c.collection_date ? formatReadableDate(c.collection_date) : "—"}
                          </td>
                          <td className="py-2.5 px-2 text-emerald-800 font-bold font-sans">
                            {c.next_collection_date ? formatReadableDate(c.next_collection_date) : "—"}
                          </td>
                          <td className="py-2.5 px-2 text-slate-600 font-sans">
                            {c.next_collection_date_2 ? formatReadableDate(c.next_collection_date_2) : "—"}
                          </td>
                          <td className="py-2.5 px-2 font-sans font-medium text-slate-700">
                            {c.in_out_plan}
                          </td>
                          <td className="py-2.5 px-2 text-slate-600 font-sans">
                            {c.date_1 ? formatReadableDate(c.date_1) : "—"}
                          </td>
                          <td className="py-2.5 px-2 text-slate-600 font-sans">
                            {c.date_2 ? formatReadableDate(c.date_2) : "—"}
                          </td>
                          <td className="py-2.5 px-2 text-right text-emerald-700 font-bold">
                            {formatBDT(c.new_sales_amount)}
                          </td>
                          <td className="py-2.5 px-2 text-right text-emerald-700 font-bold">
                            {formatBDT(c.tb_amount)}
                          </td>
                          <td className="py-2.5 px-2 text-right text-emerald-700 font-bold">
                            {formatBDT(c.emi_amount)}
                          </td>
                          <td className="py-2.5 px-2 text-right font-extrabold text-emerald-900 bg-emerald-50/70">
                            {formatBDT(c.total_collection)}
                          </td>
                          <td className="py-2.5 px-2 text-center font-bold text-slate-800">
                            {c.new_lead_status}
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            {renderCertaintyBadge(c.collection_probability)}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 font-sans truncate max-w-[150px]" title={c.remarks || ""}>
                            {c.remarks || "—"}
                          </td>
                          {!isClosed && (
                            <td className="py-2.5 px-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => openEditCustomerModal(c)}
                                  className="p-1 text-slate-500 hover:text-green-700 transition"
                                  title="Edit Row"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCustomer(c)}
                                  className="p-1 text-slate-400 hover:text-rose-600 transition"
                                  title="Delete Row"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Cards for Table 2 */}
            <div className="space-y-3 md:hidden">
              {scorecard.customers.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-xs text-slate-500 italic">
                  No customer recovery plans logged for this month yet.
                </div>
              ) : (
                scorecard.customers.map((c) => (
                  <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-xs">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">{c.customer_name}</h4>
                        <span className="text-[10px] text-slate-500 font-medium">Plan: {c.in_out_plan}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {renderCertaintyBadge(c.collection_probability)}
                        {!isClosed && (
                          <div className="flex items-center gap-1 ml-1">
                            <button
                              type="button"
                              onClick={() => openEditCustomerModal(c)}
                              className="p-1 text-slate-500 hover:text-green-700"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCustomer(c)}
                              className="p-1 text-slate-400 hover:text-rose-600"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-sans">Expected Total</span>
                        <span className="font-extrabold text-emerald-800 text-sm">{formatBDT(c.total_collection)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-sans">Next Collec Date</span>
                        <span className="font-bold text-slate-800">{c.next_collection_date ? formatReadableDate(c.next_collection_date) : "—"}</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-[11px] text-slate-500">
                      <span>Status: <strong className="text-slate-800">{c.new_lead_status}</strong></span>
                      {c.remarks && <span className="truncate max-w-[180px]">{c.remarks}</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ─── Portfolio Snapshot & Manual Inputs Drawer ─────────────────────── */}
        {scorecard && (
          <div className={cn("space-y-4", mobileTab !== "portfolio" && "hidden md:block")}>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-green-700" />
                  Portfolio Snapshot & Executive Review
                </h3>
                {!isClosed && (
                  <Button size="sm" onClick={handleSaveManual} disabled={savingManual}>
                    <Save className="w-3.5 h-3.5 mr-1" />
                    Save Scorecard Changes
                  </Button>
                )}
              </div>

              {/* Portfolio Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3.5 text-xs">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                    EMI Due Monthly
                  </label>
                  <input
                    type="number"
                    disabled={isClosed}
                    value={editManual.emi_due_monthly ?? 0}
                    onChange={(e) =>
                      setEditManual({ ...editManual, emi_due_monthly: Number(e.target.value) })
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono text-slate-900 text-xs focus:ring-1 focus:ring-green-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                    EMI Clients
                  </label>
                  <input
                    type="number"
                    disabled={isClosed}
                    value={editManual.emi_client_count ?? 0}
                    onChange={(e) =>
                      setEditManual({ ...editManual, emi_client_count: Number(e.target.value) })
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono text-slate-900 text-xs focus:ring-1 focus:ring-green-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                    EMI Hold
                  </label>
                  <input
                    type="number"
                    disabled={isClosed}
                    value={editManual.emi_hold_count ?? 0}
                    onChange={(e) =>
                      setEditManual({ ...editManual, emi_hold_count: Number(e.target.value) })
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono text-slate-900 text-xs focus:ring-1 focus:ring-green-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                    EMI Cancel
                  </label>
                  <input
                    type="number"
                    disabled={isClosed}
                    value={editManual.emi_cancel_count ?? 0}
                    onChange={(e) =>
                      setEditManual({ ...editManual, emi_cancel_count: Number(e.target.value) })
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono text-slate-900 text-xs focus:ring-1 focus:ring-green-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                    TB Due Amount
                  </label>
                  <input
                    type="number"
                    disabled={isClosed}
                    value={editManual.tb_due_amount ?? 0}
                    onChange={(e) =>
                      setEditManual({ ...editManual, tb_due_amount: Number(e.target.value) })
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono text-slate-900 text-xs focus:ring-1 focus:ring-green-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                    TB Clients
                  </label>
                  <input
                    type="number"
                    disabled={isClosed}
                    value={editManual.tb_client_count ?? 0}
                    onChange={(e) =>
                      setEditManual({ ...editManual, tb_client_count: Number(e.target.value) })
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono text-slate-900 text-xs focus:ring-1 focus:ring-green-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                    TB Share
                  </label>
                  <input
                    type="number"
                    disabled={isClosed}
                    value={editManual.tb_share_count ?? 0}
                    onChange={(e) =>
                      setEditManual({ ...editManual, tb_share_count: Number(e.target.value) })
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono text-slate-900 text-xs focus:ring-1 focus:ring-green-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                    TB Hold
                  </label>
                  <input
                    type="number"
                    disabled={isClosed}
                    value={editManual.tb_hold_count ?? 0}
                    onChange={(e) =>
                      setEditManual({ ...editManual, tb_hold_count: Number(e.target.value) })
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono text-slate-900 text-xs focus:ring-1 focus:ring-green-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                    TB Cancel
                  </label>
                  <input
                    type="number"
                    disabled={isClosed}
                    value={editManual.tb_cancel_count ?? 0}
                    onChange={(e) =>
                      setEditManual({ ...editManual, tb_cancel_count: Number(e.target.value) })
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono text-slate-900 text-xs focus:ring-1 focus:ring-green-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                    Prediction Amount
                  </label>
                  <input
                    type="number"
                    disabled={isClosed}
                    value={editManual.prediction_amount ?? 0}
                    onChange={(e) =>
                      setEditManual({ ...editManual, prediction_amount: Number(e.target.value) })
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono text-slate-900 text-xs focus:ring-1 focus:ring-green-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Attendance & Supervisor Marking */}
              <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                    Planned Leave (Days)
                  </label>
                  <input
                    type="number"
                    disabled={isClosed}
                    value={editManual.planned_leave ?? 0}
                    onChange={(e) =>
                      setEditManual({ ...editManual, planned_leave: Number(e.target.value) })
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono text-slate-900 text-xs focus:ring-1 focus:ring-green-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                    Un-Authorize Leave (Days)
                  </label>
                  <input
                    type="number"
                    disabled={isClosed}
                    value={editManual.unauthorized_leave ?? 0}
                    onChange={(e) =>
                      setEditManual({ ...editManual, unauthorized_leave: Number(e.target.value) })
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono text-slate-900 text-xs focus:ring-1 focus:ring-green-600 focus:outline-none"
                  />
                </div>

                {/* Supervisor Restricted Evaluation */}
                <div className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-200/80">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-bold text-amber-900 uppercase block">
                      Marking (Out of 100)
                    </label>
                    {!scorecard.can_edit_marking && (
                      <span className="text-[9px] text-amber-700 italic">Supervisor only</span>
                    )}
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    disabled={isClosed || !scorecard.can_edit_marking}
                    value={editManual.marking ?? ""}
                    placeholder="e.g. 85"
                    onChange={(e) =>
                      setEditManual({
                        ...editManual,
                        marking: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    className="w-full bg-white border border-amber-300 rounded px-2.5 py-1.5 font-mono font-bold text-amber-900 text-xs focus:ring-1 focus:ring-amber-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </div>

                <div className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-200/80">
                  <label className="text-[10px] font-bold text-amber-900 uppercase block mb-1">
                    Supervisor Notes
                  </label>
                  <input
                    type="text"
                    disabled={isClosed || !scorecard.can_edit_marking}
                    value={editManual.supervisor_notes ?? ""}
                    placeholder="Evaluation feedback"
                    onChange={(e) =>
                      setEditManual({ ...editManual, supervisor_notes: e.target.value })
                    }
                    className="w-full bg-white border border-amber-300 rounded px-2.5 py-1.5 text-slate-800 text-xs focus:ring-1 focus:ring-amber-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Customer Modal (Add / Edit Table 2) ──────────────────────────── */}
        {customerModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
            <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
                <h3 className="text-sm font-bold text-slate-900">
                  {editingCustomer ? "Edit Customer Plan Row" : "Add Customer Recovery Plan Row"}
                </h3>
                <button
                  type="button"
                  onClick={() => setCustomerModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveCustomer} className="p-4 md:p-5 space-y-3.5 text-xs">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Customer Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={customerForm.customer_name}
                    onChange={(e) => setCustomerForm({ ...customerForm, customer_name: e.target.value })}
                    placeholder="e.g. Mr. Shafiqul Alam"
                    className="w-full border border-slate-300 rounded px-3 py-2 text-slate-900 focus:ring-2 focus:ring-green-600 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      Paid Amount (BDT)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={customerForm.paid_amount || ""}
                      onChange={(e) => setCustomerForm({ ...customerForm, paid_amount: Number(e.target.value) })}
                      className="w-full border border-slate-300 rounded px-3 py-1.5 font-mono text-slate-900 focus:ring-1 focus:ring-green-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      Unpaid Amount (BDT)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={customerForm.unpaid_amount || ""}
                      onChange={(e) => setCustomerForm({ ...customerForm, unpaid_amount: Number(e.target.value) })}
                      className="w-full border border-slate-300 rounded px-3 py-1.5 font-mono text-slate-900 focus:ring-1 focus:ring-green-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 bg-emerald-50/60 p-3 rounded-lg border border-emerald-200">
                  <div>
                    <label className="text-[10px] font-bold text-emerald-900 block mb-1">
                      New Sales
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={customerForm.new_sales_amount || ""}
                      onChange={(e) => setCustomerForm({ ...customerForm, new_sales_amount: Number(e.target.value) })}
                      className="w-full bg-white border border-emerald-300 rounded px-2 py-1 font-mono text-xs text-slate-900 focus:ring-1 focus:ring-green-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-emerald-900 block mb-1">
                      TB
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={customerForm.tb_amount || ""}
                      onChange={(e) => setCustomerForm({ ...customerForm, tb_amount: Number(e.target.value) })}
                      className="w-full bg-white border border-emerald-300 rounded px-2 py-1 font-mono text-xs text-slate-900 focus:ring-1 focus:ring-green-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-emerald-900 block mb-1">
                      EMI
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={customerForm.emi_amount || ""}
                      onChange={(e) => setCustomerForm({ ...customerForm, emi_amount: Number(e.target.value) })}
                      className="w-full bg-white border border-emerald-300 rounded px-2 py-1 font-mono text-xs text-slate-900 focus:ring-1 focus:ring-green-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      Next Collec Date (Primary)
                    </label>
                    <input
                      type="date"
                      value={customerForm.next_collection_date || ""}
                      onChange={(e) => setCustomerForm({ ...customerForm, next_collection_date: e.target.value })}
                      className="w-full border border-slate-300 rounded px-3 py-1.5 text-slate-900 text-xs focus:ring-1 focus:ring-green-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      Next Collec Date (Secondary)
                    </label>
                    <input
                      type="date"
                      value={customerForm.next_collection_date_2 || ""}
                      onChange={(e) => setCustomerForm({ ...customerForm, next_collection_date_2: e.target.value })}
                      className="w-full border border-slate-300 rounded px-3 py-1.5 text-slate-900 text-xs focus:ring-1 focus:ring-green-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-700 block mb-1">
                      IN / Out Plan
                    </label>
                    <select
                      value={customerForm.in_out_plan}
                      onChange={(e) => setCustomerForm({ ...customerForm, in_out_plan: e.target.value })}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-slate-900 text-xs focus:ring-1 focus:ring-green-600 focus:outline-none"
                    >
                      <option value="Office / Call">Office / Call</option>
                      <option value="Indoor CX">Indoor CX</option>
                      <option value="Outdoor Visit">Outdoor Visit</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-700 block mb-1">
                      Lead Status
                    </label>
                    <select
                      value={customerForm.new_lead_status}
                      onChange={(e) => setCustomerForm({ ...customerForm, new_lead_status: e.target.value })}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-slate-900 text-xs focus:ring-1 focus:ring-green-600 focus:outline-none"
                    >
                      <option value="HP">High Potential (HP)</option>
                      <option value="P">Potential (P)</option>
                      <option value="FUB">Follow Up (FUB)</option>
                      <option value="NI">Not Interested (NI)</option>
                      <option value="Sold">Sold</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-700 block mb-1">
                      Certainty (10-100%)
                    </label>
                    <select
                      value={customerForm.collection_probability}
                      onChange={(e) => setCustomerForm({ ...customerForm, collection_probability: Number(e.target.value) })}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-slate-900 text-xs font-mono font-bold focus:ring-1 focus:ring-green-600 focus:outline-none"
                    >
                      {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((p) => (
                        <option key={p} value={p}>
                          {p}%
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Remarks / Action Taken
                  </label>
                  <input
                    type="text"
                    value={customerForm.remarks || ""}
                    onChange={(e) => setCustomerForm({ ...customerForm, remarks: e.target.value })}
                    placeholder="e.g. Committed payment via City Bank PO"
                    className="w-full border border-slate-300 rounded px-3 py-1.5 text-slate-900 focus:ring-1 focus:ring-green-600 focus:outline-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCustomerModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" loading={savingCustomer}>
                    {editingCustomer ? "Update Row" : "Add Row"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
