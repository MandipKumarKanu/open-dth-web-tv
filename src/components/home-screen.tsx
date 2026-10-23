"use client";

// Ported from lib/screens/home.dart: sidebar, sectioned channel grid, D-pad
// movement, language filter dialog, mobile topbar/pills and empty states.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Baby,
  Clapperboard,
  Compass,
  Drama,
  History,
  Home as HomeIcon,
  Languages,
  LayoutGrid,
  MoreHorizontal,
  Music,
  Newspaper,
  Search,
  Sparkles,
  Star,
  TrendingUp,
  Trophy,
  Tv,
  TvMinimal,
} from "lucide-react";
import {
  type Channel,
  channelIdKey,
  channelMatchesLanguage,
  categoryOrder,
} from "@/lib/live-tv";
import { useStore } from "@/lib/store";
import { ChannelIcon } from "./channel-icon";
import { LanguageDialog } from "./language-dialog";
import { TvSearchDialog } from "./tv-search-dialog";

const categoryIcons: Record<string, React.ReactNode> = {
  Home: <HomeIcon size={18} />,
  All: <LayoutGrid size={18} />,
  Favorites: <Star size={18} />,
  Recent: <History size={18} />,
  News: <Newspaper size={18} />,
  Entertainment: <Drama size={18} />,
  Movies: <Clapperboard size={18} />,
  Music: <Music size={18} />,
  Sports: <Trophy size={18} />,
  Kids: <Baby size={18} />,
  Infotainment: <Compass size={18} />,
  Business: <TrendingUp size={18} />,
  Devotional: <Sparkles size={18} />,
  Other: <MoreHorizontal size={18} />,
};

function iconFor(cat: string) {
  return categoryIcons[cat] ?? <Tv size={18} />;
}

type Zone = "search" | "side" | "lang" | "tile";

export interface PlayRequest {
  channels: Channel[];
  index: number;
  initialCategory: string;
}

