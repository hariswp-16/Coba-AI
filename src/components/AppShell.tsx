"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Clapperboard, FolderKanban, Mic2, Palette, Settings, Sparkles, Menu, X } from "lucide-react";
import { useState } from "react";

const NAV = [
  { href: "/", label: "Dashboard", icon: FolderKanban },
  { href: "/new", label: "Buat Video", icon: Sparkles },
  { href: "/styles", label: "Gaya Referensi", icon: Palette },
  { href: "/voices", label: "Suara Saya", icon: Mic2 },
  { href: "/settings", label: "Integrasi", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const nav = (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={clsx(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
              isActive(item.href) ? "bg-lime/10 text-lime" : "text-mist-300 hover:bg-white/5 hover:text-white"
            )}
          >
            <Icon className={clsx("h-4 w-4", isActive(item.href) ? "text-lime" : "text-mist-400 group-hover:text-white")} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/8 bg-ink-900/60 px-4 py-6 backdrop-blur lg:flex">
        <Link href="/" className="mb-8 flex items-center gap-3 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime text-ink-950">
            <Clapperboard className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-sm font-bold leading-tight text-white">AI Video Studio</span>
            <span className="block text-[10px] uppercase tracking-[0.18em] text-mist-400">Cerita animasi otomatis</span>
          </span>
        </Link>
        {nav}
        <div className="mt-auto rounded-xl border border-white/8 bg-white/[0.02] p-3 text-[11px] leading-relaxed text-mist-400">
          Render video berjalan di worker backend, bukan di browser. Pastikan worker aktif saat membuat video.
        </div>
      </aside>

      <div className="flex min-h-screen w-full flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/8 bg-ink-950/85 px-4 py-3 backdrop-blur lg:hidden">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lime text-ink-950">
              <Clapperboard className="h-4 w-4" />
            </span>
            <span className="text-sm font-bold text-white">AI Video Studio</span>
          </Link>
          <button onClick={() => setOpen((v) => !v)} className="rounded-lg p-2 text-mist-300 hover:bg-white/5" aria-label="Menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </header>
        {open ? (
          <div className="animate-in border-b border-white/8 bg-ink-900 px-4 py-4 lg:hidden">{nav}</div>
        ) : null}
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
