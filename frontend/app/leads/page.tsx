"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Database,
  Search,
  RefreshCw,
  Download,
  Phone,
  Mail,
  Building,
  User,
  Calendar,
  ShieldAlert,
  AlertCircle,
  ExternalLink,
  Tag,
  CheckCircle2,
  Clock,
  Eye,
  X,
  FileSpreadsheet,
  Terminal,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, Button, Modal } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

interface CrmLead {
  id: string | number;
  lead_code?: string;
  name: string;
  phone: string;
  email: string;
  project: string;
  status: string;
  source: string;
  assigned_to: string;
  created_at: string;
  address?: string;
  organization?: string;
  profession?: string;
  notes?: string;
  badge?: string;
  crm_link?: string;
  raw?: Record<string, any>;
}

export default function CrmLeadsPage() {
  const { user, isAdmin, isSubAdmin, loading: authLoading } = useAuth();

  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [recordsTotal, setRecordsTotal] = useState<number | null>(null);
  const [recordsFiltered, setRecordsFiltered] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [crmStatus, setCrmStatus] = useState<any>(null);

  // Filters, Search & Pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [orderDir, setOrderDir] = useState<"desc" | "asc">("desc");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(100);
  const [totalPages, setTotalPages] = useState(1);

  // Lead Detail Modal
  const [selectedLead, setSelectedLead] = useState<CrmLead | null>(null);

  // Diagnostic state
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const runDiagnostics = async () => {
    setDebugLoading(true);
    try {
      const data = await api.crm.getDebug();
      setDebugInfo(data);
      setShowDebug(true);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : "Failed to run diagnostics";
      setDebugInfo({ error: msg });
      setShowDebug(true);
    } finally {
      setDebugLoading(false);
    }
  };

  // Load CRM Status and Leads
  const loadLeads = useCallback(
    async (
      forceRefresh = false,
      targetPage = page,
      targetPerPage = perPage,
      targetQuery = searchQuery,
      targetStatus = statusFilter,
      targetOrderDir = orderDir
    ) => {
      try {
        if (forceRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);

        // Check CRM status first
        try {
          const st = await api.crm.getStatus();
          setCrmStatus(st);
        } catch {
          // ignore
        }

        const res = await api.crm.getLeads({
          force_refresh: forceRefresh,
          page: targetPage,
          per_page: targetPerPage,
          query: targetQuery || undefined,
          status: targetStatus !== "all" ? targetStatus : undefined,
          from_date: "1971-01-01",
          active_status: "Active",
          order_dir: targetOrderDir,
        });

        if (!res.success) {
          setError(res.error || "Failed to load CRM leads.");
          setLeads([]);
        } else {
          setLeads(res.leads || []);
          if (res.records_total !== undefined) setRecordsTotal(res.records_total ?? null);
          if (res.records_filtered !== undefined) setRecordsFiltered(res.records_filtered ?? null);
          if (res.page !== undefined) setPage(res.page);
          if (res.per_page !== undefined) setPerPage(res.per_page);
          if (res.total_pages !== undefined) setTotalPages(res.total_pages);
          setFetchedAt(res.fetched_at || null);
          setFromCache(res.from_cache ?? false);
        }
      } catch (err: unknown) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("Unable to connect to the backend CRM service.");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page, perPage, searchQuery, statusFilter, orderDir]
  );

  useEffect(() => {
    if (authLoading) return;
    if (isAdmin || isSubAdmin) {
      loadLeads();
    }
  }, [authLoading, isAdmin, isSubAdmin, loadLeads]);

  // Extract unique statuses and projects for filter dropdowns
  const availableStatuses = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((l) => {
      if (l.status && l.status !== "—") set.add(l.status);
    });
    return Array.from(set);
  }, [leads]);

  const availableProjects = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((l) => {
      if (l.project && l.project !== "—") set.add(l.project);
    });
    return Array.from(set);
  }, [leads]);

  // Filtered Leads
  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return leads.filter((lead) => {
      // Search matching
      const matchesSearch =
        !q ||
        lead.name.toLowerCase().includes(q) ||
        lead.phone.toLowerCase().includes(q) ||
        lead.email.toLowerCase().includes(q) ||
        lead.project.toLowerCase().includes(q) ||
        lead.assigned_to.toLowerCase().includes(q) ||
        lead.source.toLowerCase().includes(q) ||
        (lead.address && lead.address.toLowerCase().includes(q));

      // Status matching
      const matchesStatus =
        statusFilter === "all" ||
        lead.status.toLowerCase() === statusFilter.toLowerCase();

      // Project matching
      const matchesProject =
        projectFilter === "all" ||
        lead.project.toLowerCase() === projectFilter.toLowerCase();

      return matchesSearch && matchesStatus && matchesProject;
    });
  }, [leads, searchQuery, statusFilter, projectFilter]);

  // CSV Export handler
  const handleExportCsv = () => {
    if (filteredLeads.length === 0) return;

    const headers = [
      "ID",
      "Customer Name",
      "Phone",
      "Email",
      "Project / Product",
      "Status",
      "Source",
      "Assigned Executive",
      "Created Date",
      "Address",
      "Profession",
      "Notes",
    ];

    const rows = filteredLeads.map((l) => [
      `"${l.id}"`,
      `"${(l.name || "").replace(/"/g, '""')}"`,
      `"${(l.phone || "").replace(/"/g, '""')}"`,
      `"${(l.email || "").replace(/"/g, '""')}"`,
      `"${(l.project || "").replace(/"/g, '""')}"`,
      `"${(l.status || "").replace(/"/g, '""')}"`,
      `"${(l.source || "").replace(/"/g, '""')}"`,
      `"${(l.assigned_to || "").replace(/"/g, '""')}"`,
      `"${(l.created_at || "").replace(/"/g, '""')}"`,
      `"${(l.address || "").replace(/"/g, '""')}"`,
      `"${(l.profession || "").replace(/"/g, '""')}"`,
      `"${(l.notes || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const todayStr = new Date().toISOString().split("T")[0];
    link.setAttribute("href", url);
    link.setAttribute("download", `crm_leads_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper for Status Badge Color
  const getStatusBadge = (status: string) => {
    const s = (status || "").toLowerCase();
    if (s.includes("high") || s.includes("hp")) {
      return "bg-rose-50 text-rose-700 border-rose-200";
    }
    if (s.includes("potential") || s.includes("warm") || s.includes("pos")) {
      return "bg-amber-50 text-amber-800 border-amber-200";
    }
    if (s.includes("sold") || s.includes("booking") || s.includes("won") || s.includes("confirm")) {
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    }
    if (s.includes("new") || s.includes("fresh")) {
      return "bg-sky-50 text-sky-700 border-sky-200";
    }
    if (s.includes("follow") || s.includes("fub")) {
      return "bg-indigo-50 text-indigo-700 border-indigo-200";
    }
    if (s.includes("lost") || s.includes("not") || s.includes("ni") || s.includes("drop")) {
      return "bg-slate-100 text-slate-600 border-slate-200";
    }
    return "bg-slate-50 text-slate-700 border-slate-200";
  };

  // Access check
  if (!authLoading && !isAdmin && !isSubAdmin) {
    return (
      <DashboardLayout title="CRM Leads" subtitle="Access Restricted">
        <div className="max-w-md mx-auto my-12 p-6 bg-white border border-rose-200 rounded-2xl text-center shadow-sm">
          <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-800">Administrator Access Required</h2>
          <p className="text-xs text-slate-500 mt-1">
            CRM Leads contain sensitive prospective client data and can only be accessed by Administrators.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition"
          >
            Back to Dashboard
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="CRM Lead Directory"
      subtitle="Live prospect leads feed from Somikoron CRM (sunset.somikoronitltd.com)"
    >
      <div className="space-y-4 max-w-7xl mx-auto pb-16">
        {/* Top Header Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center justify-center shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900">Somikoron CRM Leads</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                  {recordsTotal ? `${recordsTotal.toLocaleString()} In CRM Database` : `${leads.length} Leads`}
                </span>
                {recordsTotal && recordsTotal > leads.length && (
                  <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    {leads.length} active pipeline leads loaded
                  </span>
                )}
                {fromCache && (
                  <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    Cached
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span>Source:</span>
                <a
                  href="https://sunset.somikoronitltd.com/crm-module/lead_data"
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-indigo-600 hover:underline flex items-center gap-0.5"
                >
                  <span>sunset.somikoronitltd.com</span>
                  <ExternalLink className="w-3 h-3 inline" />
                </a>
                {fetchedAt && (
                  <span className="text-[11px] text-slate-400">
                    • Last updated: {fetchedAt}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadLeads(true)}
              loading={refreshing}
              disabled={loading}
              className="text-xs h-8 shadow-2xs"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1 text-slate-600" />
              Sync Now
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={handleExportCsv}
              disabled={filteredLeads.length === 0}
              className="text-xs h-8 bg-emerald-700 hover:bg-emerald-800 text-white shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 mr-1" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Configuration Setup Warning / Error Notice */}
        {error && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-900 space-y-3 shadow-2xs">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 text-xs space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="font-bold text-amber-950 text-sm">CRM Connection Notice</h4>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={runDiagnostics}
                      loading={debugLoading}
                      className="text-[11px] h-7 bg-white text-slate-700 hover:bg-slate-50 border-amber-300"
                    >
                      <Terminal className="w-3.5 h-3.5 mr-1 text-slate-500" />
                      Run Diagnostic Probe
                    </Button>
                    {debugInfo && (
                      <button
                        onClick={() => setShowDebug(!showDebug)}
                        className="text-[11px] text-amber-800 font-semibold hover:underline flex items-center gap-0.5"
                      >
                        {showDebug ? "Hide Details" : "Show Details"}
                        {showDebug ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                </div>

                <p className="leading-relaxed text-amber-800 font-medium">{error}</p>

                {error.includes("401") && (
                  <div className="p-3 bg-white/90 rounded-xl border border-amber-200/80 text-[11px] text-slate-700 space-y-1.5">
                    <p className="font-bold text-amber-950">💡 What does 401 Unauthorized mean?</p>
                    <p>
                      The CRM server (<code className="font-mono bg-slate-100 px-1 py-0.5 rounded">sunset.somikoronitltd.com</code>)
                      received our request, but <strong>refused to deliver the lead data because it does not recognize an active authenticated session</strong>.
                    </p>
                    <ul className="list-disc pl-4 space-y-0.5 text-slate-600">
                      <li>The CRM login form might be at a different URL (e.g. <code className="font-mono bg-slate-100 px-1 rounded">/admin/login</code> or root <code className="font-mono bg-slate-100 px-1 rounded">/</code> rather than <code className="font-mono bg-slate-100 px-1 rounded">/login</code>).</li>
                      <li>The CRM form might expect the input field name <code className="font-mono bg-slate-100 px-1 rounded">username</code> instead of <code className="font-mono bg-slate-100 px-1 rounded">email</code>.</li>
                      <li>Check your browser address bar when you log in manually to see the exact login URL.</li>
                    </ul>
                  </div>
                )}

                {/* Diagnostic Details Accordion */}
                {showDebug && debugInfo && (
                  <div className="mt-3 p-3.5 bg-slate-900 text-slate-200 rounded-xl font-mono text-[11px] space-y-2 border border-slate-800 overflow-x-auto">
                    <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-1.5 font-sans font-semibold text-xs">
                      <span>Live Diagnostic Probe Results</span>
                      <span>Configured: {debugInfo.configured ? "Yes" : "No"}</span>
                    </div>
                    <div className="text-[10px] space-y-0.5 text-slate-400">
                      <div>Base URL: {debugInfo.base_url}</div>
                      <div>Login URL: {debugInfo.login_url}</div>
                      <div>Leads URL: {debugInfo.leads_url}</div>
                      <div>User: {debugInfo.username} | Has Password: {debugInfo.has_password ? "Yes" : "No"}</div>
                    </div>
                    {debugInfo.steps && (
                      <div className="space-y-1.5 pt-1">
                        {debugInfo.steps.map((st: any, i: number) => (
                          <div key={i} className="p-2.5 rounded bg-slate-800/80 border border-slate-700/60 space-y-1">
                            <div className="font-bold text-amber-400 flex items-center justify-between">
                              <span>{st.step}</span>
                              {st.status_code && (
                                <span className={st.status_code === 200 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                                  HTTP {st.status_code}
                                </span>
                              )}
                            </div>
                            {st.error && <div className="text-rose-300 text-[10px] font-semibold">Error: {st.error}</div>}
                            {st.form_action && <div className="text-slate-400 text-[10px]">Form Action: {st.form_action}</div>}
                            {st.inputs_found && st.inputs_found.length > 0 && (
                              <div className="text-slate-400 text-[10px]">Inputs Found: {st.inputs_found.join(", ")}</div>
                            )}
                            {st.results && (
                              <div className="space-y-1 pt-1">
                                <div className="text-amber-300 font-bold text-[10px]">Parameter / Endpoint Tests:</div>
                                {st.results.map((r: any, rIdx: number) => (
                                  <div key={rIdx} className="text-[10px] bg-slate-900/60 p-1.5 rounded flex items-center justify-between">
                                    <span className="text-slate-300">{r.test || r.endpoint}:</span>
                                    {r.recordsFiltered || r.recordsTotal ? (
                                      <span className="text-emerald-400 font-bold">
                                        Total: {r.recordsTotal ?? "—"} | Filtered: {r.recordsFiltered ?? "—"} | Items: {r.returned ?? r.count ?? 0}
                                      </span>
                                    ) : (
                                      <span className="text-rose-400">{r.error || (r.status ? `HTTP ${r.status}` : "0 returned")}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                            {st.script_datatable_urls && st.script_datatable_urls.length > 0 && (
                              <div className="text-indigo-300 text-[10px] break-all">
                                Scripts DataTables URLs: {st.script_datatable_urls.join(", ")}
                              </div>
                            )}
                            {st.detected_ajax_urls && st.detected_ajax_urls.length > 0 && (
                              <div className="text-sky-300 text-[10px] break-all">
                                Detected AJAX endpoints: {st.detected_ajax_urls.join(", ")}
                              </div>
                            )}
                            {st.ajax_recordsTotal !== undefined && st.ajax_recordsTotal !== null && (
                              <div className="text-emerald-300 font-bold text-[10px]">
                                add-lead-account AJAX recordsTotal: {st.ajax_recordsTotal} | count: {st.ajax_data_count}
                              </div>
                            )}
                            {st.result && (
                              <div className="text-slate-300 text-[10px] space-y-0.5">
                                <div>Status: {st.result.status_code} | Landed on: {st.result.final_url}</div>
                                <div>Cookies: {st.result.cookies?.join(", ") || "None"}</div>
                                {st.result.detected_error && (
                                  <div className="text-rose-300 font-bold bg-rose-950/40 p-1 rounded border border-rose-800/50 mt-1">
                                    CRM Error: {st.result.detected_error}
                                  </div>
                                )}
                              </div>
                            )}
                            {st.snippet && (
                              <div className="text-slate-400 text-[9px] font-mono break-all bg-slate-950/60 p-1.5 rounded border border-slate-800">
                                {st.snippet}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {crmStatus && !crmStatus.username_configured && (
                  <div className="mt-3 p-3 bg-white/80 rounded-xl border border-amber-300 text-[11px] font-mono space-y-1">
                    <p className="font-sans font-bold text-slate-800">
                      To connect your Somikoron CRM, add these credentials in your VPS <code className="text-rose-700 bg-slate-100 px-1 py-0.5 rounded">backend/.env</code>:
                    </p>
                    <p className="text-slate-700">CRM_BASE_URL=https://sunset.somikoronitltd.com</p>
                    <p className="text-slate-700">CRM_LOGIN_URL=https://sunset.somikoronitltd.com/login</p>
                    <p className="text-slate-700">CRM_LEADS_URL=https://sunset.somikoronitltd.com/crm-module/lead_data</p>
                    <p className="text-emerald-800 font-bold">CRM_USERNAME=your_crm_login_email_or_username</p>
                    <p className="text-emerald-800 font-bold">CRM_PASSWORD=your_crm_password</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Summary KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total in CRM</p>
            <p className="text-xl font-bold text-slate-900 mt-0.5">
              {recordsTotal ? recordsTotal.toLocaleString() : leads.length}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {recordsTotal ? `${leads.length} loaded in active pipeline` : "Fetched from CRM"}
            </p>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Filtered Results</p>
            <p className="text-xl font-bold text-indigo-700 mt-0.5">{filteredLeads.length}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Matching current view</p>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Projects</p>
            <p className="text-xl font-bold text-emerald-700 mt-0.5">{availableProjects.length}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Active real estate projects</p>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Lead Stages</p>
            <p className="text-xl font-bold text-amber-700 mt-0.5">{availableStatuses.length}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Different pipeline stages</p>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by client name, phone, email, project, or executive..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 bg-white"
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

          <div className="flex items-center gap-2 flex-wrap">
            {/* Status Filter */}
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="font-semibold text-slate-500">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
              >
                <option value="all">All Stages ({leads.length})</option>
                {availableStatuses.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            {/* Project Filter */}
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="font-semibold text-slate-500">Project:</span>
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600 max-w-[180px] truncate"
              >
                <option value="all">All Projects</option>
                {availableProjects.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort Order */}
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="font-semibold text-slate-500">Sort:</span>
              <select
                value={orderDir}
                onChange={(e) => {
                  const newDir = e.target.value as "desc" | "asc";
                  setOrderDir(newDir);
                  loadLeads(true, 1, perPage, searchQuery, statusFilter, newDir);
                }}
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
              >
                <option value="desc">Newest First (Desc)</option>
                <option value="asc">Oldest First (Asc)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Leads Data Table (Desktop) */}
        <div className="hidden lg:block bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-3 w-12 text-center">#</th>
                  <th className="py-3 px-3 min-w-[180px]">Customer Name</th>
                  <th className="py-3 px-3 min-w-[130px]">Phone Number</th>
                  <th className="py-3 px-3 min-w-[160px]">Project</th>
                  <th className="py-3 px-3 min-w-[110px] text-center">Status</th>
                  <th className="py-3 px-3 min-w-[110px]">Source</th>
                  <th className="py-3 px-3 min-w-[130px]">Assigned To</th>
                  <th className="py-3 px-3 min-w-[100px]">Date</th>
                  <th className="py-3 px-3 w-16 text-center">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-16 text-center text-slate-400">
                      <RefreshCw className="w-6 h-6 mx-auto animate-spin mb-2 text-indigo-600" />
                      Loading CRM leads...
                    </td>
                  </tr>
                ) : filteredLeads.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-16 text-center text-slate-400">
                      No matching leads found.
                    </td>
                  </tr>
                ) : (
                  filteredLeads.map((lead, idx) => (
                    <tr
                      key={lead.id || idx}
                      className="hover:bg-slate-50/80 transition cursor-pointer"
                      onClick={() => setSelectedLead(lead)}
                    >
                      <td className="py-3 px-3 text-center text-slate-400 font-mono text-[11px]">
                        {(page - 1) * perPage + idx + 1}
                      </td>

                      {/* Customer Name */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-900">{lead.name}</span>
                          {lead.badge && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                              {lead.badge}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                          {lead.lead_code && (
                            <span className="font-mono text-slate-500 font-semibold">{lead.lead_code}</span>
                          )}
                          {lead.email && lead.email !== "—" && (
                            <span className="truncate max-w-[150px]">{lead.email}</span>
                          )}
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="py-3 px-3">
                        {lead.phone && lead.phone !== "—" ? (
                          <a
                            href={`tel:${lead.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-mono text-emerald-700 hover:underline inline-flex items-center gap-1 font-semibold"
                          >
                            <Phone className="w-3 h-3 text-emerald-600" />
                            <span>{lead.phone}</span>
                          </a>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Project */}
                      <td className="py-3 px-3">
                        <span className="font-medium text-slate-800 line-clamp-1">
                          {lead.project}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 text-center">
                        <span
                          className={cn(
                            "inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border",
                            getStatusBadge(lead.status)
                          )}
                        >
                          {lead.status}
                        </span>
                      </td>

                      {/* Source */}
                      <td className="py-3 px-3 text-slate-600">
                        <span className="text-[11px] truncate max-w-[100px] inline-block">
                          {lead.source}
                        </span>
                      </td>

                      {/* Assigned Executive */}
                      <td className="py-3 px-3 text-slate-700 font-medium">
                        <span className="truncate max-w-[120px] inline-block">
                          {lead.assigned_to}
                        </span>
                      </td>

                      {/* Created Date */}
                      <td className="py-3 px-3 text-slate-500 font-mono text-[10.5px]">
                        {lead.created_at}
                      </td>

                      {/* View Action */}
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLead(lead);
                            }}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                            title="View lead details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {lead.crm_link && (
                            <a
                              href={lead.crm_link}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                              title="Open in Somikoron CRM"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile Cards View */}
        <div className="lg:hidden space-y-2.5">
          {loading ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
              <RefreshCw className="w-6 h-6 mx-auto animate-spin mb-2 text-indigo-600" />
              Loading CRM leads...
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
              No matching leads found.
            </div>
          ) : (
            filteredLeads.map((lead, idx) => (
              <div
                key={lead.id || idx}
                onClick={() => setSelectedLead(lead)}
                className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs space-y-2 active:bg-slate-50 transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                        #{(page - 1) * perPage + idx + 1}
                      </span>
                      <h4 className="text-xs font-bold text-slate-900 truncate">{lead.name}</h4>
                      {lead.badge && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {lead.badge}
                        </span>
                      )}
                    </div>
                    {lead.lead_code && (
                      <p className="text-[10px] font-mono text-slate-500 font-semibold">{lead.lead_code}</p>
                    )}
                    {lead.project && lead.project !== "—" && (
                      <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5 truncate">
                        <Building className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{lead.project}</span>
                      </p>
                    )}
                  </div>
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0",
                      getStatusBadge(lead.status)
                    )}
                  >
                    {lead.status}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                  {lead.phone && lead.phone !== "—" ? (
                    <a
                      href={`tel:${lead.phone}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-mono text-emerald-700 font-bold inline-flex items-center gap-1 text-[11px]"
                    >
                      <Phone className="w-3 h-3 text-emerald-600" />
                      <span>{lead.phone}</span>
                    </a>
                  ) : (
                    <span className="text-slate-400 text-[11px]">No Phone</span>
                  )}

                  <span className="text-[10px] text-slate-400 font-mono">
                    {lead.created_at}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination Toolbar */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-1.5">
            <span>
              Showing{" "}
              <strong className="text-slate-900 font-bold">
                {leads.length > 0 ? (page - 1) * perPage + 1 : 0}
              </strong>{" "}
              to{" "}
              <strong className="text-slate-900 font-bold">
                {Math.min(page * perPage, recordsFiltered || recordsTotal || (page - 1) * perPage + leads.length)}
              </strong>{" "}
              of{" "}
              <strong className="text-indigo-700 font-bold">
                {(recordsFiltered || recordsTotal || leads.length).toLocaleString()}
              </strong>{" "}
              entries
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span>Show</span>
              <select
                value={perPage}
                onChange={(e) => {
                  const newPer = Number(e.target.value);
                  setPerPage(newPer);
                  setPage(1);
                  loadLeads(false, 1, newPer);
                }}
                className="border border-slate-200 rounded px-2 py-1 text-xs font-semibold bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-600"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
                <option value={500}>500</option>
              </select>
              <span>per page</span>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newP = Math.max(1, page - 1);
                  setPage(newP);
                  loadLeads(false, newP);
                }}
                disabled={page <= 1 || loading}
                className="h-7 w-7 p-0 flex items-center justify-center text-slate-600"
                title="Previous page"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <div className="flex items-center gap-1 px-1 font-semibold text-slate-700 text-xs">
                <span>Page</span>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, totalPages)}
                  value={page}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (val >= 1 && val <= totalPages) {
                      setPage(val);
                      loadLeads(false, val);
                    }
                  }}
                  className="w-12 text-center py-0.5 border border-slate-200 rounded font-bold text-indigo-700 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
                />
                <span>of {Math.max(1, totalPages)}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newP = Math.min(totalPages, page + 1);
                  setPage(newP);
                  loadLeads(false, newP);
                }}
                disabled={page >= totalPages || loading}
                className="h-7 w-7 p-0 flex items-center justify-center text-slate-600"
                title="Next page"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Lead Detail Modal */}
        <Modal
          isOpen={!!selectedLead}
          onClose={() => setSelectedLead(null)}
          title={selectedLead?.name || "Lead Details"}
          description={
            selectedLead?.lead_code
              ? `ID: ${selectedLead.lead_code} • Somikoron CRM Record`
              : `ID: #${selectedLead?.id} • Somikoron CRM Record`
          }
        >
          {selectedLead && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Phone Number
                  </label>
                  {selectedLead.phone && selectedLead.phone !== "—" ? (
                    <a
                      href={`tel:${selectedLead.phone}`}
                      className="text-sm font-bold font-mono text-emerald-700 hover:underline flex items-center gap-1 mt-0.5"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{selectedLead.phone}</span>
                    </a>
                  ) : (
                    <p className="text-slate-500 font-medium">—</p>
                  )}
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Email Address
                  </label>
                  <p className="text-slate-800 font-medium mt-0.5 truncate">
                    {selectedLead.email}
                  </p>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Project / Product
                  </label>
                  <p className="text-slate-900 font-bold mt-0.5">
                    {selectedLead.project}
                  </p>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Lead Status
                  </label>
                  <span
                    className={cn(
                      "inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border mt-0.5",
                      getStatusBadge(selectedLead.status)
                    )}
                  >
                    {selectedLead.status}
                  </span>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Assigned Executive
                  </label>
                  <p className="text-slate-800 font-medium mt-0.5">
                    {selectedLead.assigned_to}
                  </p>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Lead Source
                  </label>
                  <p className="text-slate-800 font-medium mt-0.5">
                    {selectedLead.source}
                  </p>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Created Date
                  </label>
                  <p className="text-slate-700 font-mono text-[11px] mt-0.5">
                    {selectedLead.created_at}
                  </p>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Profession
                  </label>
                  <p className="text-slate-800 font-medium mt-0.5">
                    {selectedLead.profession || "—"}
                  </p>
                </div>
              </div>

              {selectedLead.address && selectedLead.address !== "—" && (
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                    Address / Location
                  </label>
                  <p className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800">
                    {selectedLead.address}
                  </p>
                </div>
              )}

              {selectedLead.notes && selectedLead.notes !== "—" && (
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                    Remarks / Notes
                  </label>
                  <p className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 whitespace-pre-wrap">
                    {selectedLead.notes}
                  </p>
                </div>
              )}

              <div className="pt-2 flex items-center justify-between gap-2">
                {selectedLead.crm_link ? (
                  <a
                    href={selectedLead.crm_link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition"
                  >
                    <span>Open in Somikoron CRM</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                ) : (
                  <div />
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedLead(null)}
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </DashboardLayout>
  );
}
