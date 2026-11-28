"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  UserPlus,
  Search,
  RefreshCw,
  Phone,
  Calendar,
  CheckCircle2,
  Clock,
  User,
  Users,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ShieldAlert,
  Building2,
  Globe,
  Snowflake,
  Handshake,
  ExternalLink,
  MessageSquare,
} from "lucide-react";
import { WorkflowLead, OnboardedLeadsSummary, User as UserType } from "@/types";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatReadableDate, cn, getDhakaToday } from "@/lib/utils";

interface OnboardedLeadsViewProps {
  initialEmployeeId?: number;
}

export function OnboardedLeadsView({ initialEmployeeId }: OnboardedLeadsViewProps) {
  const { user, isAdmin, isSubAdmin } = useAuth();
  const isSupervisor = Boolean(isAdmin || isSubAdmin);

  const [leads, setLeads] = useState<WorkflowLead[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<OnboardedLeadsSummary>({
    total_onboarded: 0,
    onboarded_today: 0,
    onboarded_this_month: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmpId, setSelectedEmpId] = useState<number | undefined>(initialEmployeeId);
  const [dateRange, setDateRange] = useState<"all" | "today" | "this_month">("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Executive list for supervisor
  const [executives, setExecutives] = useState<UserType[]>([]);

  // Load executive options if supervisor
  useEffect(() => {
    if (isSupervisor) {
      api.employees
        .list({ is_active: true, limit: 500 })
        .then((data: UserType[]) => {
          setExecutives(data.filter((u: UserType) => u.is_active));
        })
        .catch((err: unknown) => console.error("Error loading users for filter:", err));
    }
  }, [isSupervisor]);

  // Compute dates based on filter
  const getDateParams = useCallback(() => {
    const today = getDhakaToday();
    if (dateRange === "today") {
      return { date_from: today, date_to: today };
    }
    if (dateRange === "this_month") {
      const monthStart = today.slice(0, 7) + "-01";
      return { date_from: monthStart, date_to: today };
    }
    return {};
  }, [dateRange]);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const dateParams = getDateParams();
      const res = await api.leadWorkflow.getOnboardedLeads({
        employee_id: selectedEmpId,
        search: searchQuery.trim() || undefined,
        date_from: dateParams.date_from,
        date_to: dateParams.date_to,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });

      setLeads(res.items);
      setTotal(res.total);
      setSummary(res.summary);
    } catch (err: any) {
      console.error("Failed to load onboarded leads:", err);
      setError(err?.message || "Failed to load onboarded leads.");
    } finally {
      setLoading(false);
    }
  }, [selectedEmpId, searchQuery, dateRange, page, getDateParams]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const totalPages = Math.ceil(total / pageSize) || 1;

  const getSourceIcon = (source: string) => {
    switch (source) {
      case "fb_lead":
        return <Globe className="w-3.5 h-3.5 text-blue-500" />;
      case "fair_lead":
        return <Building2 className="w-3.5 h-3.5 text-purple-600" />;
      case "cold_lead":
        return <Snowflake className="w-3.5 h-3.5 text-sky-500" />;
      case "reference":
        return <Handshake className="w-3.5 h-3.5 text-amber-500" />;
      default:
        return <User className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const s = (status || "").toLowerCase();
    switch (s) {
      case "hp":
        return "bg-emerald-100 text-emerald-800 border-emerald-300";
      case "p":
        return "bg-blue-100 text-blue-800 border-blue-300";
      case "fup":
        return "bg-amber-100 text-amber-800 border-amber-300";
      case "ni":
        return "bg-slate-100 text-slate-600 border-slate-300";
      case "nr":
        return "bg-rose-100 text-rose-700 border-rose-300";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  return (
    <div className="space-y-4">
      {/* ── 1. Top KPI Summary Cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Total Onboarded */}
        <div className="bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-transparent border border-indigo-200/80 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider">
              Total Onboarded
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-0.5">
              {summary.total_onboarded}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {isSupervisor ? "Across company" : "Your lifetime onboarded"}
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20">
            <UserPlus className="w-6 h-6" />
          </div>
        </div>

        {/* Onboarded Today */}
        <div className="bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-200/80 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
              Onboarded Today
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-0.5">
              {summary.onboarded_today}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">Today&apos;s new achievements</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        {/* Onboarded This Month */}
        <div className="bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent border border-blue-200/80 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">
              This Month
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-0.5">
              {summary.onboarded_this_month}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">Current month achievements</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/20">
            <Calendar className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* ── 2. Filters & Controls Bar (Mobile Optimized) ──────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search by lead name or phone..."
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
            />
          </div>

          {/* Quick Date Range Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => {
                setDateRange("all");
                setPage(1);
              }}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0",
                dateRange === "all"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              All Time
            </button>
            <button
              type="button"
              onClick={() => {
                setDateRange("today");
                setPage(1);
              }}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0",
                dateRange === "today"
                  ? "bg-emerald-700 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => {
                setDateRange("this_month");
                setPage(1);
              }}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0",
                dateRange === "this_month"
                  ? "bg-blue-700 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              This Month
            </button>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={fetchLeads}
              disabled={loading}
              className="p-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition shrink-0 disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Supervisor Executive Filter */}
        {isSupervisor && executives.length > 0 && (
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 flex-wrap">
            <span className="text-xs font-bold text-slate-600">Filter Executive:</span>
            <select
              value={selectedEmpId || ""}
              onChange={(e) => {
                const val = e.target.value ? Number(e.target.value) : undefined;
                setSelectedEmpId(val);
                setPage(1);
              }}
              className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Executives (Whole Company)</option>
              {executives.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.full_name || ex.username}
                </option>
              ))}
            </select>
            {selectedEmpId && (
              <button
                type="button"
                onClick={() => {
                  setSelectedEmpId(undefined);
                  setPage(1);
                }}
                className="text-xs text-indigo-600 hover:underline font-bold"
              >
                Clear filter
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── 3. Leads Content: Mobile Cards & Desktop Table ───────────────── */}
      {loading ? (
        <div className="py-16 text-center text-slate-500 space-y-2 bg-white rounded-2xl border border-slate-200">
          <Loader2 className="w-7 h-7 animate-spin text-indigo-600 mx-auto" />
          <p className="text-xs font-medium">Loading onboarded leads...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-50 text-rose-800 text-xs rounded-2xl border border-rose-200 flex items-center gap-2.5">
          <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      ) : leads.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-2xl border border-dashed border-slate-200 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <UserPlus className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold text-slate-700">No Onboarded Leads Found</p>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {searchQuery || dateRange !== "all" || selectedEmpId
              ? "No leads matched your search or filters. Try adjusting your filter parameters."
              : "When a salesperson clicks 'Onboard' on any lead card, it will appear here permanently."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* ── Mobile View: Clean, Responsive Cards ──────────────────────── */}
          <div className="sm:hidden space-y-2.5">
            {leads.map((lead) => (
              <div
                key={lead.id}
                className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3 relative overflow-hidden"
              >
                {/* Status bar top indicator */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-slate-900 truncate">
                      {lead.name}
                    </h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      <a
                        href={`tel:${lead.phone}`}
                        className="text-xs font-mono font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 bg-indigo-50 px-2 py-0.5 rounded-md"
                      >
                        <Phone className="w-3 h-3" />
                        <span>{lead.phone}</span>
                      </a>
                      <span
                        className={cn(
                          "text-[10px] font-extrabold uppercase px-1.5 py-0.2 rounded border",
                          getStatusBadge(lead.status)
                        )}
                      >
                        {lead.status}
                      </span>
                    </div>
                  </div>

                  {/* Permanent Onboarded Badge */}
                  <span className="shrink-0 bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <span>Onboarded</span>
                  </span>
                </div>

                {/* Audit & Timing Details */}
                <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Onboarded On</span>
                    <span className="font-semibold text-slate-800">
                      {lead.onboarded_at ? formatReadableDate(lead.onboarded_at) : "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Owner</span>
                    <span className="font-semibold text-slate-800 truncate block">
                      {lead.assigned_to_name || `User #${lead.assigned_to_id}`}
                    </span>
                  </div>
                  {lead.onboarded_by_name && (
                    <div className="col-span-2 pt-1 border-t border-slate-200/60">
                      <span className="text-slate-400 text-[10px]">Onboarded By: </span>
                      <span className="font-bold text-slate-700">{lead.onboarded_by_name}</span>
                    </div>
                  )}
                </div>

                {/* Notes preview if any */}
                {lead.notes && (
                  <p className="text-[11px] text-slate-600 italic bg-amber-50/70 p-2 rounded-lg border border-amber-100">
                    &quot;{lead.notes}&quot;
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* ── Desktop View: Professional Table ───────────────────────────── */}
          <div className="hidden sm:block bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10.5px]">
                  <tr>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-3 py-3">Phone</th>
                    <th className="px-3 py-3">Source</th>
                    <th className="px-3 py-3">Stage</th>
                    <th className="px-3 py-3">Owner</th>
                    <th className="px-4 py-3">Onboarded At</th>
                    <th className="px-3 py-3">Onboarded By</th>
                    <th className="px-4 py-3">Sync Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-slate-50/70 transition">
                      {/* Customer Name */}
                      <td className="px-4 py-3 font-bold text-slate-900">
                        {lead.name}
                        {lead.notes && (
                          <span
                            className="block text-[10.5px] font-normal text-slate-500 italic max-w-xs truncate"
                            title={lead.notes}
                          >
                            &quot;{lead.notes}&quot;
                          </span>
                        )}
                      </td>

                      {/* Phone */}
                      <td className="px-3 py-3">
                        <a
                          href={`tel:${lead.phone}`}
                          className="font-mono font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                        >
                          <Phone className="w-3 h-3 text-indigo-500" />
                          <span>{lead.phone}</span>
                        </a>
                      </td>

                      {/* Source */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5 text-slate-700 capitalize">
                          {getSourceIcon(lead.source)}
                          <span>{lead.source.replace("_", " ")}</span>
                        </div>
                      </td>

                      {/* Stage */}
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded text-[10.5px] font-extrabold uppercase border",
                            getStatusBadge(lead.status)
                          )}
                        >
                          {lead.status}
                        </span>
                      </td>

                      {/* Lead Owner */}
                      <td className="px-3 py-3 text-slate-800 font-medium">
                        {lead.assigned_to_name || `User #${lead.assigned_to_id}`}
                      </td>

                      {/* Onboarded At */}
                      <td className="px-4 py-3 text-slate-600">
                        {lead.onboarded_at ? (
                          <>
                            <span className="font-semibold text-slate-900 block">
                              {formatReadableDate(lead.onboarded_at)}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(lead.onboarded_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </>
                        ) : (
                          "N/A"
                        )}
                      </td>

                      {/* Onboarded By */}
                      <td className="px-3 py-3 text-slate-700 font-semibold">
                        {lead.onboarded_by_name || "—"}
                      </td>

                      {/* Sync Status */}
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"
                          title={lead.onboard_response || "Synced via API"}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Synced</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── 4. Pagination Controls ────────────────────────────────────── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 pt-2 px-1">
              <p className="text-xs text-slate-500">
                Showing{" "}
                <span className="font-bold text-slate-800">
                  {(page - 1) * pageSize + 1}
                </span>{" "}
                to{" "}
                <span className="font-bold text-slate-800">
                  {Math.min(page * pageSize, total)}
                </span>{" "}
                of <span className="font-bold text-slate-800">{total}</span> leads
              </p>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-bold text-slate-700 px-2">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition disabled:opacity-40"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
