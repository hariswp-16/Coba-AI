"use client";
import clsx from "clsx";
import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx("card p-5", className)}>{children}</div>;
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.16em] text-mist-400">{children}</h2>
      {hint ? <div className="text-xs text-mist-400">{hint}</div> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "lime" | "flare" | "sky" | "red" | "amber";
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "border-white/10 bg-white/5 text-mist-300",
    lime: "border-lime/30 bg-lime/10 text-lime",
    flare: "border-flare/30 bg-flare/10 text-flare",
    sky: "border-sky/30 bg-sky/10 text-sky",
    red: "border-red-500/30 bg-red-500/10 text-red-300",
    amber: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  };
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={clsx("inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-lime", className)}
      aria-hidden
    />
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={clsx("h-1.5 w-full overflow-hidden rounded-full bg-white/8", className)}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-lime to-sky transition-all duration-500"
        style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        className={clsx(
          "animate-in max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-ink-900 p-6 shadow-2xl sm:rounded-2xl",
          wide ? "sm:max-w-3xl" : "sm:max-w-lg"
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-mist-400 hover:bg-white/5 hover:text-white" aria-label="Tutup">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Toast({ message, tone = "info", onClose }: { message: string; tone?: "info" | "error" | "success"; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 5200);
    return () => clearTimeout(t);
  }, [onClose]);
  const tones = {
    info: "border-sky/40 bg-sky/10 text-sky",
    error: "border-red-500/40 bg-red-500/10 text-red-200",
    success: "border-lime/40 bg-lime/10 text-lime",
  };
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
      <div className={clsx("animate-in pointer-events-auto max-w-xl rounded-xl border px-4 py-3 text-sm font-medium shadow-xl backdrop-blur", tones[tone])}>
        {message}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint ? <p className="mt-1.5 text-[11px] leading-relaxed text-mist-400">{hint}</p> : null}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-mist-400">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-mist-400">{sub}</div> : null}
    </div>
  );
}
