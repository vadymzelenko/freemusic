"use client";

import { tx } from "@/lib/i18n";
import { BarChart3, ChevronRight, History, ListChecks, Music2, ThumbsDown } from "lucide-react";
import Link from "next/link";
import { AccountCard } from "@/components/AccountCard";
import { BackButton } from "@/components/BackButton";
import { Cover } from "@/components/ui/Cover";
import { flag, tagLabel } from "@/lib/radio/types";
import { useLibrary } from "@/store/library";
import { THEMES } from "@/lib/themes";
import { cn } from "@/lib/cn";
import { useUI } from "@/store/ui";

function Row({
  icon,
  title,
  value,
  href,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  title: string;
  value?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  danger?: boolean;
}) {
  const inner = (
    <>
      <span className="flex h-5 w-5 items-center justify-center text-muted [&>svg]:h-[18px] [&>svg]:w-[18px]">{icon}</span>
      <span className={`flex-1 text-[15px] ${danger ? "text-red-400" : ""}`}>{title}</span>
      {value !== undefined && <span className="text-[13px] text-subtle">{value}</span>}
      {href && <ChevronRight className="h-4 w-4 text-subtle" />}
    </>
  );
  const cls = "flex w-full items-center gap-3.5 px-4 py-3.5 text-left active:bg-fg/[0.04] md:hover:bg-fg/[0.03]";
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

function Toggle({ on, onChange, title, hint }: { on: boolean; onChange: () => void; title: string; hint?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onChange}
      className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-fg/[0.04]"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px]">{title}</span>
        {hint && <span className="block truncate text-[12.5px] text-subtle">{hint}</span>}
      </span>
      <span className={`relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors ${on ? "bg-fg" : "bg-fg/15"}`}>
        <span
          className={`absolute top-[3px] h-5 w-5 rounded-full shadow transition-all ${on ? "left-[21px] bg-bg" : "left-[3px] bg-fg/80"}`}
        />
      </span>
    </button>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="px-5 pb-2 text-[12px] font-medium uppercase tracking-[0.1em] text-subtle">{title}</h2>
      <div className="mx-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const artists = useLibrary((s) => s.artists);
  const dislikes = useLibrary((s) => s.dislikedIds.length);
  const plays = useLibrary((s) => s.plays.length);
  const clearHistory = useLibrary((s) => s.clearHistory);
  const clearRadioHistory = useLibrary((s) => s.clearRadioHistory);
  const smart = useLibrary((s) => s.radioSmart);
  const setSmart = useLibrary((s) => s.setRadioSmart);
  const prefs = useLibrary((s) => s.radioPrefs);
  const setPrefs = useLibrary((s) => s.setRadioPrefs);
  const tags = useLibrary((s) => s.radioTags);
  const theme = useLibrary((s) => s.theme);
  const setTheme = useLibrary((s) => s.setTheme);
  const lang = useLibrary((s) => s.lang);
  const setLang = useLibrary((s) => s.setLang);
  const toast = useUI((s) => s.showToast);

  return (
    <div>
      <div className="px-2 pt-3">
        <BackButton />
      </div>
      <h1 className="px-4 pt-2 text-[28px] font-bold tracking-tight">{tx("Настройки")}</h1>

      <div className="mt-4">
        <AccountCard />
      </div>

      <section className="mt-6">
        <h2 className="px-5 pb-2 text-[12px] font-medium uppercase tracking-[0.1em] text-subtle">{tx("Тема")}</h2>
        <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-1 md:grid md:grid-cols-7 md:overflow-visible">
          {THEMES.map((th) => (
            <button
              key={th.id}
              type="button"
              onClick={() => setTheme(th.id)}
              aria-pressed={theme === th.id}
              className="w-[86px] shrink-0 text-center md:w-auto"
            >
              <span
                className={cn(
                  "relative block aspect-[3/4] w-full overflow-hidden rounded-xl border-2 transition-colors",
                  theme === th.id ? "border-fg" : "border-line",
                )}
                style={{ background: th.bg }}
              >
                <span className="absolute inset-x-2 top-2 h-2 rounded-full" style={{ background: th.fg, opacity: 0.85 }} />
                <span className="absolute inset-x-2 top-6 h-1.5 w-2/3 rounded-full" style={{ background: th.fg, opacity: 0.35 }} />
                <span className="absolute inset-x-2 bottom-2 h-8 rounded-md" style={{ background: th.card }} />
              </span>
              <span className={cn("mt-1.5 block truncate text-[12.5px]", theme === th.id ? "text-fg" : "text-muted")}>
                {tx(th.name)}
              </span>
            </button>
          ))}
        </div>
      </section>

      <Group title={tx("Язык")}>
        <div className="grid grid-cols-2 gap-2 p-3 md:grid-cols-4">
          {[
            { id: "", label: tx("Как в системе") },
            { id: "ru", label: tx("Русский") },
            { id: "en", label: "English" },
            { id: "pl", label: "Polski" },
          ].map((l) => (
            <button
              key={l.id || "auto"}
              type="button"
              onClick={() => setLang(l.id)}
              aria-pressed={lang === l.id}
              className={cn(
                "h-10 rounded-lg border text-[14px] font-medium transition-colors",
                lang === l.id ? "border-fg bg-fg text-bg" : "border-line text-muted hover:text-fg",
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      </Group>

      <Group title={tx("Эфир")}>
        <Toggle
          title={tx("Умное радио")}
          hint={tx("Переносит туда, где начинается ваша песня")}
          on={smart}
          onChange={() => setSmart(!smart)}
        />
        <Toggle
          title={tx("Уходить от рекламы")}
          hint={tx("Переключает на станцию, где играет музыка")}
          on={prefs.skipAds}
          onChange={() => setPrefs({ skipAds: !prefs.skipAds })}
        />
        <Toggle
          title={tx("Только музыка")}
          hint={tx("Также уходить от новостей и разговоров")}
          on={prefs.skipTalk}
          onChange={() => setPrefs({ skipTalk: !prefs.skipTalk })}
        />
      </Group>

      <Group title={tx("Ваш вкус")}>
        <Link href="/onboarding" className="flex items-center gap-3.5 px-4 py-3 active:bg-fg/[0.04]">
          <Music2 className="h-[18px] w-[18px] text-muted" />
          <div className="min-w-0 flex-1">
            <div className="text-[15px]">{tx("Мои артисты")}</div>
            <div className="mt-1 flex -space-x-2">
              {artists.slice(0, 7).map((a) => (
                <Cover key={a.key} src={a.thumbnail} alt="" className="h-7 w-7 ring-2 ring-card" rounded="rounded-full" />
              ))}
              {artists.length === 0 && <span className="text-[13px] text-subtle">{tx("Не выбраны")}</span>}
            </div>
          </div>
          <span className="text-[13px] text-subtle">{artists.length}</span>
          <ChevronRight className="h-4 w-4 text-subtle" />
        </Link>
        <Row
          icon={<ListChecks />}
          title={tx("Пройти опрос заново")}
          value={[tags.slice(0, 3).map((t) => tx(tagLabel(t))).join(", "), prefs.countries.map(flag).join("")].filter(Boolean).join(" · ")}
          href="/onboarding"
        />
        <Row icon={<ThumbsDown />} title={tx("Не нравится")} value={dislikes} href="/library?tab=songs" />
        <Row icon={<BarChart3 />} title={tx("Статистика")} href="/stats" />
        <Row
          icon={<History />}
          title={tx("Очистить историю прослушиваний")}
          value={plays}
          onClick={() => {
            if (confirm(tx("Удалить историю прослушиваний? Рекомендации начнут учиться заново."))) {
              clearHistory();
              clearRadioHistory();
              toast(tx("История очищена"));
            }
          }}
        />
      </Group>

      <p className="px-5 pt-6 text-[12px] leading-relaxed text-subtle">
        {tx("Любимые станции, песни, ответы опроса и история хранятся на устройстве и синхронизируются с облаком после входа. Звук идёт напрямую от радиостанций, мы ничего не записываем.")}
      </p>
    </div>
  );
}
