"use client";

import { useEffect, useState, useMemo, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { exportPerformanceCollectionToCSV } from "@/lib/export-performance-collection";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { TakaIcon } from "@/components/ui";
import type {
  PerformanceCollectionReportResponse,
  EmployeeMonthlyPerformance,
  CustomerCollectionItem,
  PerformanceIntervalSummary,
  MilestoneCheckpointItem,
  CustomerDetailResponse,
} from "@/types";
import {
  FileSpreadsheet,
  Download,
  Filter,
  RefreshCw,
  TrendingUp,
  Banknote,
  Users,
  Calendar,
  AlertCircle,
  Clock,
  Layers,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  ArrowLeftRight,
  Maximize2,
  Minimize2,
  Phone,
  ShieldAlert,
  ArrowRight,
  LayoutGrid,
  Table as TableIcon,
  Search,
  AlertTriangle,
  Printer,
  Edit3,
  CheckCircle2,
  RotateCcw,
  X,
  Check,
  ExternalLink,
  UserCheck,
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

  // Milestone Review Session Modal States
  const [isMilestoneModalOpen, setIsMilestoneModalOpen] = useState<boolean>(false);
  const [modalScope, setModalScope] = useState<"company" | "employee">("company");
  const [modalEmployeeId, setModalEmployeeId] = useState<string>("");
  const [modalLoading, setModalLoading] = useState<boolean>(false);
  const [modalSaving, setModalSaving] = useState<boolean>(false);
  const [modalMessage, setModalMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const initialCheckpoints: MilestoneCheckpointItem[] = useMemo(
    () => [
      { checkpoint_day: 5, label: "Till 5th", new_sales: 0, emi: 0, total_collection: 0, total_lead: 0, fair_lead: 0, fb_lead: 0, hp: 0, p: 0, fup: 0, outdoor_visits: 0, indoor_cx: 0, total_calls: 0, sold_fair: 0, sold_fb: 0, sold_other: 0, gl: "GL", hold: 0, cancel: 0, admin_notes: "" },
      { checkpoint_day: 10, label: "Till 10th", new_sales: 0, emi: 0, total_collection: 0, total_lead: 0, fair_lead: 0, fb_lead: 0, hp: 0, p: 0, fup: 0, outdoor_visits: 0, indoor_cx: 0, total_calls: 0, sold_fair: 0, sold_fb: 0, sold_other: 0, gl: "GL", hold: 0, cancel: 0, admin_notes: "" },
      { checkpoint_day: 15, label: "Till 15th", new_sales: 0, emi: 0, total_collection: 0, total_lead: 0, fair_lead: 0, fb_lead: 0, hp: 0, p: 0, fup: 0, outdoor_visits: 0, indoor_cx: 0, total_calls: 0, sold_fair: 0, sold_fb: 0, sold_other: 0, gl: "GL", hold: 0, cancel: 0, admin_notes: "" },
      { checkpoint_day: 20, label: "Till 20th", new_sales: 0, emi: 0, total_collection: 0, total_lead: 0, fair_lead: 0, fb_lead: 0, hp: 0, p: 0, fup: 0, outdoor_visits: 0, indoor_cx: 0, total_calls: 0, sold_fair: 0, sold_fb: 0, sold_other: 0, gl: "GL", hold: 0, cancel: 0, admin_notes: "" },
      { checkpoint_day: 25, label: "Till 25th", new_sales: 0, emi: 0, total_collection: 0, total_lead: 0, fair_lead: 0, fb_lead: 0, hp: 0, p: 0, fup: 0, outdoor_visits: 0, indoor_cx: 0, total_calls: 0, sold_fair: 0, sold_fb: 0, sold_other: 0, gl: "GL", hold: 0, cancel: 0, admin_notes: "" },
      { checkpoint_day: 30, label: "Till 30/31th", new_sales: 0, emi: 0, total_collection: 0, total_lead: 0, fair_lead: 0, fb_lead: 0, hp: 0, p: 0, fup: 0, outdoor_visits: 0, indoor_cx: 0, total_calls: 0, sold_fair: 0, sold_fb: 0, sold_other: 0, gl: "GL", hold: 0, cancel: 0, admin_notes: "" },
    ],
    []
  );

  const [checkpointRows, setCheckpointRows] = useState<MilestoneCheckpointItem[]>(initialCheckpoints);

  // Horizontal Scroll & Viewport Height Controls
  const [section1HeightMode, setSection1HeightMode] = useState<"compact" | "full">("compact");
  const [section2HeightMode, setSection2HeightMode] = useState<"compact" | "full">("compact");

  const section1TableRef = useRef<HTMLDivElement>(null);
  const section1TopScrollRef = useRef<HTMLDivElement>(null);
  const [table1Scroll, setTable1Scroll] = useState({ canLeft: false, canRight: true });

  const section2TableRef = useRef<HTMLDivElement>(null);
  const section2TopScrollRef = useRef<HTMLDivElement>(null);
  const [table2Scroll, setTable2Scroll] = useState({ canLeft: false, canRight: true });

  const handleTable1Scroll = () => {
    if (!section1TableRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = section1TableRef.current;
    if (section1TopScrollRef.current && Math.abs(section1TopScrollRef.current.scrollLeft - scrollLeft) > 1) {
      section1TopScrollRef.current.scrollLeft = scrollLeft;
    }
    setTable1Scroll({
      canLeft: scrollLeft > 10,
      canRight: scrollLeft < scrollWidth - clientWidth - 10,
    });
  };

  const handleTopScroll1 = () => {
    if (!section1TopScrollRef.current || !section1TableRef.current) return;
    const { scrollLeft } = section1TopScrollRef.current;
    if (Math.abs(section1TableRef.current.scrollLeft - scrollLeft) > 1) {
      section1TableRef.current.scrollLeft = scrollLeft;
    }
  };

  const scrollTable1 = (delta: number) => {
    if (section1TableRef.current) {
      section1TableRef.current.scrollBy({ left: delta, behavior: "smooth" });
    }
  };

  const jumpTable1 = (toEnd: boolean) => {
    if (section1TableRef.current) {
      section1TableRef.current.scrollTo({ left: toEnd ? 9999 : 0, behavior: "smooth" });
    }
  };

  const handleTable2Scroll = () => {
    if (!section2TableRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = section2TableRef.current;
    if (section2TopScrollRef.current && Math.abs(section2TopScrollRef.current.scrollLeft - scrollLeft) > 1) {
      section2TopScrollRef.current.scrollLeft = scrollLeft;
    }
    setTable2Scroll({
      canLeft: scrollLeft > 10,
      canRight: scrollLeft < scrollWidth - clientWidth - 10,
    });
  };

  const handleTopScroll2 = () => {
    if (!section2TopScrollRef.current || !section2TableRef.current) return;
    const { scrollLeft } = section2TopScrollRef.current;
    if (Math.abs(section2TableRef.current.scrollLeft - scrollLeft) > 1) {
      section2TableRef.current.scrollLeft = scrollLeft;
    }
  };

  const scrollTable2 = (delta: number) => {
    if (section2TableRef.current) {
      section2TableRef.current.scrollBy({ left: delta, behavior: "smooth" });
    }
  };

  const jumpTable2 = (toEnd: boolean) => {
    if (section2TableRef.current) {
      section2TableRef.current.scrollTo({ left: toEnd ? 9999 : 0, behavior: "smooth" });
    }
  };

  // Customer Detail Modal States
  const [selectedCustomerDetail, setSelectedCustomerDetail] = useState<CustomerDetailResponse | null>(null);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState<boolean>(false);
  const [customerModalLoading, setCustomerModalLoading] = useState<boolean>(false);

  const handleOpenCustomerDetail = async (cust: CustomerCollectionItem) => {
    setIsCustomerModalOpen(true);
    setCustomerModalLoading(true);
    setSelectedCustomerDetail(null);
    try {
      const data = await api.reports.getCustomerDetail({
        customer_code: cust.customer_code,
        customer_phone: cust.customer_phone || undefined,
        customer_name: cust.customer_name,
      });
      setSelectedCustomerDetail(data);
    } catch (err: unknown) {
      console.warn("Could not fetch remote customer details, synthesizing from report row", err);
      setSelectedCustomerDetail({
        customer_code: cust.customer_code || `CX-${1000 + cust.id}`,
        customer_name: cust.customer_name,
        customer_phone: cust.customer_phone,
        lead_status: cust.lead_status,
        lead_source: cust.lead_source || "Direct Lead",
        lead_source_date: cust.lead_source_date || cust.date_1,
        total_paid: cust.paid_amount,
        total_unpaid: cust.unpaid_amount,
        total_collection: cust.total_collection,
        new_sales_amount: cust.new_sales_amount,
        emi_amount: cust.emi_amount,
        tb_amount: cust.tb_amount,
        next_collection_date: cust.next_collection_date,
        next_collection_date_2: cust.next_collection_date_2,
        assigned_employees: [cust.employee_name],
        transactions: [
          {
            id: cust.id,
            report_date: cust.collection_date || cust.date_1 || selectedMonth,
            category:
              cust.new_sales_amount > 0
                ? "new_sales"
                : cust.emi_amount > 0
                ? "emi_collection"
                : "tb_collection",
            amount: cust.total_collection,
            paid_amount: cust.paid_amount,
            unpaid_amount: cust.unpaid_amount,
            expected_payment_date: cust.next_collection_date,
            notes: cust.remarks,
            employee_name: cust.employee_name,
          },
        ],
      });
    } finally {
      setCustomerModalLoading(false);
    }
  };

  // Auto-fill form inputs from current system report calculations
  const autoFillFromSystem = (scope: "company" | "employee", empIdStr: string) => {
    let sourceIntervals: PerformanceIntervalSummary[] = [];
    if (scope === "company") {
      sourceIntervals = report?.company_intervals || report?.monthly_performances?.[0]?.intervals || [];
    } else {
      const emp = report?.monthly_performances?.find((e) => String(e.employee_id) === empIdStr);
      sourceIntervals = emp?.intervals || [];
    }

    if (!sourceIntervals || sourceIntervals.length === 0) return;

    setCheckpointRows((prev) =>
      prev.map((row) => {
        const match = sourceIntervals.find((inv) => inv.end_day === row.checkpoint_day);
        if (!match) return row;
        return {
          ...row,
          new_sales: match.new_sales || 0,
          emi: match.emi || 0,
          total_collection: match.total_collection || ((match.new_sales || 0) + (match.emi || 0)),
          total_lead: match.total_lead || 0,
          fair_lead: match.fair_lead || 0,
          fb_lead: match.fb_lead || 0,
          hp: match.hp || 0,
          p: match.p || 0,
          fup: match.fup || 0,
          outdoor_visits: match.outdoor_visits || 0,
          indoor_cx: match.indoor_cx || 0,
          total_calls: match.total_calls || 0,
          sold_fair: match.sold_fair || 0,
          sold_fb: match.sold_fb || 0,
          sold_other: match.sold_other || 0,
          gl: match.gl || row.gl || "GL",
          hold: match.hold || 0,
          cancel: match.cancel || 0,
          admin_notes: match.admin_notes || row.admin_notes || "",
        };
      })
    );
  };

  // Load existing saved checkpoints from database for modal
  const loadMilestoneCheckpointsForModal = async (scope: "company" | "employee", empIdStr: string) => {
    if (!selectedMonth) return;
    try {
      setModalLoading(true);
      setModalMessage(null);
      const empId = scope === "employee" && empIdStr ? Number(empIdStr) : null;
      const saved = await api.reports.getMilestoneCheckpoints({
        month: selectedMonth,
        employee_id: empId,
      });

      if (saved && saved.length > 0) {
        setCheckpointRows((prev) =>
          prev.map((row) => {
            const match = saved.find((s) => s.checkpoint_day === row.checkpoint_day);
            if (!match) return row;
            return {
              checkpoint_day: match.checkpoint_day,
              label: match.label,
              new_sales: match.new_sales,
              emi: match.emi,
              total_collection: match.total_collection,
              total_lead: match.total_lead,
              fair_lead: match.fair_lead,
              fb_lead: match.fb_lead,
              hp: match.hp,
              p: match.p,
              fup: match.fup,
              outdoor_visits: match.outdoor_visits,
              indoor_cx: match.indoor_cx,
              total_calls: match.total_calls || 0,
              sold_fair: match.sold_fair || 0,
              sold_fb: match.sold_fb || 0,
              sold_other: match.sold_other || 0,
              gl: match.gl || "GL",
              hold: match.hold || 0,
              cancel: match.cancel || 0,
              admin_notes: match.admin_notes || "",
            };
          })
        );
      } else {
        autoFillFromSystem(scope, empIdStr);
      }
    } catch (err: unknown) {
      console.error("Failed to load checkpoints", err);
      autoFillFromSystem(scope, empIdStr);
    } finally {
      setModalLoading(false);
    }
  };

  const handleOpenMilestoneModal = (employeeId?: number) => {
    setModalMessage(null);
    if (employeeId) {
      setModalScope("employee");
      setModalEmployeeId(String(employeeId));
      setIsMilestoneModalOpen(true);
      loadMilestoneCheckpointsForModal("employee", String(employeeId));
    } else {
      setModalScope("company");
      const defaultEmp = report?.monthly_performances?.[0]?.employee_id
        ? String(report.monthly_performances[0].employee_id)
        : "";
      setModalEmployeeId(defaultEmp);
      setIsMilestoneModalOpen(true);
      loadMilestoneCheckpointsForModal("company", defaultEmp);
    }
  };

  const handleSaveMilestones = async () => {
    if (!selectedMonth) return;
    try {
      setModalSaving(true);
      setModalMessage(null);
      const empId = modalScope === "employee" && modalEmployeeId ? Number(modalEmployeeId) : null;
      await api.reports.saveMilestoneCheckpoints({
        month: selectedMonth,
        employee_id: empId,
        checkpoints: checkpointRows,
      });

      setModalMessage({
        type: "success",
        text: `Milestone checkpoints saved successfully for ${
          modalScope === "company" ? "Company-Wide Total" : "Selected Employee"
        }!`,
      });

      await loadData();

      setTimeout(() => {
        setIsMilestoneModalOpen(false);
        setModalMessage(null);
      }, 800);
    } catch (err: unknown) {
      console.error("Failed to save checkpoints", err);
      setModalMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save milestone checkpoints.",
      });
    } finally {
      setModalSaving(false);
    }
  };

  const handleResetMilestones = async () => {
    if (!selectedMonth) return;
    const confirmReset = window.confirm(
      `Revert ${
        modalScope === "company" ? "Company-Wide" : "this Employee's"
      } milestone checkpoints back to auto-calculated daily report figures?`
    );
    if (!confirmReset) return;

    try {
      setModalSaving(true);
      setModalMessage(null);
      const empId = modalScope === "employee" && modalEmployeeId ? Number(modalEmployeeId) : null;
      await api.reports.resetMilestoneCheckpoints({
        month: selectedMonth,
        employee_id: empId,
      });

      autoFillFromSystem(modalScope, modalEmployeeId);

      setModalMessage({
        type: "success",
        text: "Reset back to auto-calculated report figures.",
      });

      await loadData();
    } catch (err: unknown) {
      console.error("Failed to reset checkpoints", err);
      setModalMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to reset milestone checkpoints.",
      });
    } finally {
      setModalSaving(false);
    }
  };

  const updateCheckpointField = (
    index: number,
    field: keyof MilestoneCheckpointItem,
    value: string | number
  ) => {
    setCheckpointRows((prev) => {
      const copy = [...prev];
      const row = { ...copy[index], [field]: value };

      if (field === "new_sales" || field === "emi") {
        const prevSales = Number(copy[index].new_sales) || 0;
        const prevEmi = Number(copy[index].emi) || 0;
        const currentTotal = Number(copy[index].total_collection) || 0;
        const newSales = field === "new_sales" ? Number(value) || 0 : prevSales;
        const newEmi = field === "emi" ? Number(value) || 0 : prevEmi;

        if (currentTotal === 0 || currentTotal === prevSales + prevEmi) {
          row.total_collection = newSales + newEmi;
        }
      }

      copy[index] = row;
      return copy;
    });
  };

  const displayMilestones: PerformanceIntervalSummary[] = useMemo(() => {
    if (report?.company_intervals && report.company_intervals.length > 0) {
      return report.company_intervals;
    }
    return report?.monthly_performances?.[0]?.intervals || [];
  }, [report]);

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

            <Link
              href={`/reports/performance-collection/print?month=${selectedMonth}&employee_id=${selectedEmployeeId}&lead_status=${selectedLeadStatus}`}
              target="_blank"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition"
              title="Print or Save as Official PDF Report"
            >
              <Printer className="h-3.5 w-3.5 text-slate-600" />
              <span>Print / PDF</span>
            </Link>

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
                  <TakaIcon className="h-3.5 w-3.5" />
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
                  <Banknote className="h-3.5 w-3.5" />
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

            {/* View Mode & Horizontal Scroll Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <ArrowLeftRight className="h-3.5 w-3.5 text-emerald-700" />
                  Horizontal Scroll:
                </span>
                <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white shadow-2xs overflow-hidden">
                  <button
                    type="button"
                    onClick={() => scrollTable1(-300)}
                    disabled={!table1Scroll.canLeft}
                    className="p-1.5 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-white text-slate-700 transition"
                    title="Slide columns left"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => jumpTable1(false)}
                    className="px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 border-x border-slate-200 transition"
                    title="Jump to Start (TG / New Sales / Leads)"
                  >
                    Start (TG/Leads)
                  </button>
                  <button
                    type="button"
                    onClick={() => jumpTable1(true)}
                    className="px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-50 border-r border-slate-200 transition"
                    title="Jump to End (Prediction / GL / Collection)"
                  >
                    End (GL & Coll) →
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollTable1(300)}
                    disabled={!table1Scroll.canRight}
                    className="p-1.5 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-white text-slate-700 transition"
                    title="Slide columns right"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-slate-500 hidden md:inline text-[11px]">View Height:</span>
                <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs text-[11px]">
                  <button
                    type="button"
                    onClick={() => setSection1HeightMode("compact")}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition ${
                      section1HeightMode === "compact"
                        ? "bg-emerald-700 text-white shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                    title="Comfortable scroll window with pinned visible horizontal scrollbar"
                  >
                    <Minimize2 className="h-3 w-3" />
                    <span>Scroll Window</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSection1HeightMode("full")}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition ${
                      section1HeightMode === "full"
                        ? "bg-emerald-700 text-white shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                    title="Full length view without vertical height limitation"
                  >
                    <Maximize2 className="h-3 w-3" />
                    <span>Full Height</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Synchronized Top Horizontal Scrollbar */}
            <div
              ref={section1TopScrollRef}
              onScroll={handleTopScroll1}
              className="overflow-x-auto bg-slate-100/70 border-b border-slate-200 custom-table-scrollbar"
              title="Drag this horizontal scrollbar to slide table columns left or right"
            >
              <div style={{ width: 1400, height: 8 }} />
            </div>

            {/* Desktop Table */}
            <div
              ref={section1TableRef}
              onScroll={handleTable1Scroll}
              className={`${mobileViewMode === "cards" ? "hidden sm:block" : "block"} overflow-x-auto custom-table-scrollbar ${
                section1HeightMode === "compact" ? "max-h-[72vh] overflow-y-auto" : ""
              } relative`}
            >
              <table className="w-full text-left text-xs border-collapse min-w-[1250px]">
                <thead className="sticky top-0 z-20 shadow-xs">
                  <tr className="border-b border-slate-200 bg-slate-100 text-[11px] uppercase tracking-wider text-slate-700">
                    <th rowSpan={2} className="py-2.5 px-3 font-bold sticky left-0 bg-slate-100 z-30 border-r border-b border-slate-200 whitespace-nowrap min-w-[100px]">
                      Month / Period
                    </th>
                    <th rowSpan={2} className="py-2.5 px-2 font-bold text-right border-b border-slate-200 whitespace-nowrap min-w-[70px]">TG</th>
                    <th rowSpan={2} className="py-2.5 px-2 font-bold text-right text-emerald-700 border-b border-slate-200 whitespace-nowrap min-w-[75px]">New Sales</th>
                    <th rowSpan={2} className="py-2.5 px-2 font-bold text-right text-sky-700 border-b border-slate-200 whitespace-nowrap min-w-[75px]">EMI</th>
                    <th rowSpan={2} className="py-2.5 px-2 font-bold text-right border-b border-slate-200 whitespace-nowrap min-w-[50px]">Total Lead</th>
                    <th rowSpan={2} className="py-2.5 px-2 font-bold text-right border-b border-slate-200 whitespace-nowrap min-w-[50px]">Fair Lead</th>
                    <th rowSpan={2} className="py-2.5 px-2 font-bold text-right border-b border-slate-200 whitespace-nowrap min-w-[50px]">FB Leads</th>
                    <th rowSpan={2} className="py-2.5 px-2 font-bold text-right text-rose-700 border-b border-slate-200 whitespace-nowrap min-w-[38px]">HP</th>
                    <th rowSpan={2} className="py-2.5 px-2 font-bold text-right text-amber-700 border-b border-slate-200 whitespace-nowrap min-w-[38px]">P</th>
                    <th rowSpan={2} className="py-2.5 px-2 font-bold text-right text-sky-700 border-b border-slate-200 whitespace-nowrap min-w-[38px]">Fup</th>
                    <th colSpan={4} className="py-1.5 px-2 font-bold text-center bg-slate-200 border-x border-b border-slate-300 text-slate-800 whitespace-nowrap">
                      Prediction from Emp
                    </th>
                    <th rowSpan={2} className="py-2.5 px-2 font-bold text-center border-b border-slate-200 whitespace-nowrap min-w-[42px]">GL</th>
                    <th rowSpan={2} className="py-2.5 px-2 font-bold text-center text-amber-700 border-b border-slate-200 whitespace-nowrap min-w-[42px]">Hold</th>
                    <th rowSpan={2} className="py-2.5 px-2 font-bold text-center text-rose-700 border-b border-slate-200 whitespace-nowrap min-w-[42px]">Cancel</th>
                    <th rowSpan={2} className="py-2.5 px-2.5 font-bold text-center bg-slate-200 border-l border-b border-slate-300 text-slate-800 whitespace-nowrap min-w-[125px]">
                      Total Lead (HP+P) / Coll
                    </th>
                  </tr>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[10px] text-slate-600 font-semibold">
                    <th className="py-1 px-1.5 text-center text-slate-800 bg-slate-100 border-l border-slate-200 whitespace-nowrap min-w-[65px]">Total Calls</th>
                    <th className="py-1 px-1 text-center text-emerald-700 bg-emerald-50 whitespace-nowrap min-w-[70px]">Sold Fair</th>
                    <th className="py-1 px-1 text-center text-sky-700 bg-sky-50 whitespace-nowrap min-w-[70px]">Sold FB</th>
                    <th className="py-1 px-1 text-center text-purple-700 bg-purple-50 border-r border-slate-200 whitespace-nowrap min-w-[70px]">Sold Other</th>
                  </tr>
                </thead>
                {report.monthly_performances.length === 0 ? (
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    <tr>
                      <td colSpan={18} className="py-10 text-center text-slate-400 font-medium">
                        No employee performance records found for {selectedMonth}.
                      </td>
                    </tr>
                  </tbody>
                ) : (
                  report.monthly_performances.map((emp: EmployeeMonthlyPerformance) => {
                    // Combined rows: Historical months + Active Month + 6 Milestone Checkpoints
                    const historyRows = emp.history_months || [];
                    const intervalRows = emp.intervals || [];

                    return (
                      <tbody key={emp.employee_id} className="border-b-2 border-slate-300 last:border-0 divide-y divide-slate-100 text-slate-700">
                        {/* Employee Header Banner Row */}
                        <tr className="bg-slate-100/90 border-t-2 border-slate-300 text-xs">
                          <td colSpan={18} className="py-2.5 px-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-3">
                                <div>
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mr-1.5">Name:</span>
                                  <span className="font-extrabold text-slate-900 text-sm">{emp.employee_name}</span>
                                </div>
                                <span className="text-slate-300">•</span>
                                <div>
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mr-1.5">Position:</span>
                                  <span className="font-semibold text-slate-700">{emp.position || "Staff"}</span>
                                </div>
                                <span className="text-slate-300">•</span>
                                <div>
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mr-1.5">GL:</span>
                                  <span className="font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">{emp.gl || "GL"}</span>
                                </div>
                              </div>

                              {canAccess && (
                                <button
                                  onClick={() => handleOpenMilestoneModal(emp.employee_id)}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold text-emerald-800 bg-white hover:bg-emerald-50 border border-emerald-300 shadow-2xs transition"
                                  title={`Log review session checkpoints for ${emp.employee_name}`}
                                >
                                  <Edit3 className="h-3 w-3 text-emerald-700" />
                                  <span>Review Session Entry</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* 1. Historical Month Rows (e.g. Sep-26, Oct-26) */}
                        {historyRows.map((hm: EmployeeMonthlyPerformance, hIdx: number) => (
                          <tr key={`hist-${hIdx}`} className="bg-slate-50/50 hover:bg-slate-100/60 transition">
                            <td className="py-2.5 px-3 font-bold text-slate-700 sticky left-0 bg-slate-50 border-r border-slate-200 z-10">
                              {hm.month}
                            </td>
                            <td className="py-2.5 px-2 text-right font-medium text-slate-600">৳{formatMoney(hm.target_sales)}</td>
                            <td className="py-2.5 px-2 text-right font-bold text-emerald-700">৳{formatMoney(hm.actual_new_sales)}</td>
                            <td className="py-2.5 px-2 text-right font-bold text-sky-700">৳{formatMoney(hm.actual_emi)}</td>
                            <td className="py-2.5 px-2 text-right font-bold text-slate-800">{hm.total_lead}</td>
                            <td className="py-2.5 px-2 text-right font-medium text-slate-600">{hm.fair_lead}</td>
                            <td className="py-2.5 px-2 text-right font-medium text-slate-600">{hm.fb_lead}</td>
                            <td className="py-2.5 px-2 text-right text-rose-700 font-bold">{hm.hp}</td>
                            <td className="py-2.5 px-2 text-right text-amber-700 font-bold">{hm.p}</td>
                            <td className="py-2.5 px-2 text-right text-sky-700 font-bold">{hm.fup}</td>
                            <td className="py-2.5 px-1.5 text-center font-bold text-slate-800 bg-slate-50/80 border-l border-slate-200">{hm.total_calls || 0}</td>
                            <td className="py-2.5 px-1.5 text-center text-emerald-700 bg-emerald-50/20 font-bold">{hm.prediction_sold_fair}</td>
                            <td className="py-2.5 px-1.5 text-center text-sky-700 bg-sky-50/20 font-bold">{hm.prediction_sold_fb}</td>
                            <td className="py-2.5 px-1.5 text-center text-purple-700 bg-purple-50/20 font-bold border-r border-slate-200">{hm.prediction_sold_other}</td>
                            <td className="py-2.5 px-1.5 text-center font-bold text-slate-700">{hm.gl || "GL"}</td>
                            <td className="py-2.5 px-1.5 text-center text-amber-700 bg-amber-50/20 font-bold">{hm.prediction_hold}</td>
                            <td className="py-2.5 px-1.5 text-center text-rose-700 bg-rose-50/20 font-bold">{hm.prediction_cancel}</td>
                            <td className="py-2.5 px-2.5 text-center bg-slate-50/60 font-semibold border-l border-slate-200">
                              <span className="font-bold text-slate-900">{hm.hp + hm.p}</span>
                              <span className="text-slate-400 mx-1">/</span>
                              <span className="font-bold text-emerald-700">৳{formatMoney(hm.total_collection)}</span>
                            </td>
                          </tr>
                        ))}

                        {/* 2. Active Month Summary Row (e.g. Nov-26) */}
                        <tr className="bg-emerald-50/30 hover:bg-emerald-50/50 font-medium transition border-y border-emerald-200/50">
                          <td className="py-2.5 px-3 font-extrabold text-emerald-900 sticky left-0 bg-emerald-50 border-r border-slate-200 z-10">
                            {emp.month}
                          </td>
                          <td className="py-2.5 px-2 text-right font-semibold text-slate-900">৳{formatMoney(emp.target_sales || emp.target_collection)}</td>
                          <td className="py-2.5 px-2 text-right font-extrabold text-emerald-700">৳{formatMoney(emp.actual_new_sales)}</td>
                          <td className="py-2.5 px-2 text-right font-extrabold text-sky-700">৳{formatMoney(emp.actual_emi)}</td>
                          <td className="py-2.5 px-2 text-right font-extrabold text-slate-900">{emp.total_lead}</td>
                          <td className="py-2.5 px-2 text-right font-semibold text-slate-700">{emp.fair_lead}</td>
                          <td className="py-2.5 px-2 text-right font-semibold text-slate-700">{emp.fb_lead}</td>
                          <td className="py-2.5 px-2 text-right text-rose-700 font-extrabold">{emp.hp}</td>
                          <td className="py-2.5 px-2 text-right text-amber-700 font-extrabold">{emp.p}</td>
                          <td className="py-2.5 px-2 text-right text-sky-700 font-extrabold">{emp.fup}</td>
                          <td className="py-2.5 px-1.5 text-center font-extrabold text-slate-900 bg-slate-100/80 border-l border-slate-200">{emp.total_calls || 0}</td>
                          <td className="py-2.5 px-1.5 text-center text-emerald-700 bg-emerald-50/30 font-bold">{emp.prediction_sold_fair}</td>
                          <td className="py-2.5 px-1.5 text-center text-sky-700 bg-sky-50/30 font-bold">{emp.prediction_sold_fb}</td>
                          <td className="py-2.5 px-1.5 text-center text-purple-700 bg-purple-50/30 font-bold border-r border-slate-200">{emp.prediction_sold_other}</td>
                          <td className="py-2.5 px-1.5 text-center font-extrabold text-slate-800">{emp.gl || "GL"}</td>
                          <td className="py-2.5 px-1.5 text-center text-amber-700 bg-amber-50/30 font-bold">{emp.prediction_hold}</td>
                          <td className="py-2.5 px-1.5 text-center text-rose-700 bg-rose-50/30 font-bold">{emp.prediction_cancel}</td>
                          <td className="py-2.5 px-2.5 text-center bg-emerald-100/40 font-bold border-l border-slate-200">
                            <span className="font-extrabold text-slate-900">{emp.hp + emp.p}</span>
                            <span className="text-slate-400 mx-1">/</span>
                            <span className="font-extrabold text-emerald-800">৳{formatMoney(emp.total_collection)}</span>
                          </td>
                        </tr>

                        {/* 3. The 6 Milestone Rows: Till 5th, Till 10th, ..., Till 30/31th */}
                        {intervalRows.map((inv: PerformanceIntervalSummary, iIdx: number) => (
                          <tr key={`inv-${iIdx}`} className={`hover:bg-slate-50 transition ${inv.is_manual ? "bg-amber-50/20" : "bg-white"}`}>
                            <td className="py-2 px-3 font-semibold text-slate-800 sticky left-0 bg-white border-r border-slate-200 z-10">
                              <div className="flex items-center justify-between gap-1">
                                <span>{inv.label}</span>
                                {inv.is_manual && (
                                  <span className="text-[8px] font-extrabold text-amber-800 bg-amber-100 px-1 py-0.2 rounded border border-amber-300">
                                    Verified
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-2 text-right text-slate-400">-</td>
                            <td className="py-2 px-2 text-right font-bold text-emerald-700">৳{formatMoney(inv.new_sales)}</td>
                            <td className="py-2 px-2 text-right font-bold text-sky-700">৳{formatMoney(inv.emi)}</td>
                            <td className="py-2 px-2 text-right font-bold text-slate-900">{inv.total_lead}</td>
                            <td className="py-2 px-2 text-right text-slate-600">{inv.fair_lead}</td>
                            <td className="py-2 px-2 text-right text-slate-600">{inv.fb_lead}</td>
                            <td className="py-2 px-2 text-right text-rose-700 font-bold">{inv.hp}</td>
                            <td className="py-2 px-2 text-right text-amber-700 font-bold">{inv.p}</td>
                            <td className="py-2 px-2 text-right text-sky-700 font-bold">{inv.fup}</td>
                            <td className="py-2 px-1.5 text-center font-bold text-slate-800 bg-slate-50/70 border-l border-slate-200">{inv.total_calls || 0}</td>
                            <td className="py-2 px-1.5 text-center text-emerald-700 bg-emerald-50/20">{inv.sold_fair || 0}</td>
                            <td className="py-2 px-1.5 text-center text-sky-700 bg-sky-50/20">{inv.sold_fb || 0}</td>
                            <td className="py-2 px-1.5 text-center text-purple-700 bg-purple-50/20 border-r border-slate-200">{inv.sold_other || 0}</td>
                            <td className="py-2 px-1.5 text-center text-slate-600">{inv.gl || emp.gl || "GL"}</td>
                            <td className="py-2 px-1.5 text-center text-amber-700 bg-amber-50/20">{inv.hold || 0}</td>
                            <td className="py-2 px-1.5 text-center text-rose-700 bg-rose-50/20">{inv.cancel || 0}</td>
                            <td className="py-2 px-2.5 text-center bg-slate-50/50 font-semibold border-l border-slate-200">
                              <span className="font-bold text-slate-900">{inv.hp + inv.p}</span>
                              <span className="text-slate-400 mx-1">/</span>
                              <span className="font-bold text-emerald-700">৳{formatMoney(inv.total_collection)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    );
                  })
                )}
              </table>

              {/* Floating Bottom Scroll Pill Helper */}
              <div className="sticky bottom-3 z-30 flex justify-center pointer-events-none mt-2 pb-2">
                <div className="pointer-events-auto inline-flex items-center gap-2 bg-slate-900/90 text-white backdrop-blur px-3 py-1.5 rounded-full shadow-lg border border-slate-700 text-xs">
                  <button
                    type="button"
                    onClick={() => scrollTable1(-300)}
                    disabled={!table1Scroll.canLeft}
                    className="p-1 hover:bg-slate-800 rounded disabled:opacity-30 transition"
                    title="Slide left"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => jumpTable1(false)}
                    className="text-[11px] font-medium text-slate-300 hover:text-white px-1.5 transition"
                  >
                    Start
                  </button>
                  <span className="text-slate-600">•</span>
                  <span className="text-[11px] text-slate-300 hidden sm:inline">Slide columns horizontally</span>
                  <span className="text-slate-600">•</span>
                  <button
                    type="button"
                    onClick={() => jumpTable1(true)}
                    className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 px-1.5 transition"
                  >
                    View End (GL & Coll) →
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollTable1(300)}
                    disabled={!table1Scroll.canRight}
                    className="p-1 hover:bg-slate-800 rounded disabled:opacity-30 transition"
                    title="Slide right"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
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
                          <div className="text-xs text-slate-500 font-medium mt-0.5">
                            {emp.position || "Staff"} • GL: <span className="font-semibold text-slate-700">{emp.gl || "GL"}</span> • {emp.month}
                          </div>
                          <div className="text-[11px] text-slate-600 font-medium mt-0.5">
                            Calls: <span className="font-bold text-slate-900">{emp.total_calls || 0}</span> • Lead (HP+P)/Coll: <span className="font-bold text-emerald-800">{emp.hp + emp.p} / ৳{formatMoney(emp.total_collection)}</span>
                          </div>
                          {canAccess && (
                            <button
                              onClick={() => handleOpenMilestoneModal(emp.employee_id)}
                              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 transition"
                            >
                              <Edit3 className="h-3 w-3" />
                              <span>Review Session</span>
                            </button>
                          )}
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
                          <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-800 border border-purple-200 font-semibold">
                            Other: {emp.prediction_sold_other}
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
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-slate-800">{inv.label}</span>
                                    {inv.is_manual && (
                                      <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                        Session Data
                                      </span>
                                    )}
                                  </div>
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
            {displayMilestones.length > 0 && (
              <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/30">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 mb-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-emerald-700" />
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                        Progress Summaries & Cumulative Milestones (Till 5th, 10th, 15th, 20th, 25th, 30th)
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        {report.company_intervals?.some((i) => i.is_manual)
                          ? "Company milestone review session data approved by management"
                          : "Calculated from daily activity reports (Admin can conduct review sessions & enter checkpoints)"}
                      </p>
                    </div>
                  </div>

                  {canAccess && (
                    <button
                      onClick={() => handleOpenMilestoneModal()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-xs font-bold text-emerald-800 shadow-2xs transition self-start sm:self-auto"
                      title="Conduct admin review session and enter/adjust milestone checkpoints"
                    >
                      <Edit3 className="h-3.5 w-3.5 text-emerald-700" />
                      <span>Milestone Review Session</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
                  {displayMilestones.map((inv: PerformanceIntervalSummary, idx: number) => (
                    <div
                      key={idx}
                      className={`rounded-xl border p-3 shadow-2xs transition ${
                        inv.is_manual
                          ? "border-amber-200 bg-amber-50/30 hover:border-amber-300"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-bold text-slate-800 pb-1.5 border-b border-slate-100">
                        <div className="flex items-center gap-1">
                          <span>{inv.label}</span>
                          {inv.is_manual && (
                            <span
                              title={inv.admin_notes || "Verified during admin review session"}
                              className="px-1 py-0.5 rounded text-[9px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300 uppercase tracking-tight"
                            >
                              Session
                            </span>
                          )}
                        </div>
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
                        {inv.admin_notes && (
                          <div className="text-[10px] text-slate-500 italic truncate pt-0.5" title={inv.admin_notes}>
                            &ldquo;{inv.admin_notes}&rdquo;
                          </div>
                        )}
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

            {/* View Mode & Horizontal Scroll Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <ArrowLeftRight className="h-3.5 w-3.5 text-sky-700" />
                  Horizontal Scroll:
                </span>
                <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white shadow-2xs overflow-hidden">
                  <button
                    type="button"
                    onClick={() => scrollTable2(-300)}
                    disabled={!table2Scroll.canLeft}
                    className="p-1.5 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-white text-slate-700 transition"
                    title="Slide columns left"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => jumpTable2(false)}
                    className="px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 border-x border-slate-200 transition"
                    title="Jump to Start (Customer ID & Name)"
                  >
                    Start (Customer)
                  </button>
                  <button
                    type="button"
                    onClick={() => jumpTable2(true)}
                    className="px-2 py-1 text-[11px] font-bold text-sky-700 hover:bg-sky-50 border-r border-slate-200 transition"
                    title="Jump to End (Total Collection & Remarks)"
                  >
                    End (Coll & Remarks) →
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollTable2(300)}
                    disabled={!table2Scroll.canRight}
                    className="p-1.5 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-white text-slate-700 transition"
                    title="Slide columns right"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-slate-500 hidden md:inline text-[11px]">View Height:</span>
                <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs text-[11px]">
                  <button
                    type="button"
                    onClick={() => setSection2HeightMode("compact")}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition ${
                      section2HeightMode === "compact"
                        ? "bg-sky-700 text-white shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                    title="Comfortable scroll window with pinned visible horizontal scrollbar"
                  >
                    <Minimize2 className="h-3 w-3" />
                    <span>Scroll Window</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSection2HeightMode("full")}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition ${
                      section2HeightMode === "full"
                        ? "bg-sky-700 text-white shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                    title="Full length view without vertical height limitation"
                  >
                    <Maximize2 className="h-3 w-3" />
                    <span>Full Height</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Synchronized Top Horizontal Scrollbar */}
            <div
              ref={section2TopScrollRef}
              onScroll={handleTopScroll2}
              className="overflow-x-auto bg-slate-100/70 border-b border-slate-200 custom-table-scrollbar"
              title="Drag this horizontal scrollbar to slide table columns left or right"
            >
              <div style={{ width: 1400, height: 8 }} />
            </div>

            {/* Desktop Table */}
            <div
              ref={section2TableRef}
              onScroll={handleTable2Scroll}
              className={`${mobileViewMode === "cards" ? "hidden sm:block" : "block"} overflow-x-auto custom-table-scrollbar ${
                section2HeightMode === "compact" ? "max-h-[72vh] overflow-y-auto" : ""
              } relative`}
            >
              <table className="w-full text-left text-xs border-collapse min-w-[1300px]">
                <thead className="sticky top-0 z-20 shadow-xs">
                  <tr className="border-b border-slate-200 bg-slate-100 text-[11px] uppercase tracking-wider text-slate-700">
                    <th className="py-3 px-3 font-bold sticky left-0 bg-slate-100 z-30 border-r border-slate-200">
                      Customer ID & Name
                    </th>
                    <th className="py-3 px-2.5 font-bold text-right text-emerald-700 whitespace-nowrap min-w-[75px]">Paid</th>
                    <th className="py-3 px-2.5 font-bold text-right text-rose-700 whitespace-nowrap min-w-[75px]">Unpaid</th>
                    <th className="py-3 px-2.5 font-bold whitespace-nowrap min-w-[95px]">Collection Date</th>
                    <th className="py-3 px-2.5 font-bold whitespace-nowrap min-w-[85px]">IN/OUT Plan</th>
                    <th className="py-3 px-2.5 font-bold whitespace-nowrap min-w-[85px]">Date-1</th>
                    <th className="py-3 px-2.5 font-bold whitespace-nowrap min-w-[85px]">Date-2</th>
                    <th className="py-3 px-2.5 font-bold text-right text-emerald-700 whitespace-nowrap min-w-[75px]">New Sales</th>
                    <th className="py-3 px-2.5 font-bold text-right text-sky-700 whitespace-nowrap min-w-[70px]">TB</th>
                    <th className="py-3 px-2.5 font-bold text-right text-sky-700 whitespace-nowrap min-w-[70px]">EMI</th>
                    <th className="py-3 px-2.5 font-bold text-amber-700 whitespace-nowrap min-w-[110px]">Next Collec Date</th>
                    <th className="py-3 px-2.5 font-bold text-amber-700 whitespace-nowrap min-w-[110px]">Next Collec Date 2</th>
                    <th className="py-3 px-2.5 font-bold whitespace-nowrap min-w-[80px]">Lead Status</th>
                    <th className="py-3 px-2.5 font-bold whitespace-nowrap min-w-[90px]">Lead Source</th>
                    <th className="py-3 px-2.5 font-bold whitespace-nowrap min-w-[100px]">Lead Source Date</th>
                    <th className="py-3 px-2.5 font-bold text-right text-emerald-800 whitespace-nowrap min-w-[95px]">Total Collection</th>
                    <th className="py-3 px-3 font-bold whitespace-nowrap min-w-[120px]">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={17} className="py-10 text-center text-slate-400 font-medium">
                        No customer collection records found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredCustomers.map((cust: CustomerCollectionItem) => (
                      <tr key={cust.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3 sticky left-0 bg-white hover:bg-slate-50/80 z-10 border-r border-slate-100">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => handleOpenCustomerDetail(cust)}
                              className="inline-flex items-center gap-1 font-mono text-[10px] font-extrabold text-sky-800 bg-sky-50 hover:bg-sky-100 px-1.5 py-0.5 rounded border border-sky-200 transition"
                              title="Click to view complete customer profile & ledger"
                            >
                              <span>{cust.customer_code || `CX-${1000 + cust.id}`}</span>
                              <ExternalLink className="h-2.5 w-2.5 text-sky-600" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenCustomerDetail(cust)}
                              className="font-bold text-slate-900 hover:text-emerald-700 transition text-left"
                              title="Click to view complete customer profile & ledger"
                            >
                              {cust.customer_name}
                            </button>
                          </div>
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
                          {cust.next_collection_date_2 ? (
                            <span className="inline-flex items-center gap-1 font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 text-[11px]">
                              <Calendar className="h-3 w-3 text-amber-700" />
                              {cust.next_collection_date_2}
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
                        <td className="py-3 px-2.5 whitespace-nowrap font-medium text-slate-700 text-[11px]">
                          {cust.lead_source || "-"}
                        </td>
                        <td className="py-3 px-2.5 whitespace-nowrap text-slate-500 text-[11px]">
                          {cust.lead_source_date || "-"}
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

              {/* Floating Bottom Scroll Pill Helper */}
              <div className="sticky bottom-3 z-30 flex justify-center pointer-events-none mt-2 pb-2">
                <div className="pointer-events-auto inline-flex items-center gap-2 bg-slate-900/90 text-white backdrop-blur px-3 py-1.5 rounded-full shadow-lg border border-slate-700 text-xs">
                  <button
                    type="button"
                    onClick={() => scrollTable2(-300)}
                    disabled={!table2Scroll.canLeft}
                    className="p-1 hover:bg-slate-800 rounded disabled:opacity-30 transition"
                    title="Slide left"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => jumpTable2(false)}
                    className="text-[11px] font-medium text-slate-300 hover:text-white px-1.5 transition"
                  >
                    Start
                  </button>
                  <span className="text-slate-600">•</span>
                  <span className="text-[11px] text-slate-300 hidden sm:inline">Slide customer columns</span>
                  <span className="text-slate-600">•</span>
                  <button
                    type="button"
                    onClick={() => jumpTable2(true)}
                    className="text-[11px] font-bold text-sky-400 hover:text-sky-300 px-1.5 transition"
                  >
                    View End (Coll & Remarks) →
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollTable2(300)}
                    disabled={!table2Scroll.canRight}
                    className="p-1 hover:bg-slate-800 rounded disabled:opacity-30 transition"
                    title="Slide right"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
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
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleOpenCustomerDetail(cust)}
                            className="font-mono text-[10px] font-extrabold text-sky-800 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200"
                          >
                            {cust.customer_code || `CX-${1000 + cust.id}`}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenCustomerDetail(cust)}
                            className="font-bold text-slate-900 text-sm hover:text-emerald-700 text-left"
                          >
                            {cust.customer_name}
                          </button>
                        </div>
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

                      {cust.next_collection_date_2 && (
                        <div className="flex items-center justify-between bg-amber-50/70 p-2 rounded-lg border border-amber-200 text-amber-900 font-semibold text-[11px]">
                          <span className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-amber-700" />
                            <span>Next Collection Date 2:</span>
                          </span>
                          <span>{cust.next_collection_date_2}</span>
                        </div>
                      )}

                      {(cust.lead_source || cust.lead_source_date) && (
                        <div className="flex items-center justify-between text-slate-500 text-[11px]">
                          <span>Lead Source:</span>
                          <span className="font-medium text-slate-700">
                            {cust.lead_source || "Direct"} {cust.lead_source_date ? `(${cust.lead_source_date})` : ""}
                          </span>
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

        {/* ============================================================ */}
        {/* MILESTONE REVIEW SESSION MODAL (Company-Wide & Per-Employee) */}
        {/* ============================================================ */}
        {isMilestoneModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
            <div className="relative w-full max-w-5xl rounded-2xl bg-white shadow-2xl border border-slate-200 my-8 overflow-hidden flex flex-col max-h-[90vh]">
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-slate-50/70 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 shrink-0">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Milestone Review Session ({selectedMonth})
                    </h3>
                    <p className="text-xs text-slate-500">
                      Manual review data entry for checkpoints: Till 5th, 10th, 15th, 20th, 25th, 30th
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsMilestoneModalOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                  title="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Scope & Fast Actions Toolbar */}
              <div className="p-4 border-b border-slate-100 bg-white shrink-0 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  {/* Scope Selector */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-slate-700 mr-1">Session Scope:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setModalScope("company");
                        loadMilestoneCheckpointsForModal("company", modalEmployeeId);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition border ${
                        modalScope === "company"
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      Company-Wide Total
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setModalScope("employee");
                        const defaultEmp =
                          modalEmployeeId ||
                          (report?.monthly_performances?.[0]?.employee_id
                            ? String(report.monthly_performances[0].employee_id)
                            : "");
                        setModalEmployeeId(defaultEmp);
                        loadMilestoneCheckpointsForModal("employee", defaultEmp);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition border ${
                        modalScope === "employee"
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      Per-Employee Entry
                    </button>

                    {modalScope === "employee" && (
                      <select
                        value={modalEmployeeId}
                        onChange={(e) => {
                          const newEmpId = e.target.value;
                          setModalEmployeeId(newEmpId);
                          loadMilestoneCheckpointsForModal("employee", newEmpId);
                        }}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                      >
                        {report?.monthly_performances?.map((emp) => (
                          <option key={emp.employee_id} value={emp.employee_id}>
                            {emp.employee_name} ({emp.position || "Staff"})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Quick Auto-fill & Reset Buttons */}
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => autoFillFromSystem(modalScope, modalEmployeeId)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-sky-200 bg-sky-50 hover:bg-sky-100 text-xs font-bold text-sky-800 transition"
                      title="Prefill inputs from current system report calculations"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Auto-fill from System</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleResetMilestones}
                      disabled={modalSaving}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:text-rose-700 text-xs font-semibold text-slate-600 transition"
                      title="Delete manual session records to revert to automated calculations"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Revert to Auto</span>
                    </button>
                  </div>
                </div>

                {/* Feedback message banner */}
                {modalMessage && (
                  <div
                    className={`rounded-lg p-2.5 text-xs font-semibold flex items-center gap-2 ${
                      modalMessage.type === "success"
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        : "bg-rose-50 text-rose-800 border border-rose-200"
                    }`}
                  >
                    {modalMessage.type === "success" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                    )}
                    <span>{modalMessage.text}</span>
                  </div>
                )}
              </div>

              {/* Modal Body: 6 Checkpoint Cards */}
              <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
                {modalLoading ? (
                  <div className="flex h-64 items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {checkpointRows.map((cp, idx) => (
                      <div
                        key={cp.checkpoint_day}
                        className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 shadow-2xs space-y-3"
                      >
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                          <span className="font-extrabold text-sm text-slate-900">
                            {cp.label || `Till ${cp.checkpoint_day}th`}
                          </span>
                          <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                            Days 1 - {cp.checkpoint_day}
                          </span>
                        </div>

                        {/* Financials: Sales, EMI, Total */}
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                              Sales (৳)
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={cp.new_sales}
                              onChange={(e) => updateCheckpointField(idx, "new_sales", Number(e.target.value) || 0)}
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-emerald-700 focus:border-emerald-600 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                              EMI (৳)
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={cp.emi}
                              onChange={(e) => updateCheckpointField(idx, "emi", Number(e.target.value) || 0)}
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-sky-700 focus:border-emerald-600 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                              Total (৳)
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={cp.total_collection || 0}
                              onChange={(e) => updateCheckpointField(idx, "total_collection", Number(e.target.value) || 0)}
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-extrabold text-slate-900 focus:border-emerald-600 focus:outline-none"
                            />
                          </div>
                        </div>

                        {/* Leads: Total, Fair, FB */}
                        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-200">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-1">
                              Total Leads
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={cp.total_lead || 0}
                              onChange={(e) => updateCheckpointField(idx, "total_lead", Number(e.target.value) || 0)}
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-1">
                              Fair Lead
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={cp.fair_lead || 0}
                              onChange={(e) => updateCheckpointField(idx, "fair_lead", Number(e.target.value) || 0)}
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-1">
                              FB Lead
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={cp.fb_lead || 0}
                              onChange={(e) => updateCheckpointField(idx, "fb_lead", Number(e.target.value) || 0)}
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-none"
                            />
                          </div>
                        </div>

                        {/* Status Leads: HP, P, FUP, Visits */}
                        <div className="grid grid-cols-4 gap-1.5 pt-1 border-t border-slate-200">
                          <div>
                            <label className="block text-[9px] font-bold text-rose-700 mb-1">
                              HP
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={cp.hp || 0}
                              onChange={(e) => updateCheckpointField(idx, "hp", Number(e.target.value) || 0)}
                              className="w-full rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs font-bold text-rose-700 focus:border-emerald-600 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold text-amber-700 mb-1">
                              P
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={cp.p || 0}
                              onChange={(e) => updateCheckpointField(idx, "p", Number(e.target.value) || 0)}
                              className="w-full rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs font-bold text-amber-700 focus:border-emerald-600 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold text-sky-700 mb-1">
                              FUP
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={cp.fup || 0}
                              onChange={(e) => updateCheckpointField(idx, "fup", Number(e.target.value) || 0)}
                              className="w-full rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs font-bold text-sky-700 focus:border-emerald-600 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold text-slate-700 mb-1">
                              Visits
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={(cp.outdoor_visits || 0) + (cp.indoor_cx || 0)}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 0;
                                updateCheckpointField(idx, "outdoor_visits", val);
                                updateCheckpointField(idx, "indoor_cx", 0);
                              }}
                              className="w-full rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs font-bold text-slate-800 focus:border-emerald-600 focus:outline-none"
                            />
                          </div>
                        </div>

                        {/* Predictions from Emp, Total Calls, GL, Hold, Cancel */}
                        <div className="pt-2 border-t border-slate-200 space-y-2">
                          <div className="text-[10px] font-bold text-slate-600 uppercase">
                            Predictions & Employee Activity
                          </div>
                          <div className="grid grid-cols-4 gap-1.5">
                            <div>
                              <label className="block text-[9px] font-bold text-slate-700 mb-0.5">Calls</label>
                              <input
                                type="number"
                                min="0"
                                value={cp.total_calls || 0}
                                onChange={(e) => updateCheckpointField(idx, "total_calls", Number(e.target.value) || 0)}
                                className="w-full rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-emerald-700 mb-0.5">Fair Sold</label>
                              <input
                                type="number"
                                min="0"
                                value={cp.sold_fair || 0}
                                onChange={(e) => updateCheckpointField(idx, "sold_fair", Number(e.target.value) || 0)}
                                className="w-full rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs font-bold text-emerald-700 focus:border-emerald-600 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-sky-700 mb-0.5">FB Sold</label>
                              <input
                                type="number"
                                min="0"
                                value={cp.sold_fb || 0}
                                onChange={(e) => updateCheckpointField(idx, "sold_fb", Number(e.target.value) || 0)}
                                className="w-full rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs font-bold text-sky-700 focus:border-emerald-600 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-purple-700 mb-0.5">Other Sold</label>
                              <input
                                type="number"
                                min="0"
                                value={cp.sold_other || 0}
                                onChange={(e) => updateCheckpointField(idx, "sold_other", Number(e.target.value) || 0)}
                                className="w-full rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs font-bold text-purple-700 focus:border-emerald-600 focus:outline-none"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5">
                            <div>
                              <label className="block text-[9px] font-bold text-slate-700 mb-0.5">GL</label>
                              <input
                                type="text"
                                value={cp.gl || ""}
                                placeholder="GL"
                                onChange={(e) => updateCheckpointField(idx, "gl", e.target.value)}
                                className="w-full rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-amber-700 mb-0.5">Hold</label>
                              <input
                                type="number"
                                min="0"
                                value={cp.hold || 0}
                                onChange={(e) => updateCheckpointField(idx, "hold", Number(e.target.value) || 0)}
                                className="w-full rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs font-bold text-amber-700 focus:border-emerald-600 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-rose-700 mb-0.5">Cancel</label>
                              <input
                                type="number"
                                min="0"
                                value={cp.cancel || 0}
                                onChange={(e) => updateCheckpointField(idx, "cancel", Number(e.target.value) || 0)}
                                className="w-full rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs font-bold text-rose-700 focus:border-emerald-600 focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Admin Session Remarks */}
                        <div className="pt-1 border-t border-slate-200">
                          <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                            Session Remarks / Notes
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Reviewed in meeting; fair lead on target"
                            value={cp.admin_notes || ""}
                            onChange={(e) => updateCheckpointField(idx, "admin_notes", e.target.value)}
                            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-between p-4 border-t border-slate-100 bg-slate-50/70 shrink-0">
                <div className="text-xs text-slate-500">
                  Target Scope:{" "}
                  <span className="font-bold text-slate-800">
                    {modalScope === "company"
                      ? "All Executives (Company-Wide Total)"
                      : `Employee ID #${modalEmployeeId}`}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsMilestoneModalOpen(false)}
                    className="px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 shadow-2xs transition"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveMilestones}
                    disabled={modalSaving || modalLoading}
                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white shadow-2xs transition disabled:opacity-50"
                  >
                    {modalSaving ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    <span>Save Session Checkpoints</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* CUSTOMER DETAILS & LIFETIME TRANSACTION LEDGER MODAL */}
        {/* ============================================================ */}
        {isCustomerModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
            <div className="relative w-full max-w-4xl rounded-2xl bg-white shadow-2xl border border-slate-200 my-8 overflow-hidden flex flex-col max-h-[90vh]">
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-slate-50/80 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-800 shrink-0">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-extrabold text-sky-800 bg-sky-100/80 px-2 py-0.5 rounded border border-sky-300">
                        {selectedCustomerDetail?.customer_code || "Customer Profile"}
                      </span>
                      <h3 className="text-base font-bold text-slate-900">
                        {selectedCustomerDetail?.customer_name || "Customer Detail"}
                      </h3>
                      {selectedCustomerDetail?.lead_status && (
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getStatusBadge(
                            selectedCustomerDetail.lead_status
                          )}`}
                        >
                          {selectedCustomerDetail.lead_status}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                      {selectedCustomerDetail?.customer_phone && (
                        <a
                          href={`tel:${selectedCustomerDetail.customer_phone}`}
                          className="inline-flex items-center gap-1 text-emerald-700 font-semibold hover:underline"
                        >
                          <Phone className="h-3 w-3" />
                          <span>{selectedCustomerDetail.customer_phone}</span>
                        </a>
                      )}
                      {selectedCustomerDetail?.lead_source && (
                        <span>
                          Source: <span className="font-medium text-slate-700">{selectedCustomerDetail.lead_source}</span>
                          {selectedCustomerDetail.lead_source_date ? ` (${selectedCustomerDetail.lead_source_date})` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setIsCustomerModalOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                  title="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
                {customerModalLoading ? (
                  <div className="flex h-64 items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
                  </div>
                ) : !selectedCustomerDetail ? (
                  <div className="py-12 text-center text-xs text-slate-400 font-medium">
                    Customer information not available.
                  </div>
                ) : (
                  <>
                    {/* Financial KPI Summary Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-200">
                        <div className="text-[10px] font-bold text-emerald-800 uppercase">Paid Amount</div>
                        <div className="text-lg font-black text-emerald-700 mt-0.5">
                          ৳{formatMoney(selectedCustomerDetail.total_paid)}
                        </div>
                        <div className="text-[10px] text-emerald-800/80 mt-0.5">Physically Received</div>
                      </div>

                      <div className="bg-rose-50 rounded-xl p-3 border border-rose-200">
                        <div className="text-[10px] font-bold text-rose-800 uppercase">Unpaid Amount</div>
                        <div className="text-lg font-black text-rose-700 mt-0.5">
                          ৳{formatMoney(selectedCustomerDetail.total_unpaid)}
                        </div>
                        <div className="text-[10px] text-rose-800/80 mt-0.5">Committed Balance</div>
                      </div>

                      <div className="bg-sky-50 rounded-xl p-3 border border-sky-200">
                        <div className="text-[10px] font-bold text-sky-800 uppercase">Total Collection</div>
                        <div className="text-lg font-black text-sky-900 mt-0.5">
                          ৳{formatMoney(selectedCustomerDetail.total_collection)}
                        </div>
                        <div className="text-[10px] text-sky-800/80 mt-0.5">Paid + Unpaid</div>
                      </div>

                      <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                        <div className="text-[10px] font-bold text-slate-600 uppercase">Breakdown</div>
                        <div className="text-xs font-semibold text-slate-800 mt-1 space-y-0.5">
                          <div>Sales: <span className="font-bold text-emerald-700">৳{formatMoney(selectedCustomerDetail.new_sales_amount)}</span></div>
                          <div>EMI: <span className="font-bold text-sky-700">৳{formatMoney(selectedCustomerDetail.emi_amount)}</span></div>
                          <div>TB: <span className="font-bold text-slate-700">৳{formatMoney(selectedCustomerDetail.tb_amount)}</span></div>
                        </div>
                      </div>
                    </div>

                    {/* Next Collection Dates & Handling Executives */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-amber-50/60 border border-amber-200 text-xs text-amber-900">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Calendar className="h-4 w-4 text-amber-700 shrink-0" />
                        <span className="font-bold">Next Collection Date:</span>
                        {selectedCustomerDetail.next_collection_date ? (
                          <span className="font-extrabold text-amber-900 bg-white px-2 py-0.5 rounded border border-amber-300">
                            {selectedCustomerDetail.next_collection_date}
                          </span>
                        ) : (
                          <span className="text-slate-500 font-medium">Not scheduled</span>
                        )}
                        {selectedCustomerDetail.next_collection_date_2 && (
                          <>
                            <span className="font-bold ml-2">Next Date 2:</span>
                            <span className="font-extrabold text-amber-900 bg-white px-2 py-0.5 rounded border border-amber-300">
                              {selectedCustomerDetail.next_collection_date_2}
                            </span>
                          </>
                        )}
                      </div>

                      {selectedCustomerDetail.assigned_employees?.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap text-slate-600">
                          <UserCheck className="h-3.5 w-3.5 text-slate-500" />
                          <span className="font-semibold text-slate-700">Assigned:</span>
                          <span className="font-bold text-slate-900">
                            {selectedCustomerDetail.assigned_employees.join(", ")}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Transaction / Activity History Table */}
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center justify-between">
                        <span>Transaction & Activity Records</span>
                        <span className="text-[11px] text-slate-500 font-medium">
                          Total {selectedCustomerDetail.transactions?.length || 0} Records
                        </span>
                      </h4>

                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-600 border-b border-slate-200">
                            <tr>
                              <th className="py-2.5 px-3">Date</th>
                              <th className="py-2.5 px-2">Category</th>
                              <th className="py-2.5 px-2 text-right text-emerald-800">Paid</th>
                              <th className="py-2.5 px-2 text-right text-rose-800">Unpaid</th>
                              <th className="py-2.5 px-2">Payment Mode</th>
                              <th className="py-2.5 px-2">Next Date</th>
                              <th className="py-2.5 px-2">Executive</th>
                              <th className="py-2.5 px-3">Remarks</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-700">
                            {(!selectedCustomerDetail.transactions ||
                              selectedCustomerDetail.transactions.length === 0) ? (
                              <tr>
                                <td colSpan={8} className="py-8 text-center text-slate-400">
                                  No transaction records found for this customer.
                                </td>
                              </tr>
                            ) : (
                              selectedCustomerDetail.transactions.map((tx) => (
                                <tr key={tx.id} className="hover:bg-slate-50 transition">
                                  <td className="py-2 px-3 font-semibold text-slate-900 whitespace-nowrap">
                                    {tx.report_date}
                                  </td>
                                  <td className="py-2 px-2 whitespace-nowrap">
                                    <span className="font-medium text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-[11px] border border-slate-200">
                                      {tx.category.replace(/_/g, " ")}
                                    </span>
                                  </td>
                                  <td className="py-2 px-2 text-right font-bold text-emerald-700 whitespace-nowrap">
                                    ৳{formatMoney(tx.paid_amount)}
                                  </td>
                                  <td className="py-2 px-2 text-right font-bold text-rose-700 whitespace-nowrap">
                                    ৳{formatMoney(tx.unpaid_amount)}
                                  </td>
                                  <td className="py-2 px-2 whitespace-nowrap text-slate-600">
                                    {tx.payment_method || "-"}
                                  </td>
                                  <td className="py-2 px-2 whitespace-nowrap text-amber-800 font-semibold text-[11px]">
                                    {tx.expected_payment_date || "-"}
                                  </td>
                                  <td className="py-2 px-2 whitespace-nowrap text-slate-700 font-medium">
                                    {tx.employee_name || "-"}
                                  </td>
                                  <td className="py-2 px-3 text-slate-500 text-[11px] max-w-[200px] truncate" title={tx.notes || ""}>
                                    {tx.notes || "-"}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end p-4 border-t border-slate-100 bg-slate-50/70 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsCustomerModalOpen(false)}
                  className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-bold text-white shadow-2xs transition"
                >
                  Close
                </button>
              </div>
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
