"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

// ─── Button ──────────────────────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer";

  const variants = {
    primary: "bg-green-700 text-white hover:bg-green-800 active:bg-green-900 shadow-sm",
    secondary: "bg-slate-100 text-slate-800 hover:bg-slate-200 active:bg-slate-300",
    outline: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100",
    danger: "bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 shadow-sm",
    ghost: "text-slate-600 hover:bg-slate-100 active:bg-slate-200",
  };

  const sizes = {
    sm: "h-8 px-3 text-xs rounded",
    md: "h-9 px-4 text-sm rounded-md",
    lg: "h-11 px-6 text-base rounded-md",
  };

  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

// ─── Badge ───────────────────────────────────────────────────────────────────
interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info" | "neutral";
  className?: string;
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  const variants = {
    default: "bg-green-50 text-green-800 border-green-200",
    success: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warning: "bg-amber-50 text-amber-800 border-amber-200",
    danger: "bg-rose-50 text-rose-700 border-rose-200",
    info: "bg-sky-50 text-sky-700 border-sky-200",
    neutral: "bg-slate-100 text-slate-700 border-slate-200",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────
export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("px-5 py-4 border-b border-slate-100 flex items-center justify-between", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-sm sm:text-base font-semibold text-slate-900 tracking-tight", className)}
      {...props}
    >
      {children}
    </h3>
  );
}

export function CardContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("p-5", className)} {...props}>
      {children}
    </div>
  );
}

// ─── StatCard ────────────────────────────────────────────────────────────────
interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  trend?: string;
}

export function StatCard({ title, value, subtitle, icon, badge }: StatCardProps) {
  return (
    <Card className="hover:border-slate-300 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            {title}
          </span>
          {icon && <span className="text-slate-600">{icon}</span>}
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <div className="text-2xl font-bold text-slate-900">{value}</div>
          {badge}
        </div>
        {subtitle && <p className="mt-1 text-xs text-slate-600 font-medium">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = "max-w-lg",
}: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
      <div
        className={cn(
          "bg-white rounded-xl shadow-2xl border border-slate-200 w-full flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden my-auto animate-in zoom-in-95 duration-150",
          maxWidth
        )}
      >
        <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white sticky top-0 z-10">
          <div className="pr-3">
            <h3 className="text-base sm:text-lg font-semibold text-slate-900 leading-snug">
              {title}
            </h3>
            {description && (
              <p className="text-xs text-slate-500 mt-0.5">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100 transition-colors shrink-0"
            title="Close"
          >
            ✕
          </button>
        </div>
        <div className="p-4 sm:p-6 overflow-y-auto overscroll-contain flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse bg-slate-200 rounded", className)} />;
}

// ─── Alert ───────────────────────────────────────────────────────────────────
export function Alert({
  type = "info",
  children,
  onDismiss,
}: {
  type?: "success" | "error" | "warning" | "info";
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  const styles = {
    success: "bg-emerald-50 border-emerald-200 text-emerald-800",
    error: "bg-rose-50 border-rose-200 text-rose-800",
    warning: "bg-amber-50 border-amber-200 text-amber-800",
    info: "bg-slate-50 border-slate-200 text-slate-800",
  };

  return (
    <div
      className={cn(
        "p-3 rounded-md border text-sm flex items-start justify-between",
        styles[type]
      )}
    >
      <div className="flex-1">{children}</div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="ml-3 text-slate-400 hover:text-slate-600 font-bold"
        >
          ✕
        </button>
      )}
    </div>
  );
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────
interface TooltipProps {
  content: string;
  subcontent?: string;
  children: React.ReactNode;
  className?: string;
  align?: "center" | "left" | "right";
  position?: "top" | "bottom";
}

export function Tooltip({
  content,
  subcontent,
  children,
  className,
  align = "center",
  position = "bottom",
}: TooltipProps) {
  const alignClasses = {
    center: "left-1/2 -translate-x-1/2",
    left: "left-0",
    right: "right-0",
  };

  const posClasses = {
    bottom: "top-full mt-1.5",
    top: "bottom-full mb-1.5",
  };

  return (
    <div
      title={`${content}${subcontent ? ` — ${subcontent}` : ""}`}
      className={cn("relative group/tip inline-flex items-center justify-center cursor-help", className)}
    >
      {children}
      <div
        role="tooltip"
        className={cn(
          "absolute hidden group-hover/tip:flex flex-col z-50 pointer-events-none",
          "w-max max-w-[230px] rounded-md bg-slate-900 text-white p-2 shadow-xl border border-slate-700/80 text-left transition-all duration-150",
          posClasses[position],
          alignClasses[align]
        )}
      >
        <span className="font-bold text-[11px] text-white leading-tight">{content}</span>
        {subcontent && (
          <span className="text-[10px] text-slate-300 font-normal leading-snug mt-0.5">
            {subcontent}
          </span>
        )}
        {position === "bottom" ? (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-slate-900" />
        ) : (
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
        )}
      </div>
    </div>
  );
}

/**
 * Authentic Bangladeshi Taka (৳) vector icon.
 * Matches Lucide icon sizing and styling via className.
 */
export function TakaIcon({
  className = "w-4 h-4",
  ...props
}: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <circle cx="12" cy="12" r="9.5" strokeWidth="1.8" />
      <text
        x="12"
        y="16.5"
        textAnchor="middle"
        fontSize="13"
        fontWeight="bold"
        fill="currentColor"
        stroke="none"
        fontFamily="sans-serif, Arial"
      >
        ৳
      </text>
    </svg>
  );
}

export const BdtIcon = TakaIcon;
