"use client";

import React from "react";
import { Download, CheckCircle, Smartphone } from "lucide-react";
import { usePwa } from "@/components/pwa-provider";
import { cn } from "@/lib/utils";

interface PwaInstallButtonProps {
  collapsed?: boolean;
  className?: string;
}

export function PwaInstallButton({ collapsed = false, className }: PwaInstallButtonProps) {
  const { isInstalled, canInstall, installApp } = usePwa();

  // If already installed, show subtle installed badge or omit
  if (isInstalled) {
    if (collapsed) return null;
    return (
      <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-[10px] font-semibold border border-emerald-200", className)}>
        <CheckCircle className="w-3 h-3 text-emerald-600 shrink-0" />
        <span>PWA Installed</span>
      </div>
    );
  }

  // If install is available
  if (!canInstall) return null;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={installApp}
        title="Install Sunset App on your device"
        className={cn(
          "w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 transition shadow-2xs",
          className
        )}
      >
        <Download className="w-4 h-4" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={installApp}
      className={cn(
        "w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white text-xs font-bold transition shadow-xs active:scale-[0.99]",
        className
      )}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <Smartphone className="w-3.5 h-3.5 text-emerald-200 shrink-0" />
        <span className="truncate">Install Web App</span>
      </div>
      <span className="text-[9.5px] bg-white/20 text-white px-1.5 py-0.2 rounded font-semibold uppercase tracking-wide">
        PWA
      </span>
    </button>
  );
}

