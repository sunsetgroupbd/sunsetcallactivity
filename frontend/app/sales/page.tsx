"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Banknote,
  Plus,
  Trash2,
  Edit2,
  Calendar,
  Lock,
  Receipt,
  History,
  AlertTriangle,
  Clock,
  ArrowRight,
  TrendingUp,
  Search,
  CheckCircle2,
  AlertCircle,
  Users,
  Phone,
  Bell,
  Percent,
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
  SALES_CATEGORIES,
  SalesCollectionCategory,
  SalesCollectionEntry,
  Report,
  CommitmentItem,
  CommitmentPipelineResponse,
} from "@/types";
import {
  getDhakaToday,
  formatReadableDate,
  formatBDT,
  formatEmployeeId,
} from "@/lib/utils";

function getPaymentMethodBadge(method?: string | null) {
  if (!method) return <span className="text-slate-400">—</span>;
  const m = method.toLowerCase();
  switch (m) {
    case "cash":
      return (
        <span className="inline-flex items-center font-semibold text-[11px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
          Cash
        </span>
      );
    case "cheque":
      return (
        <span className="inline-flex items-center font-semibold text-[11px] px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
          Cheque
        </span>
      );
    case "bkash":
      return (
        <span className="inline-flex items-center font-semibold text-[11px] px-2 py-0.5 rounded bg-pink-50 text-pink-800 border border-pink-200">
          bKash
        </span>
      );
    case "nagad":
      return (
        <span className="inline-flex items-center font-semibold text-[11px] px-2 py-0.5 rounded bg-orange-50 text-orange-800 border border-orange-200">
          Nagad
        </span>
      );
    case "rocket":
      return (
        <span className="inline-flex items-center font-semibold text-[11px] px-2 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200">
          Rocket
        </span>
      );
    case "bank_transfer":
      return (
        <span className="inline-flex items-center font-semibold text-[11px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200">
          Bank Transfer
        </span>
      );
    case "pos":
      return (
        <span className="inline-flex items-center font-semibold text-[11px] px-2 py-0.5 rounded bg-cyan-50 text-cyan-800 border border-cyan-200">
          POS / Card
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center font-semibold text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
          {method}
        </span>
      );
  }
}

