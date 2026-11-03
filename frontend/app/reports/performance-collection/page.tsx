"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { exportPerformanceCollectionToCSV } from "@/lib/export-performance-collection";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
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
  AlertTriangle,
} from "lucide-react";

function PerformanceCollectionReportContent() {
  const { user, loading: authLoading, isAdmin, isSubAdmin } = useAuth();
  const router = useRouter();

  // Permitted only for Admin and Sub-Admin
  const canAccess = Boolean(isAdmin || isSubAdmin);

  // Filter States - deferred to avoid SSR prerender time instability
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [selectedLeadStatus, setSelectedLeadStatus] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    setSelectedMonth(new Date().toISOString().slice(0, 7));
  }, []);

  // Data & Loading States
  const [report, setReport] = useState<PerformanceCollectionReportResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Mobile View Toggles
  const [mobileViewMode, setMobileViewMode] = useState<"cards" | "table">("cards");
  const [activeTab, setActiveTab] = useState<"both" | "employees" | "customers">("both");
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<number | null>(null);

  // Fetch report data
  const loadData = async () => {
    if (!selectedMonth) return;
    try {
      setLoading(true);
      setError(null);
      const data = await api.reports.getPerformanceCollectionReport({
        month: selectedMonth,
        employee_id: selectedEmployeeId ? Number(selectedEmployeeId) : undefined,
        lead_status: selectedLeadStatus || undefined,
      });
      setReport(data);
    } catch (err: unknown) {
      console.error("Failed to load performance & collection report", err);
      setError(err instanceof Error ? err.message : "Failed to load report data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      if (user && !canAccess) {
        router.push("/");
      } else if (canAccess && selectedMonth) {
        loadData();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, canAccess, selectedMonth, selectedEmployeeId, selectedLeadStatus]);

  // Client-side search filtering on customer records
  const customerCollections = report?.customer_collections;
  const filteredCustomers = useMemo(() => {
    if (!customerCollections) return [];
    if (!searchQuery.trim()) return customerCollections;
    const q = searchQuery.toLowerCase();
    return customerCollections.filter(
      (c: CustomerCollectionItem) =>
        c.customer_name.toLowerCase().includes(q) ||
        (c.customer_phone && c.customer_phone.toLowerCase().includes(q)) ||
        (c.employee_name && c.employee_name.toLowerCase().includes(q)) ||
        (c.remarks && c.remarks.toLowerCase().includes(q)) ||
        (c.lead_status && c.lead_status.toLowerCase().includes(q))
    );
  }, [customerCollections, searchQuery]);

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

  // Helper for lead status badge styles with clean light contrast
  const getStatusBadge = (status?: string | null) => {
    const s = (status || "").toUpperCase();
    if (s.includes("WON") || s.includes("COLLECTED") || s.includes("HOT")) {
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    }
    if (s.includes("WARM") || s.includes("RESCHEDULED") || s.includes("PENDING")) {
      return "bg-amber-50 text-amber-800 border-amber-200";
    }
    if (s.includes("LOST") || s.includes("CANCEL") || s.includes("COLD")) {
      return "bg-rose-50 text-rose-800 border-rose-200";
    }
    return "bg-slate-100 text-slate-700 border-slate-200";
  };

  if (authLoading) {
    return (
      <DashboardLayout
        title="Performance & Collection Report"
        subtitle="Monthly performance benchmarks & customer collection ledger"
      >
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
        </div>
      </DashboardLayout>
    );
  }

  // Admin access guard
  if (!canAccess) {
    return (
      <DashboardLayout
        title="Performance & Collection Report"
        subtitle="Monthly performance benchmarks & customer collection ledger"
      >
        <div className="mx-auto max-w-md py-16 px-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 mb-4 shadow-2xs">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Access Restricted</h1>
          <p className="text-sm text-slate-600 mb-6">
            This <strong>Employee Performance & Collection Report</strong> is restricted to Administrators and Sub-Administrators only.
          </p>
          <button
            onClick={() => router.push("/")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-xs transition"
          >
            <ArrowRight className="h-4 w-4 rotate-180" /> Return to Dashboard
          </button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Performance & Collection Report"
      subtitle="Monthly performance benchmarks, milestone intervals & customer collection ledger"
    >
      <div className="space-y-6 pb-12">
        {/* Top Header & Actions Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
              <FileSpreadsheet className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                Monthly Performance & Ledger
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Active Cycle: <span className="font-semibold text-emerald-800">{selectedMonth || "Loading..."}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={loadData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition disabled:opacity-50"
              title="Refresh Data"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={handleExport}
              disabled={loading || !report}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white shadow-2xs transition disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export to Excel</span>
            </button>
          </div>
        </div>

        {/* Filter Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 pb-3 mb-3 border-b border-slate-100 text-xs font-bold text-slate-700 uppercase tracking-wider">
            <Filter className="h-3.5 w-3.5 text-emerald-700" />
            <span>Filters & Search</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Month Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Select Month
              </label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 font-medium focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 shadow-2xs"
              />
            </div>

            {/* Employee Filter */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Filter by Employee
              </label>
              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 font-medium focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 shadow-2xs"
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
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Lead Status
              </label>
              <select
                value={selectedLeadStatus}
                onChange={(e) => setSelectedLeadStatus(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 font-medium focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 shadow-2xs"
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

            {/* Customer / Remarks Search */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Search Customer / Remarks
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Customer name, phone, remarks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 font-medium focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 shadow-2xs"
                />
                <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>
          </div>
        </div>

        {/* KPI Summary Cards */}
        {report && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {/* Target Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-1.5">
                <div className="p-1 rounded-md bg-slate-100 text-slate-700">
                  <TrendingUp className="h-3.5 w-3.5" />
                </div>
                <span>Target (TG)</span>
              </div>
              <div className="text-lg sm:text-xl font-bold text-slate-900">
                ৳{formatMoney(report.summary.total_target)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 font-medium">Monthly Goal</div>
            </div>

            {/* New Sales */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 mb-1.5">
                <div className="p-1 rounded-md bg-emerald-50 text-emerald-700">
                  <DollarSign className="h-3.5 w-3.5" />
                </div>
                <span>New Sales</span>
              </div>
              <div className="text-lg sm:text-xl font-bold text-emerald-700">
                ৳{formatMoney(report.summary.total_new_sales)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 font-medium">Booking / Down Payment</div>
            </div>

            {/* EMI Collected */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-700 mb-1.5">
                <div className="p-1 rounded-md bg-sky-50 text-sky-700">
                  <Layers className="h-3.5 w-3.5" />
                </div>
                <span>EMI Collected</span>
              </div>
              <div className="text-lg sm:text-xl font-bold text-sky-700">
                ৳{formatMoney(report.summary.total_emi)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 font-medium">Installment Collection</div>
            </div>

            {/* Total Collection (Featured) */}
            <div className="rounded-xl border border-emerald-300 bg-emerald-50/40 p-4 shadow-sm hover:shadow-md transition">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 mb-1.5">
                <div className="p-1 rounded-md bg-emerald-100 text-emerald-800">
                  <DollarSign className="h-3.5 w-3.5" />
                </div>
                <span>Total Collection</span>
              </div>
              <div className="text-lg sm:text-xl font-extrabold text-emerald-800">
                ৳{formatMoney(report.summary.total_collection)}
              </div>
              <div className="text-[11px] text-emerald-700 mt-1 font-medium">New Sales + EMI + TB</div>
            </div>

            {/* Unpaid Recovery (Featured) */}
            <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-4 shadow-sm hover:shadow-md transition">
              <div className="flex items-center gap-1.5 text-xs font-bold text-rose-700 mb-1.5">
                <div className="p-1 rounded-md bg-rose-100 text-rose-700">
                  <AlertCircle className="h-3.5 w-3.5" />
                </div>
                <span>Unpaid Amount</span>
              </div>
              <div className="text-lg sm:text-xl font-extrabold text-rose-700">
                ৳{formatMoney(report.summary.total_unpaid)}
              </div>
              <div className="text-[11px] text-rose-600 mt-1 font-medium">Pending Recovery</div>
            </div>

            {/* Total Leads */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 mb-1.5">
                <div className="p-1 rounded-md bg-indigo-50 text-indigo-700">
                  <Users className="h-3.5 w-3.5" />
                </div>
                <span>Total Leads</span>
              </div>
              <div className="text-lg sm:text-xl font-bold text-slate-900">
                {report.summary.total_leads}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 font-medium">
                Fair: {report.summary.total_fair_leads} • FB: {report.summary.total_fb_leads}
              </div>
            </div>
          </div>
        )}

        {/* Section View Selector & Mobile Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
          {/* Tab filter: Both / Employees / Customers */}
          <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs self-start">
            <button
              onClick={() => setActiveTab("both")}
              className={`px-3 py-1.5 rounded-md font-semibold transition ${
                activeTab === "both"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All Sections
            </button>
            <button
              onClick={() => setActiveTab("employees")}
              className={`px-3 py-1.5 rounded-md font-semibold transition ${
                activeTab === "employees"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Employees
            </button>
            <button
              onClick={() => setActiveTab("customers")}
              className={`px-3 py-1.5 rounded-md font-semibold transition ${
                activeTab === "customers"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Customers
            </button>
          </div>

          {/* Card vs Table toggle for mobile viewports */}
          <div className="flex sm:hidden items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs self-start">
            <button
              onClick={() => setMobileViewMode("cards")}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md font-semibold transition ${
                mobileViewMode === "cards"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Cards</span>
            </button>
            <button
              onClick={() => setMobileViewMode("table")}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md font-semibold transition ${
                mobileViewMode === "table"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <TableIcon className="h-3.5 w-3.5" />
              <span>Table</span>
            </button>
          </div>
        </div>

        {/* Error notification */}
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">Failed to load report data</div>
              <div className="text-xs text-rose-700 mt-0.5">{error}</div>
            </div>
          </div>
        )}

        {/* Loading state indicator */}
        {loading && !report && (
          <div className="flex h-64 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-2xs">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
              <div className="text-xs font-medium text-slate-500">Loading performance report & customer ledger...</div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* SECTION 1: EMPLOYEE MONTHLY PERFORMANCE REPORT */}
        {/* ============================================================ */}
        {report && (activeTab === "both" || activeTab === "employees") && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            {/* Section Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-xs font-bold text-emerald-800">
                  1
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Section 1: Employee Performance
                  </h3>
                  <p className="text-xs text-slate-500">
                    Sales targets, lead breakdown & progressive milestones
                  </p>
                </div>
              </div>
              <div className="text-xs font-semibold text-slate-600 bg-white px-3 py-1 rounded-full border border-slate-200 shadow-2xs self-start sm:self-auto">
                Showing <span className="text-emerald-700 font-bold">{report.monthly_performances.length}</span> Employees
              </div>
            </div>

            {/* Desktop Table */}
            <div className={`${mobileViewMode === "cards" ? "hidden sm:block" : "block"} overflow-x-auto`}>
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-600">
                    <th className="py-3 px-3 font-bold sticky left-0 bg-slate-50 z-10 border-r border-slate-200">
                      Employee & Position
                    </th>
                    <th className="py-3 px-2.5 font-bold">Month</th>
                    <th className="py-3 px-2.5 font-bold text-right">Target (TG)</th>
                    <th className="py-3 px-2.5 font-bold text-right text-emerald-700">New Sales</th>
                    <th className="py-3 px-2.5 font-bold text-right text-sky-700">EMI</th>
                    <th className="py-3 px-2.5 font-bold text-right">Total Lead</th>
                    <th className="py-3 px-2.5 font-bold text-right">Fair Lead</th>
                    <th className="py-3 px-2.5 font-bold text-right">FB Leads</th>
                    <th className="py-3 px-2.5 font-bold text-right text-rose-700">HP</th>
                    <th className="py-3 px-2.5 font-bold text-right text-amber-700">P</th>
                    <th className="py-3 px-2.5 font-bold text-right text-sky-700">FUP</th>
                    <th className="py-3 px-2 font-bold text-center bg-slate-100 border-l border-slate-200 text-slate-800" colSpan={5}>
                      Prediction From Employee
                    </th>
                  </tr>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] text-slate-500 font-semibold">
                    <th colSpan={11} className="py-1 px-3 border-r border-slate-200"></th>
                    <th className="py-1 px-1.5 text-center text-emerald-700 bg-emerald-50/40">Sold Fair</th>
                    <th className="py-1 px-1.5 text-center text-sky-700 bg-sky-50/40">Sold FB</th>
                    <th className="py-1 px-1.5 text-center text-purple-700 bg-purple-50/40">Sold Other</th>
                    <th className="py-1 px-1.5 text-center text-amber-700 bg-amber-50/40">Hold</th>
                    <th className="py-1 px-1.5 text-center text-rose-700 bg-rose-50/40">Cancel</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {report.monthly_performances.length === 0 ? (
                    <tr>
                      <td colSpan={16} className="py-10 text-center text-slate-400 font-medium">
                        No employee performance records found for {selectedMonth}.
                      </td>
                    </tr>
                  ) : (
                    report.monthly_performances.map((emp: EmployeeMonthlyPerformance) => (
                      <tr key={emp.employee_id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3 sticky left-0 bg-white hover:bg-slate-50/80 z-10 border-r border-slate-100">
                          <div className="font-bold text-slate-900">{emp.employee_name}</div>
                          <div className="text-[11px] text-slate-500 font-medium">{emp.position || "Staff"}</div>
                        </td>
                        <td className="py-3 px-2.5 whitespace-nowrap text-slate-600 font-medium">{emp.month}</td>
                        <td className="py-3 px-2.5 text-right font-semibold text-slate-900">
                          ৳{formatMoney(emp.target_sales || emp.target_collection)}
                        </td>
                        <td className="py-3 px-2.5 text-right font-bold text-emerald-700">
                          ৳{formatMoney(emp.actual_new_sales)}
                        </td>
                        <td className="py-3 px-2.5 text-right font-bold text-sky-700">
                          ৳{formatMoney(emp.actual_emi)}
                        </td>
                        <td className="py-3 px-2.5 text-right font-bold text-slate-900">{emp.total_lead}</td>
                        <td className="py-3 px-2.5 text-right font-medium text-slate-600">{emp.fair_lead}</td>
                        <td className="py-3 px-2.5 text-right font-medium text-slate-600">{emp.fb_lead}</td>
                        <td className="py-3 px-2.5 text-right text-rose-700 font-bold">{emp.hp}</td>
                        <td className="py-3 px-2.5 text-right text-amber-700 font-bold">{emp.p}</td>
                        <td className="py-3 px-2.5 text-right text-sky-700 font-bold">{emp.fup}</td>
                        <td className="py-3 px-1.5 text-center text-emerald-700 bg-emerald-50/20 font-bold border-l border-slate-100">
                          {emp.prediction_sold_fair}
                        </td>
                        <td className="py-3 px-1.5 text-center text-sky-700 bg-sky-50/20 font-bold">
                          {emp.prediction_sold_fb}
                        </td>
                        <td className="py-3 px-1.5 text-center text-purple-700 bg-purple-50/20 font-bold">
                          {emp.prediction_sold_other}
                        </td>
                        <td className="py-3 px-1.5 text-center text-amber-700 bg-amber-50/20 font-bold">
                          {emp.prediction_hold}
                        </td>
                        <td className="py-3 px-1.5 text-center text-rose-700 bg-rose-50/20 font-bold">
                          {emp.prediction_cancel}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View for Section 1 */}
            <div className={`${mobileViewMode === "cards" ? "block sm:hidden" : "hidden"} p-3 space-y-3`}>
              {report.monthly_performances.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400 font-medium">
                  No employee performance records found for {selectedMonth}.
                </div>
              ) : (
                report.monthly_performances.map((emp: EmployeeMonthlyPerformance) => {
                  const isExpanded = expandedEmployeeId === emp.employee_id;
                  return (
                    <div
                      key={emp.employee_id}
                      className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs"
                    >
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100">
                        <div>
                          <div className="font-bold text-slate-900 text-sm">{emp.employee_name}</div>
                          <div className="text-xs text-slate-500 font-medium mt-0.5">{emp.position || "Staff"} • {emp.month}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-slate-400 font-semibold uppercase">Target (TG)</div>
                          <div className="text-xs font-bold text-slate-900">
                            ৳{formatMoney(emp.target_sales || emp.target_collection)}
                          </div>
                        </div>
                      </div>

                      {/* Sales & EMI Bar */}
                      <div className="grid grid-cols-2 gap-2 py-3 border-b border-slate-100 text-xs">
                        <div className="bg-emerald-50 rounded-lg p-2.5 border border-emerald-100">
                          <div className="text-[10px] font-semibold text-emerald-800">New Sales</div>
                          <div className="font-extrabold text-emerald-700 text-sm">৳{formatMoney(emp.actual_new_sales)}</div>
                        </div>
                        <div className="bg-sky-50 rounded-lg p-2.5 border border-sky-100">
                          <div className="text-[10px] font-semibold text-sky-800">EMI Collected</div>
                          <div className="font-extrabold text-sky-700 text-sm">৳{formatMoney(emp.actual_emi)}</div>
                        </div>
                      </div>

                      {/* Lead Breakdown Pills */}
                      <div className="grid grid-cols-4 gap-1.5 py-2.5 border-b border-slate-100 text-center text-xs">
                        <div className="bg-slate-50 rounded-lg p-1.5 border border-slate-100">
                          <div className="text-[10px] text-slate-500 font-medium">Total</div>
                          <div className="font-bold text-slate-900">{emp.total_lead}</div>
                        </div>
                        <div className="bg-rose-50 rounded-lg p-1.5 border border-rose-100">
                          <div className="text-[10px] text-rose-700 font-bold">HP</div>
                          <div className="font-bold text-rose-700">{emp.hp}</div>
                        </div>
                        <div className="bg-amber-50 rounded-lg p-1.5 border border-amber-100">
                          <div className="text-[10px] text-amber-700 font-bold">P</div>
                          <div className="font-bold text-amber-700">{emp.p}</div>
                        </div>
                        <div className="bg-sky-50 rounded-lg p-1.5 border border-sky-100">
                          <div className="text-[10px] text-sky-700 font-bold">FUP</div>
                          <div className="font-bold text-sky-700">{emp.fup}</div>
                        </div>
                      </div>

                      {/* Predictions Row */}
                      <div className="pt-2.5 text-xs">
                        <div className="text-[10px] font-semibold text-slate-500 mb-1.5">Predictions From Employee:</div>
                        <div className="flex flex-wrap gap-1.5 text-[11px]">
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                            Fair: {emp.prediction_sold_fair}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-800 border border-sky-200 font-semibold">
                            FB: {emp.prediction_sold_fb}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
                            Hold: {emp.prediction_hold}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-800 border border-rose-200 font-semibold">
                            Cancel: {emp.prediction_cancel}
                          </span>
                        </div>
                      </div>

                      {/* Toggle Milestones Accordion */}
                      {emp.intervals && emp.intervals.length > 0 && (
                        <>
                          <button
                            onClick={() => setExpandedEmployeeId(isExpanded ? null : emp.employee_id)}
                            className="mt-3 flex w-full items-center justify-between rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                          >
                            <span className="flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5 text-emerald-700" />
                              <span>Milestones (Till 5th, 10th...)</span>
                            </span>
                            {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                          </button>

                          {isExpanded && (
                            <div className="mt-2 space-y-1.5 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 text-xs">
                              {emp.intervals.map((inv: PerformanceIntervalSummary, idx: number) => (
                                <div
                                  key={idx}
                                  className="flex items-center justify-between py-1.5 border-b border-slate-200/60 last:border-0"
                                >
                                  <span className="font-semibold text-slate-800">{inv.label}</span>
                                  <div className="flex items-center gap-2.5">
                                    <span className="text-emerald-700 font-bold">
                                      ৳{formatMoney(inv.new_sales)}
                                    </span>
                                    <span className="text-slate-500 text-[11px]">Leads: {inv.total_lead}</span>
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

            {/* PROGRESS SUMMARIES / MILESTONES (Global Grid) */}
            {report.monthly_performances.length > 0 &&
              report.monthly_performances[0].intervals &&
              report.monthly_performances[0].intervals.length > 0 && (
                <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/30">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="h-4 w-4 text-emerald-700" />
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                      Progress Summaries & Cumulative Milestones (Till 5th, 10th, 15th, 20th...)
                    </h4>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                    {report.monthly_performances[0].intervals.map((inv: PerformanceIntervalSummary, idx: number) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-300 shadow-2xs transition"
                      >
                        <div className="flex items-center justify-between text-xs font-bold text-slate-800 pb-1.5 border-b border-slate-100">
                          <span>{inv.label}</span>
                          <span className="text-[10px] text-slate-500 font-medium">{inv.total_lead} Leads</span>
                        </div>
                        <div className="mt-2 space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Sales:</span>
                            <span className="font-bold text-emerald-700">৳{formatMoney(inv.new_sales)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Coll:</span>
                            <span className="font-bold text-sky-700">৳{formatMoney(inv.total_collection)}</span>
                          </div>
                          <div className="flex justify-between border-t border-slate-100 pt-1 text-[11px]">
                            <span className="text-slate-500">Visits:</span>
                            <span className="font-semibold text-slate-800">
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
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            {/* Section Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-xs font-bold text-sky-800">
                  2
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Section 2: Customer Collection
                  </h3>
                  <p className="text-xs text-slate-500">
                    Customer collection ledger, visit plans & promised dates
                  </p>
                </div>
              </div>
              <div className="text-xs font-semibold text-slate-600 bg-white px-3 py-1 rounded-full border border-slate-200 shadow-2xs self-start sm:self-auto">
                Showing <span className="text-sky-700 font-bold">{filteredCustomers.length}</span> Customer Records
              </div>
            </div>

            {/* Desktop Table */}
            <div className={`${mobileViewMode === "cards" ? "hidden sm:block" : "block"} overflow-x-auto`}>
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-600">
                    <th className="py-3 px-3 font-bold sticky left-0 bg-slate-50 z-10 border-r border-slate-200">
                      Customer Name & Phone
                    </th>
                    <th className="py-3 px-2.5 font-bold text-right text-emerald-700">Paid</th>
                    <th className="py-3 px-2.5 font-bold text-right text-rose-700">Unpaid</th>
                    <th className="py-3 px-2.5 font-bold">Collection Date</th>
                    <th className="py-3 px-2.5 font-bold">IN/OUT Plan</th>
                    <th className="py-3 px-2.5 font-bold">Date-1</th>
                    <th className="py-3 px-2.5 font-bold">Date-2</th>
                    <th className="py-3 px-2.5 font-bold text-right text-emerald-700">New Sales</th>
                    <th className="py-3 px-2.5 font-bold text-right text-sky-700">TB</th>
                    <th className="py-3 px-2.5 font-bold text-right text-sky-700">EMI</th>
                    <th className="py-3 px-2.5 font-bold text-amber-700">Next Collection Date</th>
                    <th className="py-3 px-2.5 font-bold">Lead Status</th>
                    <th className="py-3 px-2.5 font-bold text-right text-emerald-800">Total Collection</th>
                    <th className="py-3 px-3 font-bold">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={14} className="py-10 text-center text-slate-400 font-medium">
                        No customer collection records found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredCustomers.map((cust: CustomerCollectionItem) => (
                      <tr key={cust.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3 sticky left-0 bg-white hover:bg-slate-50/80 z-10 border-r border-slate-100">
                          <div className="font-bold text-slate-900">{cust.customer_name}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {cust.customer_phone ? (
                              <a
                                href={`tel:${cust.customer_phone}`}
                                className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-semibold hover:underline"
                              >
                                <Phone className="h-3 w-3" />
                                {cust.customer_phone}
                              </a>
                            ) : (
                              <span className="text-[11px] text-slate-400">No phone</span>
                            )}
                            {cust.employee_name && (
                              <span className="text-[11px] text-slate-500 font-medium">• {cust.employee_name}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-2.5 text-right font-bold text-emerald-700">
                          ৳{formatMoney(cust.paid_amount)}
                        </td>
                        <td className="py-3 px-2.5 text-right font-bold text-rose-700">
                          ৳{formatMoney(cust.unpaid_amount)}
                        </td>
                        <td className="py-3 px-2.5 whitespace-nowrap text-slate-600 font-medium">
                          {cust.collection_date || "-"}
                        </td>
                        <td className="py-3 px-2.5 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-semibold border border-slate-200">
                            {cust.in_out_plan || "Indoor"}
                          </span>
                        </td>
                        <td className="py-3 px-2.5 whitespace-nowrap text-slate-500 text-[11px]">
                          {cust.date_1 || "-"}
                        </td>
                        <td className="py-3 px-2.5 whitespace-nowrap text-slate-500 text-[11px]">
                          {cust.date_2 || "-"}
                        </td>
                        <td className="py-3 px-2.5 text-right font-semibold text-emerald-700">
                          ৳{formatMoney(cust.new_sales_amount)}
                        </td>
                        <td className="py-3 px-2.5 text-right font-semibold text-sky-700">
                          ৳{formatMoney(cust.tb_amount)}
                        </td>
                        <td className="py-3 px-2.5 text-right font-semibold text-sky-700">
                          ৳{formatMoney(cust.emi_amount)}
                        </td>
                        <td className="py-3 px-2.5 whitespace-nowrap">
                          {cust.next_collection_date ? (
                            <span className="inline-flex items-center gap-1 font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 text-[11px]">
                              <Calendar className="h-3 w-3 text-amber-700" />
                              {cust.next_collection_date}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-3 px-2.5 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getStatusBadge(
                              cust.lead_status
                            )}`}
                          >
                            {cust.lead_status || "PENDING"}
                          </span>
                        </td>
                        <td className="py-3 px-2.5 text-right font-extrabold text-emerald-800">
                          ৳{formatMoney(cust.total_collection)}
                        </td>
                        <td className="py-3 px-3 max-w-[200px] truncate text-slate-500 text-[11px]" title={cust.remarks || ""}>
                          {cust.remarks || "-"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View for Section 2 */}
            <div className={`${mobileViewMode === "cards" ? "block sm:hidden" : "hidden"} p-3 space-y-3`}>
              {filteredCustomers.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400 font-medium">
                  No customer collection records found matching your filters.
                </div>
              ) : (
                filteredCustomers.map((cust: CustomerCollectionItem) => (
                  <div
                    key={cust.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs"
                  >
                    {/* Header: Customer & Lead Status */}
                    <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100">
                      <div>
                        <div className="font-bold text-slate-900 text-sm">{cust.customer_name}</div>
                        <div className="flex items-center gap-2 mt-1">
                          {cust.customer_phone ? (
                            <a
                              href={`tel:${cust.customer_phone}`}
                              className="inline-flex items-center gap-1 text-xs text-emerald-700 font-semibold hover:underline"
                            >
                              <Phone className="h-3 w-3" />
                              {cust.customer_phone}
                            </a>
                          ) : (
                            <span className="text-xs text-slate-400">No phone</span>
                          )}
                          {cust.employee_name && (
                            <span className="text-[11px] text-slate-500 font-medium">• {cust.employee_name}</span>
                          )}
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getStatusBadge(
                          cust.lead_status
                        )}`}
                      >
                        {cust.lead_status || "PENDING"}
                      </span>
                    </div>

                    {/* Financial Metrics Strip */}
                    <div className="grid grid-cols-3 gap-2 py-3 border-b border-slate-100 text-center text-xs">
                      <div className="bg-emerald-50 rounded-lg p-2 border border-emerald-100">
                        <div className="text-[10px] font-semibold text-emerald-800">Paid</div>
                        <div className="font-extrabold text-emerald-700">৳{formatMoney(cust.paid_amount)}</div>
                      </div>
                      <div className="bg-rose-50 rounded-lg p-2 border border-rose-100">
                        <div className="text-[10px] font-semibold text-rose-800">Unpaid</div>
                        <div className="font-extrabold text-rose-700">৳{formatMoney(cust.unpaid_amount)}</div>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-2 border border-slate-200">
                        <div className="text-[10px] font-semibold text-slate-700">Total</div>
                        <div className="font-extrabold text-slate-900">৳{formatMoney(cust.total_collection)}</div>
                      </div>
                    </div>

                    {/* Breakdown & Dates */}
                    <div className="py-2.5 text-xs space-y-2 border-b border-slate-100">
                      <div className="flex items-center justify-between text-slate-600">
                        <span className="text-slate-500">IN/OUT Plan:</span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 text-[11px] font-semibold border border-slate-200">
                          {cust.in_out_plan || "Indoor"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-slate-600">
                        <span className="text-slate-500">Collection Date:</span>
                        <span className="font-semibold text-slate-800">{cust.collection_date || "-"}</span>
                      </div>

                      {cust.next_collection_date && (
                        <div className="flex items-center justify-between bg-amber-50 p-2 rounded-lg border border-amber-200 text-amber-900 font-semibold text-[11px]">
                          <span className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-amber-700" />
                            <span>Next Collection Date:</span>
                          </span>
                          <span>{cust.next_collection_date}</span>
                        </div>
                      )}

                      {(cust.date_1 || cust.date_2) && (
                        <div className="flex items-center justify-between text-slate-500 text-[11px]">
                          <span>Contact Dates:</span>
                          <span className="font-medium text-slate-700">
                            {cust.date_1 ? `D1: ${cust.date_1}` : ""} {cust.date_2 ? `• D2: ${cust.date_2}` : ""}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Remarks */}
                    {cust.remarks && (
                      <div className="pt-2.5 text-xs text-slate-600">
                        <span className="font-semibold text-slate-500 text-[11px]">Remarks: </span>
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
    </DashboardLayout>
  );
}

export default function PerformanceCollectionReportPage() {
  return (
    <Suspense
      fallback={
        <DashboardLayout
          title="Performance & Collection Report"
          subtitle="Monthly performance benchmarks & customer collection ledger"
        >
          <div className="flex h-96 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
          </div>
        </DashboardLayout>
      }
    >
      <PerformanceCollectionReportContent />
    </Suspense>
  );
}
