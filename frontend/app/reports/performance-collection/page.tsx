"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { exportPerformanceCollectionToCSV } from "@/lib/export-performance-collection";
import type {
  PerformanceCollectionReportResponse,
  EmployeeMonthlyPerformance,
  CustomerCollectionItem,
  PerformanceIntervalSummary,
} from "@/types";
import {
  FileSpreadsheet,
  Download,
  Filter,
  RefreshCw,
  TrendingUp,
  DollarSign,
  Users,
  Calendar,
  AlertCircle,
  Clock,
  Layers,
  ChevronDown,
  ChevronRight,
  Phone,
  ShieldAlert,
  ArrowRight,
  LayoutGrid,
  Table as TableIcon,
  Search,
} from "lucide-react";

export default function PerformanceCollectionReportPage() {
  const { user, loading: authLoading, isAdmin, isSubAdmin } = useAuth();
  const router = useRouter();

  // Permitted only for Admin and Sub-Admin
  const canAccess = Boolean(isAdmin || isSubAdmin);

  // Filter States
  const currentYearMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const [selectedMonth, setSelectedMonth] = useState<string>(currentYearMonth);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [selectedLeadStatus, setSelectedLeadStatus] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Data & Loading States
  const [report, setReport] = useState<PerformanceCollectionReportResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Mobile View Toggles
  const [mobileViewMode, setMobileViewMode] = useState<"cards" | "table">("cards");
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"both" | "employees" | "customers">("both");

  // Load report data
  const loadData = async () => {
    if (!canAccess) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.reports.getPerformanceCollectionReport({
        month: selectedMonth,
        employee_id: selectedEmployeeId ? parseInt(selectedEmployeeId, 10) : undefined,
        lead_status: selectedLeadStatus || undefined,
      });
      setReport(data);
      // Auto-expand first employee on mobile if available
      if (data?.monthly_performances?.length && expandedEmployeeId === null) {
        setExpandedEmployeeId(data.monthly_performances[0].employee_id);
      }
    } catch (err: any) {
      console.error("Failed to load Performance & Collection Report:", err);
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "Failed to load report. Please ensure your backend is up to date."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push("/login");
      } else if (canAccess) {
        loadData();
      }
    }
  }, [authLoading, user, canAccess, selectedMonth, selectedEmployeeId, selectedLeadStatus]);

  // Client-side search filtering on customer records
  const filteredCustomers = useMemo(() => {
    if (!report?.customer_collections) return [];
    if (!searchQuery.trim()) return report.customer_collections;
    const q = searchQuery.toLowerCase();
    return report.customer_collections.filter(
      (c: CustomerCollectionItem) =>
        c.customer_name.toLowerCase().includes(q) ||
        (c.customer_phone && c.customer_phone.toLowerCase().includes(q)) ||
        (c.employee_name && c.employee_name.toLowerCase().includes(q)) ||
        (c.remarks && c.remarks.toLowerCase().includes(q)) ||
        (c.lead_status && c.lead_status.toLowerCase().includes(q))
    );
  }, [report?.customer_collections, searchQuery]);

  // Excel Export Handler
  const handleExport = () => {
    if (!report) return;
    exportPerformanceCollectionToCSV(report, `Employee_Performance_Collection_${selectedMonth}.csv`);
  };

  // Format currency
  const formatMoney = (val?: number | null) => {
    if (val === undefined || val === null) return "0";
    return Number(val).toLocaleString("en-BD");
  };

  // Helper for lead status badge styles
  const getStatusBadge = (status?: string | null) => {
    const s = (status || "").toUpperCase();
    if (s.includes("WON") || s.includes("COLLECTED") || s.includes("HOT")) {
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
    }
    if (s.includes("WARM") || s.includes("RESCHEDULED") || s.includes("PENDING")) {
      return "bg-amber-500/10 text-amber-400 border-amber-500/30";
    }
    if (s.includes("LOST") || s.includes("CANCEL") || s.includes("COLD")) {
      return "bg-rose-500/10 text-rose-400 border-rose-500/30";
    }
    return "bg-slate-800 text-slate-300 border-slate-700";
  };

  if (authLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Admin access guard
  if (!canAccess) {
    return (
      <div className="mx-auto max-w-2xl py-12 px-4 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20 mb-4">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-2">Access Restricted</h1>
        <p className="text-sm text-slate-400 mb-6">
          This <strong>Employee Performance & Collection Report</strong> is restricted to Administrators and Sub-Administrators only.
        </p>
        <button
          onClick={() => router.push("/")}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium border border-slate-700 transition"
        >
          <ArrowRight className="h-4 w-4 rotate-180" /> Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16 px-1 sm:px-0">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                Performance & Collection Report
              </h1>
              <p className="text-xs sm:text-sm text-slate-400">
                Monthly performance & customer ledger
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700/80 bg-slate-800/80 px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-200 hover:bg-slate-700 transition disabled:opacity-50"
            title="Refresh Data"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={handleExport}
            disabled={loading || !report}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3.5 py-2 text-xs sm:text-sm font-medium text-white shadow-lg shadow-emerald-600/20 transition disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            <span>Export to Excel</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur">
        <div className="flex items-center gap-2 pb-3 mb-3 border-b border-slate-800/80 text-xs font-semibold text-slate-400 uppercase tracking-wider">
          <Filter className="h-3.5 w-3.5 text-primary" />
          <span>Filters & Search</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Month Selector */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Select Month
            </label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full rounded-xl border border-slate-700/80 bg-slate-800/90 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Employee Filter */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Filter by Employee
            </label>
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="w-full rounded-xl border border-slate-700/80 bg-slate-800/90 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All Employees ({report?.monthly_performances?.length || 0})</option>
              {report?.monthly_performances?.map((emp: EmployeeMonthlyPerformance) => (
                <option key={emp.employee_id} value={emp.employee_id}>
                  {emp.employee_name} ({emp.position || "Staff"})
                </option>
              ))}
            </select>
          </div>

          {/* Lead Status Filter */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Lead Status
            </label>
            <select
              value={selectedLeadStatus}
              onChange={(e) => setSelectedLeadStatus(e.target.value)}
              className="w-full rounded-xl border border-slate-700/80 bg-slate-800/90 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All Statuses</option>
              <option value="HOT">Hot Lead</option>
              <option value="WARM">Warm Lead</option>
              <option value="COLD">Cold Lead</option>
              <option value="WON">Sold / Won</option>
              <option value="RESCHEDULED">Rescheduled</option>
              <option value="PENDING">Pending Collection</option>
            </select>
          </div>

          {/* Customer / Phone Search */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Search Customer / Remarks
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Customer, phone, remarks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-700/80 bg-slate-800/90 pl-8 pr-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <Search className="h-4 w-4 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>
        </div>
      </div>

      {/* KPI Summary Cards */}
      {report && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3 sm:p-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
              <span>Target (TG)</span>
            </div>
            <div className="text-base sm:text-xl font-bold text-white">
              ৳{formatMoney(report.summary.total_target)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Monthly Goal</div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3 sm:p-4">
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 mb-1">
              <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
              <span>New Sales</span>
            </div>
            <div className="text-base sm:text-xl font-bold text-emerald-400">
              ৳{formatMoney(report.summary.total_new_sales)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Booking / Down Payment</div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3 sm:p-4">
            <div className="flex items-center gap-1.5 text-xs text-blue-400 mb-1">
              <Layers className="h-3.5 w-3.5 text-blue-400" />
              <span>EMI Collected</span>
            </div>
            <div className="text-base sm:text-xl font-bold text-blue-400">
              ৳{formatMoney(report.summary.total_emi)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Installment Collection</div>
          </div>

          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3 sm:p-4">
            <div className="flex items-center gap-1.5 text-xs text-emerald-300 mb-1">
              <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
              <span>Total Collection</span>
            </div>
            <div className="text-base sm:text-xl font-bold text-emerald-300">
              ৳{formatMoney(report.summary.total_collection)}
            </div>
            <div className="text-[10px] text-emerald-500/70 mt-0.5">New Sales + EMI + TB</div>
          </div>

          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-3 sm:p-4">
            <div className="flex items-center gap-1.5 text-xs text-rose-300 mb-1">
              <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
              <span>Unpaid Amount</span>
            </div>
            <div className="text-base sm:text-xl font-bold text-rose-300">
              ৳{formatMoney(report.summary.total_unpaid)}
            </div>
            <div className="text-[10px] text-rose-500/70 mt-0.5">Pending Recovery</div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3 sm:p-4">
            <div className="flex items-center gap-1.5 text-xs text-indigo-400 mb-1">
              <Users className="h-3.5 w-3.5 text-indigo-400" />
              <span>Total Leads</span>
            </div>
            <div className="text-base sm:text-xl font-bold text-indigo-300">
              {report.summary.total_leads}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Fair: {report.summary.total_fair_leads} | FB: {report.summary.total_fb_leads}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Section View Selector */}
      <div className="flex sm:hidden items-center justify-between gap-2 border-b border-slate-800 pb-2">
        <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl text-xs">
          <button
            onClick={() => setActiveTab("both")}
            className={`px-2.5 py-1 rounded-lg font-medium transition ${
              activeTab === "both" ? "bg-primary text-white" : "text-slate-400"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setActiveTab("employees")}
            className={`px-2.5 py-1 rounded-lg font-medium transition ${
              activeTab === "employees" ? "bg-primary text-white" : "text-slate-400"
            }`}
          >
            Employees
          </button>
          <button
            onClick={() => setActiveTab("customers")}
            className={`px-2.5 py-1 rounded-lg font-medium transition ${
              activeTab === "customers" ? "bg-primary text-white" : "text-slate-400"
            }`}
          >
            Customers
          </button>
        </div>

        {/* Card vs Table toggle for mobile */}
        <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl text-xs">
          <button
            onClick={() => setMobileViewMode("cards")}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg font-medium transition ${
              mobileViewMode === "cards" ? "bg-slate-700 text-white" : "text-slate-400"
            }`}
            title="Card View (Mobile Optimized)"
          >
            <LayoutGrid className="h-3 w-3" />
            <span>Cards</span>
          </button>
          <button
            onClick={() => setMobileViewMode("table")}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg font-medium transition ${
              mobileViewMode === "table" ? "bg-slate-700 text-white" : "text-slate-400"
            }`}
            title="Table View (Full Excel Sheet)"
          >
            <TableIcon className="h-3 w-3" />
            <span>Table</span>
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          <div className="font-semibold mb-1">Failed to load report data:</div>
          <div>{error}</div>
        </div>
      )}

      {/* Loading state */}
      {loading && !report && (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/40">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <div className="text-xs text-slate-400">Loading performance report & ledger...</div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* SECTION 1: EMPLOYEE MONTHLY PERFORMANCE REPORT */}
      {/* ============================================================ */}
      {report && (activeTab === "both" || activeTab === "employees") && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5 backdrop-blur">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 mb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/20 text-xs font-bold text-primary">
                  1
                </span>
                <h2 className="text-base sm:text-lg font-bold text-white">
                  Section 1: Employee Performance
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Sales targets, lead breakdown & progressive milestones
              </p>
            </div>
            <div className="text-xs text-slate-400">
              Showing <span className="text-white font-semibold">{report.monthly_performances.length}</span> Employees
            </div>
          </div>

          {/* Desktop & Tablet Table (or Mobile when Table toggle is chosen) */}
          <div className={`${mobileViewMode === "cards" ? "hidden sm:block" : "block"} overflow-x-auto`}>
            <table className="w-full text-left text-xs text-slate-300 border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/40 text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="py-2.5 px-3 font-semibold sticky left-0 bg-slate-900/90 z-10">Employee & Position</th>
                  <th className="py-2.5 px-2 font-semibold">Month</th>
                  <th className="py-2.5 px-2 font-semibold text-right">Target (TG)</th>
                  <th className="py-2.5 px-2 font-semibold text-right text-emerald-400">New Sales</th>
                  <th className="py-2.5 px-2 font-semibold text-right text-blue-400">EMI</th>
                  <th className="py-2.5 px-2 font-semibold text-right">Total Lead</th>
                  <th className="py-2.5 px-2 font-semibold text-right">Fair Lead</th>
                  <th className="py-2.5 px-2 font-semibold text-right">FB Leads</th>
                  <th className="py-2.5 px-2 font-semibold text-right">HP</th>
                  <th className="py-2.5 px-2 font-semibold text-right">P</th>
                  <th className="py-2.5 px-2 font-semibold text-right">FUP</th>
                  <th className="py-2.5 px-2 font-semibold text-center bg-slate-800/60" colSpan={5}>
                    Prediction From Employee
                  </th>
                </tr>
                <tr className="border-b border-slate-800/80 bg-slate-800/20 text-[10px] text-slate-400">
                  <th colSpan={11} className="py-1 px-3"></th>
                  <th className="py-1 px-1.5 text-center text-emerald-400">Sold Fair</th>
                  <th className="py-1 px-1.5 text-center text-blue-400">Sold FB</th>
                  <th className="py-1 px-1.5 text-center text-indigo-400">Sold Other</th>
                  <th className="py-1 px-1.5 text-center text-amber-400">Hold</th>
                  <th className="py-1 px-1.5 text-center text-rose-400">Cancel</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {report.monthly_performances.length === 0 ? (
                  <tr>
                    <td colSpan={16} className="py-8 text-center text-slate-500">
                      No employee performance records found for {selectedMonth}.
                    </td>
                  </tr>
                ) : (
                  report.monthly_performances.map((emp: EmployeeMonthlyPerformance) => (
                    <tr key={emp.employee_id} className="hover:bg-slate-800/30 transition">
                      <td className="py-2.5 px-3 sticky left-0 bg-slate-900/90 z-10">
                        <div className="font-semibold text-white">{emp.employee_name}</div>
                        <div className="text-[11px] text-slate-400">{emp.position || "Staff"}</div>
                      </td>
                      <td className="py-2.5 px-2 whitespace-nowrap text-slate-300">{emp.month}</td>
                      <td className="py-2.5 px-2 text-right font-medium text-slate-200">
                        ৳{formatMoney(emp.target_sales || emp.target_collection)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-semibold text-emerald-400">
                        ৳{formatMoney(emp.actual_new_sales)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-semibold text-blue-400">
                        ৳{formatMoney(emp.actual_emi)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-medium text-white">{emp.total_lead}</td>
                      <td className="py-2.5 px-2 text-right text-slate-300">{emp.fair_lead}</td>
                      <td className="py-2.5 px-2 text-right text-slate-300">{emp.fb_lead}</td>
                      <td className="py-2.5 px-2 text-right text-rose-400 font-medium">{emp.hp}</td>
                      <td className="py-2.5 px-2 text-right text-amber-400 font-medium">{emp.p}</td>
                      <td className="py-2.5 px-2 text-right text-sky-400 font-medium">{emp.fup}</td>
                      <td className="py-2.5 px-1.5 text-center text-emerald-400 bg-emerald-500/5 font-medium">
                        {emp.prediction_sold_fair}
                      </td>
                      <td className="py-2.5 px-1.5 text-center text-blue-400 bg-blue-500/5 font-medium">
                        {emp.prediction_sold_fb}
                      </td>
                      <td className="py-2.5 px-1.5 text-center text-indigo-400 bg-indigo-500/5 font-medium">
                        {emp.prediction_sold_other}
                      </td>
                      <td className="py-2.5 px-1.5 text-center text-amber-400 bg-amber-500/5 font-medium">
                        {emp.prediction_hold}
                      </td>
                      <td className="py-2.5 px-1.5 text-center text-rose-400 bg-rose-500/5 font-medium">
                        {emp.prediction_cancel}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View for Section 1 */}
          <div className={`${mobileViewMode === "cards" ? "block sm:hidden" : "hidden"} space-y-3`}>
            {report.monthly_performances.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No employee performance records found for {selectedMonth}.
              </div>
            ) : (
              report.monthly_performances.map((emp: EmployeeMonthlyPerformance) => {
                const isExpanded = expandedEmployeeId === emp.employee_id;
                return (
                  <div
                    key={emp.employee_id}
                    className="rounded-xl border border-slate-800 bg-slate-800/40 p-3.5 transition"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-800/80">
                      <div>
                        <div className="font-bold text-white text-sm">{emp.employee_name}</div>
                        <div className="text-xs text-slate-400">{emp.position || "Staff"} • {emp.month}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-slate-400 uppercase">Target (TG)</div>
                        <div className="text-xs font-bold text-slate-200">
                          ৳{formatMoney(emp.target_sales || emp.target_collection)}
                        </div>
                      </div>
                    </div>

                    {/* Sales Metrics */}
                    <div className="grid grid-cols-2 gap-2 py-2.5 border-b border-slate-800/60 text-xs">
                      <div className="bg-emerald-500/10 rounded-lg p-2 border border-emerald-500/20">
                        <div className="text-[10px] text-emerald-400">New Sales</div>
                        <div className="font-bold text-emerald-300">৳{formatMoney(emp.actual_new_sales)}</div>
                      </div>
                      <div className="bg-blue-500/10 rounded-lg p-2 border border-blue-500/20">
                        <div className="text-[10px] text-blue-400">EMI Collected</div>
                        <div className="font-bold text-blue-300">৳{formatMoney(emp.actual_emi)}</div>
                      </div>
                    </div>

                    {/* Lead Statistics */}
                    <div className="grid grid-cols-4 gap-1.5 py-2 border-b border-slate-800/60 text-center text-[11px]">
                      <div className="bg-slate-900/60 rounded p-1">
                        <div className="text-[9px] text-slate-400">Total</div>
                        <div className="font-bold text-white">{emp.total_lead}</div>
                      </div>
                      <div className="bg-slate-900/60 rounded p-1">
                        <div className="text-[9px] text-rose-400">HP</div>
                        <div className="font-bold text-rose-300">{emp.hp}</div>
                      </div>
                      <div className="bg-slate-900/60 rounded p-1">
                        <div className="text-[9px] text-amber-400">P</div>
                        <div className="font-bold text-amber-300">{emp.p}</div>
                      </div>
                      <div className="bg-slate-900/60 rounded p-1">
                        <div className="text-[9px] text-sky-400">FUP</div>
                        <div className="font-bold text-sky-300">{emp.fup}</div>
                      </div>
                    </div>

                    {/* Predictions Row */}
                    <div className="pt-2 text-xs">
                      <div className="text-[10px] text-slate-400 mb-1 font-medium">Predictions from Employee:</div>
                      <div className="flex flex-wrap gap-1 text-[11px]">
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Fair: {emp.prediction_sold_fair}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          FB: {emp.prediction_sold_fb}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          Hold: {emp.prediction_hold}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          Cancel: {emp.prediction_cancel}
                        </span>
                      </div>
                    </div>

                    {/* Toggle Milestones Accordion */}
                    {emp.intervals && emp.intervals.length > 0 && (
                      <>
                        <button
                          onClick={() => setExpandedEmployeeId(isExpanded ? null : emp.employee_id)}
                          className="mt-3 flex w-full items-center justify-between rounded-lg bg-slate-900/80 px-2.5 py-1.5 text-[11px] text-slate-300 hover:text-white transition"
                        >
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-primary" />
                            <span>Milestones Progress (Till 5th, 10th...)</span>
                          </span>
                          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>

                        {/* Expanded Milestones Content */}
                        {isExpanded && (
                          <div className="mt-2 space-y-1.5 rounded-lg border border-slate-800 bg-slate-900/90 p-2.5 text-[11px]">
                            {emp.intervals.map((inv: PerformanceIntervalSummary, idx: number) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between py-1 border-b border-slate-800/60 last:border-0"
                              >
                                <span className="font-medium text-slate-300">{inv.label}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-emerald-400 font-semibold">
                                    ৳{formatMoney(inv.new_sales)}
                                  </span>
                                  <span className="text-slate-400">Leads: {inv.total_lead}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* PROGRESS SUMMARIES / MILESTONES (Company-wide or Selected Employee) */}
          {report.monthly_performances.length > 0 &&
            report.monthly_performances[0].intervals &&
            report.monthly_performances[0].intervals.length > 0 && (
              <div className="mt-6 pt-4 border-t border-slate-800">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="h-4 w-4 text-primary" />
                  <h3 className="text-xs sm:text-sm font-bold text-white">
                    Progress Summaries / Cumulative Milestones (Till 5th, Till 10th, Till 15th, etc.)
                  </h3>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {report.monthly_performances[0].intervals.map((inv: PerformanceIntervalSummary, idx: number) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-slate-800 bg-slate-800/40 p-2.5 sm:p-3 hover:border-slate-700 transition"
                    >
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-300 pb-1 border-b border-slate-800/60">
                        <span>{inv.label}</span>
                        <span className="text-[10px] text-slate-500">{inv.total_lead} Leads</span>
                      </div>
                      <div className="mt-2 space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Sales:</span>
                          <span className="font-semibold text-emerald-400">৳{formatMoney(inv.new_sales)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Coll:</span>
                          <span className="font-semibold text-blue-400">৳{formatMoney(inv.total_collection)}</span>
                        </div>
                        <div className="flex justify-between border-t border-slate-800/40 pt-1">
                          <span className="text-slate-400">Visits:</span>
                          <span className="font-medium text-slate-200">
                            {inv.outdoor_visits + inv.indoor_cx}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
        </div>
      )}

      {/* ============================================================ */}
      {/* SECTION 2: CUSTOMER-WISE COLLECTION REPORT */}
      {/* ============================================================ */}
      {report && (activeTab === "both" || activeTab === "customers") && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5 backdrop-blur">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 mb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/20 text-xs font-bold text-emerald-400">
                  2
                </span>
                <h2 className="text-base sm:text-lg font-bold text-white">
                  Section 2: Customer Collection
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Customer collection ledger, visit plans & promised dates
              </p>
            </div>
            <div className="text-xs text-slate-400">
              Showing <span className="text-white font-semibold">{filteredCustomers.length}</span> Customer Records
            </div>
          </div>

          {/* Desktop & Tablet Table (or Mobile when Table toggle is chosen) */}
          <div className={`${mobileViewMode === "cards" ? "hidden sm:block" : "block"} overflow-x-auto`}>
            <table className="w-full text-left text-xs text-slate-300 border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/40 text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="py-2.5 px-3 font-semibold sticky left-0 bg-slate-900/90 z-10">Customer Name & Phone</th>
                  <th className="py-2.5 px-2 font-semibold text-right text-emerald-400">Paid</th>
                  <th className="py-2.5 px-2 font-semibold text-right text-rose-400">Unpaid</th>
                  <th className="py-2.5 px-2 font-semibold">Collection Date</th>
                  <th className="py-2.5 px-2 font-semibold">IN/OUT Plan</th>
                  <th className="py-2.5 px-2 font-semibold">Date-1</th>
                  <th className="py-2.5 px-2 font-semibold">Date-2</th>
                  <th className="py-2.5 px-2 font-semibold text-right text-emerald-400">New Sales</th>
                  <th className="py-2.5 px-2 font-semibold text-right text-sky-400">TB</th>
                  <th className="py-2.5 px-2 font-semibold text-right text-blue-400">EMI</th>
                  <th className="py-2.5 px-2 font-semibold text-amber-400">Next Collection Date</th>
                  <th className="py-2.5 px-2 font-semibold">Lead Status</th>
                  <th className="py-2.5 px-2 font-semibold text-right text-emerald-300">Total Collection</th>
                  <th className="py-2.5 px-3 font-semibold">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="py-8 text-center text-slate-500">
                      No customer collection records found matching your filters.
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((cust: CustomerCollectionItem) => (
                    <tr key={cust.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-2.5 px-3 sticky left-0 bg-slate-900/90 z-10">
                        <div className="font-semibold text-white">{cust.customer_name}</div>
                        <div className="flex items-center gap-1 text-[11px] text-slate-400">
                          {cust.customer_phone ? (
                            <a
                              href={`tel:${cust.customer_phone}`}
                              className="text-primary hover:underline flex items-center gap-0.5"
                            >
                              <Phone className="h-2.5 w-2.5" />
                              {cust.customer_phone}
                            </a>
                          ) : (
                            <span>No phone</span>
                          )}
                          {cust.employee_name && (
                            <span className="text-slate-500">• {cust.employee_name}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right font-semibold text-emerald-400">
                        ৳{formatMoney(cust.paid_amount)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-semibold text-rose-400">
                        ৳{formatMoney(cust.unpaid_amount)}
                      </td>
                      <td className="py-2.5 px-2 whitespace-nowrap text-slate-300">
                        {cust.collection_date || "-"}
                      </td>
                      <td className="py-2.5 px-2 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                          {cust.in_out_plan || "Indoor"}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 whitespace-nowrap text-slate-400">{cust.date_1 || "-"}</td>
                      <td className="py-2.5 px-2 whitespace-nowrap text-slate-400">{cust.date_2 || "-"}</td>
                      <td className="py-2.5 px-2 text-right font-medium text-emerald-400">
                        ৳{formatMoney(cust.new_sales_amount)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-medium text-sky-400">
                        ৳{formatMoney(cust.tb_amount)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-medium text-blue-400">
                        ৳{formatMoney(cust.emi_amount)}
                      </td>
                      <td className="py-2.5 px-2 whitespace-nowrap">
                        {cust.next_collection_date ? (
                          <span className="flex items-center gap-1 font-semibold text-amber-400">
                            <Calendar className="h-3 w-3" />
                            {cust.next_collection_date}
                          </span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${getStatusBadge(
                            cust.lead_status
                          )}`}
                        >
                          {cust.lead_status || "PENDING"}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right font-bold text-emerald-300">
                        ৳{formatMoney(cust.total_collection)}
                      </td>
                      <td className="py-2.5 px-3 max-w-[200px] truncate text-slate-400" title={cust.remarks || ""}>
                        {cust.remarks || "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View for Section 2 */}
          <div className={`${mobileViewMode === "cards" ? "block sm:hidden" : "hidden"} space-y-3`}>
            {filteredCustomers.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No customer collection records found matching your filters.
              </div>
            ) : (
              filteredCustomers.map((cust: CustomerCollectionItem) => (
                <div
                  key={cust.id}
                  className="rounded-xl border border-slate-800 bg-slate-800/40 p-3.5 transition"
                >
                  {/* Top Bar: Customer & Status */}
                  <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-800/80">
                    <div>
                      <div className="font-bold text-white text-sm">{cust.customer_name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {cust.customer_phone ? (
                          <a
                            href={`tel:${cust.customer_phone}`}
                            className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                          >
                            <Phone className="h-3 w-3" />
                            {cust.customer_phone}
                          </a>
                        ) : (
                          <span className="text-xs text-slate-500">No phone</span>
                        )}
                        {cust.employee_name && (
                          <span className="text-[11px] text-slate-400">• {cust.employee_name}</span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${getStatusBadge(
                        cust.lead_status
                      )}`}
                    >
                      {cust.lead_status || "PENDING"}
                    </span>
                  </div>

                  {/* Financial Metrics */}
                  <div className="grid grid-cols-3 gap-2 py-2.5 border-b border-slate-800/60 text-center text-xs">
                    <div className="bg-emerald-500/10 rounded-lg p-2 border border-emerald-500/20">
                      <div className="text-[10px] text-emerald-400">Paid</div>
                      <div className="font-bold text-emerald-300">৳{formatMoney(cust.paid_amount)}</div>
                    </div>
                    <div className="bg-rose-500/10 rounded-lg p-2 border border-rose-500/20">
                      <div className="text-[10px] text-rose-400">Unpaid</div>
                      <div className="font-bold text-rose-300">৳{formatMoney(cust.unpaid_amount)}</div>
                    </div>
                    <div className="bg-emerald-500/5 rounded-lg p-2 border border-emerald-500/10">
                      <div className="text-[10px] text-emerald-400">Total</div>
                      <div className="font-bold text-emerald-200">৳{formatMoney(cust.total_collection)}</div>
                    </div>
                  </div>

                  {/* Breakdown & Dates */}
                  <div className="py-2 text-xs space-y-1.5 border-b border-slate-800/60">
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-400">IN/OUT Plan:</span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-900 text-slate-300 text-[11px] border border-slate-700">
                        {cust.in_out_plan || "Indoor"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-400">Collection Date:</span>
                      <span className="text-slate-200">{cust.collection_date || "-"}</span>
                    </div>

                    {cust.next_collection_date && (
                      <div className="flex items-center justify-between text-amber-400 font-medium">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>Next Collection:</span>
                        </span>
                        <span>{cust.next_collection_date}</span>
                      </div>
                    )}

                    {(cust.date_1 || cust.date_2) && (
                      <div className="flex items-center justify-between text-slate-400 text-[11px]">
                        <span>Contact Dates:</span>
                        <span>
                          {cust.date_1 ? `D1: ${cust.date_1}` : ""} {cust.date_2 ? `• D2: ${cust.date_2}` : ""}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Remarks */}
                  {cust.remarks && (
                    <div className="pt-2 text-[11px] text-slate-400">
                      <span className="text-slate-500">Remarks: </span>
                      {cust.remarks}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