export function renderCommitmentPercentageBadge(pct: number | null | undefined) {
  if (!pct || pct <= 0) return null;
  let colorClass = "bg-slate-100 text-slate-700 border-slate-300";
  if (pct >= 80) {
    colorClass = "bg-emerald-50 text-emerald-800 border-emerald-300";
  } else if (pct >= 50) {
    colorClass = "bg-amber-50 text-amber-850 border-amber-300";
  } else {
    colorClass = "bg-sky-50 text-sky-800 border-sky-300";
  }
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-extrabold px-1.5 py-0.5 rounded border font-mono ${colorClass}`}
      title={`Commitment certainty: ${pct}%`}
    >
      <span>{pct}%</span>
    </span>
  );
}

function SalesVsCollectionContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, isAdmin, isSubAdmin } = useAuth();
  const isSupervisor = isAdmin || isSubAdmin;

  const today = getDhakaToday();
  const initialDate = searchParams.get("date") || today;
  const initialTab = searchParams.get("tab") === "pipeline" ? "pipeline" : "daily";
  const initialSearch = searchParams.get("search") || "";
  const initialEditId = searchParams.get("edit_id");
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

  // Tab: Daily Transactions vs Future Commitments Pipeline
  const [activeTab, setActiveTab] = useState<"daily" | "pipeline">(initialTab);

  const handleSelectEmployee = useCallback((empId: number) => {
    setSelectedEmpId(empId);
    const tabQuery = activeTab === "pipeline" ? "&tab=pipeline" : "";
    router.replace(`/sales?date=${reportDate}&employee_id=${empId}${tabQuery}`);
  }, [reportDate, activeTab, router]);

  // Report & entries state
  const [report, setReport] = useState<Report | null>(null);
  const [entries, setEntries] = useState<SalesCollectionEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Future Commitments Pipeline State
  const [pipelineData, setPipelineData] = useState<CommitmentPipelineResponse | null>(null);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const initialFilter = (searchParams.get("filter") as "all" | "due_today" | "upcoming" | "overdue" | "rescheduled") || "all";
  const [pipelineFilter, setPipelineFilter] = useState<"all" | "due_today" | "upcoming" | "overdue" | "rescheduled">(initialFilter);
  const [pipelineSearch, setPipelineSearch] = useState(initialSearch);
  const [autoOpenedEditId, setAutoOpenedEditId] = useState<string | null>(initialEditId);

  // Add/Edit modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<SalesCollectionEntry | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // Audit history modal state
  const [selectedHistoryEntry, setSelectedHistoryEntry] = useState<SalesCollectionEntry | CommitmentItem | null>(null);

  // Form fields
  const [formCategory, setFormCategory] = useState<SalesCollectionCategory>("new_sales_collection");
  const [formAmount, setFormAmount] = useState<string>("");
  const [formCustomerNames, setFormCustomerNames] = useState<string[]>([""]);
  const [formCustomerPhone, setFormCustomerPhone] = useState<string>("");
  const [formPaymentMethod, setFormPaymentMethod] = useState<string>("cash");
  const [formPaymentSeq, setFormPaymentSeq] = useState<string>("");
  const [formReference, setFormReference] = useState<string>("");
  const [formNotes, setFormNotes] = useState<string>("");
  const [formExpectedPaymentDate, setFormExpectedPaymentDate] = useState<string>("");
  const [formCommitmentPercentage, setFormCommitmentPercentage] = useState<string>("");
  const [formRescheduleReason, setFormRescheduleReason] = useState<string>("");

  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleCustomerNameChange = (index: number, val: string) => {
    setFormCustomerNames((prev) => {
      const updated = [...prev];
      updated[index] = val;
      return updated;
    });
  };

  const handleAddNextCustomer = () => {
    setFormCustomerNames((prev) => [...prev, ""]);
  };

  const handleRemoveCustomer = (index: number) => {
    setFormCustomerNames((prev) => (prev.length <= 1 ? [""] : prev.filter((_, i) => i !== index)));
  };

  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  // Load report and transactions
  const loadData = useCallback(async (dateStr: string, empId?: number) => {
    setLoading(true);
    setStatusMessage(null);
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

      const res = await api.sales.get(r.id);
      setEntries(res.entries || []);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setStatusMessage({ type: "error", text: err.message });
      } else {
        setStatusMessage({
          type: "error",
          text: "Failed to load sales and collection entries.",
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Load pipeline data
  const loadPipeline = useCallback(async () => {
    setPipelineLoading(true);
    try {
      const empId = isSupervisor ? selectedEmpId : undefined;
      const data = await api.sales.getCommitmentsPipeline({
        employee_id: empId,
      });
      setPipelineData(data);
    } catch {
      // Non-fatal
    } finally {
      setPipelineLoading(false);
    }
  }, [isSupervisor, selectedEmpId]);

  useEffect(() => {
    if (isSupervisor && !selectedEmpId) return;
    loadData(reportDate, isSupervisor ? selectedEmpId : undefined);
  }, [reportDate, selectedEmpId, isSupervisor, loadData]);

  useEffect(() => {
    if (activeTab === "pipeline") {
      loadPipeline();
    }
  }, [activeTab, loadPipeline]);

  // Financial separation rules
  const calculations = useMemo(() => {
    const actualNewSalesCollection = entries
      .filter((e) => e.category === "new_sales_collection")
      .reduce((sum, e) => sum + (e.amount || 0), 0);

    const salesCommitments = entries
      .filter(
        (e) =>
          e.category === "new_sales_commit_payment_1" ||
          e.category === "new_sales_commit_payment_2" ||
          e.category === "new_sales_commit_payment_3"
      )
      .reduce((sum, e) => sum + (e.amount || 0), 0);

    const tbCollection = entries
      .filter((e) => e.category === "tb_collection")
      .reduce((sum, e) => sum + (e.amount || 0), 0);

    const tbCommitments = entries
      .filter(
        (e) =>
          e.category === "tb_commit_payment_1" ||
          e.category === "tb_commit_payment_2" ||
          e.category === "tb_commit_payment_3"
      )
      .reduce((sum, e) => sum + (e.amount || 0), 0);

    const emiCollection = entries
      .filter((e) => e.category === "emi_collection")
      .reduce((sum, e) => sum + (e.amount || 0), 0);

    const emiCommitments = entries
      .filter(
        (e) =>
          e.category === "emi_commit_payment_1" ||
          e.category === "emi_commit_payment_2" ||
          e.category === "emi_commit_payment_3"
      )
      .reduce((sum, e) => sum + (e.amount || 0), 0);

    const otherCollection = entries
      .filter((e) => e.category === "other_collection")
      .reduce((sum, e) => sum + (e.amount || 0), 0);

    const grandTotalActual =
      actualNewSalesCollection + tbCollection + emiCollection + otherCollection;
    const grandTotalCommitments = salesCommitments + tbCommitments + emiCommitments;

    return {
      actualNewSalesCollection,
      salesCommitments,
      tbCollection,
      tbCommitments,
      emiCollection,
      emiCommitments,
      otherCollection,
      grandTotalActual,
      grandTotalCommitments,
    };
  }, [entries]);

  const openAddModal = () => {
    setEditingEntry(null);
    setFormCategory("new_sales_commit_payment_1");
    setFormAmount("");
    setFormCustomerNames([""]);
    setFormCustomerPhone("");
    setFormPaymentMethod("cash");
    setFormPaymentSeq("");
    setFormReference("");
    setFormNotes("");
    setFormExpectedPaymentDate("");
    setFormCommitmentPercentage("");
    setFormRescheduleReason("");
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (entry: SalesCollectionEntry) => {
    setEditingEntry(entry);
    setFormCategory(entry.category as SalesCollectionCategory);
    setFormAmount(String(entry.amount));
    if (entry.customer_name) {
      const parts = entry.customer_name
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      setFormCustomerNames(parts.length > 0 ? parts : [""]);
    } else {
      setFormCustomerNames([""]);
    }
    setFormCustomerPhone(entry.customer_phone || "");
    setFormPaymentMethod(entry.payment_method || "cash");
    setFormPaymentSeq(entry.payment_sequence ? String(entry.payment_sequence) : "");
    setFormReference(entry.reference || "");
    setFormNotes(entry.notes || "");
    setFormExpectedPaymentDate(entry.expected_payment_date || "");
    setFormCommitmentPercentage(
      entry.commitment_percentage != null ? String(entry.commitment_percentage) : ""
    );
    setFormRescheduleReason("");
    setFormError(null);
    setIsModalOpen(true);
  };

  // Auto-open modal if edit_id is in query parameters
  useEffect(() => {
    if (!autoOpenedEditId) return;

    if (activeTab === "pipeline" && pipelineData?.items) {
      const match = pipelineData.items.find((i) => String(i.id) === autoOpenedEditId);
      if (match) {
        openEditModal(match as any);
        setAutoOpenedEditId(null);
      }
    } else if (entries.length > 0) {
      const match = entries.find((e) => String(e.id) === autoOpenedEditId);
      if (match) {
        openEditModal(match);
        setAutoOpenedEditId(null);
      }
    }
  }, [autoOpenedEditId, activeTab, pipelineData, entries]);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rId = editingEntry?.report_id || report?.id;
    if (!rId) return;

    const amt = parseFloat(formAmount);
    if (isNaN(amt) || amt <= 0) {
      setFormError("Please enter a valid amount greater than 0 BDT.");
      return;
    }

    setFormSubmitting(true);
    setFormError(null);

    const catDef = SALES_CATEGORIES.find((c) => c.key === formCategory);
    const isCollection = catDef?.isCollection ?? false;

    const joinedCustomerNames = formCustomerNames
      .map((n) => n.trim())
      .filter(Boolean)
      .join(", ");

    const payload: Partial<SalesCollectionEntry> & { reschedule_reason?: string } = {
      category: formCategory,
      is_collection: isCollection,
      amount: amt,
      customer_name: joinedCustomerNames || null,
      customer_phone: formCustomerPhone.trim() || null,
      payment_method: formPaymentMethod || null,
      payment_sequence: formPaymentSeq ? parseInt(formPaymentSeq, 10) : null,
      reference: formReference.trim() || null,
      notes: formNotes.trim() || null,
      expected_payment_date: formExpectedPaymentDate ? formExpectedPaymentDate : null,
      commitment_percentage: formCommitmentPercentage ? parseInt(formCommitmentPercentage, 10) : null,
    };

    if (formRescheduleReason.trim()) {
      payload.reschedule_reason = formRescheduleReason.trim();
    }

    try {
      if (editingEntry) {
        const updated = await api.sales.update(rId, editingEntry.id, payload);
        setEntries((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item))
        );
        setStatusMessage({
          type: "success",
          text: "Entry updated successfully.",
        });
      } else {
        const created = await api.sales.create(rId, payload as any);
        setEntries((prev) => [created, ...prev]);
        setStatusMessage({
          type: "success",
          text: "New sales/collection transaction recorded successfully.",
        });
      }
      setIsModalOpen(false);
      // Refresh pipeline if active
      if (activeTab === "pipeline") {
        loadPipeline();
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("Failed to save entry. Please try again.");
      }
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDelete = async (entryId: number) => {
    if (!report) return;
    try {
      await api.sales.delete(report.id, entryId);
      setEntries((prev) => prev.filter((item) => item.id !== entryId));
      setStatusMessage({
        type: "info",
        text: "Transaction deleted.",
      });
      setDeleteConfirmId(null);
      if (activeTab === "pipeline") {
        loadPipeline();
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setStatusMessage({ type: "error", text: err.message });
      } else {
        setStatusMessage({
          type: "error",
          text: "Failed to delete transaction.",
        });
      }
    }
  };

  const isLocked = report?.is_submitted ?? false;

  // Filtered pipeline items
  const filteredPipelineItems = useMemo(() => {
    if (!pipelineData?.items) return [];
    let items = pipelineData.items;

    if (pipelineFilter === "due_today") {
      items = items.filter((i) => i.status === "due_today");
    } else if (pipelineFilter === "upcoming") {
      items = items.filter((i) => i.status === "upcoming");
    } else if (pipelineFilter === "overdue") {
      items = items.filter((i) => i.status === "overdue");
    } else if (pipelineFilter === "rescheduled") {
      items = items.filter((i) => i.reschedule_count > 0);
    }

    if (pipelineSearch.trim()) {
      const q = pipelineSearch.trim().toLowerCase();
      items = items.filter(
        (i) =>
          i.customer_name?.toLowerCase().includes(q) ||
          i.customer_phone?.toLowerCase().includes(q) ||
          i.category?.toLowerCase().includes(q) ||
          i.employee_name?.toLowerCase().includes(q) ||
          i.reference?.toLowerCase().includes(q)
      );
    }

    return items;
  }, [pipelineData, pipelineFilter, pipelineSearch]);

  const highRiskCount = useMemo(() => {
    if (!pipelineData?.items) return 0;
    return pipelineData.items.filter((i) => i.reschedule_count >= 2).length;
  }, [pipelineData]);

  return (
    <DashboardLayout
      title="Sales & Collection"
      subtitle={isSupervisor ? "Supervisor Review: Monitor employee collections, commitments, and reschedule audits" : "Financial tracking, actual collections, future commitments, and promise reschedule audit"}
    >
      <div className="space-y-6">
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
            currentPage="sales"
          />
        )}
        {/* ── Header Controls Card ────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-3.5 sm:p-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
              {/* Date & Employee info */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <div className="flex items-center gap-1.5 text-sm">
                  <Calendar className="w-4 h-4 text-green-700 shrink-0" />
                  <label htmlFor="report-date" className="text-xs font-bold text-slate-700 shrink-0">
                    Date:
                  </label>
                  <input
                    id="report-date"
                    type="date"
                    value={reportDate}
                    onChange={(e) => {
                      setReportDate(e.target.value);
                      const empQuery = (isSupervisor ? selectedEmpId : undefined) ? `&employee_id=${selectedEmpId}` : "";
                      const tabQuery = activeTab === "pipeline" ? "&tab=pipeline" : "";
                      router.replace(`/sales?date=${e.target.value}${empQuery}${tabQuery}`);
                    }}
                    className="border border-slate-300 rounded px-2.5 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-green-600 bg-white"
                  />
                  {reportDate !== today && (
                    <button
                      type="button"
                      onClick={() => {
                        setReportDate(today);
                        const empQuery = (isSupervisor ? selectedEmpId : undefined) ? `&employee_id=${selectedEmpId}` : "";
                        const tabQuery = activeTab === "pipeline" ? "&tab=pipeline" : "";
                        router.replace(`/sales?date=${today}${empQuery}${tabQuery}`);
                      }}
                      className="px-2 py-1 text-[11px] font-semibold text-green-800 bg-green-50 hover:bg-green-100 rounded border border-green-200 transition-colors"
                    >
                      Today
                    </button>
                  )}
                </div>

                <Badge variant={isLocked ? "success" : "warning"} className="text-[10px]">
                  {isLocked ? "Finalized / Submitted" : "Draft (Editable)"}
                </Badge>
              </div>

              {/* View Tabs Toggle & Action */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                {/* View Tabs Toggle (Segmented control) */}
                <div className="grid grid-cols-2 sm:flex sm:items-center bg-slate-100 p-1 rounded-lg border border-slate-200 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setActiveTab("daily")}
                    className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                      activeTab === "daily"
                        ? "bg-white text-green-800 shadow-2xs font-bold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>Daily Transactions</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("pipeline")}
                    className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                      activeTab === "pipeline"
                        ? "bg-white text-green-800 shadow-2xs font-bold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5 text-amber-600" />
                    <span>Future Commitments</span>
                    {pipelineData?.total_commitments ? (
                      <span className="text-[10px] font-mono font-extrabold px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-900">
                        {pipelineData.total_commitments}
                      </span>
                    ) : null}
                  </button>
                </div>

                {(!isLocked || isAdmin) && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={openAddModal}
                    disabled={loading}
                    className="w-full sm:w-auto font-bold py-2 sm:py-1.5 shadow-xs"
                  >
                    <Plus className="w-4 h-4 mr-1.5" />
                    Record Transaction
                  </Button>
                )}
                {isLocked && !isAdmin && (
                  <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded border border-emerald-200 font-medium w-full sm:w-auto">
                    <Lock className="w-3.5 h-3.5" />
                    Locked for Edits
                  </div>
                )}
                {isLocked && isAdmin && (
                  <div className="flex items-center justify-center gap-1.5 text-xs text-amber-800 bg-amber-50 px-3 py-1.5 rounded border border-amber-300 font-medium w-full sm:w-auto">
                    <Lock className="w-3.5 h-3.5" />
                    Finalized (Admin Override)
                  </div>
                )}
              </div>
            </div>

            {isLocked && (
              <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600 flex items-center gap-2">
                <Lock className="w-4 h-4 text-slate-500 shrink-0" />
                <span>
                  This report has been finalized and submitted. Modifying financial records is locked.
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
            TAB 1: DAILY TRANSACTIONS VIEW
           ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "daily" && (
          <>
            {/* Financial Split Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
              {/* Actual Cash Collected */}
              <Card className="p-3 sm:p-4 bg-emerald-50/40 border-emerald-200">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] sm:text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
                    Actual Collection
                  </span>
                  <Badge variant="success" className="text-[9px] sm:text-xs">Actual</Badge>
                </div>
                <div className="text-lg sm:text-2xl font-extrabold text-emerald-800 mt-1 sm:mt-2">
                  {formatBDT(calculations.grandTotalActual)}
                </div>
                <p className="text-[10px] sm:text-[11px] text-emerald-700 mt-0.5 sm:mt-1 truncate">
                  Sales {formatBDT(calculations.actualNewSalesCollection)} • TB {formatBDT(calculations.tbCollection)}
                </p>
              </Card>

              {/* Payment Commitments */}
              <Card className="p-3 sm:p-4 bg-amber-50/40 border-amber-200">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] sm:text-[11px] font-bold text-amber-800 uppercase tracking-wider">
                    Commitments
                  </span>
                  <Badge variant="warning" className="text-[9px] sm:text-xs">Upcoming</Badge>
                </div>
                <div className="text-lg sm:text-2xl font-extrabold text-amber-800 mt-1 sm:mt-2">
                  {formatBDT(calculations.grandTotalCommitments)}
                </div>
                <p className="text-[10px] sm:text-[11px] text-amber-700 mt-0.5 sm:mt-1 truncate">
                  Sales {formatBDT(calculations.salesCommitments)} • TB {formatBDT(calculations.tbCommitments)}
                </p>
              </Card>

              {/* Token to Booking (TB) Total */}
              <Card className="p-3 sm:p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] sm:text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    TB Total
                  </span>
                  <Receipt className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-600" />
                </div>
                <div className="text-base sm:text-xl font-bold text-slate-900 mt-1 sm:mt-2">
                  {formatBDT(calculations.tbCollection)}
                </div>
                <p className="text-[10px] sm:text-[11px] text-slate-600 font-medium mt-0.5 sm:mt-1 truncate">
                  Commit: {formatBDT(calculations.tbCommitments)}
                </p>
              </Card>

              {/* EMI Collection */}
              <Card className="p-3 sm:p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] sm:text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    EMI Collection
                  </span>
                  <Banknote className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-600" />
                </div>
                <div className="text-base sm:text-xl font-bold text-slate-900 mt-1 sm:mt-2">
                  {formatBDT(calculations.emiCollection)}
                </div>
                <p className="text-[10px] sm:text-[11px] text-slate-600 font-medium mt-0.5 sm:mt-1 truncate">
                  Monthly installments
                </p>
              </Card>
            </div>

            {/* Transactions Table */}
            <Card>
              <CardHeader className="p-3.5 sm:p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                    <Receipt className="w-4 h-4 text-green-700" />
                    Recorded Financial Transactions
                  </CardTitle>
                  <span className="text-xs text-slate-500">
                    {entries.length} {entries.length === 1 ? "entry" : "entries"} recorded
                  </span>
                </div>
              </CardHeader>

              {/* Mobile View: Native App-Like Cards */}
              <div className="block md:hidden p-3 space-y-3 bg-slate-50/50">
                {entries.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 bg-white rounded-xl border border-dashed border-slate-200 p-4">
                    <p className="text-xs font-medium text-slate-500">No financial transactions recorded for this day yet.</p>
                    {(!isLocked || isAdmin) && (
                      <div className="mt-3">
                        <Button size="sm" variant="outline" onClick={openAddModal} className="text-xs">
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          Record First Transaction
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  entries.map((entry) => {
                    const catDef = SALES_CATEGORIES.find((c) => c.key === entry.category);
                    return (
                      <div
                        key={entry.id}
                        className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-3.5 space-y-2.5 transition-all"
                      >
                        {/* Top: Category & Amount */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1">
                            <span className="text-xs font-bold text-slate-900 block leading-tight">
                              {catDef?.label || entry.category}
                            </span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge variant={entry.is_collection ? "success" : "warning"} className="text-[10px]">
                                {entry.is_collection ? "Actual Collection" : "Commitment"}
                              </Badge>
                              {getPaymentMethodBadge(entry.payment_method)}
                              {entry.payment_sequence && (
                                <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                                  Seq #{entry.payment_sequence}
                                </span>
                              )}
                              {renderCommitmentPercentageBadge(entry.commitment_percentage)}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-base font-extrabold text-slate-900 font-mono block">
                              {formatBDT(entry.amount)}
                            </span>
                          </div>
                        </div>

                        {/* Customer Info Box */}
                        <div className="bg-slate-50/80 rounded-lg p-2.5 border border-slate-100 space-y-1.5 text-xs">
                          <div className="flex items-center gap-1.5 text-slate-700">
                            <Users className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span className="font-semibold text-slate-900 truncate">
                              {entry.customer_name || "Customer not specified"}
                            </span>
                          </div>

                          {entry.customer_phone && (
                            <a
                              href={`tel:${entry.customer_phone}`}
                              className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 px-2.5 py-1 rounded-md border border-emerald-200 transition-colors w-fit"
                            >
                              <Phone className="w-3 h-3 text-emerald-600" />
                              <span>{entry.customer_phone}</span>
                              <span className="text-[10px] text-emerald-700 font-normal ml-0.5">(Tap to Call)</span>
                            </a>
                          )}

                          {entry.expected_payment_date && (
                            <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[11px]">
                              <span className="text-slate-500 flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-amber-600" />
                                Promised Date:
                              </span>
                              <span className="font-mono font-bold text-amber-900">
                                {formatReadableDate(entry.expected_payment_date)}
                              </span>
                            </div>
                          )}

                          {entry.reschedule_count && entry.reschedule_count > 0 ? (
                            <button
                              type="button"
                              onClick={() => setSelectedHistoryEntry(entry)}
                              className="w-full text-left inline-flex items-center justify-between px-2 py-1 rounded bg-amber-50 hover:bg-amber-100 border border-amber-200 text-[11px] font-bold text-amber-900 transition-colors"
                            >
                              <span className="flex items-center gap-1">
                                <History className="w-3 h-3 text-amber-700" />
                                Shifted {entry.reschedule_count}x
                              </span>
                              <span className="text-[10px] text-amber-700 underline">View Log →</span>
                            </button>
                          ) : null}

                          {(entry.reference || entry.notes) && (
                            <p className="text-[11px] text-slate-500 italic pt-1 border-t border-slate-200/60 truncate">
                              Ref: {entry.reference || entry.notes}
                            </p>
                          )}
                        </div>

                        {/* Action Buttons */}
                        {(!isLocked || isAdmin) && (
                          <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs py-1 px-3 h-8 flex-1 sm:flex-initial"
                              onClick={() => openEditModal(entry)}
                            >
                              <Edit2 className="w-3.5 h-3.5 mr-1 text-slate-600" />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs py-1 px-2.5 h-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200"
                              onClick={() => setDeleteConfirmId(entry.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-700 text-[11px] font-semibold">
                      <th className="py-2.5 px-4">Category</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3 text-right">Amount (BDT)</th>
                      <th className="py-2.5 px-3">Customer Name</th>
                      <th className="py-2.5 px-3">Promised Date & Reschedule Audit</th>
                      <th className="py-2.5 px-3">Method</th>
                      <th className="py-2.5 px-3">Seq #</th>
                      <th className="py-2.5 px-3">Reference / Notes</th>
                      {(!isLocked || isAdmin) && <th className="py-2.5 px-3 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {entries.length === 0 ? (
                      <tr>
                        <td
                          colSpan={(!isLocked || isAdmin) ? 9 : 8}
                          className="py-10 text-center text-slate-400"
                        >
                          No financial transactions recorded for this day yet.
                          {!isLocked && (
                            <div className="mt-2">
                              <Button size="sm" variant="outline" onClick={openAddModal}>
                                <Plus className="w-3.5 h-3.5 mr-1" />
                                Record First Transaction
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : (
                      entries.map((entry) => {
                        const catDef = SALES_CATEGORIES.find((c) => c.key === entry.category);
                        return (
                          <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-4 font-semibold text-slate-900">
                              {catDef?.label || entry.category}
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Badge variant={entry.is_collection ? "success" : "warning"}>
                                  {entry.is_collection ? "Actual Collection" : "Commitment"}
                                </Badge>
                                {renderCommitmentPercentageBadge(entry.commitment_percentage)}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-slate-900">
                              {formatBDT(entry.amount)}
                            </td>
                            <td className="py-3 px-3 text-slate-700">
                              <div className="flex flex-col">
                                {entry.customer_name ? (
                                  entry.customer_name.includes(",") ? (
                                    <div className="flex flex-wrap gap-1">
                                      {entry.customer_name.split(",").map((cName, idx) => (
                                        <span
                                          key={idx}
                                          className="inline-block bg-slate-100 text-slate-800 text-[11px] font-semibold px-2 py-0.5 rounded border border-slate-200"
                                        >
                                          {cName.trim()}
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="font-medium text-slate-900">{entry.customer_name}</span>
                                  )
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                                {entry.customer_phone && (
                                  <a
                                    href={`tel:${entry.customer_phone}`}
                                    className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-emerald-700 hover:text-emerald-800 hover:underline mt-0.5 w-fit"
                                    title="Click to call customer"
                                  >
                                    <Phone className="w-2.5 h-2.5" />
                                    <span>{entry.customer_phone}</span>
                                  </a>
                                )}
                              </div>
                            </td>

                            {/* Promised Date & Reschedule Audit Trail */}
                            <td className="py-3 px-3">
                              {entry.expected_payment_date ? (
                                <div className="space-y-1">
                                  <span className="inline-flex items-center gap-1 font-semibold text-[11px] px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200">
                                    <Calendar className="w-3 h-3 text-amber-700" />
                                    {formatReadableDate(entry.expected_payment_date)}
                                  </span>
                                  {entry.reschedule_count && entry.reschedule_count > 0 ? (
                                    <div>
                                      <button
                                        type="button"
                                        onClick={() => setSelectedHistoryEntry(entry)}
                                        className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.2 rounded border transition-colors ${
                                          entry.reschedule_count >= 2
                                            ? "bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-300"
                                            : "bg-amber-100 hover:bg-amber-200 text-amber-800 border-amber-300"
                                        }`}
                                        title="Click to view full reschedule audit trail"
                                      >
                                        <History className="w-3 h-3" />
                                        Shifted {entry.reschedule_count}x
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>

                            <td className="py-3 px-3">
                              {getPaymentMethodBadge(entry.payment_method)}
                            </td>
                            <td className="py-3 px-3 text-slate-600">
                              {entry.payment_sequence ? `#${entry.payment_sequence}` : "—"}
                            </td>
                            <td className="py-3 px-3 text-slate-500 max-w-[200px] truncate">
                              {entry.reference || entry.notes || "—"}
                            </td>
                            {(!isLocked || isAdmin) && (
                              <td className="py-3 px-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => openEditModal(entry)}
                                    className="p-1 text-slate-400 hover:text-slate-700 rounded"
                                    title="Edit"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setDeleteConfirmId(entry.id)}
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded"
                                    title="Delete"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            TAB 2: FUTURE COMMITMENTS PIPELINE & RESCHEDULE AUDIT
           ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "pipeline" && (
          <div className="space-y-6">
            {/* Pipeline KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
              <Card className="p-3 sm:p-4 bg-gradient-to-br from-amber-50/70 to-white border-amber-200">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] sm:text-[11px] font-bold text-amber-900 uppercase tracking-wider">
                    Promised Pipeline
                  </span>
                  <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-700" />
                </div>
                <div className="text-lg sm:text-2xl font-extrabold text-amber-900 mt-1 sm:mt-2">
                  {formatBDT(pipelineData?.total_promised_amount || 0)}
                </div>
                <p className="text-[10px] sm:text-[11px] text-amber-800 mt-0.5 sm:mt-1 font-medium truncate">
                  Future expected cash
                </p>
              </Card>

              <Card className="p-3 sm:p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] sm:text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Commitments
                  </span>
                  <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-700" />
                </div>
                <div className="text-lg sm:text-2xl font-extrabold text-slate-900 mt-1 sm:mt-2">
                  {pipelineData?.total_commitments || 0}
                </div>
                <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 sm:mt-1 truncate">
                  Active customer records
                </p>
              </Card>

              <Card className="p-3 sm:p-4 bg-slate-50 border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] sm:text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Rescheduled
                  </span>
                  <History className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-600" />
                </div>
                <div className="text-lg sm:text-2xl font-extrabold text-slate-900 mt-1 sm:mt-2">
                  {pipelineData?.rescheduled_count || 0}
                </div>
                <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 sm:mt-1 truncate">
                  Clients postponed date
                </p>
              </Card>

              <Card className="p-3 sm:p-4 bg-rose-50/50 border-rose-200">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] sm:text-[11px] font-bold text-rose-800 uppercase tracking-wider">
                    High-Risk (2+x)
                  </span>
                  <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-600" />
                </div>
                <div className="text-lg sm:text-2xl font-extrabold text-rose-900 mt-1 sm:mt-2">
                  {highRiskCount}
                </div>
                <p className="text-[10px] sm:text-[11px] text-rose-700 mt-0.5 sm:mt-1 font-medium truncate">
                  {highRiskCount > 0 ? "Multiple delays" : "On schedule"}
                </p>
              </Card>
            </div>

            {/* Filter and Search Bar */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                    {[
                      { key: "all", label: "All Commitments" },
                      { key: "due_today", label: "Due Today" },
                      { key: "upcoming", label: "Upcoming" },
                      { key: "overdue", label: "Overdue" },
                      { key: "rescheduled", label: "Rescheduled / Shifted" },
                    ].map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => setPipelineFilter(f.key as any)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                          pipelineFilter === f.key
                            ? "bg-green-700 text-white font-bold shadow-xs"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  <div className="relative w-full sm:w-64">
                    <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search customer, employee..."
                      value={pipelineSearch}
                      onChange={(e) => setPipelineSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Pipeline Section: Desktop Table & Mobile Cards */}
            <Card>
              <CardHeader className="p-3.5 sm:p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                    <Calendar className="w-4 h-4 text-amber-600" />
                    <span>Customer Commitment Pipeline</span>
                  </CardTitle>
                  <span className="text-xs text-slate-500">
                    {filteredPipelineItems.length} {filteredPipelineItems.length === 1 ? "record" : "records"}
                  </span>
                </div>
              </CardHeader>

              {/* Mobile View: Native App-Like Cards */}
              <div className="block md:hidden p-3 space-y-3 bg-slate-50/50">
                {pipelineLoading ? (
                  <div className="py-10 text-center text-slate-400 bg-white rounded-xl border border-slate-200 p-4">
                    Loading commitment pipeline...
                  </div>
                ) : filteredPipelineItems.length === 0 ? (
                  <div className="py-10 text-center text-slate-400 bg-white rounded-xl border border-dashed border-slate-200 p-4">
                    <p className="text-xs font-medium text-slate-500">No customer commitments match this filter.</p>
                  </div>
                ) : (
                  filteredPipelineItems.map((item) => (
                    <div
                      key={item.id}
                      className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-3.5 space-y-2.5 transition-all"
                    >
                      {/* Top: Customer & Status */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <span className="text-xs font-bold text-slate-900 block leading-tight">
                            {item.customer_name || "Unknown Customer"}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono block">
                            Ref #{item.id} • {item.category}
                          </span>
                        </div>
                        {/* Status Badge with Lucide Icon */}
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                            item.status === "due_today"
                              ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                              : item.status === "overdue"
                              ? "bg-rose-100 text-rose-800 border border-rose-300"
                              : item.status === "upcoming"
                              ? "bg-blue-50 text-blue-800 border border-blue-200"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {item.status === "due_today" ? (
                            <>
                              <Bell className="w-2.5 h-2.5 text-emerald-700" />
                              <span>Due Today</span>
                            </>
                          ) : item.status === "overdue" ? (
                            <>
                              <AlertTriangle className="w-2.5 h-2.5 text-rose-600" />
                              <span>Overdue</span>
                            </>
                          ) : item.status === "upcoming" ? (
                            <>
                              <Calendar className="w-2.5 h-2.5 text-blue-600" />
                              <span>Upcoming</span>
                            </>
                          ) : (
                            <span>No Date</span>
                          )}
                        </span>
                      </div>

                      {/* Amount & Due Date Box */}
                      <div className="flex items-center justify-between p-2.5 bg-amber-50/50 rounded-lg border border-amber-200/70">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-amber-800 block">Promised Amount</span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-base font-extrabold text-amber-950 font-mono">
                              {formatBDT(item.amount)}
                            </span>
                            {renderCommitmentPercentageBadge(item.commitment_percentage)}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] uppercase font-bold text-amber-800 block">Promised Date</span>
                          <span className="text-xs font-bold text-amber-900 font-mono">
                            {item.expected_payment_date ? formatReadableDate(item.expected_payment_date) : "—"}
                          </span>
                        </div>
                      </div>

                      {/* Customer Phone & Employee info */}
                      <div className="space-y-1.5 text-xs">
                        {item.customer_phone && (
                          <a
                            href={`tel:${item.customer_phone}`}
                            className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 px-2.5 py-1 rounded-md border border-emerald-200 transition-colors w-fit"
                          >
                            <Phone className="w-3 h-3 text-emerald-600" />
                            <span>{item.customer_phone}</span>
                            <span className="text-[10px] text-emerald-700 font-normal ml-0.5">(Tap to Call)</span>
                          </a>
                        )}
                        <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1 border-t border-slate-100">
                          <span className="text-slate-500">Employee:</span>
                          <span className="font-semibold text-slate-800">
                            {item.employee_name || "Employee"} ({formatEmployeeId(item.employee_id)})
                          </span>
                        </div>
                        {item.reference && (
                          <p className="text-[11px] text-slate-500 italic truncate">
                            Ref: {item.reference}
                          </p>
                        )}
                      </div>

                      {/* Reschedule shift info & View Log button */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        {item.reschedule_count > 0 ? (
                          <button
                            type="button"
                            onClick={() => setSelectedHistoryEntry(item as any)}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                              item.reschedule_count >= 2
                                ? "bg-rose-100 text-rose-900 border-rose-300"
                                : "bg-amber-100 text-amber-900 border-amber-300"
                            }`}
                          >
                            <History className="w-3 h-3" />
                            <span>Shifted {item.reschedule_count}x</span>
                            {item.reschedule_count >= 2 && (
                              <span className="text-[9px] bg-rose-700 text-white px-1 rounded ml-1">
                                High Risk
                              </span>
                            )}
                          </button>
                        ) : (
                          <span className="text-emerald-700 text-[10px] font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            On Schedule
                          </span>
                        )}
                        <div className="flex items-center gap-1.5">
                          {(!isLocked || isAdmin) && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs py-1 h-7 text-emerald-800 border-emerald-300 bg-emerald-50/60 hover:bg-emerald-100"
                              onClick={() => openEditModal(item as any)}
                            >
                              <Edit2 className="w-3 h-3 mr-1" />
                              {item.expected_payment_date ? "Reschedule" : "Set Date"}
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs py-1 h-7 text-slate-700"
                            onClick={() => setSelectedHistoryEntry(item as any)}
                          >
                            <History className="w-3 h-3 mr-1" />
                            Log
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-700 text-[11px] font-semibold">
                      <th className="py-2.5 px-4">Customer Name</th>
                      <th className="py-2.5 px-3">Promised Date</th>
                      <th className="py-2.5 px-3 text-right">Promised Amount</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Reschedule Shift Log</th>
                      <th className="py-2.5 px-3">Employee</th>
                      <th className="py-2.5 px-3">Reference / Notes</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pipelineLoading ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-400">
                          Loading commitment pipeline...
                        </td>
                      </tr>
                    ) : filteredPipelineItems.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-400">
                          No customer commitments match this filter.
                        </td>
                      </tr>
                    ) : (
                      filteredPipelineItems.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4 font-bold text-slate-900">
                            <div>
                              <span>{item.customer_name || "Unknown Customer"}</span>
                              {item.customer_phone && (
                                <a
                                  href={`tel:${item.customer_phone}`}
                                  className="flex items-center gap-1 text-[11px] font-mono font-medium text-emerald-700 hover:text-emerald-800 hover:underline mt-0.5 w-fit"
                                  title="Click to call customer"
                                >
                                  <Phone className="w-2.5 h-2.5" />
                                  <span>{item.customer_phone}</span>
                                </a>
                              )}
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                Ref #{item.id} • {item.category}
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-3 font-semibold text-slate-900">
                            {item.expected_payment_date ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200 font-mono text-[11px]">
                                <Calendar className="w-3 h-3 text-amber-700" />
                                {formatReadableDate(item.expected_payment_date)}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          <td className="py-3 px-3 text-right">
                            <div className="font-extrabold text-slate-900 text-sm font-mono">
                              {formatBDT(item.amount)}
                            </div>
                            {item.commitment_percentage && (
                              <div className="mt-0.5 flex justify-end">
                                {renderCommitmentPercentageBadge(item.commitment_percentage)}
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-3">
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                item.status === "due_today"
                                  ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                                  : item.status === "overdue"
                                  ? "bg-rose-100 text-rose-800 border border-rose-300"
                                  : item.status === "upcoming"
                                  ? "bg-blue-50 text-blue-800 border border-blue-200"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {item.status === "due_today" ? (
                                <>
                                  <Bell className="w-2.5 h-2.5 text-emerald-700" />
                                  <span>Due Today</span>
                                </>
                              ) : item.status === "overdue" ? (
                                <>
                                  <AlertTriangle className="w-2.5 h-2.5 text-rose-600" />
                                  <span>Overdue</span>
                                </>
                              ) : item.status === "upcoming" ? (
                                <>
                                  <Calendar className="w-2.5 h-2.5 text-blue-600" />
                                  <span>Upcoming</span>
                                </>
                              ) : (
                                <span>No Date</span>
                              )}
                            </span>
                          </td>

                          <td className="py-3 px-3">
                            {item.reschedule_count > 0 ? (
                              <button
                                type="button"
                                onClick={() => setSelectedHistoryEntry(item as any)}
                                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold border transition-colors ${
                                  item.reschedule_count >= 2
                                    ? "bg-rose-100 text-rose-900 border-rose-300 hover:bg-rose-200"
                                    : "bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200"
                                }`}
                                title="Click to view full reschedule history timeline"
                              >
                                <History className="w-3 h-3" />
                                <span>Shifted {item.reschedule_count}x</span>
                                {item.reschedule_count >= 2 && (
                                  <span className="text-[9px] bg-rose-700 text-white px-1 rounded">
                                    High Risk
                                  </span>
                                )}
                              </button>
                            ) : (
                              <span className="text-emerald-700 text-[11px] font-semibold flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                On Schedule (0 shifts)
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-3 text-slate-700">
                            <div className="flex items-center gap-1">
                              <span>{item.employee_name || "Employee"}</span>
                              <span className="font-mono text-[9px] bg-slate-100 text-slate-700 px-1 rounded">
                                {formatEmployeeId(item.employee_id)}
                              </span>
                            </div>
                          </td>

                          <td className="py-3 px-3 text-slate-500 max-w-[200px] truncate">
                            {item.reference || item.notes || "—"}
                          </td>

                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {(!isLocked || isAdmin) && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs py-1 h-7 text-emerald-800 border-emerald-300 bg-emerald-50/60 hover:bg-emerald-100"
                                  onClick={() => openEditModal(item as any)}
                                >
                                  <Edit2 className="w-3 h-3 mr-1" />
                                  {item.expected_payment_date ? "Reschedule" : "Set Date"}
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs py-1 h-7 text-slate-700"
                                onClick={() => setSelectedHistoryEntry(item as any)}
                              >
                                <History className="w-3 h-3 mr-1" />
                                Log
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* ── Add / Edit Transaction Modal ─────────────────────────────────── */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingEntry ? "Edit Financial Transaction" : "Record Financial Transaction"}
          description={`Report date: ${formatReadableDate(reportDate)}`}
        >
          <form onSubmit={handleFormSubmit} className="space-y-4">
            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800">
                {formError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Category *
              </label>
              <select
                value={formCategory}
                onChange={(e) =>
                  setFormCategory(e.target.value as SalesCollectionCategory)
                }
                className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
              >
                <optgroup label="New Sales Commitments">
                  <option value="new_sales_commit_payment_1">CX New Sales Commit Payment 1</option>
                  <option value="new_sales_commit_payment_2">New Sales Commit Payment 2</option>
                  <option value="new_sales_commit_payment_3">New Sales Commit Payment 3</option>
                </optgroup>
                <optgroup label="Token to Booking (TB) Commitments">
                  <option value="tb_commit_payment_1">TB CX Commit Payment 1</option>
                  <option value="tb_commit_payment_2">TB CX Commit Payment 2</option>
                  <option value="tb_commit_payment_3">TB CX Commit Payment 3</option>
                </optgroup>
                <optgroup label="EMI Commitments (Installments)">
                  <option value="emi_commit_payment_1">EMI CX Commit Payment 1</option>
                  <option value="emi_commit_payment_2">EMI CX Commit Payment 2</option>
                  <option value="emi_commit_payment_3">EMI CX Commit Payment 3</option>
                </optgroup>
                <optgroup label="Actual Collections (Received Today)">
                  <option value="new_sales_collection">New Sales Collection (Actual)</option>
                  <option value="tb_collection">TB Collection (Actual)</option>
                  <option value="emi_collection">EMI Collection (Actual)</option>
                  <option value="other_collection">Other Collection (Actual)</option>
                </optgroup>
              </select>
            </div>

            {/* Future Commitment Date & Reschedule Audit Section */}
            <div className="bg-amber-50/50 p-3.5 rounded-xl border border-amber-200/90 space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-700" />
                  Next Promised Payment Date (Commitment Date)
                </label>
                {editingEntry?.reschedule_count && editingEntry.reschedule_count > 0 ? (
                  <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 inline-flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-rose-600" />
                    <span>Shifted {editingEntry.reschedule_count} {editingEntry.reschedule_count === 1 ? "time" : "times"}</span>
                  </span>
                ) : null}
              </div>
              <p className="text-[11px] text-amber-800">
                Set customer&apos;s promised payment date for pipeline tracking and reschedule audit logging.
              </p>
              <input
                type="date"
                value={formExpectedPaymentDate}
                onChange={(e) => setFormExpectedPaymentDate(e.target.value)}
                className="w-full border border-amber-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-amber-600 focus:outline-none bg-white"
              />

              {/* Commitment Percentage Dropdown (10% to 100%) */}
              <div className="pt-2 border-t border-amber-200/70">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                    <Percent className="w-3.5 h-3.5 text-amber-700" />
                    Commitment Percentage (Probability / Share)
                  </label>
                  {formCommitmentPercentage ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-mono">
                      {formCommitmentPercentage}% Selected
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-800/70 italic">Optional</span>
                  )}
                </div>
                <select
                  value={formCommitmentPercentage}
                  onChange={(e) => setFormCommitmentPercentage(e.target.value)}
                  className="w-full border border-amber-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-amber-600 focus:outline-none bg-white"
                >
                  <option value="">-- Select Percentage (Optional) --</option>
                  <option value="10">10% - Initial / Very Tentative Inquiry</option>
                  <option value="20">20% - Early Stage Interest</option>
                  <option value="30">30% - Client Reviewing Project Details</option>
                  <option value="40">40% - Positive Discussion / Decision Making</option>
                  <option value="50">50% - Moderate Confidence (50-50 Chance)</option>
                  <option value="60">60% - Proposal Agreed / Arranging Funds</option>
                  <option value="70">70% - High Confidence Commitment</option>
                  <option value="80">80% - Very High Assurance / Near Closing</option>
                  <option value="90">90% - Deal Finalized / Paperwork Ready</option>
                  <option value="100">100% - Fully Confirmed / Guaranteed Commitment</option>
                </select>
                <p className="text-[10px] text-amber-800/80 mt-1">
                  Applicable across all commitments (Sales, Token to Booking, and EMI installments).
                </p>
              </div>

              {/* Show reschedule reason prompt if editing and date has changed */}
              {editingEntry &&
                editingEntry.expected_payment_date &&
                formExpectedPaymentDate &&
                editingEntry.expected_payment_date !== formExpectedPaymentDate && (
                  <div className="pt-2.5 border-t border-amber-200 space-y-2">
                    <div className="flex items-center justify-between text-[11px] bg-white p-2 rounded border border-amber-200">
                      <span className="text-amber-950 font-bold">Date Rescheduling:</span>
                      <span className="text-slate-600 font-mono">
                        <span className="line-through text-rose-600 font-bold mr-1">
                          {formatReadableDate(editingEntry.expected_payment_date)}
                        </span>
                        ➔{" "}
                        <span className="text-emerald-700 font-bold ml-1">
                          {formatReadableDate(formExpectedPaymentDate)}
                        </span>
                      </span>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-rose-800 uppercase tracking-wide mb-1">
                        Reason for Date Postponement *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Bank cheque clearance delay, Client out of town, Funds arranging..."
                        value={formRescheduleReason}
                        onChange={(e) => setFormRescheduleReason(e.target.value)}
                        className="w-full border border-rose-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-rose-400 focus:ring-1 focus:ring-rose-500 focus:outline-none bg-white"
                      />
                    </div>
                  </div>
                )}
            </div>

            {/* Amount and Payment Sequence */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Amount (BDT) *
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 font-bold text-xs">
                    ৳
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="e.g. 50000"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    className="w-full border border-slate-300 rounded pl-7 pr-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-500 focus:ring-1 focus:ring-green-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Payment Sequence
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 1, 2, 3"
                  value={formPaymentSeq}
                  onChange={(e) => setFormPaymentSeq(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-500 focus:ring-1 focus:ring-green-600 focus:outline-none"
                />
              </div>
            </div>

            {/* Customer Name(s) */}
            <div className="bg-slate-50/70 p-3 rounded-lg border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Customer Name(s)
                </label>
                {formCustomerNames.filter((n) => n.trim()).length > 1 && (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Joint / Multi Customer ({formCustomerNames.filter((n) => n.trim()).length})
                  </span>
                )}
              </div>

              <div className="space-y-2">
                {formCustomerNames.map((name, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-slate-600 w-24 shrink-0">
                      {idx === 0 ? "Customer 1:" : `Customer ${idx + 1} (Opt):`}
                    </span>
                    <input
                      type="text"
                      placeholder={
                        idx === 0
                          ? "e.g. Mr. Farhan Ahmed"
                          : `e.g. Customer ${idx + 1} / Joint buyer name`
                      }
                      value={name}
                      onChange={(e) => handleCustomerNameChange(idx, e.target.value)}
                      className="flex-1 border border-slate-300 rounded px-3 py-1.5 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
                    />
                    {idx > 0 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomer(idx)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title={`Remove Customer ${idx + 1}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {formCustomerNames[formCustomerNames.length - 1]?.trim().length > 0 && (
                <button
                  type="button"
                  onClick={handleAddNextCustomer}
                  className="w-full mt-1 py-1.5 px-3 border border-dashed border-emerald-300 hover:border-emerald-500 rounded text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50/50 hover:bg-emerald-50 flex items-center justify-center gap-1.5 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Add Customer {formCustomerNames.length + 1} (Optional)</span>
                </button>
              )}
            </div>

            {/* Customer Phone Number (Optional) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Customer Phone Number <span className="text-slate-400 font-normal lowercase">(optional)</span>
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="tel"
                  placeholder="e.g. 01712345678 or +88018..."
                  value={formCustomerPhone}
                  onChange={(e) => setFormCustomerPhone(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Payment Method *
                </label>
                <select
                  value={formPaymentMethod}
                  onChange={(e) => setFormPaymentMethod(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
                >
                  <option value="cash">Cash</option>
                  <option value="cheque">Cheque</option>
                  <optgroup label="Mobile Banking">
                    <option value="bkash">bKash</option>
                    <option value="nagad">Nagad</option>
                    <option value="rocket">Rocket</option>
                  </optgroup>
                  <optgroup label="Bank & Card">
                    <option value="bank_transfer">Online Bank Transfer / BEFTN</option>
                    <option value="pos">POS / Card Payment</option>
                  </optgroup>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Reference / Slip # / Trx ID
                </label>
                <input
                  type="text"
                  placeholder={
                    formPaymentMethod === "cheque"
                      ? "e.g. Bank name & Cheque #"
                      : formPaymentMethod === "bkash" || formPaymentMethod === "nagad" || formPaymentMethod === "rocket"
                      ? "e.g. Transaction ID / TrxID"
                      : formPaymentMethod === "pos"
                      ? "e.g. POS Card Slip / Approval #"
                      : formPaymentMethod === "bank_transfer"
                      ? "e.g. Bank Name / Transfer Ref"
                      : "MR slip, receipt #, or reference"
                  }
                  value={formReference}
                  onChange={(e) => setFormReference(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-500 focus:ring-1 focus:ring-green-600 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Notes
              </label>
              <textarea
                rows={2}
                placeholder="Additional details..."
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-500 focus:ring-1 focus:ring-green-600 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 pb-1 border-t border-slate-100 sticky bottom-0 bg-white z-10">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsModalOpen(false)}
                disabled={formSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={formSubmitting}>
                {editingEntry ? "Update Transaction" : "Save Transaction"}
              </Button>
            </div>
          </form>
        </Modal>

        {/* ── Reschedule History Audit Trail Modal ─────────────────────────── */}
        <Modal
          isOpen={selectedHistoryEntry !== null}
          onClose={() => setSelectedHistoryEntry(null)}
          title="Customer Commitment & Reschedule History Log"
          description={
            selectedHistoryEntry?.customer_name
              ? `Client: ${selectedHistoryEntry.customer_name}`
              : "Audit Trail"
          }
        >
          {selectedHistoryEntry && (
            <div className="space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Promised Amount:</span>
                  <span className="font-extrabold text-slate-900 text-sm">
                    {formatBDT(selectedHistoryEntry.amount)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Current Promised Date:</span>
                  <span className="font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-mono">
                    {selectedHistoryEntry.expected_payment_date
                      ? formatReadableDate(selectedHistoryEntry.expected_payment_date)
                      : "Not set"}
                  </span>
                </div>
                {selectedHistoryEntry.commitment_percentage ? (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Commitment Probability:</span>
                    {renderCommitmentPercentageBadge(selectedHistoryEntry.commitment_percentage)}
                  </div>
                ) : null}
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Total Times Date Shifted:</span>
                  <span
                    className={`font-extrabold px-2 py-0.5 rounded ${
                      (selectedHistoryEntry.reschedule_count || 0) >= 2
                        ? "bg-rose-100 text-rose-800 border border-rose-300"
                        : "bg-amber-100 text-amber-900 border border-amber-300"
                    }`}
                  >
                    {selectedHistoryEntry.reschedule_count || 0} times postponed
                  </span>
                </div>
              </div>

              {/* Client Heat Gauge Analysis */}
              {(selectedHistoryEntry.reschedule_count || 0) >= 2 ? (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Client Intention Warning (Weak Interest):</span>
                    <span>
                      Customer has shifted commitment dates {selectedHistoryEntry.reschedule_count} times. Admin and sales team should verify genuine buyer interest before prioritizing.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Commitment timeline is active and within acceptable sales follow-up parameters.
                  </span>
                </div>
              )}

              {/* Chronological Reschedule Log */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-green-700" />
                  Chronological Reschedule Timeline
                </h4>

                {selectedHistoryEntry.reschedule_history &&
                selectedHistoryEntry.reschedule_history.length > 0 ? (
                  <div className="relative pl-6 space-y-3 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                    {selectedHistoryEntry.reschedule_history.map((h, i) => (
                      <div key={i} className="relative">
                        <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-amber-500 ring-4 ring-amber-100" />
                        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-1 text-xs">
                          <div className="flex items-center justify-between font-semibold">
                            <span className="text-slate-800 font-bold">Shift #{i + 1}</span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {h.changed_at ? h.changed_at.slice(0, 10) : ""}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 font-mono text-[11px] text-slate-700">
                            <span className="line-through text-rose-600">
                              {h.old_date ? formatReadableDate(h.old_date) : "Start"}
                            </span>
                            <ArrowRight className="w-3 h-3 text-slate-400" />
                            <span className="text-emerald-700 font-bold">
                              {h.new_date ? formatReadableDate(h.new_date) : "New Date"}
                            </span>
                          </div>
                          {h.reason && (
                            <p className="text-slate-600 text-[11px] bg-slate-50 p-2 rounded border border-slate-100 mt-1">
                              <strong>Reason:</strong> {h.reason}
                            </p>
                          )}
                          {h.changed_by && (
                            <p className="text-[10px] text-slate-400">
                              Updated by: {h.changed_by}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 py-3 text-center bg-slate-50 rounded-lg">
                    No date shifts recorded yet. This is the client's initial promised date.
                  </p>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedHistoryEntry(null)}
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </Modal>

        {/* ── Delete Confirmation Modal ────────────────────────────────────── */}
        <Modal
          isOpen={deleteConfirmId !== null}
          onClose={() => setDeleteConfirmId(null)}
          title="Confirm Delete Transaction"
          description="Are you sure you want to remove this financial record?"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-600">
              This action will permanently delete this transaction from the daily report.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteConfirmId(null)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              >
                Delete
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}

export default function SalesVsCollectionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-sm text-slate-500">
          Loading Financial Activity...
        </div>
      }
    >
      <SalesVsCollectionContent />
    </Suspense>
  );
}
