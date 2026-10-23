import { NextResponse } from "next/server";
import zlib from "node:zlib";

// Ported from lib/provider/epg_provider.dart — parses the gzip-compressed XMLTV
// feed server side, keeps a window of now-4h .. now+28h, and serves programs
// keyed by the same normalized nameKey the client uses.

const epgUrl = "https://mitthu786.github.io/tvepg/tataplay/epg.xml.gz";
const timeoutMs = 30_000;

type StoredProgram = { t: string; d: string; s: number; e: number; k: string };

type Cached = { body: string; time: number };
let cache: Cached | null = null;
const CACHE_MS = 60 * 60 * 1000;

export function nameKey(name: string) {
  return name
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/\bhd\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function unescapeXml(s: string) {
  if (!s.includes("&")) return s;
  let out = s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (m, hex: string) => {
    const code = parseInt(hex, 16);
    return code > 0 && code <= 0x10ffff ? String.fromCharCode(code) : m;
  });
  out = out.replace(/&#(\d+);/g, (m, dec: string) => {
    const code = parseInt(dec, 10);
    return code > 0 && code <= 0x10ffff ? String.fromCharCode(code) : m;
  });
  return out.replace(/&amp;/g, "&");
}

function parseXmlTime(s: string) {
  const clean = s.split(" ")[0].trim();
  const y = Number(clean.slice(0, 4));
  const mo = Number(clean.slice(4, 6));
  const d = Number(clean.slice(6, 8));
  const h = Number(clean.slice(8, 10));
  const mi = Number(clean.slice(10, 12));
  const sec = clean.length >= 14 ? Number(clean.slice(12, 14)) : 0;
  // The feed is IST (UTC+5:30); convert to UTC ms then to local on the client.
  return Date.UTC(y, mo - 1, d, h, mi, sec) - 5.5 * 60 * 60 * 1000;
}

function parseEpg(xml: string): Record<string, StoredProgram[]> {
  // 1. Map channel ID to cleaned nameKey
  const chanIdToKey = new Map<string, string>();
  const chanNameRegex = /<channel id="([^"]+)">\s*<display-name>([^<]+)<\/display-name>/g;
  for (const m of xml.matchAll(chanNameRegex)) {
    chanIdToKey.set(m[1], nameKey(unescapeXml(m[2])));
  }

  // 2. Window: keep programs from 4 hours ago to 28 hours ahead (today + tonight)
  const now = Date.now();
  const minTime = now - 4 * 60 * 60 * 1000;
  const maxTime = now + 28 * 60 * 60 * 1000;

  const progRegex =
    /<programme start="([^"]+)" stop="([^"]+)" channel="([^"]+)"[^>]*>\s*<title>([^<]+)<\/title>(?:\s*<desc>([^<]*)<\/desc>)?/g;

  const out: Record<string, StoredProgram[]> = {};

  for (const m of xml.matchAll(progRegex)) {
    const key = chanIdToKey.get(m[3]);
    if (!key) continue;
    const start = parseXmlTime(m[1]);
    const stop = parseXmlTime(m[2]);
    if (stop < minTime || start > maxTime) continue;

    const p: StoredProgram = {
      t: unescapeXml(m[4].trim()),
      d: unescapeXml((m[5] ?? "").trim()),
      s: start,
      e: stop,
      k: key,
    };
    (out[key] ??= []).push(p);
  }

  // Sort each channel's schedule chronologically
  for (const list of Object.values(out)) {
    list.sort((a, b) => a.s - b.s);
  }
  return out;
}

export async function GET() {
  if (cache && Date.now() - cache.time < CACHE_MS) {
    return NextResponse.json(JSON.parse(cache.body));
  }
  try {
    const resp = await fetch(epgUrl, { signal: AbortSignal.timeout(timeoutMs) });
    if (!resp.ok) {
      return NextResponse.json({ error: "EPG feed unavailable" }, { status: resp.status });
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    const xml = zlib.gunzipSync(buf).toString("utf8");
    const parsed = parseEpg(xml);
    const body = JSON.stringify(parsed);
    cache = { body, time: Date.now() };
    return NextResponse.json(JSON.parse(body));
  } catch {
    return NextResponse.json({ error: "Failed to load EPG" }, { status: 502 });
  }
}
