"use client";

import { BarChart3, ChevronRight, Download, History, Music2, ThumbsDown, Trash2, Wrench } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountCard } from "@/components/AccountCard";
import { BackButton } from "@/components/BackButton";
import { Cover } from "@/components/ui/Cover";
import { removeAllDownloads, storageEstimate } from "@/lib/downloads";
import { useDownloads } from "@/store/downloads";
import { HOME_SECTIONS, useLibrary } from "@/store/library";
import { THEMES } from "@/lib/themes";
import { cn } from "@/lib/cn";
import { useUI } from "@/store/ui";

const mb = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} ГБ` : `${Math.round(b / 1e6)} МБ`);

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
  const hidden = useLibrary((s) => s.hiddenSections);
  const toggleSection = useLibrary((s) => s.toggleSection);
  const theme = useLibrary((s) => s.theme);
  const setTheme = useLibrary((s) => s.setTheme);
  const lang = useLibrary((s) => s.lang);
  const setLang = useLibrary((s) => s.setLang);
  const downloads = useDownloads((s) => s.items);
  const toast = useUI((s) => s.showToast);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);

  const count = Object.keys(downloads).length;
  const bytes = Object.values(downloads).reduce((s, d) => s + d.bytes, 0);

  useEffect(() => {
    void storageEstimate().then(setUsage);
  }, [count]);

  return (
    <div>
      <div className="px-2 pt-3">
        <BackButton />
      </div>
      <h1 className="px-4 pt-2 text-[28px] font-bold tracking-tight">Настройки</h1>

      <div className="mt-4">
        <AccountCard />
      </div>

      <section className="mt-6">
        <h2 className="px-5 pb-2 text-[12px] font-medium uppercase tracking-[0.1em] text-subtle">Тема</h2>
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
                {th.name}
              </span>
            </button>
          ))}
        </div>
      </section>

      <Group title="Язык">
        <div className="grid grid-cols-2 gap-2 p-3 md:grid-cols-4">
          {[
            { id: "", label: "Как в системе" },
            { id: "ru", label: "Русский" },
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

      <Group title="Главная — что показывать">
        {HOME_SECTIONS.map((sec) => (
          <Toggle
            key={sec.id}
            title={sec.title}
            hint={sec.hint}
            on={!hidden.includes(sec.id)}
            onChange={() => toggleSection(sec.id)}
          />
        ))}
      </Group>

      <Group title="Рекомендации">
        <Link href="/onboarding" className="flex items-center gap-3.5 px-4 py-3 active:bg-fg/[0.04]">
          <Music2 className="h-[18px] w-[18px] text-muted" />
          <div className="min-w-0 flex-1">
            <div className="text-[15px]">Мои артисты</div>
            <div className="mt-1 flex -space-x-2">
              {artists.slice(0, 7).map((a) => (
                <Cover key={a.key} src={a.thumbnail} alt="" className="h-7 w-7 ring-2 ring-card" rounded="rounded-full" />
              ))}
              {artists.length === 0 && <span className="text-[13px] text-subtle">Не выбраны</span>}
            </div>
          </div>
          <span className="text-[13px] text-subtle">{artists.length}</span>
          <ChevronRight className="h-4 w-4 text-subtle" />
        </Link>
        <Row icon={<ThumbsDown />} title="Не нравится" value={dislikes} href="/library/disliked" />
        <Row icon={<BarChart3 />} title="Статистика" href="/stats" />
        <Row
          icon={<History />}
          title="Очистить историю прослушиваний"
          value={plays}
          onClick={() => {
            if (confirm("Удалить историю прослушиваний на этом устройстве? Рекомендации начнут учиться заново.")) {
              clearHistory();
              toast("История очищена");
            }
          }}
        />
      </Group>

      <Group title="Загрузки">
        <Row icon={<Download />} title="Скачанное" value={`${count} · ${mb(bytes)}`} href="/library/downloads" />
        {usage && usage.quota > 0 && (
          <div className="px-4 py-3">
            <div className="mb-1.5 flex justify-between text-[12.5px] text-subtle">
              <span>Занято на устройстве</span>
              <span>
                {mb(usage.usage)} из {mb(usage.quota)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-fg/10">
              <div className="h-full bg-fg" style={{ width: `${Math.min(100, (usage.usage / usage.quota) * 100)}%` }} />
            </div>
          </div>
        )}
        <Row
          icon={<Trash2 />}
          title="Удалить все загрузки"
          danger
          onClick={() => {
            if (count && confirm(`Удалить ${count} скачанных треков?`)) {
              void removeAllDownloads().then(() => toast("Загрузки удалены"));
            }
          }}
        />
      </Group>

      <Group title="Диагностика">
        <Row
          icon={<Wrench />}
          title="Проверить YouTube"
          onClick={() => window.open("/api/debug", "_blank")}
        />
      </Group>

      <p className="px-5 pt-6 text-[12px] leading-relaxed text-subtle">
        Лайки, плейлисты, артисты и история хранятся на устройстве и синхронизируются с облаком после входа. Скачанные
        треки хранятся только на этом устройстве.
      </p>
    </div>
  );
}
