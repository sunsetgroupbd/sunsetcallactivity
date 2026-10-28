"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  PhoneCall,
  Users,
  Banknote,
  FileSpreadsheet,
  UserCheck,
  Settings,
  X,
  BellRing,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useNoticesBadge } from "@/lib/use-notices-badge";
import { cn, formatEmployeeId } from "@/lib/utils";

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, isAdmin, isSubAdmin, logout } = useAuth();
  const { unreadCount, pendingReviewCount } = useNoticesBadge();

  const navigation = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Daily Call Activity", href: "/calls", icon: PhoneCall },
    { name: "Meeting Activity", href: "/meetings", icon: Users },
    { name: "Sales & Collection", href: "/sales", icon: Banknote },
    { name: "Reports", href: "/reports", icon: FileSpreadsheet },
    { name: "Notice Board", href: "/notices", icon: BellRing },
    ...(isAdmin
      ? [
          { name: "Employees", href: "/employees", icon: UserCheck },
          { name: "Settings", href: "/settings", icon: Settings },
        ]
      : []),
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      {/* Brand Header with Sunset Group Logo */}
      <div className="h-18 flex items-center justify-between px-5 border-b border-slate-200">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/Sunset-Group-Logo.png"
            alt="Sunset Group Logo"
            width={44}
            height={55}
            className="h-12 w-auto object-contain"
            priority
          />
          <div>
            <span className="font-extrabold text-slate-900 tracking-tight text-sm block leading-none">
              SUNSET GROUP
            </span>
            <span className="text-[10px] uppercase font-bold text-green-700 tracking-wider block mt-0.5">
              Daily Call Activity
            </span>
          </div>
        </Link>
        {onClose && (
          <button
            onClick={onClose}
            className="md:hidden text-slate-400 hover:text-slate-600 p-1"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-green-50 text-green-800 font-semibold"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <Icon
                className={cn(
                  "w-4 h-4 shrink-0",
                  isActive ? "text-green-700" : "text-slate-400 group-hover:text-slate-500"
                )}
              />
              <span className="truncate">{item.name}</span>
              {item.href === "/notices" && unreadCount > 0 && (
                <span className="ml-auto flex items-center gap-1.5" title={`${unreadCount} unread notice${unreadCount > 1 ? "s" : ""}`}>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                  </span>
                  <span className="text-[10px] font-bold bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full">
                    {unreadCount}
                  </span>
                </span>
              )}
              {item.href === "/notices" && unreadCount === 0 && isSubAdmin && pendingReviewCount > 0 && (
                <span className="ml-auto flex items-center gap-1.5" title={`${pendingReviewCount} notice${pendingReviewCount > 1 ? "s" : ""} pending review`}>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </span>
                  <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">
                    {pendingReviewCount}
                  </span>
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User Footer Summary */}
      {user && (
        <div className="p-3 border-t border-slate-200 bg-slate-50 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-700 font-bold text-xs uppercase shrink-0">
              {user.username.slice(0, 2)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <p className="text-xs font-semibold text-slate-900 truncate">
                  {user.full_name}
                </p>
                <span className="font-mono text-[9px] font-bold bg-green-100 text-green-900 border border-green-200 px-1 py-0.2 rounded shrink-0">
                  {formatEmployeeId(user.id)}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 truncate capitalize">
                {user.role} • @{user.username}
              </p>
            </div>
            <button
              onClick={() => logout()}
              title="Logout"
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Static Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 z-30">
        {sidebarContent}
      </aside>

      {/* Mobile Modal Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
            onClick={onClose}
          />
          <div className="fixed inset-y-0 left-0 w-72 z-50 animate-in slide-in-from-left duration-200 shadow-2xl">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
