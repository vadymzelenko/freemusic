import "server-only";
import net from "node:net";
import tls from "node:tls";

/*
 * Reads the current "StreamTitle" from an Icecast / Shoutcast stream (ICY metadata).
 * Raw sockets on purpose: old Shoutcast servers answer "ICY 200 OK", which fetch() rejects.
 * Reads at most one/two metadata intervals (a few KB–64 KB) and disconnects.
 */

const UA = "Mozilla/5.0 (vzRadio; ICY metadata)";
const MAX_BYTES = 300_000;

function decodeMeta(buf: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    // legacy stations: Cyrillic in windows-1251, otherwise latin1
    const hi = buf.filter((b) => b >= 0xc0).length;
    return new TextDecoder(hi > 2 ? "windows-1251" : "latin1").decode(buf);
  }
}

export interface IcyMeta {
  title: string | null;
  /** AdsWizz / Triton ad insertion marker in the metadata */
  adMarker: boolean;
}

function parseMeta(meta: string): IcyMeta {
  const m = /StreamTitle='([\s\S]*?)';/.exec(meta) ?? /StreamTitle='([\s\S]*)/.exec(meta);
  const t = m?.[1]?.replace(/\0+$/, "").trim();
  const adMarker = /adw_ad='?true|insertionType='?(?:midroll|preroll)|\bad_id=|X-AD-/i.test(meta);
  return { title: t ? t : null, adMarker };
}

export function readIcyMeta(url: string, timeoutMs = 5000, redirects = 3): Promise<IcyMeta | null> {
  return new Promise((resolve) => {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      resolve(null);
      return;
    }
    const secure = u.protocol === "https:";
    const port = Number(u.port) || (secure ? 443 : 80);
    const sock: net.Socket = secure
      ? tls.connect({ host: u.hostname, port, servername: u.hostname, rejectUnauthorized: true })
      : net.connect(port, u.hostname);

    let settled = false;
    const finish = (v: IcyMeta | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sock.destroy();
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);

    let buf = Buffer.alloc(0);
    let headerDone = false;
    let metaint = 0;
    let bodyStart = 0;

    sock.on(secure ? "secureConnect" : "connect", () => {
      sock.write(
        `GET ${u.pathname || "/"}${u.search} HTTP/1.0\r\n` +
          `Host: ${u.host}\r\n` +
          `User-Agent: ${UA}\r\n` +
          `Icy-MetaData: 1\r\n` +
          `Accept: */*\r\n` +
          `Connection: close\r\n\r\n`,
      );
    });
    sock.on("error", () => finish(null));
    sock.on("end", () => finish(null));
    sock.on("data", (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length > MAX_BYTES) return finish(null);

      if (!headerDone) {
        const end = buf.indexOf("\r\n\r\n");
        if (end === -1) return;
        const head = buf.subarray(0, end).toString("latin1");
        const [status = "", ...lines] = head.split("\r\n");
        const code = Number(/^(?:HTTP\/\d\.\d|ICY)\s+(\d{3})/i.exec(status)?.[1] ?? 0);
        const headers = new Map(
          lines.map((l) => {
            const i = l.indexOf(":");
            return [l.slice(0, i).trim().toLowerCase(), l.slice(i + 1).trim()] as const;
          }),
        );
        if (code >= 300 && code < 400 && headers.get("location") && redirects > 0) {
          const next = new URL(headers.get("location")!, u).href;
          settled = true;
          clearTimeout(timer);
          sock.destroy();
          void readIcyMeta(next, timeoutMs, redirects - 1).then(resolve);
          return;
        }
        if (code !== 200) return finish(null);
        metaint = Number(headers.get("icy-metaint") ?? 0);
        if (!metaint) return finish(null); // station doesn't send titles
        headerDone = true;
        bodyStart = end + 4;
      }

      // [metaint audio bytes][1 length byte][len*16 metadata] … (look at up to 2 blocks)
      let pos = bodyStart;
      for (let block = 0; block < 2; block++) {
        const lenAt = pos + metaint;
        if (buf.length <= lenAt) return;
        const len = buf[lenAt]! * 16;
        if (buf.length < lenAt + 1 + len) return;
        if (len > 0) {
          return finish(parseMeta(decodeMeta(buf.subarray(lenAt + 1, lenAt + 1 + len))));
        }
        pos = lenAt + 1;
      }
      finish({ title: null, adMarker: false });
    });
  });
}

/** Back-compat helper: just the title. */
export async function readIcyTitle(url: string, timeoutMs = 5000): Promise<string | null> {
  return (await readIcyMeta(url, timeoutMs))?.title ?? null;
}
