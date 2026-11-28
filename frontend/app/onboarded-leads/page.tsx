"use client";

import React, { Suspense } from "react";
import { UserPlus, PhoneCall, Sparkles } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { OnboardedLeadsView } from "@/components/leads/onboarded-leads-view";
import { useAuth } from "@/lib/auth-context";

function OnboardedLeadsPageContent() {
  const { user, isAdmin, isSubAdmin } = useAuth();
  const isSupervisor = Boolean(isAdmin || isSubAdmin);

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
            <UserPlus className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>Onboarded Leads</span>
              <span className="text-[11px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                Live Synced
              </span>
            </h1>
            <p className="text-xs text-slate-500">
              {isSupervisor
                ? "All onboarded leads pushed to the external web app platform across your sales team."
                : "All leads you have successfully onboarded and synced to the external web platform."}
            </p>
          </div>
        </div>
      </div>

      {/* Main View Component */}
      <OnboardedLeadsView />
    </div>
  );
}

export default function OnboardedLeadsPage() {
  return (
    <DashboardLayout
      title="Onboarded Leads"
      subtitle="View and track all leads successfully onboarded and synced to the external platform"
    >
      <Suspense fallback={<div className="p-8 text-center text-xs text-slate-400">Loading...</div>}>
        <OnboardedLeadsPageContent />
      </Suspense>
    </DashboardLayout>
  );
}
