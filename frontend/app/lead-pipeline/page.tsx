"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  GitFork,
  Database,
  PhoneCall,
  Search,
  RefreshCw,
  Download,
  Flame,
  Target,
  Clock,
  AlertTriangle,
  UserCheck,
  ChevronRight,
  ChevronDown,
  ArrowRightLeft,
  X,
  Phone,
  Building,
  CheckCircle2,
  Copy,
  ExternalLink,
  Layers,
  Filter,
  BarChart3,
  Sparkles,
  ShieldCheck,
  ArrowUpDown,
  Check,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button, Card, CardContent } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  EmployeePipelineItem,
  PipelineOverview,
  LeadPipelineSummaryResponse,
  CrmPipelineExecutive,
  CrmPipelineSummaryResponse,
  WorkflowLead,
  LeadTransferPayload,
} from "@/types";

export default function LeadPipelinePage() {
  const { user, isAdmin, isSubAdmin, loading: authLoading } = useAuth();

  // Active Tab: "crm" (Somikoron CRM Live Data) | "internal" (Sunset Telemarketing DB)
  const [activeTab, setActiveTab] = useState<"crm" | "internal">("crm");

  // Loading & Error States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // CRM Pipeline State
  const [crmData, setCrmData] = useState<CrmPipelineSummaryResponse | null>(null);

  // Internal Calling Pipeline State
  const [internalData, setInternalData] = useState<LeadPipelineSummaryResponse | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [workloadFilter, setWorkloadFilter] = useState<string>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"total" | "hp" | "p" | "name">("total");

  // Lead Inspection Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTitle, setDrawerTitle] = useState("");
  const [drawerSubtitle, setDrawerSubtitle] = useState("");
  const [drawerLeads, setDrawerLeads] = useState<Array<{
    id: string | number;
    name: string;
    phone: string;
    project?: string;
    status: string;
    source?: string;
    created_at?: string;
    crm_link?: string;
    badge?: string;
    lead_cat_id?: string | number;
    raw_keys?: any;
  }>>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerSearch, setDrawerSearch] = useState("");
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);

  // Lead Transfer Modal
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [fromEmployeeId, setFromEmployeeId] = useState<number | "">("");
  const [toEmployeeId, setToEmployeeId] = useState<number | "">("");
  const [transferReason, setTransferReason] = useState("");
  const [transferStatuses, setTransferStatuses] = useState<string[]>(["hp", "p", "fup"]);
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferSuccessMsg, setTransferSuccessMsg] = useState<string | null>(null);
  const [transferErrorMsg, setTransferErrorMsg] = useState<string | null>(null);

  // Fetch Pipeline Data
  const loadData = useCallback(async (forceRefresh = false) => {
    try {
      if (forceRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      // Load both in parallel
      const [crmRes, internalRes] = await Promise.allSettled([
        api.crm.getPipelineSummary({ force_refresh: forceRefresh, limit: 1500 }),
        api.leadWorkflow.getPipelineSummary(),
      ]);

      if (crmRes.status === "fulfilled" && crmRes.value.success) {
        setCrmData(crmRes.value);
      } else if (crmRes.status === "fulfilled" && !crmRes.value.success) {
        // CRM returned error
        console.warn("CRM summary note:", crmRes.value.error);
      }

      if (internalRes.status === "fulfilled") {
        setInternalData(internalRes.value);
      }
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : "Failed to load lead pipeline data.";
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (isAdmin || isSubAdmin) {
      loadData();
    }
  }, [authLoading, isAdmin, isSubAdmin, loadData]);

  // Copy phone helper
  const handleCopyPhone = (phone: string) => {
    navigator.clipboard.writeText(phone);
    setCopiedPhone(phone);
    setTimeout(() => setCopiedPhone(null), 2000);
  };

  // Inspect internal employee leads
  const handleInspectInternalEmployee = async (emp: EmployeePipelineItem) => {
    setDrawerTitle(emp.full_name);
    setDrawerSubtitle(`${emp.designation || "Sales Executive"} • ${emp.team_name || "General Team"} • ${emp.total_leads} Total Active Leads`);
    setDrawerOpen(true);
    setDrawerLoading(true);
    setDrawerSearch("");

    try {
      const res = await api.leadWorkflow.getLeads({ employee_id: emp.id, limit: 100 });
      setDrawerLeads(
        res.items.map((l: WorkflowLead) => ({
          id: l.id,
          name: l.name,
          phone: l.phone,
          project: l.source.toUpperCase(),
          status: l.status.toUpperCase(),
          source: l.source,
          created_at: l.lead_date ? String(l.lead_date) : undefined,
        }))
      );
    } catch {
      setDrawerLeads([]);
    } finally {
      setDrawerLoading(false);
    }
  };

  // Inspect CRM executive leads
  const handleInspectCrmExecutive = (exec: CrmPipelineExecutive) => {
    setDrawerTitle(exec.name);
    setDrawerSubtitle(`Somikoron CRM Executive • ${exec.total_leads} Leads Analyzed (${exec.hp_count} HP, ${exec.p_count} P)`);
    setDrawerOpen(true);
    setDrawerLoading(false);
    setDrawerSearch("");

    setDrawerLeads(
      exec.lead_samples.map((l) => ({
        id: l.id,
        name: l.name,
        phone: l.phone,
        project: l.project || "—",
        status: l.status,
        created_at: l.created_at,
        badge: l.badge,
        lead_cat_id: l.lead_cat_id,
        raw_keys: l.raw_keys,
      }))
    );
  };

  // Inspect Unassigned Leads
  const handleInspectUnassigned = (type: "crm" | "internal") => {
    if (type === "crm" && crmData) {
      setDrawerTitle("Unassigned CRM Leads Pool");
      setDrawerSubtitle(`${crmData.unassigned_count} Leads currently unassigned in Somikoron CRM — Ready for Auto-Assignment`);
      setDrawerLeads(
        crmData.unassigned_leads.map((l) => ({
          id: l.id,
          name: l.name,
          phone: l.phone,
          project: l.project || "—",
          status: l.status,
          created_at: l.created_at,
          crm_link: l.crm_link,
        }))
      );
    } else if (type === "internal" && internalData) {
      setDrawerTitle("Unassigned Calling Leads Pool");
      setDrawerSubtitle(`${internalData.overview.unassigned_leads} Leads in Sunset Database with no active owner`);
      setDrawerLeads(
        internalData.unassigned_samples.map((l) => ({
          id: l.id,
          name: l.name,
          phone: l.phone,
          project: l.source.toUpperCase(),
          status: l.status.toUpperCase(),
          source: l.source,
          created_at: l.created_at,
        }))
      );
    }
    setDrawerOpen(true);
    setDrawerLoading(false);
    setDrawerSearch("");
  };

  // Open Transfer Modal for specific employee
  const handleOpenTransferFor = (empId: number) => {
    setFromEmployeeId(empId);
    setToEmployeeId("");
    setTransferReason("Lead reallocation / workload balancing");
    setTransferStatuses(["hp", "p", "fup"]);
    setTransferSuccessMsg(null);
    setTransferErrorMsg(null);
    setTransferModalOpen(true);
  };

  // Submit Lead Transfer
  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromEmployeeId || !toEmployeeId) {
      setTransferErrorMsg("Please select both source and destination employees.");
      return;
    }
    if (fromEmployeeId === toEmployeeId) {
      setTransferErrorMsg("Source and destination employees must be different.");
      return;
    }

    setTransferSubmitting(true);
    setTransferErrorMsg(null);
    setTransferSuccessMsg(null);

    try {
      const payload: LeadTransferPayload = {
        from_employee_id: Number(fromEmployeeId),
        to_employee_id: Number(toEmployeeId),
        statuses: transferStatuses.length ? transferStatuses : undefined,
        reason: transferReason.trim() || undefined,
      };

      const res = await api.leadWorkflow.transferLeads(payload);
      setTransferSuccessMsg(
        `Successfully transferred ${res.transferred_count} leads from ${res.from_employee_name} to ${res.to_employee_name}!`
      );
      // Reload pipeline
      setTimeout(() => {
        loadData(true);
      }, 800);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : "Failed to transfer leads.";
      setTransferErrorMsg(msg);
    } finally {
      setTransferSubmitting(false);
    }
  };

  // Filtered & Sorted Internal Employees
  const filteredInternalEmployees = useMemo(() => {
    if (!internalData) return [];
    let list = [...internalData.employees];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (e) =>
          e.full_name.toLowerCase().includes(q) ||
          e.username.toLowerCase().includes(q) ||
          (e.team_name && e.team_name.toLowerCase().includes(q)) ||
          (e.designation && e.designation.toLowerCase().includes(q))
      );
    }

    if (workloadFilter !== "all") {
      list = list.filter((e) => e.workload_level === workloadFilter);
    }

    if (teamFilter !== "all") {
      list = list.filter((e) => e.team_name === teamFilter);
    }

    list.sort((a, b) => {
      if (sortBy === "hp") return b.hp_count - a.hp_count;
      if (sortBy === "p") return b.p_count - a.p_count;
      if (sortBy === "name") return a.full_name.localeCompare(b.full_name);
      return b.total_leads - a.total_leads;
    });

    return list;
  }, [internalData, searchQuery, workloadFilter, teamFilter, sortBy]);

  // Filtered & Sorted CRM Executives
  const filteredCrmExecutives = useMemo(() => {
    if (!crmData) return [];
    let list = [...crmData.executives];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.projects.some((p) => p.toLowerCase().includes(q))
      );
    }

    if (statusFilter !== "all") {
      list = list.filter(
        (e) =>
          (e.status_breakdown && (e.status_breakdown[statusFilter] || 0) > 0) ||
          e.lead_samples.some((l) => l.status === statusFilter)
      );
    }

    list.sort((a, b) => {
      if (sortBy === "hp") return b.hp_count - a.hp_count;
      if (sortBy === "p") return b.p_count - a.p_count;
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return b.total_leads - a.total_leads;
    });

    return list;
  }, [crmData, searchQuery, sortBy]);

  // Unique Teams for filter dropdown
  const uniqueTeams = useMemo(() => {
    if (!internalData) return [];
    const set = new Set<string>();
    internalData.employees.forEach((e) => {
      if (e.team_name) set.add(e.team_name);
    });
    return Array.from(set);
  }, [internalData]);

  // Export CSV Helper
  const handleExportCsv = () => {
    let csvContent = "";
    if (activeTab === "crm" && crmData) {
      csvContent = "Executive Name,High Potential (HP),Potential (P),Follow Up (FUP),Other Leads,Total Leads,Projects\n";
      filteredCrmExecutives.forEach((e) => {
        csvContent += `"${e.name}",${e.hp_count},${e.p_count},${e.fup_count},${e.other_count},${e.total_leads},"${e.projects.join("; ")}"\n`;
      });
    } else if (activeTab === "internal" && internalData) {
      csvContent = "Employee Name,Designation,Team,Director,High Potential (HP),Potential (P),Follow Up (FUP),Not Interested,Not Reached,Total Leads,Workload Status\n";
      filteredInternalEmployees.forEach((e) => {
        csvContent += `"${e.full_name}","${e.designation || ""}","${e.team_name || ""}","${e.director_name || ""}",${e.hp_count},${e.p_count},${e.fup_count},${e.ni_count},${e.nr_count},${e.total_leads},"${e.workload_level}"\n`;
      });
    }

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lead_pipeline_${activeTab}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filtered Leads inside Drawer
  const filteredDrawerLeads = useMemo(() => {
    if (!drawerSearch.trim()) return drawerLeads;
    const q = drawerSearch.toLowerCase().trim();
    return drawerLeads.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.phone.includes(q) ||
        (l.project && l.project.toLowerCase().includes(q)) ||
        l.status.toLowerCase().includes(q)
    );
  }, [drawerLeads, drawerSearch]);

  return (
    <DashboardLayout
      title="Lead Pipeline & Distribution"
      subtitle="Monitor employee-wise High Potential (HP), Potential (P) lead distribution, workload capacity, and unassigned lead queues."
      adminOnly
    >
      <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header with Title & Action Toolbar */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white flex items-center justify-center shadow-md">
                <GitFork className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                  <span>Lead Pipeline & Distribution</span>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Step 1: Check First
                  </span>
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Monitor employee-wise High Potential (HP), Potential (P) distribution, capacity, and unassigned queues.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadData(true)}
              loading={refreshing}
              disabled={loading}
              className="text-xs h-9 shadow-2xs"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", refreshing && "animate-spin")} />
              Sync Data
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={loading}
              className="text-xs h-9 shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export CSV
            </Button>

            {isAdmin && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setFromEmployeeId("");
                  setToEmployeeId("");
                  setTransferReason("");
                  setTransferSuccessMsg(null);
                  setTransferErrorMsg(null);
                  setTransferModalOpen(true);
                }}
                className="text-xs h-9 bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs flex items-center gap-1.5"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>Transfer Leads (Admin)</span>
              </Button>
            )}
          </div>
        </div>

        {/* View Switcher Tabs (CRM vs Sunset Telemarketing) */}
        <div className="flex items-center justify-between flex-wrap gap-3 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab("crm")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer",
                activeTab === "crm"
                  ? "bg-white text-indigo-700 shadow-sm border border-slate-200"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
              )}
            >
              <Database className="w-4 h-4 text-indigo-600" />
              <span>Somikoron CRM Pipeline</span>
              {crmData?.total_crm_leads && (
                <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-full font-mono">
                  {crmData.total_crm_leads.toLocaleString()}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("internal")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer",
                activeTab === "internal"
                  ? "bg-white text-emerald-800 shadow-sm border border-slate-200"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
              )}
            >
              <PhoneCall className="w-4 h-4 text-emerald-700" />
              <span>Sunset Calling Pipeline</span>
              {internalData?.overview && (
                <span className="text-[10px] bg-emerald-50 text-emerald-800 px-1.5 py-0.5 rounded-full font-mono">
                  {internalData.overview.total_leads.toLocaleString()}
                </span>
              )}
            </button>
          </div>

          <div className="text-[11px] text-slate-500 px-3 py-1 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              {activeTab === "crm"
                ? crmData?.fetched_at ? `Live CRM sync • ${crmData.fetched_at}` : "Connecting to CRM..."
                : "Internal Sunset telemarketing database"}
            </span>
          </div>
        </div>

        {/* KPI Cards Row */}
        {activeTab === "crm" ? (
          <>
            {/* CRM KPI Row */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
            <Card className="border-slate-200 shadow-2xs hover:shadow-md transition">
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                  <span>Total CRM Leads</span>
                  <Database className="w-4 h-4 text-slate-400" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-slate-900">
                    {crmData?.total_crm_leads?.toLocaleString() || "—"}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    ({crmData?.analyzed_count || 0} sampled)
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Across Somikoron CRM database</p>
              </CardContent>
            </Card>

            <Card className="border-amber-200 bg-gradient-to-br from-amber-50/50 to-white shadow-2xs hover:shadow-md transition">
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-amber-800 text-xs font-bold">
                  <span>High Potential (HP)</span>
                  <Flame className="w-4 h-4 text-amber-600" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-amber-950">
                    {crmData?.total_hp?.toLocaleString() || 0}
                  </span>
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
                    Top Priority
                  </span>
                </div>
                <p className="text-[11px] text-amber-700/80 mt-1">High conversion propensity</p>
              </CardContent>
            </Card>

            <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50/50 to-white shadow-2xs hover:shadow-md transition">
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-indigo-800 text-xs font-bold">
                  <span>Potential (P)</span>
                  <Target className="w-4 h-4 text-indigo-600" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-indigo-950">
                    {crmData?.total_p?.toLocaleString() || 0}
                  </span>
                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded-full">
                    Warm
                  </span>
                </div>
                <p className="text-[11px] text-indigo-700/80 mt-1">Active prospective buyers</p>
              </CardContent>
            </Card>

            <Card className="border-sky-200 bg-gradient-to-br from-sky-50/50 to-white shadow-2xs hover:shadow-md transition">
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-sky-800 text-xs font-bold">
                  <span>Follow Up (FUP)</span>
                  <Clock className="w-4 h-4 text-sky-600" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-sky-950">
                    {crmData?.total_fup?.toLocaleString() || 0}
                  </span>
                  <span className="text-[10px] font-bold text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded-full">
                    In Pipeline
                  </span>
                </div>
                <p className="text-[11px] text-sky-700/80 mt-1">Scheduled call-back leads</p>
              </CardContent>
            </Card>

            <Card
              onClick={() => handleInspectUnassigned("crm")}
              className="border-rose-200 bg-gradient-to-br from-rose-50 to-white shadow-2xs hover:shadow-md transition cursor-pointer group"
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-rose-800 text-xs font-bold">
                  <span>Unassigned Pool</span>
                  <AlertTriangle className="w-4 h-4 text-rose-600 group-hover:scale-110 transition" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-rose-950">
                    {crmData?.unassigned_count?.toLocaleString() || 0}
                  </span>
                  <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded-full">
                    Ready to Assign
                  </span>
                </div>
                <p className="text-[11px] text-rose-700/80 mt-1 flex items-center gap-1 group-hover:underline">
                  <span>Click to inspect pool</span>
                  <ChevronRight className="w-3 h-3" />
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Dynamic Pipeline Stages in Somikoron CRM */}
          {crmData?.status_counts && Object.keys(crmData.status_counts).length > 0 && (
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-bold text-slate-900">
                    All Pipeline Stages Found in CRM ({Object.keys(crmData.status_counts).length} stages):
                  </span>
                  <span className="text-[10px] text-slate-400">Click any stage badge to filter</span>
                </div>
                {statusFilter !== "all" && (
                  <button
                    type="button"
                    onClick={() => setStatusFilter("all")}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer"
                  >
                    Reset to all stages ({crmData.analyzed_count})
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs",
                    statusFilter === "all"
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  )}
                >
                  <span>All Stages</span>
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.2 rounded-full font-mono",
                      statusFilter === "all" ? "bg-white/25 text-white" : "bg-slate-200 text-slate-700"
                    )}
                  >
                    {crmData.analyzed_count.toLocaleString()}
                  </span>
                </button>

                {Object.entries(crmData.status_counts).map(([stName, count]) => {
                  const isSelected = statusFilter === stName;
                  const lower = stName.toLowerCase();
                  let badgeTheme = "bg-slate-100 text-slate-800 hover:bg-slate-200 border-slate-200";
                  if (lower.includes("high") || lower.includes("hp") || lower.includes("hot")) {
                    badgeTheme = isSelected
                      ? "bg-amber-600 text-white border-amber-600"
                      : "bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100";
                  } else if (
                    lower.includes("potential") ||
                    lower.includes("positive") ||
                    lower.includes("pos") ||
                    lower.includes("warm")
                  ) {
                    badgeTheme = isSelected
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-indigo-50 text-indigo-900 border-indigo-200 hover:bg-indigo-100";
                  } else if (lower.includes("follow") || lower.includes("fup") || lower.includes("fub")) {
                    badgeTheme = isSelected
                      ? "bg-sky-600 text-white border-sky-600"
                      : "bg-sky-50 text-sky-900 border-sky-200 hover:bg-sky-100";
                  } else if (isSelected) {
                    badgeTheme = "bg-indigo-600 text-white border-indigo-600";
                  }

                  return (
                    <button
                      key={stName}
                      type="button"
                      onClick={() => setStatusFilter(isSelected ? "all" : stName)}
                      className={cn(
                        "px-3 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 cursor-pointer shadow-2xs",
                        badgeTheme
                      )}
                    >
                      <span>{stName}</span>
                      <span
                        className={cn(
                          "text-[10px] px-1.5 py-0.2 rounded-full font-mono",
                          isSelected ? "bg-white/25 text-white" : "bg-black/5"
                        )}
                      >
                        {count.toLocaleString()}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
        ) : (
          /* Internal Calling KPI Row */
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
            <Card className="border-slate-200 shadow-2xs hover:shadow-md transition">
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                  <span>Total Calling Leads</span>
                  <PhoneCall className="w-4 h-4 text-slate-400" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-slate-900">
                    {internalData?.overview.total_leads.toLocaleString() || 0}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    ({internalData?.overview.total_executives || 0} team)
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Active telemarketing leads</p>
              </CardContent>
            </Card>

            <Card className="border-amber-200 bg-gradient-to-br from-amber-50/50 to-white shadow-2xs hover:shadow-md transition">
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-amber-800 text-xs font-bold">
                  <span>High Potential (HP)</span>
                  <Flame className="w-4 h-4 text-amber-600" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-amber-950">
                    {internalData?.overview.hp_count.toLocaleString() || 0}
                  </span>
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
                    Top Priority
                  </span>
                </div>
                <p className="text-[11px] text-amber-700/80 mt-1">High priority closures</p>
              </CardContent>
            </Card>

            <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50/50 to-white shadow-2xs hover:shadow-md transition">
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-indigo-800 text-xs font-bold">
                  <span>Potential (P)</span>
                  <Target className="w-4 h-4 text-indigo-600" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-indigo-950">
                    {internalData?.overview.p_count.toLocaleString() || 0}
                  </span>
                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded-full">
                    Warm
                  </span>
                </div>
                <p className="text-[11px] text-indigo-700/80 mt-1">Interested prospect pool</p>
              </CardContent>
            </Card>

            <Card className="border-sky-200 bg-gradient-to-br from-sky-50/50 to-white shadow-2xs hover:shadow-md transition">
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-sky-800 text-xs font-bold">
                  <span>Follow Up (FUP)</span>
                  <Clock className="w-4 h-4 text-sky-600" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-sky-950">
                    {internalData?.overview.fup_count.toLocaleString() || 0}
                  </span>
                  <span className="text-[10px] font-bold text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded-full">
                    Scheduled
                  </span>
                </div>
                <p className="text-[11px] text-sky-700/80 mt-1">Active follow-up queue</p>
              </CardContent>
            </Card>

            <Card
              onClick={() => handleInspectUnassigned("internal")}
              className="border-rose-200 bg-gradient-to-br from-rose-50 to-white shadow-2xs hover:shadow-md transition cursor-pointer group"
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-rose-800 text-xs font-bold">
                  <span>Unassigned Leads</span>
                  <AlertTriangle className="w-4 h-4 text-rose-600 group-hover:scale-110 transition" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-rose-950">
                    {internalData?.overview.unassigned_leads.toLocaleString() || 0}
                  </span>
                  <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded-full">
                    Ready to Assign
                  </span>
                </div>
                <p className="text-[11px] text-rose-700/80 mt-1 flex items-center gap-1 group-hover:underline">
                  <span>Click to inspect pool</span>
                  <ChevronRight className="w-3 h-3" />
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 2 Roadmap Banner */}
        <div className="bg-gradient-to-r from-indigo-50 via-sky-50 to-white border border-indigo-200/80 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-indigo-950 flex items-center gap-2">
                <span>Phase 1 Active: Visual Pipeline & Employee Workload Audit</span>
                <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                  Step 1 Complete
                </span>
              </p>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Review employee High Potential & Potential distribution below. When you are satisfied with the audit, we can activate <strong>Step 2: Auto-Assign Engine</strong> (Round-Robin & Workload-balanced lead routing).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end md:self-center shrink-0">
            <Link
              href="/calls"
              className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 px-3 py-1.5 rounded-lg hover:bg-indigo-100/60 transition flex items-center gap-1"
            >
              <span>Daily Call Board</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Search, Filter & Sort Controls */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-1 min-w-[240px] max-w-md">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={
                  activeTab === "crm"
                    ? "Search CRM executive name or project..."
                    : "Search employee name, team, designation..."
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-600"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {activeTab === "internal" && (
              <>
                {/* Workload Filter */}
                <div className="flex items-center gap-1 text-xs text-slate-600">
                  <span className="font-semibold text-slate-500">Workload:</span>
                  <select
                    value={workloadFilter}
                    onChange={(e) => setWorkloadFilter(e.target.value)}
                    className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
                  >
                    <option value="all">All Capacities</option>
                    <option value="available">Available (&lt; 30)</option>
                    <option value="optimal">Optimal (30 - 80)</option>
                    <option value="heavy">Heavy (80 - 150)</option>
                    <option value="overloaded">Overloaded (&gt; 150)</option>
                  </select>
                </div>

                {/* Team Filter */}
                {uniqueTeams.length > 0 && (
                  <div className="flex items-center gap-1 text-xs text-slate-600">
                    <span className="font-semibold text-slate-500">Team:</span>
                    <select
                      value={teamFilter}
                      onChange={(e) => setTeamFilter(e.target.value)}
                      className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600 max-w-[150px] truncate"
                    >
                      <option value="all">All Teams</option>
                      {uniqueTeams.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}

            {/* CRM Stage Filter */}
            {activeTab === "crm" && crmData?.statuses_found && crmData.statuses_found.length > 0 && (
              <div className="flex items-center gap-1 text-xs text-slate-600">
                <span className="font-semibold text-slate-500">Stage:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600 max-w-[170px] truncate"
                >
                  <option value="all">All Stages ({crmData.analyzed_count})</option>
                  {crmData.statuses_found.map((st) => (
                    <option key={st} value={st}>
                      {st} ({crmData.status_counts?.[st] || 0})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Sort Order */}
            <div className="flex items-center gap-1 text-xs text-slate-600">
              <span className="font-semibold text-slate-500">Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
              >
                <option value="total">Most Total Leads</option>
                <option value="hp">Most High Potential (HP)</option>
                <option value="p">Most Potential (P)</option>
                <option value="name">Name (A-Z)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-rose-500 hover:text-rose-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* TAB 1: Somikoron CRM Pipeline Table */}
        {activeTab === "crm" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-extrabold text-slate-900 tracking-tight">
                  Somikoron CRM — Employee Lead Breakdown
                </h2>
                <p className="text-[11px] text-slate-500">
                  Aggregated from external Somikoron CRM. Showing individual High Potential (HP), Potential (P), and project distribution.
                </p>
              </div>
              <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg font-mono">
                {filteredCrmExecutives.length} Executives
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4 w-12 text-center">#</th>
                    <th className="py-3 px-4 min-w-[200px]">Executive Name</th>
                    <th className="py-3 px-4 min-w-[130px] text-center bg-amber-50/60 text-amber-900">
                      High Potential (HP)
                    </th>
                    <th className="py-3 px-4 min-w-[120px] text-center bg-indigo-50/60 text-indigo-900">
                      Potential (P)
                    </th>
                    <th className="py-3 px-4 min-w-[120px] text-center">Follow Up (FUP)</th>
                    <th className="py-3 px-4 min-w-[200px]">Pipeline Stages Breakdown</th>
                    <th className="py-3 px-4 min-w-[120px] text-center font-extrabold">Total Leads</th>
                    <th className="py-3 px-4 min-w-[180px]">Assigned Projects</th>
                    <th className="py-3 px-4 w-28 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="py-16 text-center text-slate-400">
                        <RefreshCw className="w-6 h-6 mx-auto animate-spin mb-2 text-indigo-600" />
                        Connecting to Somikoron CRM and aggregating employee pipeline...
                      </td>
                    </tr>
                  ) : filteredCrmExecutives.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        No CRM executives found matching your criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredCrmExecutives.map((exec, idx) => {
                      const hpPercent = exec.total_leads ? Math.round((exec.hp_count / exec.total_leads) * 100) : 0;
                      return (
                        <tr
                          key={exec.name}
                          className="hover:bg-indigo-50/30 transition group"
                        >
                          <td className="py-3 px-4 text-center font-mono text-slate-400 text-[11px]">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-xs shrink-0">
                                {exec.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-bold text-slate-900 group-hover:text-indigo-600 transition">
                                  {exec.name}
                                </p>
                                <p className="text-[10px] text-slate-400 font-mono">
                                  Somikoron CRM Account
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* HP Count */}
                          <td className="py-3 px-4 text-center bg-amber-50/30 font-bold">
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-mono">
                              <Flame className="w-3 h-3 text-amber-600 fill-amber-500" />
                              <span>{exec.hp_count}</span>
                              <span className="text-[9px] text-amber-700 font-normal">
                                ({hpPercent}%)
                              </span>
                            </div>
                          </td>

                          {/* Potential Count */}
                          <td className="py-3 px-4 text-center bg-indigo-50/30 font-bold">
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-900 text-xs font-mono">
                              <Target className="w-3 h-3 text-indigo-600" />
                              <span>{exec.p_count}</span>
                            </div>
                          </td>

                          {/* Follow Up Count */}
                          <td className="py-3 px-4 text-center font-mono text-slate-700">
                            {exec.fup_count > 0 ? (
                              <span className="px-2 py-0.5 rounded bg-slate-100 font-semibold">
                                {exec.fup_count}
                              </span>
                            ) : (
                              <span className="text-slate-300">0</span>
                            )}
                          </td>

                          {/* Pipeline Stages Breakdown */}
                          <td className="py-3 px-4">
                            <div className="flex flex-wrap gap-1 max-w-[240px]">
                              {exec.status_breakdown && Object.keys(exec.status_breakdown).length > 0 ? (
                                Object.entries(exec.status_breakdown).map(([st, cnt]) => (
                                  <button
                                    key={st}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setStatusFilter(st);
                                    }}
                                    className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-800 border border-slate-200 transition cursor-pointer"
                                    title={`Filter by ${st}`}
                                  >
                                    {st}: <strong className="font-mono text-slate-900">{cnt}</strong>
                                  </button>
                                ))
                              ) : (
                                <span className="text-slate-400 text-[11px]">—</span>
                              )}
                            </div>
                          </td>

                          {/* Total Leads */}
                          <td className="py-3 px-4 text-center">
                            <span className="text-sm font-extrabold text-slate-900 font-mono">
                              {exec.total_leads}
                            </span>
                          </td>

                          {/* Projects */}
                          <td className="py-3 px-4">
                            <div className="flex flex-wrap gap-1 max-w-[240px]">
                              {exec.projects.length > 0 ? (
                                exec.projects.slice(0, 3).map((p) => (
                                  <span
                                    key={p}
                                    className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 truncate max-w-[140px]"
                                    title={p}
                                  >
                                    {p}
                                  </span>
                                ))
                              ) : (
                                <span className="text-slate-400 text-[11px]">—</span>
                              )}
                              {exec.projects.length > 3 && (
                                <span className="text-[9px] text-slate-400 self-center">
                                  +{exec.projects.length - 3} more
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-4 text-center">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleInspectCrmExecutive(exec)}
                              className="text-[11px] h-7 px-2.5 text-indigo-700 hover:text-indigo-900 hover:bg-indigo-50 border-indigo-200"
                            >
                              <span>Inspect Leads</span>
                              <ChevronRight className="w-3 h-3 ml-0.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: Sunset Telemarketing Database Pipeline Table */}
        {activeTab === "internal" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-extrabold text-slate-900 tracking-tight">
                  Sunset Telemarketing — Employee Lead Distribution
                </h2>
                <p className="text-[11px] text-slate-500">
                  Individual High Potential (HP), Potential (P), and capacity workload per sales employee.
                </p>
              </div>
              <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg font-mono">
                {filteredInternalEmployees.length} Registered Employees
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4 w-12 text-center">#</th>
                    <th className="py-3 px-4 min-w-[220px]">Employee / Executive</th>
                    <th className="py-3 px-4 min-w-[160px]">Team & Hierarchy</th>
                    <th className="py-3 px-4 min-w-[120px] text-center bg-amber-50/60 text-amber-900">
                      High Potential (HP)
                    </th>
                    <th className="py-3 px-4 min-w-[110px] text-center bg-indigo-50/60 text-indigo-900">
                      Potential (P)
                    </th>
                    <th className="py-3 px-4 min-w-[110px] text-center">Follow Up (FUP)</th>
                    <th className="py-3 px-4 min-w-[120px] text-center font-extrabold">Total Leads</th>
                    <th className="py-3 px-4 min-w-[150px] text-center">Workload Capacity</th>
                    <th className="py-3 px-4 w-36 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="py-16 text-center text-slate-400">
                        <RefreshCw className="w-6 h-6 mx-auto animate-spin mb-2 text-indigo-600" />
                        Loading employee pipeline metrics...
                      </td>
                    </tr>
                  ) : filteredInternalEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        No employees found matching your criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredInternalEmployees.map((emp, idx) => {
                      // Workload styling badge
                      let workloadBadge = (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          Available (&lt;30)
                        </span>
                      );
                      if (emp.workload_level === "optimal") {
                        workloadBadge = (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
                            Optimal (30-80)
                          </span>
                        );
                      } else if (emp.workload_level === "heavy") {
                        workloadBadge = (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            Heavy (80-150)
                          </span>
                        );
                      } else if (emp.workload_level === "overloaded") {
                        workloadBadge = (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                            Overloaded (&gt;150)
                          </span>
                        );
                      }

                      return (
                        <tr
                          key={emp.id}
                          className="hover:bg-slate-50/80 transition group"
                        >
                          <td className="py-3 px-4 text-center font-mono text-slate-400 text-[11px]">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-xs shrink-0">
                                {emp.full_name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-bold text-slate-900 group-hover:text-emerald-800 transition">
                                  {emp.full_name}
                                </p>
                                <p className="text-[10px] text-slate-400">
                                  {emp.designation || emp.role} • @{emp.username}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Team & Hierarchy */}
                          <td className="py-3 px-4">
                            <p className="font-semibold text-slate-800">
                              {emp.team_name || "Unassigned Team"}
                            </p>
                            {emp.director_name && (
                              <p className="text-[10px] text-slate-400">
                                Dir: {emp.director_name}
                              </p>
                            )}
                          </td>

                          {/* HP Count */}
                          <td className="py-3 px-4 text-center bg-amber-50/30 font-bold">
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-mono">
                              <Flame className="w-3 h-3 text-amber-600 fill-amber-500" />
                              <span>{emp.hp_count}</span>
                            </div>
                          </td>

                          {/* Potential Count */}
                          <td className="py-3 px-4 text-center bg-indigo-50/30 font-bold">
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-900 text-xs font-mono">
                              <Target className="w-3 h-3 text-indigo-600" />
                              <span>{emp.p_count}</span>
                            </div>
                          </td>

                          {/* Follow Up Count */}
                          <td className="py-3 px-4 text-center font-mono text-slate-700">
                            {emp.fup_count > 0 ? (
                              <span className="px-2 py-0.5 rounded bg-slate-100 font-semibold">
                                {emp.fup_count}
                              </span>
                            ) : (
                              <span className="text-slate-300">0</span>
                            )}
                          </td>

                          {/* Total Leads */}
                          <td className="py-3 px-4 text-center font-extrabold text-slate-900 font-mono text-sm">
                            {emp.total_leads}
                          </td>

                          {/* Workload */}
                          <td className="py-3 px-4 text-center">
                            {workloadBadge}
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleInspectInternalEmployee(emp)}
                                className="text-[11px] h-7 px-2 text-slate-700 hover:text-slate-900"
                                title="Inspect leads"
                              >
                                View Leads
                              </Button>

                              {isAdmin && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenTransferFor(emp.id)}
                                  className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition"
                                  title="Transfer leads from this employee"
                                >
                                  <ArrowRightLeft className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Lead Inspection Slide-Over Drawer */}
        {drawerOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden animate-in fade-in duration-200">
            <div
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
              onClick={() => setDrawerOpen(false)}
            />

            <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
              <div className="w-screen max-w-xl bg-white shadow-2xl flex flex-col">
                {/* Drawer Header */}
                <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold tracking-tight flex items-center gap-2">
                      <span>{drawerTitle}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/20 text-white">
                        {drawerLeads.length} Leads
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-300 mt-0.5">
                      {drawerSubtitle}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(false)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Drawer Search & Filter */}
                <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search within these leads (name, phone, stage)..."
                      value={drawerSearch}
                      onChange={(e) => setDrawerSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-600"
                    />
                  </div>
                </div>

                {/* Drawer Leads List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                  {drawerLoading ? (
                    <div className="py-16 text-center text-slate-400">
                      <RefreshCw className="w-6 h-6 mx-auto animate-spin mb-2 text-indigo-600" />
                      Loading leads...
                    </div>
                  ) : filteredDrawerLeads.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-xs">
                      No leads found in this view.
                    </div>
                  ) : (
                    filteredDrawerLeads.map((lead) => {
                      const st = lead.status.toLowerCase();
                      let statusBadge = (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          {lead.status}
                        </span>
                      );
                      if (st.includes("high") || st === "hp") {
                        statusBadge = (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200 flex items-center gap-1">
                            <Flame className="w-3 h-3 text-amber-600" />
                            <span>HP</span>
                          </span>
                        );
                      } else if (st.includes("potential") || st === "p") {
                        statusBadge = (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-900 border border-indigo-200">
                            Potential
                          </span>
                        );
                      } else if (st.includes("follow") || st === "fup") {
                        statusBadge = (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-900 border border-sky-200">
                            Follow Up
                          </span>
                        );
                      }

                      return (
                        <div
                          key={lead.id}
                          className="p-3 bg-white border border-slate-200 rounded-xl hover:border-indigo-300 transition shadow-2xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="font-bold text-slate-900 text-xs">
                                  {lead.name}
                                </p>
                                {lead.badge && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                                    {lead.badge}
                                  </span>
                                )}
                                {lead.lead_cat_id && (
                                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                    Cat #{lead.lead_cat_id}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                                <span className="font-mono flex items-center gap-1">
                                  <Phone className="w-3 h-3 text-slate-400" />
                                  <span>{lead.phone}</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyPhone(lead.phone)}
                                  className="text-slate-400 hover:text-indigo-600 transition"
                                  title="Copy phone"
                                >
                                  {copiedPhone === lead.phone ? (
                                    <Check className="w-3 h-3 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {statusBadge}
                              {lead.crm_link && (
                                <a
                                  href={lead.crm_link}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                                  title="Open in Somikoron CRM"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </div>

                          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                            <span className="flex items-center gap-1">
                              <Building className="w-3 h-3 text-slate-400" />
                              <span>{lead.project || "No project"}</span>
                            </span>
                            {lead.created_at && (
                              <span>Added: {lead.created_at}</span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Drawer Footer */}
                <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
                  <span>Showing {filteredDrawerLeads.length} leads</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDrawerOpen(false)}
                    className="text-xs h-8"
                  >
                    Close
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Lead Transfer Modal */}
        {transferModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
              <div className="px-5 py-4 bg-indigo-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-indigo-300" />
                  <h3 className="text-sm font-bold tracking-tight">
                    Lead Transfer & Handover (Admin)
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setTransferModalOpen(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleExecuteTransfer} className="p-5 space-y-4">
                <p className="text-xs text-slate-500">
                  Transfer active leads between employees due to role switch, resignation, or workload rebalancing. All activity logs are preserved.
                </p>

                {transferSuccessMsg && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2 font-medium">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{transferSuccessMsg}</span>
                  </div>
                )}

                {transferErrorMsg && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2 font-medium">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{transferErrorMsg}</span>
                  </div>
                )}

                {/* Source Employee */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    From Employee (Source):
                  </label>
                  <select
                    value={fromEmployeeId}
                    onChange={(e) => setFromEmployeeId(Number(e.target.value) || "")}
                    required
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
                  >
                    <option value="">Select source employee...</option>
                    {internalData?.employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.full_name} ({e.total_leads} leads — {e.hp_count} HP, {e.p_count} P)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Destination Employee */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    To Employee (Recipient):
                  </label>
                  <select
                    value={toEmployeeId}
                    onChange={(e) => setToEmployeeId(Number(e.target.value) || "")}
                    required
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
                  >
                    <option value="">Select recipient employee...</option>
                    {internalData?.employees
                      .filter((e) => e.id !== Number(fromEmployeeId))
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.full_name} (Current: {e.total_leads} leads • {e.workload_level})
                        </option>
                      ))}
                  </select>
                </div>

                {/* Lead Stages to Transfer */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Include Lead Stages:
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {[
                      { key: "hp", label: "High Potential (HP)" },
                      { key: "p", label: "Potential (P)" },
                      { key: "fup", label: "Follow Up (FUP)" },
                      { key: "ni", label: "Not Interested" },
                    ].map((st) => {
                      const checked = transferStatuses.includes(st.key);
                      return (
                        <label
                          key={st.key}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-semibold cursor-pointer transition select-none",
                            checked
                              ? "bg-indigo-50 border-indigo-300 text-indigo-900"
                              : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setTransferStatuses([...transferStatuses, st.key]);
                              } else {
                                setTransferStatuses(transferStatuses.filter((s) => s !== st.key));
                              }
                            }}
                            className="hidden"
                          />
                          <span>{st.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Transfer Reason */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Transfer Reason / Handover Note:
                  </label>
                  <input
                    type="text"
                    value={transferReason}
                    onChange={(e) => setTransferReason(e.target.value)}
                    placeholder="e.g. Employee resignation / workload balancing"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setTransferModalOpen(false)}
                    disabled={transferSubmitting}
                    className="text-xs h-9"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    loading={transferSubmitting}
                    disabled={!fromEmployeeId || !toEmployeeId || transferSubmitting}
                    className="text-xs h-9 bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    Execute Lead Transfer
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
