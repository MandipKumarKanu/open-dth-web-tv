// Ported from lib/model/channel.dart, lib/model/program.dart,
// lib/provider/channels_provider.dart and lib/provider/epg_provider.dart.

export interface Channel {
  name: string;
  logoUrl: string;
  category: string;
  tvgId: string;
  resolution: string;
  streamUrls: string[];
  streamResolutions: string[];
}

export interface Program {
  title: string;
  desc: string;
  start: Date;
  stop: Date;
  channelKey: string;
}

export type StoredChannel = {
  n: string;
  l: string;
  c: string;
  i: string;
  s: string[];
  sr: string[];
  r: string;
};

export type StoredProgram = { t: string; d: string; s: number; e: number; k: string };

export function storedChannelToChannel(j: StoredChannel): Channel {
  const urls = j.s ?? [];
  const res = j.r ?? "HD";
  return {
    name: j.n,
    logoUrl: j.l,
    category: j.c,
    tvgId: j.i ?? "",
    streamUrls: urls,
    streamResolutions: (j.sr && j.sr.length === urls.length ? j.sr : urls.map(() => res)),
    resolution: res,
  };
}

export function hasLogo(c: Channel) {
  return c.logoUrl.startsWith("http");
}

export function channelIdKey(c: Channel) {
  return c.tvgId.trim().length > 0 ? c.tvgId.toLowerCase() : `${c.category}|${c.name.toLowerCase()}`;
}

// ---------------------------------------------------------------- keys

/** "AajTak.in@HD" -> "aajtak.in" */
export function baseId(id: string) {
  return id.split("@")[0].toLowerCase();
}