export function HomeScreen({
  onPlay,
}: {
  onPlay: (req: PlayRequest) => void;
}) {
  const store = useStore();
  const {
    channels,
    loading,
    error,
    favorites,
    recents,
    toggleFavorite,
  } = store;

  const [categories, setCategories] = useState<string[]>([]);
  const [byCategory, setByCategory] = useState<Map<string, Channel[]>>(new Map());
  const [selected, setSelected] = useState(0);
  const [selectedLanguage, setSelectedLanguage] = useState("All");
  const [languageDialogOpen, setLanguageDialogOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [zone, setZone] = useState<Zone>("side");
  const [sideIndex, setSideIndex] = useState(0);
  const [tileIndex, setTileIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [gridWidth, setGridWidth] = useState(0);

  const gridRef = useRef<HTMLDivElement>(null);
  const zoneRef = useRef<Zone>(zone);
  const selectedRef = useRef(selected);
  const categoriesRef = useRef(categories);
  const tileIndexRef = useRef(0);
  const sideIndexRef = useRef(0);
  const switchTimerRef = useRef<number | null>(null);
  const okTimerRef = useRef<number | null>(null);
  const okTriggeredRef = useRef(false);
  const historyReadyRef = useRef(false);

  useEffect(() => {
    zoneRef.current = zone;
  }, [zone]);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  useEffect(() => {
    categoriesRef.current = categories;
  }, [categories]);
  useEffect(() => {
    tileIndexRef.current = tileIndex;
  }, [tileIndex]);
  useEffect(() => {
    sideIndexRef.current = sideIndex;
  }, [sideIndex]);

  useEffect(() => {
    const state = window.history.state;
    if (!state?.openDthApp || state.screen !== "home") {
      window.history.replaceState(
        { openDthApp: true, screen: "home", category: 0 },
        "",
        window.location.href
      );
    }
    historyReadyRef.current = true;

    const onPopState = (event: PopStateEvent) => {
      const next = event.state;
      if (!next?.openDthApp || next.screen !== "home") return;
      if (next.search) {
        setSearchOpen(true);
        return;
      }
      setSearchOpen(false);
      if (typeof next.category === "number") {
        setSelected(next.category);
        selectedRef.current = next.category;
        setSideIndex(next.category);
        sideIndexRef.current = next.category;
        setTileIndex(0);
        tileIndexRef.current = 0;
        setZone("side");
        gridRef.current?.scrollTo({ top: 0 });
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // ------------------------------------------------ responsive layout
  useLayoutEffect(() => {
    const update = () =>
      setIsMobile(window.innerWidth < 720 || window.innerHeight < 600);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setGridWidth(el.clientWidth));
    ro.observe(el);
    setGridWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [categories.length, isMobile, zone]);

  const cols =
    gridWidth < 420
      ? 2
      : gridWidth < 640
        ? 3
        : gridWidth < 880
          ? 4
          : gridWidth < 1100
            ? 5
            : 6;

  // ------------------------------------------------ category data
  useEffect(() => {
    if (!channels) return;
    const favSet = new Set(favorites);
    const map = new Map<string, Channel[]>();
    map.set("Home", channels);
    map.set("All", channels);
    map.set(
      "Favorites",
      channels.filter((c) => favSet.has(channelIdKey(c)))
    );
    map.set("Recent", []);
    for (const c of channels) {
      const list = map.get(c.category) ?? [];
      list.push(c);
      map.set(c.category, list);
    }
    const remaining = [...map.keys()]
      .filter(
        (k) =>
          k !== "Home" &&
          k !== "All" &&
          k !== "Favorites" &&
          k !== "Recent" &&
          !categoryOrder.includes(k) &&
          (map.get(k)?.length ?? 0) > 0
      )
      .sort();
    const cats = [
      "Home",
      "Favorites",
      ...categoryOrder.filter(
        (c) => c !== "Favorites" && c !== "Recent" && (map.get(c)?.length ?? 0) > 0
      ),
      ...remaining,
    ];
    setByCategory(map);
    setCategories(cats);
    setSideIndex((i) => Math.min(i, cats.length - 1));
    setSelected((s) => (s >= cats.length ? 0 : s));
  }, [channels, favorites]);

  // recents slice (derived list, keeps sidebar "Recent" count accurate)
  const recentChannels = useMemo(() => {
    if (!channels) return [];
    const map = new Map<string, Channel>();
    for (const c of channels) map.set(channelIdKey(c), c);
    return recents
      .map((k) => map.get(k))
      .filter((c): c is Channel => Boolean(c));
  }, [channels, recents]);

  useEffect(() => {
    setByCategory((m) => {
      if (!m.has("All")) return m;
      const next = new Map(m);
      next.set("Recent", recentChannels);
      return next;
    });
  }, [recentChannels]);

  const cat = categories[selected] ?? "";
  const rawList = byCategory.get(cat) ?? [];

  const layout = useMemo(() => {
    // 1. recents slice (up to 2 rows), 2. favorites, 3. all channels
    const matchAll = selectedLanguage === "All";
    const filterLang = (list: Channel[]) =>
      matchAll ? list : list.filter((c) => channelMatchesLanguage(c, selectedLanguage));

    if (cat === "Favorites" || cat === "Recent") {
      const list = filterLang(rawList);
      return { sections: [], rendered: list, R: 0, F: 0 };
    }

    const allRecent = byCategory.get("Recent") ?? [];
    const recRaw =
      cat === "Home" || cat === "All"
        ? allRecent
        : allRecent.filter((c) => c.category === cat);
    const recents = filterLang(recRaw).slice(0, cols * 2);

    const allFav = filterLang(byCategory.get("Favorites") ?? []);
    const favRaw =
      cat === "Home" || cat === "All"
        ? allFav
        : allFav.filter((c) => c.category === cat);
    const favs = favRaw;

    const filtered = filterLang(rawList);
    const rendered = [...recents, ...favs, ...filtered];
    const sections = [
      { key: "recent" as const, start: 0, items: recents },
      { key: "fav" as const, start: recents.length, items: favs },
      { key: "all" as const, start: recents.length + favs.length, items: filtered },
    ].filter((s) => s.items.length > 0);
    return { sections, rendered, R: recents.length, F: favs.length };
  }, [cat, byCategory, rawList, selectedLanguage, cols]);

  const current = layout.rendered;

  // ------------------------------------------------ playback
  const play = useCallback(
    (i: number) => {
      const list = current;
      if (list.length === 0 || i >= list.length) return;
      onPlay({
        channels: list,
        index: i,
        initialCategory: categoriesRef.current[selectedRef.current] ?? "All",
      });
    },
    [current, onPlay]
  );

  const toggleFav = useCallback(
    (i: number) => {
      const list = current;
      if (i < 0 || i >= list.length) return;
      toggleFavorite(list[i]);
    },
    [current, toggleFavorite]
  );

  // ------------------------------------------------ focus helpers
  const scrollToTile = useCallback((i: number) => {
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-tile="${i}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, []);

  const focusTile = useCallback(
    (i: number) => {
      const n = current.length;
      const clamped = Math.max(0, Math.min(n - 1, i));
      tileIndexRef.current = clamped;
      setTileIndex(clamped);
      setZone("tile");
      scrollToTile(clamped);
    },
    [current.length, scrollToTile]
  );

  const selectSide = useCallback((i: number, recordHistory = true) => {
    if (i < 0 || i >= categoriesRef.current.length) return;
    if (i === selectedRef.current) return;
    if (recordHistory && historyReadyRef.current) {
      window.history.pushState(
        { openDthApp: true, screen: "home", category: i },
        "",
        window.location.href
      );
    }
    setSelected(i);
    setTileIndex(0);
    tileIndexRef.current = 0;
    selectedRef.current = i;
    gridRef.current?.scrollTo({ top: 0 });
  }, []);

  const openSearch = useCallback(() => {
    if (!searchOpen && historyReadyRef.current) {
      window.history.pushState(
        { openDthApp: true, screen: "home", search: true, category: selectedRef.current },
        "",
        window.location.href
      );
    }
    setSearchOpen(true);
  }, [searchOpen]);

  // ------------------------------------------------ keyboard
  const queuedSide = useCallback(
    (i: number) => {
      setZone("side");
      setSideIndex(i);
      if (switchTimerRef.current) window.clearTimeout(switchTimerRef.current);
      if (i === selectedRef.current) return;
      switchTimerRef.current = window.setTimeout(() => selectSide(i), 200);
    },
    [selectSide]
  );

  useEffect(() => {
    if (languageDialogOpen || searchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const k = e.key;
      const z = zoneRef.current;
      const isSelect = k === "Enter" || k === "NumpadEnter";

      if (e.code === "F5") {
        e.preventDefault();
        openSearch();
        return;
      }
      if (z === "search") {
        if (k === "ArrowDown") {
          e.preventDefault();
          setZone("side");
          setSideIndex(0);
          sideIndexRef.current = 0;
        } else if (k === "ArrowRight" || isSelect) {
          e.preventDefault();
          openSearch();
        }
        return;
      }
      if (z === "side") {
        if (k === "ArrowUp") {
          e.preventDefault();
          const prev = sideIndexRef.current - 1;
          if (prev >= 0) {
            queuedSide(prev);
          } else {
            setZone("search");
          }
          return;
        }
        if (k === "ArrowDown") {
          e.preventDefault();
          queuedSide(Math.min(categories.length - 1, sideIndexRef.current + 1));
          return;
        }
        if (k === "ArrowRight" || isSelect) {
          e.preventDefault();
          if (switchTimerRef.current) window.clearTimeout(switchTimerRef.current);
          selectSide(sideIndexRef.current);
          if (sideIndexRef.current === selectedRef.current && current.length > 0) {
            focusTile(Math.min(tileIndexRef.current, current.length - 1));
          }
          return;
        }
        return;
      }
      if (z === "lang") {
        if (k === "ArrowDown") {
          e.preventDefault();
          if (current.length > 0) focusTile(tileIndexRef.current);
          return;
        }
        if (k === "ArrowLeft") {
          e.preventDefault();
          setZone("side");
          return;
        }
        if (isSelect) {
          e.preventDefault();
          setLanguageDialogOpen(true);
        }
        return;
      }
      if (z === "tile") {
        if (isSelect) {
          // long-press OK toggles favorite; short press plays
          if (!e.repeat) {
            e.preventDefault();
            if (okTimerRef.current == null && !okTriggeredRef.current) {
              okTimerRef.current = window.setTimeout(() => {
                okTriggeredRef.current = true;
                toggleFav(tileIndexRef.current);
              }, 380);
            }
          } else {
            e.preventDefault();
            if (!okTriggeredRef.current && okTimerRef.current != null) {
              window.clearTimeout(okTimerRef.current);
              okTimerRef.current = null;
              okTriggeredRef.current = true;
              toggleFav(tileIndexRef.current);
            }
          }
          return;
        }
        if (k === "ContextMenu" || k === "f1" || k === "F1" || k === "F3") {
          e.preventDefault();
          toggleFav(tileIndexRef.current);
          return;
        }
        if (k === "Escape" || k === "Backspace") {
          e.preventDefault();
          setZone("side");
          return;
        }

        const n = current.length;
        const R = layout.R;
        const F = layout.F;
        let target: number | undefined;

        const localOf = () =>
          tileIndexRef.current < R
            ? tileIndexRef.current
            : tileIndexRef.current < R + F
              ? tileIndexRef.current - R
              : tileIndexRef.current - R - F;
        const colOf = () => localOf() % cols;

        if (k === "ArrowLeft") {
          e.preventDefault();
          if (colOf() === 0) {
            setZone("side");
            return;
          }
          target = tileIndexRef.current - 1;
        } else if (k === "ArrowRight") {
          e.preventDefault();
          const localI = localOf();
          const len =
            tileIndexRef.current < R
              ? R
              : tileIndexRef.current < R + F
                ? F
                : n - R - F;
          if (localI % cols < cols - 1 && localI + 1 < len) {
            target = tileIndexRef.current + 1;
          }
        } else if (k === "ArrowUp") {
          e.preventDefault();
          if (localOf() >= cols) {
            target = tileIndexRef.current - cols;
          } else {
            setZone("lang");
            return;
          }
        } else if (k === "ArrowDown") {
          e.preventDefault();
          const i = tileIndexRef.current;
          if (i + cols < n) {
            target = i + cols;
          } else if (Math.floor(i / cols) < Math.floor((n - 1) / cols)) {
            target = n - 1;
          }
        }
        if (target !== undefined) focusTile(target);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Enter" && zoneRef.current === "tile") {
        const wasTriggered = okTriggeredRef.current;
        if (okTimerRef.current != null) {
          window.clearTimeout(okTimerRef.current);
          okTimerRef.current = null;
        }
        okTriggeredRef.current = false;
        if (!wasTriggered) play(tileIndexRef.current);
      }
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("keyup", onKeyUp);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("keyup", onKeyUp);
    };
  }, [
    categories.length,
    current.length,
    layout,
    focusTile,
    play,
    toggleFav,
    queuedSide,
    openSearch,
    languageDialogOpen,
    searchOpen,
  ]);

  // ------------------------------------------------ grid metrics
  const pad = 20;
  const cellW = gridWidth > 0 ? (gridWidth - pad * 2) / cols : 120;
  const cardW = cellW - 14;
  const cardH = cardW * 0.58;
  const iconW = Math.max(20, cardW - 9);
  const iconH = Math.max(12, cardH - 9);

  // ------------------------------------------------ render helpers

  const gridBody = () => {
    if (loading || !channels || (channels.length > 0 && categories.length === 0)) {
      return (
        <div
          className="channel-grid channel-grid-skeleton"
          style={{ gridTemplateColumns: `repeat(${cols}, ${cellW}px)` }}
          aria-label="Loading channels"
        >
          {Array.from({ length: Math.max(cols * 3, 6) }, (_, i) => (
            <div
              key={i}
              className="channel-skeleton"
              style={{ width: cellW, height: cardH + 40 }}
            >
              <div className="skeleton-icon" style={{ width: iconW, height: iconH }} />
              <div className="skeleton-label" />
            </div>
          ))}
        </div>
      );
    }
    if (error && !channels) {
      return <div className="center-empty">{error}</div>;
    }
    if (channels.length === 0) {
      return <div className="center-empty">No channels available</div>;
    }
    if (cat === "Favorites" && current.length === 0) {
      return (
        <div className="center-empty">
          <div className="empty-ring gold">
            <Star size={46} color="#ffd700" fill="#ffd700" />
          </div>
          <div className="empty-title">No Favorite Channels Yet</div>
          <div className="empty-sub">Hold OK or press Menu on any channel to pin it here</div>
        </div>
      );
    }
    if (cat === "Recent" && current.length === 0) {
      return (
        <div className="center-empty">
          <div className="empty-ring sky">
            <History size={46} color="#38bdf8" />
          </div>
          <div className="empty-title">No Recently Watched Channels</div>
          <div className="empty-sub">Channels you play will automatically appear here</div>
        </div>
      );
    }
    if (current.length === 0) {
      return (
        <div className="center-empty">
          <TvMinimal size={44} color="rgba(255,255,255,0.15)" />
          <span>{`No channels found for ${selectedLanguage} in ${cat}`}</span>
        </div>
      );
    }

    const tile = (channel: Channel, i: number) => (
      <button
        key={`${cat}|${selectedLanguage}|${i}|${channelIdKey(channel)}`}
        data-tile={i}
        className={`tile ${zone === "tile" && tileIndex === i ? "focused" : ""}`}
        style={{ width: cellW, height: cardH + 40 }}
        onClick={() => {
          // Touch devices do not have hover. A single tap should tune immediately.
          if (isMobile || (window.matchMedia("(hover: none)").matches && window.matchMedia("(pointer: coarse)").matches)) {
            play(i);
            return;
          }
          if (zone === "tile" && tileIndex === i) play(i);
          else focusTile(i);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          toggleFav(i);
        }}
        onMouseEnter={() => {
          if (isMobile) return;
          tileIndexRef.current = i;
          setTileIndex(i);
          setZone("tile");
        }}
        type="button"
      >
        <div className="tile-card-wrap" style={{ width: iconW + 9, height: iconH + 9 }}>
          <ChannelIcon channel={channel} width={iconW} height={iconH} home />
          {favorites.includes(channelIdKey(channel)) && (
            <div className="fav-badge">
              <Star size={10} color="#ffd700" fill="#ffd700" />
            </div>
          )}
        </div>
        <div className="tile-name" style={{ maxWidth: iconW + 9 }}>
          {channel.name}
        </div>
      </button>
    );

    return (
      <>
        {/* {cat === "Home" && layout.R === 0 && layout.F === 0 && (
          <div className="home-tip">
            <History size={18} color="#38bdf8" />
            <span>Tip: Channels you watch will appear here in Recent for quick access</span>
          </div>
        )} */}
        {cat !== "Favorites" && cat !== "Recent" ? (
          layout.sections.map((section) => {
            const header =
              section.key === "recent" ? (
                <SectionHeader
                  key="h-rec"
                  icon={<History size={20} color="#38bdf8" />}
                  label={cat === "Home" ? "Recently Watched" : `${cat} Recently Watched`}
                  count={section.items.length}
                  tone="sky"
                  variant={cat === "Home" ? "first" : "tip"}
                />
              ) : section.key === "fav" ? (
                <SectionHeader
                  key="h-fav"
                  icon={<Star size={20} color="#ffd700" fill="#ffd700" />}
                  label={cat === "Home" ? "Favorites" : `${cat} Favorites`}
                  count={section.items.length}
                  tone="gold"
                  variant={layout.R > 0 ? "after" : "first"}
                />
              ) : (
                <SectionHeader
                  key="h-all"
                  icon={<span className="sh-icon">{iconFor(cat)}</span>}
                  label={cat === "Home" ? "All Channels" : `${cat} (All)`}
                  count={section.items.length}
                  tone="indigo"
                  variant={layout.R + layout.F > 0 ? "after" : cat === "Home" ? "tip" : "first"}
                />
              );
            return (
              <div key={section.key}>
                {header}
                <div
                  className="channel-grid"
                  style={{ gridTemplateColumns: `repeat(${cols}, ${cellW}px)`, paddingBottom: section.key === "all" ? 30 : 14 }}
                >
                  {section.items.map((channel, j) => tile(channel, section.start + j))}
                </div>
              </div>
            );
          })
        ) : (
          <div
            className="channel-grid"
            style={{ gridTemplateColumns: `repeat(${cols}, ${cellW}px)`, paddingBottom: 30 }}
          >
            {current.map((channel, i) => tile(channel, i))}
          </div>
        )}
      </>
    );
  };

  // ------------------------------------------------ sidebar / header

  const sidebar = () => (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-badge">
          <Tv size={16} color="#fff" />
        </div>
        <span className="sidebar-brand-title">Live TV</span>
      </div>
      <button
        type="button"
        className={`search-tile ${zone === "search" ? "focused" : ""}`}
        onClick={openSearch}
        onMouseEnter={() => setZone("search")}
      >
        <Search size={18} color={zone === "search" ? "#000" : "#38bdf8"} />
        <span style={{ flex: 1, textAlign: "left", color: zone === "search" ? "#000" : "#fff" }}>Search</span>
        <MicIcon />
      </button>
      <div style={{ height: 10 }} />
      <div className="sidebar-scroll">
        {categories.map((label, i) => (
          <button
            key={label}
            type="button"
            className={`side-item ${zone === "side" && sideIndex === i ? "focused" : ""} ${
              selected === i ? "selected" : ""
            }`}
            onClick={() => {
              setZone("side");
              setSideIndex(i);
              selectSide(i);
            }}
            onMouseEnter={() => {
              setZone("side");
              setSideIndex(i);
              sideIndexRef.current = i;
            }}
          >
            <span
              className={`si-icon ${iconClass(label, zone === "side" && sideIndex === i, selected === i)}`}
            >
              {iconFor(label)}
            </span>
            <span className="side-label">{label}</span>
            <span className="side-count">{byCategory.get(label)?.length ?? 0}</span>
          </button>
        ))}
      </div>
    </aside>
  );

  const langLabel = selectedLanguage === "All" ? "All Languages" : selectedLanguage;

  const contentHeader = () => (
    <div className="home-header">
      <span className="cat-title">{cat}</span>
      <span className="cat-count">{current.length} channels</span>
      <span className="res-tag">FHD · HD</span>
      <div className="header-spacer" />
      <button
        type="button"
        className={`lang-pill ${zone === "lang" ? "focused" : ""}`}
        onClick={() => setLanguageDialogOpen(true)}
        onMouseEnter={() => setZone("lang")}
      >
        <Languages size={15} color={zone === "lang" ? "#000" : "#38bdf8"} />
        <span style={{ color: zone === "lang" ? "#000" : "#fff" }}>{langLabel}</span>
      </button>
    </div>
  );

  if (isMobile) {
    return (
      <>
        <div className="mobile-shell">
          <div className="mobile-topbar">
            <div className="brand-badge">
              <Tv size={20} color="#fff" />
            </div>
            <span className="mobile-topbar-title">Open DTH</span>
            <button type="button" className="mobile-search-btn" onClick={openSearch}>
              <Search size={20} />
            </button>
          </div>
          <div className="mobile-catbar">
            <div className="mobile-cat-scroll">
              {categories.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  className={`mobile-cat-pill ${selected === i ? "selected" : ""}`}
                  onClick={() => selectSide(i)}
                >
                  {iconFor(label)}
                  <span>{label}</span>
                  {label === "Favorites" && (byCategory.get(label)?.length ?? 0) > 0 && (
                    <span className="pill-count">{byCategory.get(label)!.length}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="mobile-header">
            <div className="mobile-header-row">
              <span className="mobile-cat-title">{cat}</span>
              <span className="cat-count">{current.length} channels</span>
            </div>
            <div className="mobile-filter-row">
              <span className="res-tag">FHD · HD</span>
              <div style={{ flex: 1 }} />
              <button type="button" className="lang-pill" onClick={() => setLanguageDialogOpen(true)}>
                <Languages size={15} color="#38bdf8" />
                <span>{langLabel}</span>
              </button>
            </div>
          </div>
          <div ref={gridRef} className="grid-scroll mobile-grid">
            {gridBody()}
          </div>
        </div>
        {languageDialogOpen && (
          <LanguageDialog
            currentLanguage={selectedLanguage}
            onSelect={(lang) => {
              setSelectedLanguage(lang);
              setLanguageDialogOpen(false);
              setZone("lang");
            }}
            onClose={() => setLanguageDialogOpen(false)}
          />
        )}
        {searchOpen && (
          <TvSearchDialog
            allChannels={byCategory.get("All") ?? []}
            isMobile
            onChannelSelect={(ch) => {
              setSearchOpen(false);
              const all = byCategory.get("All") ?? [];
              const idx = all.findIndex((c) => channelIdKey(c) === channelIdKey(ch));
              onPlay({ channels: all, index: idx >= 0 ? idx : 0, initialCategory: "All" });
            }}
            onClose={() => setSearchOpen(false)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="home-shell">
        {sidebar()}
        <main className="home-main">
          {contentHeader()}
          <div ref={gridRef} className="grid-scroll">
            {gridBody()}
          </div>
        </main>
      </div>
      {languageDialogOpen && (
        <LanguageDialog
          currentLanguage={selectedLanguage}
          onSelect={(lang) => {
            setSelectedLanguage(lang);
            setLanguageDialogOpen(false);
            setZone("lang");
          }}
          onClose={() => setLanguageDialogOpen(false)}
        />
      )}
      {searchOpen && (
        <TvSearchDialog
          allChannels={byCategory.get("All") ?? []}
          isMobile={false}
          onChannelSelect={(ch) => {
            setSearchOpen(false);
            const all = byCategory.get("All") ?? [];
            const idx = all.findIndex((c) => channelIdKey(c) === channelIdKey(ch));
            onPlay({ channels: all, index: idx >= 0 ? idx : 0, initialCategory: "All" });
          }}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------- helpers

function iconClass(label: string, focused: boolean, selected: boolean) {
  if (focused) return "ic-black";
  if (label === "Favorites") return "ic-gold";
  if (label === "Recent") return "ic-sky";
  return selected ? "ic-white" : "ic-dim";
}

function MicIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#2dd4bf"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function SectionHeader({
  icon,
  label,
  count,
  tone,
  variant,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  tone: "sky" | "gold" | "indigo";
  variant: "first" | "after" | "tip";
}) {
  return (
    <div
      className={`section-header ${
        variant === "after" ? "after-section" : variant === "first" ? "first" : ""
      }`}
    >
      {icon}
      <span>{label}</span>
      <span className={`section-count ${tone}`}>{count}</span>
    </div>
  );
}
