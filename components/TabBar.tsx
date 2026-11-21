"use client";

import { House, Library, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/", label: "Главная", icon: House, match: (p: string) => p === "/" || p.startsWith("/artist") || p.startsWith("/album") },
  { href: "/search", label: "Поиск", icon: Search, match: (p: string) => p.startsWith("/search") || p.startsWith("/queue") },
  { href: "/library", label: "Медиатека", icon: Library, match: (p: string) => p.startsWith("/library") || p.startsWith("/settings") || p.startsWith("/stats") },
] as const;

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/85 pb-safe backdrop-blur-xl backdrop-saturate-150 md:hidden">
      <div className="mx-auto flex h-[var(--tabbar-h)] max-w-2xl items-stretch">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 text-[10.5px] font-medium tracking-wide transition-colors",
                active ? "text-fg" : "text-subtle hover:text-muted",
              )}
            >
              <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.2 : 1.8} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