/** "Aaj Tak HD (1080p) [Geo-blocked]" -> "aajtak" (also the EPG channel key) */
export function nameKey(name: string) {
  return name
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/\bhd\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/// "Aaj Tak HD (1080p) [Geo-blocked]" -> "Aaj Tak HD"
export function cleanName(name: string) {
  return name.replace(/\s*\(\d+[pi]\)/g, "").replace(/\s*\[.*?\]/g, "").trim();
}

// ---------------------------------------------------------------- resolution

export function resRank(name: string) {
  if (name.includes("2160p") || name.includes("4K")) return 4;
  if (name.includes("1080p")) return 3;
  if (name.includes("720p")) return 2;
  if (name.includes("576p")) return 1;
  return 0;
}

export function resLabel(name: string) {
  if (name.includes("2160p") || name.includes("4K")) return "4K";
  if (name.includes("1080p")) return "1080p";
  if (name.includes("720p")) return "720p";
  if (name.includes("576p")) return "576p";
  if (name.includes("480p")) return "480p";
  return "HD";
}

// ---------------------------------------------------------------- categories

/// Sidebar order. Categories with no channels are hidden.
export const categoryOrder = [
  "Favorites",
  "Recent",
  "News",
  "Entertainment",
  "Movies",
  "Music",
  "Sports",
  "Kids",
  "Infotainment",
  "Business",
  "Devotional",
  "Other",
];

export function categoryFor(group: string) {
  switch (group.split(";")[0].trim().toLowerCase()) {
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

// ---------------------------------------------------------------- languages

export const indianLanguages = [
  "All",
  "Hindi",
  "English",
  "Telugu",
  "Tamil",
  "Bangla",
  "Punjabi",
  "Marathi",
  "Gujarati",
  "Bhojpuri",
  "Kannada",
  "Malayalam",
];

export const languageFlags: Record<string, string> = {
  All: "🌐",
  Hindi: "🇮🇳",
  English: "🌐",
  Telugu: "🪷",
  Tamil: "🌴",
  Bangla: "🐯",
  Punjabi: "🌾",
  Marathi: "🏰",
  Gujarati: "🦁",
  Bhojpuri: "🎵",
  Kannada: "📕",
  Malayalam: "🛶",
};

export function channelMatchesLanguage(c: Channel, lang: string) {
  if (lang === "All") return true;
  const n = c.name.toLowerCase();
  const id = c.tvgId.toLowerCase();
  const l = lang.toLowerCase();

  if (l === "hindi") {
    return (
      n.includes("hindi") ||
      n.includes("aaj tak") ||
      n.includes("zee news") ||
      n.includes("india tv") ||
      n.includes("ndtv india") ||
      n.includes("news18 india") ||
      n.includes("abp news") ||
      n.includes("&tv") ||
      n.includes("colors rishtey") ||
      n.includes("star bharat") ||
      n.includes("star plus") ||
      n.includes("zee tv") ||
      n.includes("sony pal") ||
      n.includes("dangal") ||
      n.includes("shemaroo") ||
      n.includes("b4u") ||
      n.includes("manoranjan") ||
      n.includes("samay")
    );
  }
  if (l === "english") {
    return (
      n.includes("english") ||
      n.includes("cnn") ||
      n.includes("bbc") ||
      n.includes("republic tv") ||
      n.includes("times now") ||
      n.includes("india today") ||
      n.includes("wion") ||
      n.includes("ndtv 24x7") ||
      n.includes("al jazeera")
    );
  }
  if (l === "bangla") {
    return n.includes("bangla") || n.includes("bengali") || n.includes("kolkata") || id.includes("bangla");
  }
  return n.includes(l) || id.includes(l);
}

// ---------------------------------------------------------------- program helpers

export function programIsLive(p: Program, now = new Date()) {
  return now.getTime() > p.start.getTime() && now.getTime() < p.stop.getTime();
}

export function programProgress(p: Program, now = new Date()) {
  if (now.getTime() < p.start.getTime()) return 0;
  if (now.getTime() > p.stop.getTime()) return 1;
  const total = (p.stop.getTime() - p.start.getTime()) / 1000;
  if (total <= 0) return 0;
  const v = (now.getTime() - p.start.getTime()) / 1000 / total;
  return Math.min(1, Math.max(0, v));
}

export function formatTime(dt: Date) {
  const hour = dt.getHours() % 12 === 0 ? 12 : dt.getHours() % 12;
  const min = String(dt.getMinutes()).padStart(2, "0");
  const ampm = dt.getHours() >= 12 ? "PM" : "AM";
  return `${hour}:${min} ${ampm}`;
}

export function programTimeRangeText(p: Program) {
  return `${formatTime(p.start)} - ${formatTime(p.stop)}`;
}

export function programRemainingText(p: Program, now = new Date()) {
  if (now.getTime() < p.start.getTime()) {
    const inMin = Math.round((p.start.getTime() - now.getTime()) / 60000);
    return inMin > 60 ? `Starts in ${Math.floor(inMin / 60)}h ${inMin % 60}m` : `Starts in ${inMin} min`;
  }
  const rem = Math.round((p.stop.getTime() - now.getTime()) / 60000);
  return rem > 0 ? `${rem} min left` : "Ending soon";
}

export function programDurationMinutes(p: Program) {
  return Math.round((p.stop.getTime() - p.start.getTime()) / 60000);
}

export function programDurationText(p: Program) {
  const min = programDurationMinutes(p);
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${min} min`;
}

/** Extracts episode info like "Season 20 • Episode 44" or "Episode 2" */
export function programEpisodeInfo(p: Program) {
  const sE =
    /\bS(\d+)\s*E(\d+)\b/i.exec(p.desc) ??
    /\bS(\d+)\s*E(\d+)\b/i.exec(p.title);
  if (sE) return `Season ${Number(sE[1])} • Episode ${Number(sE[2])}`;

  const epOnly =
    /\b(?:Ep|Episode)\.?\s*(\d+)\b/i.exec(p.desc) ??
    /\b(?:Ep|Episode)\.?\s*(\d+)\b/i.exec(p.title);
  if (epOnly) return `Episode ${epOnly[1]}`;

  return null;
}

export function programSynopsis(p: Program) {
  if (p.desc.trim().length === 0) {
    return "No detailed synopsis available for this broadcast.";
  }
  return p.desc.trim();
}

/** Detects cast or host highlights if mentioned in the description */
export function programCastHighlight(p: Program) {
  if (!p.desc) return null;
  const m =
    /(?:starring|cast|hosted by|featuring|with)\s*[:\-]?\s*([^.]+)/i.exec(p.desc);
  return m ? m[1].trim() : null;
}

export function nowNextBaseline() {
  return new Date();
}

// ---------------------------------------------------------------- generated icons

/** "Aaj Tak HD (1080p)" -> "AT", "9X Jalwa" -> "9X", "Zoom" -> "ZOO" */
export function channelInitials(name: string) {
  const clean = name
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/\b(HD|SD|TV)\b/gi, "")
    .trim();
  const words = clean.split(/[\s\-_/&.]+/).filter((w) => w.length > 0);
  if (words.length === 0) return "TV";
  const first = words[0];
  if (/\d/.test(first) && first.length <= 4) return first.toUpperCase();
  if (words.length === 1) {
    if (first.length < 3) return first.toUpperCase();
    // "Zoom" -> "ZOO"
    return first.slice(0, 3).toUpperCase();
  }
  return words.slice(0, 3).map((w) => w[0]).join("").toUpperCase();
}

/** Stable, pleasant colour per channel name (same channel -> same colour every time). */
export function colorFor(name: string): { h: number; s: number; l: number } {
  const key = name.replace(/\(.*?\)|\[.*?\]/g, "").trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) & 0x7fffffff;
  }
  return { h: h % 360, s: 55, l: 45 };
}

// ---------------------------------------------------------------- remote key helpers

export function isSelectKey(k: string): boolean {
  // Enter / numpad enter / Select on TV remotes
  return k === "Enter" || k === "NumpadEnter" || k === "GamepadA";
}

export function isBackKey(k: string): boolean {
  return k === "Escape" || k === "Backspace" || k === "BrowserBack";
}

export function isVoiceKey(e: KeyboardEvent): boolean {
  // F doubles as the assistant button in the browser
  return e.code === "F5";
}

export function storedProgramToProgram(
  j: { t?: string; d?: string; s?: number; e?: number; k?: string }
): Program {
  return {
    title: j.t ?? "",
    desc: j.d ?? "",
    start: new Date(j.s ?? 0),
    stop: new Date(j.e ?? 0),
    channelKey: j.k ?? "",
  };
}
