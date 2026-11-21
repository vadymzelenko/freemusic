"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export function BackButton({ label = "Назад" }: { label?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
      className="flex h-10 items-center gap-0.5 rounded-full pr-3 text-[15px] text-muted active:bg-white/10"
    >
      <ChevronLeft className="h-5 w-5" /> {label}
    </button>
  );
}
