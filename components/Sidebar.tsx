"use client";

import { BarChart3, Download, House, Library, ListMusic, Plus, Search, Settings, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useHydrated, useLibrary } from "@/store/library";

const NAV = [
  { href: "/", label: "Главная", icon: House, match: (p: string) => p === "/" || p.startsWith("/artist") || p.startsWith("/album") },
  { href: "/search", label: "Поиск", icon: Search, match: (p: string) => p.startsWith("/search") || p.startsWith("/queue") },
  { href: "/library", label: "Медиатека", icon: Library, match: (p: string) => p === "/library" },
  { href: "/stats", label: "Статистика", icon: BarChart3, match: (p: string) => p.startsWith("/stats") },
] as const;

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof House; active: boolean }) {
  return (
    <Link
      href={href}
      title={label}
      className={cn(
        "flex h-10 items-center gap-3 rounded-lg px-3 text-[14px] font-medium transition-colors md:max-lg:justify-center md:max-lg:px-0",
        active ? "bg-fg/[0.08] text-fg" : "text-muted hover:bg-fg/[0.04] hover:text-fg",
      )}
    >
      <Icon className="h-[19px] w-[19px] shrink-0" strokeWidth={active ? 2.2 : 1.8} />
      <span className="truncate md:max-lg:hidden">{label}</span>
    </Link>
  );
}

/** Left navigation on tablets (icons) and desktops (full). Hidden on phones. */
export function Sidebar() {
  const pathname = usePathname();
  const hydrated = useHydrated();
  const playlists = useLibrary((s) => s.playlists);

  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-line bg-bg pt-safe md:flex"
      style={{ width: "var(--sidebar-w)", paddingBottom: "calc(var(--mini-h) + 12px)" }}
    >
      <div className="flex h-16 items-center gap-2.5 px-5 md:max-lg:justify-center md:max-lg:px-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-fg text-bg">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
            <rect x="4" y="9" width="3" height="8" rx="1.5" />
            <rect x="9" y="5" width="3" height="14" rx="1.5" />
            <rect x="14" y="8" width="3" height="10" rx="1.5" />
            <rect x="19" y="11" width="2.5" height="5" rx="1.25" />
          </svg>
        </div>
        <span className="text-[16px] font-bold tracking-tight md:max-lg:hidden">FreeMusic</span>
      </div>

      <nav className="space-y-0.5 px-3">
        {NAV.map((n) => (
          <NavLink key={n.href} href={n.href} label={n.label} icon={n.icon} active={n.match(pathname)} />
        ))}
      </nav>

      <div className="mx-5 my-4 h-px bg-line md:max-lg:mx-4" />

      <nav className="space-y-0.5 px-3">
        <NavLink href="/library/liked" label="Любимые треки" icon={ThumbsUp} active={pathname === "/library/liked"} />
        <NavLink href="/library/downloads" label="Скачанное" icon={Download} active={pathname === "/library/downloads"} />
      </nav>

      <div className="mt-5 hidden items-center justify-between px-6 lg:flex">
        <span className="text-[11.5px] font-medium uppercase tracking-[0.1em] text-subtle">Плейлисты</span>
        <Link href="/library" className="text-subtle hover:text-fg" aria-label="Новый плейлист">
          <Plus className="h-4 w-4" />
        </Link>
      </div>
      <div className="no-scrollbar mt-1 hidden min-h-0 flex-1 overflow-y-auto px-3 lg:block">
        {hydrated &&
          playlists.map((p) => (
            <Link
              key={p.id}
              href={`/library/${p.id}`}
              className={cn(
                "flex h-9 items-center gap-3 rounded-lg px-3 text-[13.5px] transition-colors",
                pathname === `/library/${p.id}` ? "bg-fg/[0.08] text-fg" : "text-muted hover:bg-fg/[0.04] hover:text-fg",
              )}
            >
              <ListMusic className="h-4 w-4 shrink-0" />
              <span className="truncate">{p.name}</span>
            </Link>
          ))}
      </div>

      <div className="mt-auto px-3 pt-2">
        <NavLink href="/settings" label="Настройки" icon={Settings} active={pathname.startsWith("/settings")} />
      </div>
    </aside>
  );
}
