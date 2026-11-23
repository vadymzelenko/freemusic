import { countClick } from "@/lib/radio/browser";
import { json, preflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reports a play to radio-browser (community popularity ranking). */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (/^[0-9a-f-]{36}$/i.test(id)) await countClick(id);
  return json({ ok: true }, { cache: "no-store" });
}

export const OPTIONS = preflight;
