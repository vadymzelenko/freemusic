"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";

export function Shelf({
  title,
  subtitle,
  href,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-7">
      <div className="mb-3 flex items-end justify-between gap-3 px-4">
        <div className="min-w-0">
          {subtitle && <div className="text-[12px] font-medium uppercase tracking-[0.1em] text-subtle">{subtitle}</div>}
          <h2 className="truncate text-[19px] font-bold tracking-tight">{title}</h2>
        </div>
        {href && (
          <Link href={href} className="flex shrink-0 items-center text-[13px] text-muted hover:text-fg">
            Все <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </div>
      <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-1">
        {children}
      </div>
    </section>
  );
}

export function ShelfSkeleton({ round = false }: { round?: boolean }) {
  return (
    <section className="mt-7">
      <div className="skeleton mx-4 mb-3 h-5 w-40 rounded" />
      <div className="flex gap-3 overflow-hidden px-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="w-[140px] shrink-0">
            <div className={`skeleton aspect-square w-full ${round ? "rounded-full" : "rounded-lg"}`} />
            <div className="skeleton mt-2 h-3 w-3/4 rounded" />
            <div className="skeleton mt-1.5 h-3 w-1/2 rounded" />
          </div>
        ))}
      </div>
    </section>
  );
}
