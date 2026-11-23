"use client";

import { tx } from "@/lib/i18n";
import { BarChart3, Compass, Library, RadioTower, Settings, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { StationLogo } from "@/components/radio/StationLogo";
import { useRadio } from "@/components/radio/RadioProvider";
import { cn } from "@/lib/cn";
import { useHydrated, useLibrary } from "@/store/library";

const NAV = [
  { href: "/", label: "Для вас", icon: Sparkles, match: (p: string) => p === "/" },
  { href: "/radio", label: "Эфир", icon: RadioTower, match: (p: string) => p.startsWith("/radio") },
  { href: "/explore", label: "Обзор", icon: Compass, match: (p: string) => p.startsWith("/explore") },
  { href: "/library", label: "Медиатека", icon: Library, match: (p: string) => p === "/library" },
  { href: "/stats", label: "Статистика", icon: BarChart3, match: (p: string) => p.startsWith("/stats") },
] as const;

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Sparkles; active: boolean }) {
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

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg bg-fg text-bg", className)}>
      <RadioTower className="h-4 w-4" strokeWidth={2.4} />
    </div>
  );
}

/** Left navigation on tablets (icons) and desktops (full). Hidden on phones. */
export function Sidebar() {
  const pathname = usePathname();
  const hydrated = useHydrated();
  const favs = useLibrary((s) => s.radioFavs);
  const r = useRadio();

  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-line bg-bg pt-safe md:flex"
      style={{ width: "var(--sidebar-w)", paddingBottom: "calc(var(--mini-h) + 12px)" }}
    >
      <div className="flex h-16 items-center gap-2.5 px-5 md:max-lg:justify-center md:max-lg:px-0">
        <Logo />
        <span className="text-[16px] font-bold tracking-tight md:max-lg:hidden">vzRadio</span>
      </div>

      <nav className="space-y-0.5 px-3">
        {NAV.map((n) => (
          <NavLink key={n.href} href={n.href} label={tx(n.label)} icon={n.icon} active={n.match(pathname)} />
        ))}
      </nav>

      <div className="mt-6 hidden items-center justify-between px-6 lg:flex">
        <span className="text-[11.5px] font-medium uppercase tracking-[0.1em] text-subtle">{tx("Мои станции")}</span>
      </div>
      <div className="no-scrollbar mt-1 hidden min-h-0 flex-1 overflow-y-auto px-3 lg:block">
        {hydrated &&
          favs.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => (r.station?.id === s.id ? r.toggle() : r.tune(s))}
              className={cn(
                "flex h-10 w-full items-center gap-3 rounded-lg px-2 text-left text-[13.5px] transition-colors",
                r.station?.id === s.id ? "bg-fg/[0.08] text-fg" : "text-muted hover:bg-fg/[0.04] hover:text-fg",
              )}
            >
              <StationLogo station={s} className="h-7 w-7" rounded="rounded-md" />
              <span className="truncate">{s.name}</span>
            </button>
          ))}
        {hydrated && !favs.length && <p className="px-3 text-[12.5px] leading-snug text-subtle">{tx("Отмечайте станции звёздочкой — они появятся здесь.")}</p>}
      </div>

      <div className="mt-auto px-3 pt-2">
        <NavLink href="/settings" label={tx("Настройки")} icon={Settings} active={pathname.startsWith("/settings")} />
      </div>
    </aside>
  );
}
