"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { BackButton } from "@/components/BackButton";
import { tx } from "@/lib/i18n";
import { isNative, nativePlatform } from "@/lib/native/platform";
import { fetchJSON } from "@/lib/use-api";

/** YouTube diagnostics. On the website it checks the server; in the app — the phone itself. */
export default function DebugPage() {
  const [data, setData] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(() => {
    setBusy(true);
    setData(null);
    fetchJSON("/api/debug")
      .then(setData)
      .catch((e: unknown) => setData({ error: e instanceof Error ? e.message : String(e) }))
      .finally(() => setBusy(false));
  }, []);

  useEffect(run, [run]);

  const results = (data as { results?: { client: string; ok: boolean; ms: number; error?: string }[] } | null)?.results;

  return (
    <div className="px-4 md:px-0">
      <div className="-mx-2 pt-3">
        <BackButton />
      </div>
      <div className="flex items-end justify-between gap-3 pt-2 pb-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">{tx("Проверить YouTube")}</h1>
          <p className="text-[13px] text-muted">
            {isNative() ? `${tx("Проверка с этого устройства")} (${nativePlatform()})` : tx("Проверка сервера")}
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-card text-muted disabled:opacity-50"
          aria-label={tx("Повторить")}
        >
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
        </button>
      </div>

      {busy && <p className="text-sm text-subtle">{tx("Проверяем… это может занять до минуты")}</p>}

      {(data as { playback?: Record<string, unknown> } | null)?.playback && (
        <div className="mb-3 rounded-xl border border-line bg-card px-4 py-3 text-[13.5px]">
          <div className="mb-1 font-medium">{tx("Воспроизведение")}</div>
          {Object.entries((data as { playback: Record<string, unknown> }).playback).map(([k, v]) => (
            <div key={k} className="break-words text-muted">
              <span className="text-subtle">{k}:</span> {String(v)}
            </div>
          ))}
        </div>
      )}

      {results && (
        <ul className="mb-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
          {results.map((r) => (
            <li key={r.client} className="flex items-start gap-3 px-4 py-3 text-[14px]">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${r.ok ? "bg-emerald-500" : "bg-red-500"}`} />
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {r.client} <span className="text-[12px] font-normal text-subtle">{r.ms} ms</span>
                </div>
                {r.error && <div className="break-words text-[12.5px] text-muted">{r.error}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {data !== null && (
        <pre className="overflow-x-auto rounded-xl border border-line bg-card p-3 text-[11.5px] leading-relaxed text-muted [user-select:text]">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
