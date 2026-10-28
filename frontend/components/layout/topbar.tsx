"use client";

import React from "react";
import { Menu, Calendar, ShieldCheck, User as UserIcon } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { formatReadableDate, getDhakaToday, formatEmployeeId } from "@/lib/utils";
import { NotificationBell } from "./notification-bell";

interface TopbarProps {
  title: string;
  subtitle?: string;
  onOpenMobileMenu?: () => void;
}

export function Topbar({ title, subtitle, onOpenMobileMenu }: TopbarProps) {
  const { user, isAdmin } = useAuth();
  const [todayDhaka, setTodayDhaka] = React.useState("");

  React.useEffect(() => {
    setTodayDhaka(getDhakaToday());
  }, []);

  return (
    <header className="sticky top-0 z-20 h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between">
      {/* Left: Mobile Toggle & Page Title */}
      <div className="flex items-center gap-3">
        {onOpenMobileMenu && (
          <button
            onClick={onOpenMobileMenu}
            className="md:hidden p-2 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100"
            aria-label="Open sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div>
          <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs text-slate-600 font-medium hidden sm:block">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Right: Date, Notification Bell, User info, Logout */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Dhaka Reporting Date */}
        <div className="hidden lg:flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-300 px-2.5 py-1.5 rounded-md">
          <Calendar className="w-3.5 h-3.5 text-green-700" />
          <span>{formatReadableDate(todayDhaka)}</span>
          <span className="text-[10px] text-slate-500 font-mono">(Dhaka)</span>
        </div>

        {/* Notifications & Reminders Bell */}
        {user && <NotificationBell />}

        {/* User Badge */}
        {user && (
          <div className="flex items-center gap-2">
            <div className="flex flex-col text-right">
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-xs font-semibold text-slate-900 leading-none">
                  {user.full_name}
                </span>
                <span className="font-mono text-[10px] font-bold bg-green-50 text-green-800 border border-green-200 px-1.5 py-0.5 rounded leading-none">
                  {formatEmployeeId(user.id)}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wide flex items-center justify-end gap-1 mt-0.5">
                {user.role === "admin" ? (
                  <>
                    <ShieldCheck className="w-3 h-3 text-green-700" />
                    Admin
                  </>
                ) : user.role === "sub_admin" ? (
                  <>
                    <ShieldCheck className="w-3 h-3 text-emerald-600" />
                    Sub Admin
                  </>
                ) : (
                  <>
                    <UserIcon className="w-3 h-3 text-slate-400" />
                    Employee
                  </>
                )}
              </span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
