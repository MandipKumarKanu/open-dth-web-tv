import { NextResponse } from "next/server";

// Ported from lib/provider/channels_provider.dart — runs server side instead of on device.

const streamsCatalogUrl =
  "https://raw.githubusercontent.com/kananinirav/Indian-IPTV-App/refs/heads/master/data/streams.csv";
const logoIndexUrl = "https://iptv-org.github.io/iptv/countries/in.m3u";
const timeoutMs = 20_000;

type Cached = { body: string; time: number };
let cache: Cached | null = null;
const CACHE_MS = 5 * 60 * 1000;

const tvgId = /tvg-id="([^"]*)"/;
const tvgLogo = /tvg-logo="([^"]*)"/;
const group = /group-title="([^"]*)"/;

type Entry = { info: string; url: string };

function attr(info: string, r: RegExp) {
  const m = r.exec(info);
  return m ? m[1] : "";
}

function entryName(info: string) {
  return info.substring(info.lastIndexOf(",") + 1).trim();
}

function entries(body: string): Entry[] {
  const out: Entry[] = [];
  let info: string | null = null;
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("#EXTINF:")) {
      info = line;
    } else if (line && !line.startsWith("#") && info) {
      out.push({ info, url: line });
      info = null;
    }
  }
  return out;
}

function baseId(id: string) {
  return id.split("@")[0].toLowerCase();
}

function nameKey(name: string) {
  return name
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/\bhd\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function cleanName(name: string) {
  return name.replace(/\s*\(\d+[pi]\)/g, "").replace(/\s*\[.*?\]/g, "").trim();
}

function resRank(name: string) {
  if (name.includes("2160p") || name.includes("4K")) return 4;
  if (name.includes("1080p")) return 3;
  if (name.includes("720p")) return 2;
  if (name.includes("576p")) return 1;
  return 0;
}

function resLabel(name: string) {
  if (name.includes("2160p") || name.includes("4K")) return "4K";
  if (name.includes("1080p")) return "1080p";
  if (name.includes("720p")) return "720p";
  if (name.includes("576p")) return "576p";
  if (name.includes("480p")) return "480p";
  return "HD";
}

function categoryFor(groupStr: string) {
  switch (groupStr.split(";")[0].trim().toLowerCase()) {
    case "news":
    case "legislative":
      return "News";
    case "entertainment":
    case "general":
    case "comedy":
    case "series":
      return "Entertainment";
    case "movies":
    case "classic":
      return "Movies";
    case "music":
      return "Music";
    case "sports":
      return "Sports";
    case "kids":
    case "animation":
    case "family":
      return "Kids";
    case "documentary":
    case "science":
    case "travel":
    case "culture":
    case "education":
    case "lifestyle":
    case "cooking":
    case "outdoor":
      return "Infotainment";
    case "business":
      return "Business";
    case "religious":
      return "Devotional";
    default:
      return "Other";
  }
}

function parseCatalog(csv: string) {
  const out: Array<{ name: string; url: string }> = [];
  for (const line of csv.split("\n")) {
    const t = line.trim();
    if (!t || t.toLowerCase().startsWith("name,")) continue;
    const comma = t.indexOf(",");
    if (comma <= 0) continue;
    out.push({ name: t.substring(0, comma).trim(), url: t.substring(comma + 1).trim() });
  }
  return out;
}

type StreamObj = { url: string; rank: number; label: string };
type Built = Record<string, unknown> & {
  n: string;
  l: string;
  c: string;
  i: string;
  r: string;
  s: string[];
  sr: string[];
};

export async function GET() {
  if (cache && Date.now() - cache.time < CACHE_MS) {
    return NextResponse.json(JSON.parse(cache.body));
  }
  try {
    const catalogRes = await fetch(streamsCatalogUrl, { signal: AbortSignal.timeout(timeoutMs) });
    if (!catalogRes.ok) throw new Error("Failed to load stream sources");
    const sources = parseCatalog(await catalogRes.text());

    const results = await Promise.allSettled([
      fetch(logoIndexUrl, { signal: AbortSignal.timeout(timeoutMs) }).then((r) =>
        r.ok ? r.text() : ""
      ),
      ...sources.map((s) =>
        fetch(s.url, { signal: AbortSignal.timeout(timeoutMs) }).then((r) => (r.ok ? r.text() : ""))
      ),
    ]);

    const index = results[0].status === "fulfilled" ? (results[0].value as string) : "";
    const playlistBodies = results.slice(1).map((r, i) => ({
      name: sources[i].name,
      body: r.status === "fulfilled" ? (r.value as string) : "",
    }));

    // index: channel id / name -> logo + group
    const logoById = new Map<string, string>();
    const logoByName = new Map<string, string>();
    const groupById = new Map<string, string>();
    const groupByName = new Map<string, string>();
    for (const e of entries(index)) {
      const id = baseId(attr(e.info, tvgId));
      const key = nameKey(entryName(e.info));
      const logo = attr(e.info, tvgLogo);
      const grp = attr(e.info, group);
      if (logo.startsWith("http")) {
        if (id && !logoById.has(id)) logoById.set(id, logo);
        if (key && !logoByName.has(key)) logoByName.set(key, logo);
      }
      if (grp) {
        if (id && !groupById.has(id)) groupById.set(id, grp);
        if (key && !groupByName.has(key)) groupByName.set(key, grp);
      }
    }

    // merge all playlists; same channel in the same category -> one tile with ranked streams
    const byKey = new Map<string, { n: string; l: string; c: string; i: string; streams: StreamObj[] }>();
    for (const p of playlistBodies) {
      const sportsList = p.name.toLowerCase().includes("sport");
      for (const e of entries(p.body)) {
        const id = attr(e.info, tvgId);
        const base = baseId(id);
        const key = nameKey(entryName(e.info));
        if (!key) continue;
        const g = attr(e.info, group);
        const categoryName = sportsList
          ? "Sports"
          : categoryFor(g || groupById.get(base) || groupByName.get(key) || "");
        let logo = attr(e.info, tvgLogo);
        if (!logo.startsWith("http")) logo = logoById.get(base) || logoByName.get(key) || "";

        const streamObj: StreamObj = {
          url: e.url,
          rank: resRank(entryName(e.info)),
          label: resLabel(entryName(e.info)),
        };

        const k = `${categoryName}|${key}`;
        const existing = byKey.get(k);
        if (existing) {
          if (!existing.streams.some((s) => s.url === e.url)) existing.streams.push(streamObj);
          continue;
        }
        byKey.set(k, {
          n: cleanName(entryName(e.info)),
          l: logo,
          c: categoryName,
          i: id,
          streams: [streamObj],
        });
      }
    }

    const list: Built[] = [];
    for (const item of byKey.values()) {
      item.streams.sort((a, b) => b.rank - a.rank);
      list.push({
        n: item.n,
        l: item.l,
        c: item.c,
        i: item.i,
        r: item.streams[0].label,
        s: item.streams.map((s) => s.url),
        sr: item.streams.map((s) => s.label),
      });
    }

    // Indian channels first, then by name
    const indian = (m: Built) => m.i.includes(".in@") || m.i.endsWith(".in");
    list.sort((a, b) => {
      const ia = indian(a) ? 0 : 1;
      const ib = indian(b) ? 0 : 1;
      if (ia !== ib) return ia - ib;
      return a.n.toLowerCase().localeCompare(b.n.toLowerCase());
    });

    const body = JSON.stringify(list);
    cache = { body, time: Date.now() };
    return NextResponse.json(JSON.parse(body));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load channels";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
