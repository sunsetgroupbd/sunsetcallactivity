"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ShieldCheck, Users, Unlock } from "lucide-react";
import { Card, CardContent, Button } from "@/components/ui";
import { User, Report } from "@/types";
import { api, ApiError } from "@/lib/api";
import { formatEmployeeId } from "@/lib/utils";

interface SupervisorBarProps {
  isAdmin: boolean;
  isSubAdmin: boolean;
  selectedEmployeeId?: number;
  onSelectEmployee: (empId: number) => void;
  reportDate: string;
  report: Report | null;
  onReportUnlocked?: (updated: Report) => void;
  currentPage: "calls" | "meetings" | "sales";
}

export function SupervisorBar({
  isAdmin,
  isSubAdmin,
  selectedEmployeeId,
  onSelectEmployee,
  reportDate,
  report,
  onReportUnlocked,
  currentPage,
}: SupervisorBarProps) {
  const [employees, setEmployees] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    api.employees
      .list({ is_active: true })
      .then((data) => {
        if (!mounted) return;
        const staff = data.filter((e) => e.role === "employee" || e.role === "tl" || e.role === "co");
        const listToUse = staff.length > 0 ? staff : data;
        setEmployees(listToUse);

        // If no employee is currently selected, pick the first staff member automatically
        if (!selectedEmployeeId && listToUse.length > 0) {
          onSelectEmployee(listToUse[0].id);
        }
      })
      .catch((err) => {
        console.error("Failed to load staff list for supervisor bar", err);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [selectedEmployeeId, onSelectEmployee]);

  const handleReopen = async () => {
    if (!report) return;
    try {
      setReopening(true);
      setReopenError(null);
      const updated = await api.reports.reopen(report.id);
      if (onReportUnlocked) {
        onReportUnlocked(updated);
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setReopenError(err.message);
      } else {
        setReopenError("Failed to unlock report.");
      }
    } finally {
      setReopening(false);
    }
  };

  return (
    <div className="mb-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 sm:px-3.5 sm:py-2.5 shadow-sm text-white flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-3">
        {/* Left / Top: Compact Badge, Title & Mobile Unlock */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="text-xs font-bold text-white tracking-wide">
              Supervisor Mode
            </span>
            <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700 font-medium">
              {isAdmin ? "Admin" : "Sub-Admin"}
            </span>
          </div>

          {/* Unlock Button on Mobile Header */}
          {report?.status === "submitted" && (
            <div className="md:hidden">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReopen}
                loading={reopening}
                className="bg-amber-500/10 text-amber-300 border-amber-500/40 hover:bg-amber-500/20 text-xs font-semibold h-7 px-2 shadow-xs"
                title="Unlock report for edits"
              >
                <Unlock className="w-3 h-3 mr-1 text-amber-400" />
                Unlock
              </Button>
            </div>
          )}
        </div>

        {/* Right / Bottom: Employee Selector & Quick Links */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2.5 w-full md:w-auto min-w-0">
          {/* Employee Selector - Responsive Full Width on Mobile with Truncation */}
          <div className="flex items-center gap-2 bg-white rounded-lg px-2.5 py-1.5 shadow-2xs border border-slate-200 w-full sm:w-72 md:w-80 min-w-0">
            <Users className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <select
              value={selectedEmployeeId ?? ""}
              onChange={(e) => onSelectEmployee(Number(e.target.value))}
              disabled={loading || employees.length === 0}
              className="bg-white text-xs font-bold text-slate-900 focus:outline-none cursor-pointer w-full min-w-0 truncate pr-1"
            >
              {employees.map((emp) => {
                const roleTag =
                  emp.role === "tl"
                    ? "TL"
                    : emp.role === "co"
                    ? "CO"
                    : "Exec";
                return (
                  <option key={emp.id} value={emp.id} className="bg-white text-slate-900 font-semibold py-1">
                    {emp.full_name} ({formatEmployeeId(emp.id)} • {roleTag})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Quick Page Links: Calls, Meetings, Sales, Reports */}
          {selectedEmployeeId && (
            <div className="flex items-center gap-0.5 bg-slate-800/80 p-0.5 rounded-lg border border-slate-700 w-full sm:w-auto justify-between sm:justify-start">
              {currentPage !== "calls" && (
                <Link
                  href={`/calls?date=${reportDate}&employee_id=${selectedEmployeeId}`}
                  className="flex-1 sm:flex-initial text-center px-2 py-1 rounded text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                >
                  Calls
                </Link>
              )}
              {currentPage !== "meetings" && (
                <Link
                  href={`/meetings?date=${reportDate}&employee_id=${selectedEmployeeId}`}
                  className="flex-1 sm:flex-initial text-center px-2 py-1 rounded text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                >
                  Meetings
                </Link>
              )}
              {currentPage !== "sales" && (
                <Link
                  href={`/sales?date=${reportDate}&employee_id=${selectedEmployeeId}`}
                  className="flex-1 sm:flex-initial text-center px-2 py-1 rounded text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                >
                  Sales
                </Link>
              )}
              <Link
                href={`/reports?employee_id=${selectedEmployeeId}&start_date=${reportDate}&end_date=${reportDate}`}
                className="flex-1 sm:flex-initial text-center px-2 py-1 rounded text-xs font-semibold text-emerald-400 hover:text-emerald-300 hover:bg-slate-700 transition-colors"
              >
                Reports
              </Link>
            </div>
          )}

          {/* Unlock Button for Desktop View */}
          {report?.status === "submitted" && (
            <div className="hidden md:block">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReopen}
                loading={reopening}
                className="bg-amber-500/10 text-amber-300 border-amber-500/40 hover:bg-amber-500/20 text-xs font-semibold h-7 px-2.5 shadow-xs shrink-0"
                title="Unlock report for edits"
              >
                <Unlock className="w-3 h-3 mr-1 text-amber-400" />
                Unlock
              </Button>
            </div>
          )}
        </div>
      </div>

      {reopenError && (
        <div className="mt-2 p-2.5 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800">
          {reopenError}
        </div>
      )}
    </div>
  );
}
