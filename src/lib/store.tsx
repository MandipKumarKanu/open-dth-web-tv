"use client";

// Ported from the ChangeNotifier providers: favorites, recent, stream memory,
// player settings, reminders, channels feed and EPG — persisted to localStorage,
// hosted in a single React context.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type Channel,
  type Program,
  channelIdKey,
  nameKey,
  storedChannelToChannel,
  storedProgramToProgram,
} from "./live-tv";

const MAX_RECENT = 20;

export type ScreenFitMode = "fill" | "contain" | "cover";

export const screenFitMeta: Record<
  ScreenFitMode,
  { label: string; description: string; objectFit: "fill" | "contain" | "cover" }
> = {
  fill: { label: "Full (16:9)", description: "Fills 100% TV screen · Zero black borders", objectFit: "fill" },
  contain: { label: "Original", description: "Standard broadcast aspect ratio", objectFit: "contain" },
  cover: { label: "Zoom", description: "Crops top/bottom to fill screen", objectFit: "cover" },
};

export interface ProgramReminder {
  id: string;
  cn: string;
  ck: string;
  cl: string;
  pt: string;
  pd: string;
  st: number;
  et: number;
  tr: boolean;
}

interface Store {
  channels: Channel[] | null;
  loading: boolean;
  error: string | null;
  favorites: string[];
  toggleFavorite: (c: Channel) => void;
  isFavorite: (c: Channel) => boolean;
  recents: string[];
  addRecent: (c: Channel) => void;
  getPreferredStreamIndex: (c: Channel) => number;
  rememberWorkingStream: (c: Channel, url: string) => void;
  reportStreamFailure: (c: Channel, url: string) => void;
  screenFit: ScreenFitMode;
  cycleScreenFit: () => ScreenFitMode;
  preferredAudioLanguage: string;
  setPreferredAudioLanguage: (lang: string) => void;
  reminders: ProgramReminder[];
  toggleReminder: (channel: Channel, program: Program) => boolean;
  isReminderSet: (channelKey: string, p: Program) => boolean;
  onReminderDue: ((r: ProgramReminder) => void) | null;
  setOnReminderDue: (fn: ((r: ProgramReminder) => void) | null) => void;
  epg: Map<string, Program[]>;
  epgLoading: boolean;
  getNow: (c: Channel, now?: Date) => Program | null;
  getNext: (c: Channel, now?: Date) => Program | null;
  getSchedule: (c: Channel, from?: Date, to?: Date) => Program[];
  epgChannelKey: (c: Channel) => string;
  favoritesVersion: number;
  recentsVersion: number;
  epgVersion: number;
}

const StoreContext = createContext<Store | null>(null);

