"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  FileSpreadsheet,
  Download,
  Filter,
  RotateCcw,
  Users,
  Banknote,
  PhoneCall,
  Calendar,
  Layers,
  ChevronDown,
  ChevronRight,
  Search,
  CheckCircle2,
  Clock,
  ArrowLeft,
  Building,
  Target,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
  Alert,
} from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import {
  PerformanceCollectionReportResponse,
  User,
} from "@/types";
import { exportPerformanceCollectionToCSV } from "@/lib/export-performance-collection";
import {
  formatBDT,
  formatReadableDate,
  formatEmployeeId,
} from "@/lib/utils";

function getCurrentYearMonth() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function PerformanceCollectionContent() {
  const { user, isAdmin } = useAuth();
  const searchParams = useSearchParams();

  // Filters
  const paramMonth = searchParams.get("month") || getCurrentYearMonth();
  const paramEmpId = searchParams.get("employee_id");

  const [selectedMonth, setSelectedMonth] = useState<string>(paramMonth);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | "all">(() => {
    if (paramEmpId && !isNaN(Number(paramEmpId))) {
      return Number(paramEmpId);
    }
    return "all";
  });
  const [leadStatusFilter, setLeadStatusFilter] = useState<string>("ALL");
  const [activeTab, setActiveTab] = useState<"combined" | "section1" | "section2">("combined");
  const [showCheckpoints, setShowCheckpoints] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Data & State
  const [reportData, setReportData] = useState<PerformanceCollectionReportResponse | null>(null);
  const [employees, setEmployees] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load employee list for filter
  useEffect(() => {
    async function loadEmployees() {
      try {
        const emps = await api.employees.list({ is_active: true });
        setEmployees(Array.isArray(emps) ? emps : []);
      } catch (e) {
        console.error("Failed to load employee filter options:", e);
      }
    }
    loadEmployees();
  }, []);

  // Fetch report data
  const loadReport = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await api.reports.getPerformanceCollectionReport({
        month: selectedMonth,
        employee_id: selectedEmployeeId !== "all" ? selectedEmployeeId : undefined,
        lead_status: leadStatusFilter !== "ALL" ? leadStatusFilter : undefined,
      });
      setReportData(data);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("Failed to load Employee Performance & Collection Report.");
      }
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedEmployeeId, leadStatusFilter]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  // Filtered customer collection records based on search query
  const filteredCustomerCollections = useMemo(() => {
    if (!reportData?.customer_collections) return [];
    if (!searchQuery.trim()) return reportData.customer_collections;
    const q = searchQuery.toLowerCase();
    return reportData.customer_collections.filter(
      (c) =>
        c.customer_name.toLowerCase().includes(q) ||
        (c.customer_phone && c.customer_phone.toLowerCase().includes(q)) ||
        c.employee_name.toLowerCase().includes(q) ||
        (c.remarks && c.remarks.toLowerCase().includes(q)) ||
        c.lead_status.toLowerCase().includes(q)
    );
  }, [reportData, searchQuery]);

  // Handle Export
  const handleExport = () => {
    if (!reportData) return;
    setExporting(true);
    try {
      exportPerformanceCollectionToCSV(reportData);
    } catch (err) {
      console.error("Export error:", err);
    } finally {
      setExporting(false);
    }
  };

  const handleResetFilters = () => {
    setSelectedMonth(getCurrentYearMonth());
    setSelectedEmployeeId("all");
    setLeadStatusFilter("ALL");
    setSearchQuery("");
  };

  return (
    <DashboardLayout
      title="Employee Performance & Collection Report"
      subtitle="Monthly performance benchmarks, milestone intervals, and customer-wise collection ledger"
    >
      <div className="space-y-6">
        {/* ── Top Header Actions & Breadcrumb ────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center gap-2">
            <Link
              href="/reports"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-emerald-700 transition-colors p-1.5 rounded-lg hover:bg-slate-100"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Standard Reports</span>
            </Link>
            <span className="text-slate-300">|</span>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
              <Calendar className="w-3.5 h-3.5 text-emerald-600" />
              <span>Report Month: <strong className="text-slate-900">{reportData?.month || selectedMonth}</strong></span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View Mode Toggle */}
            <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg text-xs font-medium border border-slate-200">
              <button
                type="button"
                onClick={() => setActiveTab("combined")}
                className={`px-3 py-1 rounded-md transition-all ${
                  activeTab === "combined"
                    ? "bg-white text-emerald-800 font-bold shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Combined View
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("section1")}
                className={`px-3 py-1 rounded-md transition-all ${
                  activeTab === "section1"
                    ? "bg-white text-emerald-800 font-bold shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Sec 1: Monthly Performance
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("section2")}
                className={`px-3 py-1 rounded-md transition-all ${
                  activeTab === "section2"
                    ? "bg-white text-emerald-800 font-bold shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Sec 2: Customer Collections
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={loading || !reportData || exporting}
              className="border-emerald-600 text-emerald-800 hover:bg-emerald-50 shrink-0 font-bold"
            >
              <Download className="w-3.5 h-3.5 mr-1.5 text-emerald-700" />
              {exporting ? "Exporting..." : "Export to Excel"}
            </Button>
          </div>
        </div>

        {/* ── Status Error Alert ─────────────────────────────────────────── */}
        {errorMessage && (
          <Alert type="error" onDismiss={() => setErrorMessage(null)}>
            {errorMessage}
          </Alert>
        )}

        {/* ── Filter Bar ─────────────────────────────────────────────────── */}
        <Card className="p-4 bg-slate-50/60">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            {/* 1. Month Picker */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Select Month
              </label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:outline-none"
              />
            </div>

            {/* 2. Employee Selector */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Employee
              </label>
              <select
                value={selectedEmployeeId}
                onChange={(e) =>
                  setSelectedEmployeeId(
                    e.target.value === "all" ? "all" : Number(e.target.value)
                  )
                }
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:outline-none"
              >
                <option value="all">All Employees</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name} ({formatEmployeeId(emp.id)})
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Lead Status Filter */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Lead Status
              </label>
              <select
                value={leadStatusFilter}
                onChange={(e) => setLeadStatusFilter(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="HP">HP (High Potential)</option>
                <option value="P">P (Potential)</option>
                <option value="FUB">FUB (Follow-Up Booked)</option>
                <option value="NI">NI (Not Interested)</option>
                <option value="CX">CX (Customer Meeting)</option>
                <option value="Paid">Paid / Collected</option>
              </select>
            </div>

            {/* 4. Customer / Remarks Search */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Search Customer
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Name, phone, or remarks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg pl-7 pr-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-emerald-600 focus:outline-none font-medium"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2.5" />
              </div>
            </div>

            {/* 5. Filter Actions */}
            <div className="flex items-end gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={loadReport}
                loading={loading}
                className="flex-1 font-bold"
              >
                <Filter className="w-3.5 h-3.5 mr-1" />
                Apply
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                className="px-2.5 text-slate-600"
                title="Reset Filters"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </Card>

        {/* ── Summary Financial & Lead Metrics Cards ──────────────────────── */}
        {reportData && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Target (TG)</span>
              <span className="text-sm font-extrabold text-slate-900 mt-1 block">
                {formatBDT(reportData.summary.total_target)}
              </span>
              <span className="text-[10px] text-slate-400">Monthly Quota</span>
            </div>

            <div className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-xl shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-emerald-800 block">New Sales</span>
              <span className="text-sm font-extrabold text-emerald-700 mt-1 block">
                {formatBDT(reportData.summary.total_new_sales)}
              </span>
              <span className="text-[10px] text-emerald-600 font-medium">Actual Collections</span>
            </div>

            <div className="p-3 bg-sky-50/50 border border-sky-200 rounded-xl shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-sky-800 block">EMI Collected</span>
              <span className="text-sm font-extrabold text-sky-700 mt-1 block">
                {formatBDT(reportData.summary.total_emi)}
              </span>
              <span className="text-[10px] text-sky-600 font-medium">Installment Dues</span>
            </div>

            <div className="p-3 bg-indigo-50/50 border border-indigo-200 rounded-xl shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-indigo-800 block">Total Collection</span>
              <span className="text-sm font-extrabold text-indigo-700 mt-1 block">
                {formatBDT(reportData.summary.total_collection)}
              </span>
              <span className="text-[10px] text-indigo-600 font-medium">Sales + TB + EMI</span>
            </div>

            <div className="p-3 bg-amber-50/50 border border-amber-200 rounded-xl shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-amber-800 block">Unpaid / Promised</span>
              <span className="text-sm font-extrabold text-amber-700 mt-1 block">
                {formatBDT(reportData.summary.total_unpaid)}
              </span>
              <span className="text-[10px] text-amber-600 font-medium">Committed Pipeline</span>
            </div>

            <div className="p-3 bg-purple-50/50 border border-purple-200 rounded-xl shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-purple-800 block">Total Leads Dialed</span>
              <span className="text-sm font-extrabold text-purple-700 mt-1 block">
                {reportData.summary.total_leads.toLocaleString()}
              </span>
              <span className="text-[10px] text-purple-600 font-medium">
                Fair: {reportData.summary.total_fair_leads} • FB: {reportData.summary.total_fb_leads}
              </span>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SECTION 1: EMPLOYEE MONTHLY PERFORMANCE REPORT                     */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {(activeTab === "combined" || activeTab === "section1") && (
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 bg-slate-50/50 px-4 py-3">
              <div>
                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Target className="w-4 h-4 text-emerald-700" />
                  Section 1: Employee Monthly Performance Report
                </CardTitle>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Monthly benchmarks, lead generation breakdown, and Till-Date cumulative milestones
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCheckpoints(!showCheckpoints)}
                  className={`text-xs px-2.5 py-1 rounded-md border font-semibold transition-colors flex items-center gap-1 ${
                    showCheckpoints
                      ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                      : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {showCheckpoints ? (
                    <>
                      <ChevronDown className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Hide Milestones</span>
                    </>
                  ) : (
                    <>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                      <span>Show Milestones (5th, 10th...)</span>
                    </>
                  )}
                </button>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 text-[11px] font-bold select-none whitespace-nowrap">
                      <th className="py-2.5 px-3">Employee Name</th>
                      <th className="py-2.5 px-2.5">Position</th>
                      <th className="py-2.5 px-2.5">Month</th>
                      <th className="py-2.5 px-3 text-right">TG (Target)</th>
                      <th className="py-2.5 px-3 text-right text-emerald-800 bg-emerald-50/50">New Sales</th>
                      <th className="py-2.5 px-3 text-right text-sky-800 bg-sky-50/50">EMI</th>
                      <th className="py-2.5 px-3 text-right font-extrabold text-slate-900">Total Coll.</th>
                      <th className="py-2.5 px-2.5 text-center">Total Lead</th>
                      <th className="py-2.5 px-2 text-center text-indigo-700">Fair Lead</th>
                      <th className="py-2.5 px-2 text-center text-blue-700">FB Leads</th>
                      <th className="py-2.5 px-2 text-center text-purple-700">HP</th>
                      <th className="py-2.5 px-2 text-center text-emerald-700">P</th>
                      <th className="py-2.5 px-2 text-center text-amber-700">FUP</th>
                      <th className="py-2.5 px-3 text-right text-slate-600">Pred. Fair</th>
                      <th className="py-2.5 px-3 text-right text-slate-600">Pred. FB</th>
                      <th className="py-2.5 px-3 text-right text-slate-600">Pred. Other</th>
                      <th className="py-2.5 px-2.5 text-right text-amber-700">Hold</th>
                      <th className="py-2.5 px-2.5 text-right text-rose-700">Cancel</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                    {loading ? (
                      <tr>
                        <td colSpan={18} className="py-8 text-center text-slate-400">
                          Loading monthly performance report data...
                        </td>
                      </tr>
                    ) : !reportData || reportData.monthly_performances.length === 0 ? (
                      <tr>
                        <td colSpan={18} className="py-8 text-center text-slate-400">
                          No performance data found for {selectedMonth}.
                        </td>
                      </tr>
                    ) : (
                      reportData.monthly_performances.map((emp) => (
                        <React.Fragment key={emp.employee_id}>
                          {/* Main Employee Row */}
                          <tr className="hover:bg-slate-50/80 transition-colors bg-white">
                            <td className="py-2.5 px-3 font-bold text-slate-900">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span>{emp.employee_name}</span>
                                <span className="font-mono text-[9px] font-bold bg-slate-100 text-slate-700 px-1 py-0.2 rounded">
                                  {formatEmployeeId(emp.employee_id)}
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 px-2.5 text-slate-600 text-[11px] whitespace-nowrap">
                              {emp.position}
                            </td>
                            <td className="py-2.5 px-2.5 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                              {emp.month}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-700">
                              {formatBDT(emp.target_sales)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 bg-emerald-50/30">
                              {formatBDT(emp.actual_new_sales)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-sky-700 bg-sky-50/30">
                              {formatBDT(emp.actual_emi)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-extrabold text-slate-900">
                              {formatBDT(emp.total_collection)}
                            </td>
                            <td className="py-2.5 px-2.5 text-center font-bold text-slate-800">
                              {emp.total_lead}
                            </td>
                            <td className="py-2.5 px-2 text-center font-bold text-indigo-700">
                              {emp.fair_lead}
                            </td>
                            <td className="py-2.5 px-2 text-center font-bold text-blue-700">
                              {emp.fb_lead}
                            </td>
                            <td className="py-2.5 px-2 text-center font-bold text-purple-700">
                              {emp.hp}
                            </td>
                            <td className="py-2.5 px-2 text-center font-bold text-emerald-700">
                              {emp.p}
                            </td>
                            <td className="py-2.5 px-2 text-center font-bold text-amber-700">
                              {emp.fup}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                              {emp.prediction_sold_fair > 0 ? formatBDT(emp.prediction_sold_fair) : "-"}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                              {emp.prediction_sold_fb > 0 ? formatBDT(emp.prediction_sold_fb) : "-"}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                              {emp.prediction_sold_other > 0 ? formatBDT(emp.prediction_sold_other) : "-"}
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-mono text-amber-700">
                              {emp.prediction_hold > 0 ? formatBDT(emp.prediction_hold) : "-"}
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-mono text-rose-700">
                              {emp.prediction_cancel > 0 ? formatBDT(emp.prediction_cancel) : "-"}
                            </td>
                          </tr>

                          {/* Checkpoint Milestone Rows (Till 5th, Till 10th, etc.) */}
                          {showCheckpoints &&
                            emp.intervals.map((inv) => (
                              <tr
                                key={`${emp.employee_id}-${inv.label}`}
                                className="bg-slate-50/50 hover:bg-slate-100/50 text-[11px] text-slate-600 transition-colors"
                              >
                                <td className="py-1.5 px-3 pl-8 font-semibold text-slate-600 flex items-center gap-1.5 whitespace-nowrap">
                                  <span className="text-slate-400">↳</span>
                                  <span className="bg-slate-200/70 text-slate-700 px-1.5 py-0.2 rounded text-[10px] font-bold">
                                    {inv.label}
                                  </span>
                                </td>
                                <td className="py-1.5 px-2.5 text-slate-400">-</td>
                                <td className="py-1.5 px-2.5 text-slate-400">-</td>
                                <td className="py-1.5 px-3 text-right text-slate-400">-</td>
                                <td className="py-1.5 px-3 text-right font-mono text-emerald-800 bg-emerald-50/20">
                                  {formatBDT(inv.new_sales)}
                                </td>
                                <td className="py-1.5 px-3 text-right font-mono text-sky-800 bg-sky-50/20">
                                  {formatBDT(inv.emi)}
                                </td>
                                <td className="py-1.5 px-3 text-right font-mono font-bold text-slate-800">
                                  {formatBDT(inv.total_collection)}
                                </td>
                                <td className="py-1.5 px-2.5 text-center">{inv.total_lead}</td>
                                <td className="py-1.5 px-2 text-center text-indigo-700">{inv.fair_lead}</td>
                                <td className="py-1.5 px-2 text-center text-blue-700">{inv.fb_lead}</td>
                                <td className="py-1.5 px-2 text-center text-purple-700">{inv.hp}</td>
                                <td className="py-1.5 px-2 text-center text-emerald-700">{inv.p}</td>
                                <td className="py-1.5 px-2 text-center text-amber-700">{inv.fup}</td>
                                <td className="py-1.5 px-3 text-right text-slate-400">-</td>
                                <td className="py-1.5 px-3 text-right text-slate-400">-</td>
                                <td className="py-1.5 px-3 text-right text-slate-400">-</td>
                                <td className="py-1.5 px-2.5 text-right text-slate-400">-</td>
                                <td className="py-1.5 px-2.5 text-right text-slate-400">-</td>
                              </tr>
                            ))}
                        </React.Fragment>
                      ))
                    )}
                  </tbody>

                  {/* Section 1 Totals Footer */}
                  {reportData && reportData.monthly_performances.length > 0 && (
                    <tfoot>
                      <tr className="bg-slate-100 border-t-2 border-slate-300 font-extrabold text-slate-900 select-none whitespace-nowrap">
                        <td className="py-3 px-3 uppercase text-xs">Section 1 Totals</td>
                        <td className="py-3 px-2.5 text-slate-400">-</td>
                        <td className="py-3 px-2.5 text-slate-400">-</td>
                        <td className="py-3 px-3 text-right font-mono">
                          {formatBDT(reportData.summary.total_target)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-emerald-800 bg-emerald-100/50">
                          {formatBDT(reportData.summary.total_new_sales)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-sky-800 bg-sky-100/50">
                          {formatBDT(reportData.summary.total_emi)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-900 bg-slate-200/50">
                          {formatBDT(reportData.summary.total_collection)}
                        </td>
                        <td className="py-3 px-2.5 text-center">{reportData.summary.total_leads}</td>
                        <td className="py-3 px-2 text-center text-indigo-800">{reportData.summary.total_fair_leads}</td>
                        <td className="py-3 px-2 text-center text-blue-800">{reportData.summary.total_fb_leads}</td>
                        <td className="py-3 px-2 text-center text-purple-800">{reportData.summary.total_hp}</td>
                        <td className="py-3 px-2 text-center text-emerald-800">{reportData.summary.total_p}</td>
                        <td className="py-3 px-2 text-center text-amber-800">{reportData.summary.total_fup}</td>
                        <td colSpan={5} className="py-3 px-3 text-right text-slate-400 font-normal">
                          Cumulative Monthly Benchmarks
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SECTION 2: CUSTOMER-WISE COLLECTION REPORT                         */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {(activeTab === "combined" || activeTab === "section2") && (
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 bg-slate-50/50 px-4 py-3">
              <div>
                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-emerald-700" />
                  Section 2: Customer-wise Collection Report
                </CardTitle>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Customer ledger with paid/unpaid status, IN/OUT visit plans, category amounts, and next collection dates
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-slate-600">
                  Showing: <strong className="text-slate-900">{filteredCustomerCollections.length}</strong> records
                </span>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 text-[11px] font-bold select-none whitespace-nowrap">
                      <th className="py-2.5 px-3">Customer Name</th>
                      <th className="py-2.5 px-2.5">Phone</th>
                      <th className="py-2.5 px-3 text-right text-emerald-800 bg-emerald-50/50">Paid</th>
                      <th className="py-2.5 px-3 text-right text-amber-800 bg-amber-50/50">Unpaid</th>
                      <th className="py-2.5 px-2.5">Collection Date</th>
                      <th className="py-2.5 px-2.5 text-center">IN/OUT Plan</th>
                      <th className="py-2.5 px-2.5">Date-1</th>
                      <th className="py-2.5 px-2.5">Date-2</th>
                      <th className="py-2.5 px-3 text-right">New Sales</th>
                      <th className="py-2.5 px-3 text-right">TB</th>
                      <th className="py-2.5 px-3 text-right">EMI</th>
                      <th className="py-2.5 px-2.5">Next Coll. Date</th>
                      <th className="py-2.5 px-2 text-center">Status</th>
                      <th className="py-2.5 px-3 text-right font-extrabold text-slate-900">Total Coll.</th>
                      <th className="py-2.5 px-3">Executive</th>
                      <th className="py-2.5 px-3 min-w-[150px]">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                    {loading ? (
                      <tr>
                        <td colSpan={16} className="py-8 text-center text-slate-400">
                          Loading customer collection ledger...
                        </td>
                      </tr>
                    ) : filteredCustomerCollections.length === 0 ? (
                      <tr>
                        <td colSpan={16} className="py-8 text-center text-slate-400">
                          No customer collection entries found for this criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredCustomerCollections.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50/80 transition-colors bg-white">
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            {c.customer_name}
                          </td>
                          <td className="py-2.5 px-2.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                            {c.customer_phone || "-"}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 bg-emerald-50/30">
                            {c.paid_amount > 0 ? formatBDT(c.paid_amount) : "-"}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-700 bg-amber-50/30">
                            {c.unpaid_amount > 0 ? formatBDT(c.unpaid_amount) : "-"}
                          </td>
                          <td className="py-2.5 px-2.5 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                            {c.collection_date ? formatReadableDate(c.collection_date) : "-"}
                          </td>
                          <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                c.in_out_plan.includes("Outdoor")
                                  ? "bg-purple-100 text-purple-900 border-purple-200"
                                  : c.in_out_plan.includes("Indoor")
                                  ? "bg-blue-100 text-blue-900 border-blue-200"
                                  : "bg-slate-100 text-slate-700 border-slate-200"
                              }`}
                            >
                              {c.in_out_plan}
                            </span>
                          </td>
                          <td className="py-2.5 px-2.5 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                            {c.date_1 ? formatReadableDate(c.date_1) : "-"}
                          </td>
                          <td className="py-2.5 px-2.5 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                            {c.date_2 ? formatReadableDate(c.date_2) : "-"}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-emerald-800">
                            {c.new_sales_amount > 0 ? formatBDT(c.new_sales_amount) : "-"}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-amber-800">
                            {c.tb_amount > 0 ? formatBDT(c.tb_amount) : "-"}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-sky-800">
                            {c.emi_amount > 0 ? formatBDT(c.emi_amount) : "-"}
                          </td>
                          <td className="py-2.5 px-2.5 font-mono text-[11px] text-amber-900 whitespace-nowrap">
                            {c.next_collection_date ? (
                              <span className="bg-amber-100 text-amber-900 font-bold px-1.5 py-0.5 rounded border border-amber-200">
                                {formatReadableDate(c.next_collection_date)}
                              </span>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-center whitespace-nowrap">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                                c.lead_status === "HP"
                                  ? "bg-purple-100 text-purple-800 border border-purple-200"
                                  : c.lead_status === "P"
                                  ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                  : c.lead_status === "FUB"
                                  ? "bg-amber-100 text-amber-800 border border-amber-200"
                                  : c.lead_status === "Paid"
                                  ? "bg-teal-100 text-teal-800 border border-teal-200"
                                  : "bg-slate-100 text-slate-700 border border-slate-200"
                              }`}
                            >
                              {c.lead_status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-extrabold text-slate-900">
                            {formatBDT(c.total_collection)}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                            {c.employee_name}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 text-[11px] italic max-w-xs truncate" title={c.remarks || ""}>
                            {c.remarks || "-"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>

                  {/* Section 2 Totals Footer */}
                  {reportData && filteredCustomerCollections.length > 0 && (
                    <tfoot>
                      <tr className="bg-slate-100 border-t-2 border-slate-300 font-extrabold text-slate-900 select-none whitespace-nowrap">
                        <td className="py-3 px-3 uppercase text-xs" colSpan={2}>
                          Section 2 Totals
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-emerald-800 bg-emerald-100/50">
                          {formatBDT(reportData.summary.total_paid)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-amber-800 bg-amber-100/50">
                          {formatBDT(reportData.summary.total_unpaid)}
                        </td>
                        <td className="py-3 px-2.5 text-slate-400" colSpan={4}>-</td>
                        <td className="py-3 px-3 text-right font-mono text-emerald-800">
                          {formatBDT(reportData.summary.total_new_sales)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-amber-800">
                          {formatBDT(reportData.summary.total_tb)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-sky-800">
                          {formatBDT(reportData.summary.total_emi)}
                        </td>
                        <td className="py-3 px-2.5 text-slate-400" colSpan={2}>-</td>
                        <td className="py-3 px-3 text-right font-mono text-slate-900 bg-slate-200/50">
                          {formatBDT(reportData.summary.total_collection)}
                        </td>
                        <td className="py-3 px-3 text-slate-400" colSpan={2}>-</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

export default function PerformanceCollectionPage() {
  return (
    <Suspense
      fallback={
        <DashboardLayout
          title="Employee Performance & Collection Report"
          subtitle="Loading report..."
        >
          <div className="py-12 text-center text-xs text-slate-400">Loading report...</div>
        </DashboardLayout>
      }
    >
      <PerformanceCollectionContent />
    </Suspense>
  );
}

