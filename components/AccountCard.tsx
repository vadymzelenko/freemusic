"use client";

import { tx } from "@/lib/i18n";
import { AlertCircle, Check, Cloud, CloudOff, Loader2, LogOut } from "lucide-react";
import { signInWithGoogle, signOut, useAuth } from "@/lib/cloud-sync";
import { supabaseEnabled } from "@/lib/supabase";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}

export function AccountCard() {
  const { user, ready, status, error } = useAuth();

  if (!supabaseEnabled) {
    return (
      <div className="mx-4 flex items-start gap-3 rounded-xl border border-line bg-card px-4 py-3">
        <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />
        <p className="text-[13px] leading-snug text-subtle">
          {tx("Данные хранятся только на этом устройстве. Чтобы включить вход через Google и синхронизацию, задайте переменные Supabase (см. README).")}
        </p>
      </div>
    );
  }

  if (!ready) return <div className="skeleton mx-4 h-[60px] rounded-xl" />;

  if (!user) {
    return (
      <div className="mx-4 flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-3">
        <Cloud className="h-4 w-4 shrink-0 text-muted" />
        <p className="min-w-0 flex-1 text-[13px] leading-snug text-muted">
          {tx("Войдите, чтобы лайки и плейлисты были на всех устройствах")}
        </p>
        <button
          type="button"
          onClick={() => void signInWithGoogle()}
          className="flex h-9 shrink-0 items-center gap-2 rounded-full bg-fg px-3.5 text-[13px] font-semibold text-bg active:opacity-90"
        >
          <GoogleIcon />{tx(" Войти")}
        </button>
      </div>
    );
  }

  const meta = user.user_metadata as { avatar_url?: string; full_name?: string; name?: string };
  const name = meta.full_name || meta.name || user.email || tx("Аккаунт");

  return (
    <div className="mx-4 flex items-center gap-3 rounded-xl border border-line bg-card px-3 py-2.5">
      {meta.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={meta.avatar_url} alt="" referrerPolicy="no-referrer" className="h-9 w-9 rounded-full" />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-fg/10 text-sm font-semibold">
          {name.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium">{name}</div>
        <div className="flex items-center gap-1 text-[12px] text-subtle">
          {status === "syncing" && (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />{tx(" Синхронизация…")}
            </>
          )}
          {status === "synced" && (
            <>
              <Check className="h-3 w-3" />{tx(" Синхронизировано")}
            </>
          )}
          {status === "error" && (
            <span className="flex min-w-0 items-start gap-1 text-red-400">
              <AlertCircle className="h-3 w-3 shrink-0" />
              <span className="line-clamp-2">{error ?? tx("Ошибка синхронизации")}</span>
            </span>
          )}
          {status === "off" && tx("Облако")}
        </div>
      </div>
      <button
        type="button"
        onClick={() => void signOut()}
        className="flex h-9 w-9 items-center justify-center rounded-full text-muted active:bg-fg/10"
        aria-label={tx("Выйти")}
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
