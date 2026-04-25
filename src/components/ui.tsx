import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${className}`}>{children}</div>;
}

export function Button({ children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return <button className={`rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 ${className}`} {...props}>{children}</button>;
}

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100" href={href}>{children}</Link>;
}

export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    SCORED: "bg-emerald-100 text-emerald-700",
    INVALID_OUTPUT: "bg-amber-100 text-amber-700",
    TIME_LIMIT_EXCEEDED: "bg-orange-100 text-orange-700",
    RUNTIME_ERROR: "bg-rose-100 text-rose-700",
    REJECTED: "bg-red-100 text-red-700",
    RUNNING: "bg-blue-100 text-blue-700",
    PENDING: "bg-slate-100 text-slate-700",
    PARTIAL: "bg-amber-100 text-amber-700",
    COMPLETED: "bg-emerald-100 text-emerald-700",
    FAILED: "bg-rose-100 text-rose-700",
    NOT_REQUIRED: "bg-slate-100 text-slate-700",
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${colors[status] ?? colors.PENDING}`}>{status}</span>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1 text-sm font-medium text-slate-700"><span>{label}</span>{children}</label>;
}