export function buildReminderId(channelKey: string, p: Program) {
  return `${channelKey}_${p.title}_${p.start.getTime()}`;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

export function StoreProvider({
  children,
  initialChannels,
  initialEpg,
}: {
  children: React.ReactNode;
  initialChannels?: Channel[];
  initialEpg?: Record<string, Program[]>;
}) {
  const [channels, setChannels] = useState<Channel[] | null>(
    initialChannels ?? null
  );
  const [loading, setLoading] = useState(!initialChannels);
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [streamMemory, setStreamMemory] = useState<Record<string, string>>({});
  const [screenFit, setScreenFit] = useState<ScreenFitMode>("fill");
  const [preferredAudioLanguage, setPreferredAudioLanguageState] = useState("");
  const [reminders, setReminders] = useState<ProgramReminder[]>([]);
  const [epg, setEpg] = useState<Map<string, Program[]>>(
    initialEpg ? new Map(Object.entries(initialEpg)) : new Map()
  );
  const [epgLoading, setEpgLoading] = useState(!initialEpg);
  const [favoritesVersion, setFavoritesVersion] = useState(0);
  const [recentsVersion, setRecentsVersion] = useState(0);
  const [epgVersion, setEpgVersion] = useState(0);

  const [onReminderDue, setOnReminderDueState] = useState<((r: ProgramReminder) => void) | null>(null);
  const onReminderDueRef = useRef<((r: ProgramReminder) => void) | null>(null);
  const loadedRef = useRef(false);

  // ------------------------------------------------ persisted stores
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    const favs = readJson<string[]>("favorites.json");
    if (favs) setFavorites(favs);
    const recent = readJson<string[]>("recent_channels.json");
    if (recent) setRecents(recent.slice(0, MAX_RECENT));
    const mem = readJson<Record<string, string>>("stream_memory.json");
    if (mem) {
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(mem)) if (typeof v === "string" && v) clean[k] = v;
      setStreamMemory(clean);
    }
    const settings = readJson<{ screenFit?: ScreenFitMode; audioLang?: string }>("player_settings.json");
    if (settings) {
      if (
        settings.screenFit === "fill" ||
        settings.screenFit === "contain" ||
        settings.screenFit === "cover"
      ) {
        setScreenFit(settings.screenFit);
      }
      if (settings.audioLang) setPreferredAudioLanguageState(settings.audioLang);
    }
    const rem = readJson<ProgramReminder[]>("program_reminders_v1.json");
    if (rem) {
      // Prune reminders older than 12 hours
      const now = Date.now();
      setReminders(rem.filter((r) => now - r.et < 12 * 60 * 60 * 1000));
    }
  }, []);

  // ------------------------------------------------ channels
  // If the server already provided channels, skip the client-side fetch.
  useEffect(() => {
    if (initialChannels) return;
    let cancelled = false;
    (async () => {
      // 1) cached list -> instant start
      const cached = readJson<unknown[]>("channels_v4.json");
      if (cached && cached.length > 0 && !cancelled) {
        const list = cached
          .filter((j): j is Record<string, unknown> => typeof j === "object" && j !== null)
          .map((j) => storedChannelToChannel(j as never));
        if (list.length > 0) {
          setChannels(list);
          setLoading(false);
          return;
        }
      }

      // Fetch only when there is no usable local cache.
      try {
        const res = await fetch("/api/channels");
        if (!res.ok) throw new Error("Failed to load channels");
        const body = (await res.json()) as unknown;
        if (cancelled) return;
        if (!Array.isArray(body) || body.length === 0) throw new Error("No channels found");
        const fresh = body
          .filter((j): j is Record<string, unknown> => typeof j === "object" && j !== null)
          .map((j) => storedChannelToChannel(j as never));
        if (fresh.length === 0) throw new Error("No valid channels found");
        writeJson("channels_v4.json", body);
        setChannels(fresh);
        setError(null);
      } catch (cause) {
        if (!cancelled && !cached) {
          setLoading(false);
          setError(cause instanceof Error ? cause.message : "Could not load channels. Check the internet connection.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialChannels]);

  // ------------------------------------------------ epg
  // If the server already provided EPG, skip the client-side fetch.
  useEffect(() => {
    if (initialEpg) return;
    let cancelled = false;
    (async () => {
      setEpgLoading(true);
      try {
        const res = await fetch("/api/epg");
        if (!res.ok) return;
        const body = (await res.json()) as Record<string, unknown[]>;
        if (cancelled) return;
        const map = new Map<string, Program[]>();
        for (const [key, raws] of Object.entries(body)) {
          if (!Array.isArray(raws)) continue;
          map.set(
            key,
            raws.map((r) => storedProgramToProgram(r as never))
          );
        }
        setEpg(map);
        setEpgVersion((v) => v + 1);
      } finally {
        if (!cancelled) setEpgLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialEpg]);

  const remindersRef = useRef<ProgramReminder[]>([]);
  useEffect(() => {
    remindersRef.current = reminders;
  }, [reminders]);

  // ------------------------------------------------ reminder ticker
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      let changed = false;
      const due: ProgramReminder[] = [];
      setReminders((current) => {
        const next = current.map((r) => {
          if (r.tr) return r;
          const diffMin = (r.st - now) / 60000;
          if (diffMin <= 2 && diffMin >= -3) {
            changed = true;
            due.push(r);
            return { ...r, tr: true };
          }
          return r;
        });
        return changed ? next : current;
      });
      if (changed) {
        writeJson("program_reminders_v1.json", remindersRef.current);
        for (const r of due) onReminderDueRef.current?.(r);
      }
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const setOnReminderDue = useCallback((fn: ((r: ProgramReminder) => void) | null) => {
    onReminderDueRef.current = fn;
    setOnReminderDueState(() => fn);
  }, []);

  const favoritesRef = useRef<string[]>(favorites);
  useEffect(() => {
    favoritesRef.current = favorites;
  }, [favorites]);

  const setFavoritesBacked = useCallback((key: string) => {
    setFavorites((current) => {
      const added = !current.includes(key);
      const next = added ? [...current, key] : current.filter((k) => k !== key);
      favoritesRef.current = next;
      writeJson("favorites.json", next);
      setFavoritesVersion((v) => v + 1);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((c: Channel) => {
    const key = channelIdKey(c);
    setFavoritesBacked(key);
  }, [setFavoritesBacked]);

  const isFavorite = useCallback(
    (c: Channel) => favoritesRef.current.includes(channelIdKey(c)),
    []
  );

  const recentsRef = useRef<string[]>(recents);
  useEffect(() => {
    recentsRef.current = recents;
  }, [recents]);

  const addRecent = useCallback((c: Channel) => {
    const key = channelIdKey(c);
    setRecents((current) => {
      const next = [key, ...current.filter((k) => k !== key)].slice(0, MAX_RECENT);
      recentsRef.current = next;
      writeJson("recent_channels.json", next);
      setRecentsVersion((v) => v + 1);
      return next;
    });
  }, []);

  const streamMemoryRef = useRef<Record<string, string>>(streamMemory);
  useEffect(() => {
    streamMemoryRef.current = streamMemory;
  }, [streamMemory]);

  const getPreferredStreamIndex = useCallback((c: Channel) => {
    if (c.streamUrls.length === 0) return 0;
    const remembered = streamMemoryRef.current[channelIdKey(c)];
    if (remembered) {
      const idx = c.streamUrls.indexOf(remembered);
      if (idx >= 0) return idx;
    }
    return 0;
  }, []);

  const rememberWorkingStream = useCallback((c: Channel, url: string) => {
    if (!url) return;
    const key = channelIdKey(c);
    setStreamMemory((current) => {
      if (current[key] === url) return current;
      const next = { ...current, [key]: url };
      streamMemoryRef.current = next;
      writeJson("stream_memory.json", next);
      return next;
    });
  }, []);

  const reportStreamFailure = useCallback((c: Channel, failedUrl: string) => {
    const key = channelIdKey(c);
    setStreamMemory((current) => {
      if (current[key] !== failedUrl) return current;
      const next = { ...current };
      delete next[key];
      streamMemoryRef.current = next;
      writeJson("stream_memory.json", next);
      return next;
    });
  }, []);

  const preferredAudioLanguageRef = useRef(preferredAudioLanguage);
  useEffect(() => {
    preferredAudioLanguageRef.current = preferredAudioLanguage;
  }, [preferredAudioLanguage]);

  const screenFitRef = useRef(screenFit);
  useEffect(() => {
    screenFitRef.current = screenFit;
  }, [screenFit]);

  const cycleScreenFit = useCallback((): ScreenFitMode => {
    const order: ScreenFitMode[] = ["fill", "contain", "cover"];
    let next: ScreenFitMode = "fill";
    setScreenFit((current) => {
      next = order[(order.indexOf(current) + 1) % order.length];
      writeJson("player_settings.json", {
        screenFit: next,
        audioLang: preferredAudioLanguageRef.current,
      });
      return next;
    });
    return next;
  }, []);

  const setPreferredAudioLanguage = useCallback((lang: string) => {
    setPreferredAudioLanguageState((current) => {
      if (current === lang) return current;
      writeJson("player_settings.json", { screenFit: screenFitRef.current, audioLang: lang });
      return lang;
    });
  }, []);

  const toggleReminder = useCallback((channel: Channel, p: Program): boolean => {
    const channelKey = channelIdKey(channel);
    const id = buildReminderId(channelKey, p);
    let added = false;
    setReminders((current) => {
      const idx = current.findIndex((r) => r.id === id);
      let next: ProgramReminder[];
      if (idx >= 0) {
        next = current.filter((r) => r.id !== id);
        added = false;
      } else {
        added = true;
        next = [
          ...current,
          {
            id,
            cn: channel.name,
            ck: channelKey,
            cl: channel.logoUrl,
            pt: p.title,
            pd: p.desc,
            st: p.start.getTime(),
            et: p.stop.getTime(),
            tr: false,
          },
        ];
      }
      writeJson("program_reminders_v1.json", next);
      return next;
    });
    return added;
  }, []);

  const isReminderSet = useCallback((channelKey: string, p: Program) => {
    const id = buildReminderId(channelKey, p);
    return remindersRef.current.some((r) => r.id === id);
  }, []);

  const epgRef = useRef(epg);
  useEffect(() => {
    epgRef.current = epg;
  }, [epg]);

  const epgChannelKey = useCallback(
    (c: Channel) => {
      const keyFromName = nameKey(c.name);
      if (epgRef.current.has(keyFromName)) return keyFromName;
      if (c.tvgId) {
        const keyFromId = nameKey(c.tvgId.split("@")[0]);
        if (epgRef.current.has(keyFromId)) return keyFromId;
      }
      return keyFromName;
    },
    []
  );

  const getNow = useCallback(
    (c: Channel, now = new Date()) => {
      const list = epgRef.current.get(epgChannelKey(c));
      if (!list || list.length === 0) return null;
      for (const p of list) {
        if (now.getTime() > p.start.getTime() && now.getTime() < p.stop.getTime()) return p;
      }
      return null;
    },
    [epgChannelKey]
  );

  const getNext = useCallback(
    (c: Channel, now = new Date()) => {
      const list = epgRef.current.get(epgChannelKey(c));
      if (!list || list.length === 0) return null;
      let nextCandidate: Program | null = null;
      for (const p of list) {
        if (p.start.getTime() >= now.getTime()) {
          if (!nextCandidate || p.start < nextCandidate.start) nextCandidate = p;
        }
      }
      return nextCandidate;
    },
    [epgChannelKey]
  );

  const getSchedule = useCallback(
    (c: Channel, from?: Date, to?: Date) => {
      const list = epgRef.current.get(epgChannelKey(c));
      if (!list || list.length === 0) return [];
      if (!from && !to) return list;
      return list.filter((p) => {
        if (to && p.start.getTime() > to.getTime()) return false;
        if (from && p.stop.getTime() < from.getTime()) return false;
        return true;
      });
    },
    [epgChannelKey]
  );

  const value = useMemo<Store>(
    () => ({
      channels,
      loading,
      error,
      favorites,
      favoritesVersion,
      toggleFavorite,
      isFavorite,
      recents,
      recentsVersion,
      addRecent,
      getPreferredStreamIndex,
      rememberWorkingStream,
      reportStreamFailure,
      screenFit,
      cycleScreenFit,
      preferredAudioLanguage,
      setPreferredAudioLanguage,
      reminders,
      toggleReminder,
      isReminderSet,
      onReminderDue,
      setOnReminderDue,
      epg,
      epgLoading,
      epgVersion,
      getNow,
      getNext,
      getSchedule,
      epgChannelKey,
    }),
    [
      channels,
      loading,
      error,
      favorites,
      favoritesVersion,
      toggleFavorite,
      isFavorite,
      recents,
      recentsVersion,
      addRecent,
      getPreferredStreamIndex,
      rememberWorkingStream,
      reportStreamFailure,
      screenFit,
      cycleScreenFit,
      preferredAudioLanguage,
      setPreferredAudioLanguage,
      reminders,
      toggleReminder,
      isReminderSet,
      onReminderDue,
      setOnReminderDue,
      epg,
      epgLoading,
      epgVersion,
      getNow,
      getNext,
      getSchedule,
      epgChannelKey,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}
