"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { BottomNav } from "./bottom-nav";
import { Loader2, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  adminOnly?: boolean;
  fullWidth?: boolean;
}

export function DashboardLayout({
  children,
  title,
  subtitle,
  adminOnly = false,
  fullWidth = false,
}: DashboardLayoutProps) {
  const { user, loading, isAdmin } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const router = useRouter();

  // Load persisted collapse state
  useEffect(() => {
    try {
      const saved = localStorage.getItem("sunset_sidebar_collapsed");
      if (saved !== null) {
        setIsSidebarCollapsed(saved === "true");
      }
    } catch {
      // ignore
    }
  }, []);

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sunset_sidebar_collapsed", String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Keyboard shortcut Ctrl+B or Cmd+B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebarCollapse();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 text-green-700 animate-spin mx-auto" />
          <p className="text-sm font-medium text-slate-600">Loading Sunset Group Dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect via useEffect
  }

  if (adminOnly && !isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex">
        <Sidebar
          isOpen={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapse}
        />
        <div
          className={cn(
            "flex flex-col flex-1 min-w-0 transition-all duration-300 ease-in-out",
            isSidebarCollapsed ? "md:pl-16" : "md:pl-64"
          )}
        >
          <Topbar
            title="Access Restricted"
            onOpenMobileMenu={() => setMobileMenuOpen(true)}
            isSidebarCollapsed={isSidebarCollapsed}
            onToggleCollapse={toggleSidebarCollapse}
          />
          <main className="flex-1 p-6 flex items-center justify-center">
            <div className="max-w-md w-full bg-white p-8 rounded-lg border border-slate-200 text-center shadow-xs">
              <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Administrator Access Required</h2>
              <p className="text-sm text-slate-500 mt-2">
                This page contains administrative settings and is restricted to administrator accounts.
              </p>
              <button
                onClick={() => router.push("/")}
                className="mt-6 inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-green-700 hover:bg-green-800 rounded-md shadow-xs"
              >
                Return to Dashboard
              </button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar Navigation (Desktop & Mobile Drawer) */}
      <Sidebar
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapse}
      />

      {/* Main Content Area */}
      <div
        className={cn(
          "flex flex-col flex-1 min-w-0 transition-all duration-300 ease-in-out",
          isSidebarCollapsed ? "md:pl-16" : "md:pl-64"
        )}
      >
        <Topbar
          title={title}
          subtitle={subtitle}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapse}
        />
        <main
          className={cn(
            "flex-1 p-4 sm:p-6 lg:p-8 w-full mx-auto pb-20 md:pb-8",
            fullWidth ? "max-w-none" : "max-w-7xl"
          )}
        >
          {children}
        </main>
      </div>

      {/* Fixed Mobile Bottom Navigation Bar */}
      <BottomNav />
    </div>
  );
}
