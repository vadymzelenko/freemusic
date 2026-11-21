import { getYT, getYTBrowse } from "@/lib/yt";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Called by the app on launch: boots the function instance + YouTube sessions before the first tap. */
export async function GET() {
  const t0 = Date.now();
  await Promise.allSettled([getYTBrowse(), getYT()]);
  return json({ ok: true, ms: Date.now() - t0 }, { cache: "no-store" });
}
