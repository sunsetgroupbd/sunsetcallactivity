"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  PhoneCall,
  Users,
  Banknote,
  FileSpreadsheet,
} from "lucide-react";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Calls", href: "/calls", icon: PhoneCall },
  { name: "Meetings", href: "/meetings", icon: Users },
  { name: "Sales", href: "/sales", icon: Banknote },
  { name: "Reports", href: "/reports", icon: FileSpreadsheet },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-2px_12px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-5 h-14 max-w-md mx-auto px-1">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center py-1 transition-all group relative select-none ${
                isActive
                  ? "text-green-700 font-bold"
                  : "text-slate-500 hover:text-slate-800 font-medium"
              }`}
            >
              {/* Active top green bar indicator */}
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-green-700 rounded-full" />
              )}

              <div
                className={`p-1 rounded-md transition-colors ${
                  isActive
                    ? "bg-green-50 text-green-700"
                    : "text-slate-500 group-hover:bg-slate-50 group-hover:text-slate-700"
                }`}
              >
                <Icon
                  className={`w-4.5 h-4.5 ${
                    isActive ? "stroke-[2.25]" : "stroke-[1.75]"
                  }`}
                />
              </div>
              <span
                className={`text-[10px] tracking-tight leading-none mt-0.5 ${
                  isActive ? "text-green-800 font-bold" : "text-slate-500"
                }`}
              >
                {item.name}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
