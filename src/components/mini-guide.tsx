"use client";

// Ported from lib/widgets/mini_guide.dart: slide-in channel list with category
// tabs, live "playing" tag, per-channel EPG title, D-pad navigation.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, History, Home as HomeIcon, Play, Star, Tv, X } from "lucide-react";
import { type Channel, categoryOrder } from "@/lib/live-tv";
import { useStore } from "@/lib/store";
import { ChannelIcon } from "./channel-icon";

const ITEM_EXTENT = 62;

export function MiniGuide({
  allChannels,
  currentChannel,
  initialCategory,
  onTune,
  onClose,
  onUserActivity,
  isMobileWidth,
}: {
  allChannels: Channel[];
  currentChannel: Channel;
  initialCategory: string;
  onTune: (c: Channel) => void;
  onClose: () => void;
  onUserActivity: () => void;
  isMobileWidth: boolean;
}) {
  const store = useStore();
  const { favorites, favoritesVersion, recents, getNow, toggleFavorite, isFavorite } = store;

  const listElRef = useRef<HTMLDivElement>(null);
  const tabElRef = useRef<HTMLDivElement>(null);

  const tabs = useMemo(() => {
    const catsWithChannels = new Set<string>();
    for (const c of allChannels) {
      if (c.category) catsWithChannels.add(c.category);
    }
    const knownOrdered = categoryOrder.filter(
      (c) => c !== "Favorites" && c !== "Recent" && catsWithChannels.has(c)
    );
    const remaining = [...catsWithChannels]
      .filter((c) => !categoryOrder.includes(c))
      .sort();
    return [
      "Favorites",
      ...(recents.length > 0 ? ["Recent"] : []),
      "Home",
      ...knownOrdered,
      ...remaining,
    ];
  }, [allChannels, recents]);

  const favSet = useMemo(() => new Set(favorites), [favorites]);
  const recentSet = useMemo(() => new Set(recents), [recents]);

  const tabLists = useMemo(() => {
    const build = (tab: string): Channel[] => {
      if (tab === "Favorites") {
        return allChannels.filter((c) => favSet.has(channelKey(c)));
      }
      if (tab === "Recent") {
        return allChannels.filter((c) => recentSet.has(channelKey(c)));
      }
      if (tab === "Home" || tab === "All") {
        return [
          ...allChannels.filter((c) => recentSet.has(channelKey(c))),
          ...allChannels.filter((c) => favSet.has(channelKey(c))),
          ...allChannels,
        ];
      }
      const raw = allChannels.filter((c) => c.category === tab);
      return [
        ...raw.filter((c) => recentSet.has(channelKey(c))),
        ...raw.filter((c) => favSet.has(channelKey(c))),
        ...raw.filter((c) => !favSet.has(channelKey(c)) && !recentSet.has(channelKey(c))),
      ];
    };
    const m = new Map<string, Channel[]>();
    for (const t of tabs) m.set(t, build(t));
    return m;
  }, [tabs, allChannels, favSet, recentSet, favoritesVersion]);

  const initialTab = useMemo(() => {
    if (initialCategory === "Favorites" && tabs.includes("Favorites")) {
      return tabs.indexOf("Favorites");
    }
    if (tabs.includes(currentChannel.category)) return tabs.indexOf(currentChannel.category);
    if (tabs.includes(initialCategory)) return tabs.indexOf(initialCategory);
    if (tabs.includes("Home")) return tabs.indexOf("Home");
    return 0;
  }, [tabs, currentChannel, initialCategory]);

  const [selectedTab, setSelectedTab] = useState(initialTab);
  const list = tabLists.get(tabs[selectedTab]) ?? [];
  const [focusedIndex, setFocusedIndex] = useState(() => {
    const idx = list.findIndex((c) => channelEq(c, currentChannel));
    return idx >= 0 ? idx : 0;
  });

  const scrollListTo = useCallback((i: number) => {
    const el = listElRef.current;
    if (!el) return;
    const top = i * ITEM_EXTENT;
    const bottom = top + ITEM_EXTENT;
    if (top < el.scrollTop) {
      el.scrollTo({ top, behavior: "smooth" });
    } else if (bottom > el.scrollTop + el.clientHeight) {
      el.scrollTo({ top: bottom - el.clientHeight, behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    // jump the initially-focused channel just under the first row
    const i = list.findIndex((c) => channelEq(c, currentChannel));
    const start = i >= 0 ? i : 0;
    setFocusedIndex(start);
    const el = listElRef.current;
    if (el && start > 2) {
      el.scrollTo({ top: (start - 2) * ITEM_EXTENT });
    }
  }, [selectedTab, list, currentChannel]);

  useEffect(() => {
    const t = tabElRef.current;
    const target = Math.max(0, selectedTab * 80 - 100);
    t?.scrollTo({ left: target, behavior: "smooth" });
  }, [selectedTab]);

  const switchTab = useCallback(
    (newTab: number) => {
      const nextList = tabLists.get(tabs[newTab]) ?? [];
      const playIdx = nextList.findIndex((c) => channelEq(c, currentChannel));
      setSelectedTab(newTab);
      setFocusedIndex(playIdx >= 0 ? playIdx : 0);
      const el = listElRef.current;
      if (el) {
        if (playIdx > 2) el.scrollTo({ top: (playIdx - 2) * ITEM_EXTENT });
        else el.scrollTo({ top: 0 });
      }
    },
    [tabs, tabLists, currentChannel]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      onUserActivity();
      const k = e.key;

      if (k === "ArrowUp") {
        e.preventDefault();
        if (focusedIndex > 0) {
          setFocusedIndex((i) => i - 1);
          scrollListTo(focusedIndex - 1);
        }
      } else if (k === "ArrowDown") {
        e.preventDefault();
        if (focusedIndex < list.length - 1) {
          setFocusedIndex((i) => i + 1);
          scrollListTo(focusedIndex + 1);
        }
      } else if (k === "ArrowLeft") {
        e.preventDefault();
        if (selectedTab > 0) switchTab(selectedTab - 1);
      } else if (k === "ArrowRight") {
        e.preventDefault();
        if (selectedTab < tabs.length - 1) switchTab(selectedTab + 1);
      } else if (k === "Enter" || k === "NumpadEnter") {
        e.preventDefault();
        if (list.length > 0 && focusedIndex < list.length) onTune(list[focusedIndex]);
      } else if (k === "Escape" || k === "Backspace") {
        e.preventDefault();
        onClose();
      } else if (k === "ContextMenu" || k === "MediaPlayPause" || k === "f1" || k === "F1" || k === "f3" || k === "F3") {
        e.preventDefault();
        if (list.length > 0 && focusedIndex < list.length) {
          toggleFavorite(list[focusedIndex]);
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [focusedIndex, list, selectedTab, tabs, switchTab, onTune, onClose, onUserActivity, scrollListTo, toggleFavorite]);

  return (
    <div
      className="mini-guide"
      style={{ width: isMobileWidth ? "100%" : 380 }}
      ref={listElRef ? undefined : undefined}
    >
      <div className="mg-head">
        <div className="mg-badge">
          <Tv size={16} color="#fff" />
        </div>
        <span className="mg-title">Channel Guide</span>
        <div className="mg-head-hint">
          <ArrowLeftRight size={14} />
          <span>Categories</span>
        </div>
        <button
          type="button"
          className="mg-close"
          onClick={onClose}
          aria-label="Close guide"
        >
          <X size={16} color="rgba(255,255,255,0.7)" />
        </button>
      </div>
      <div className="mg-tabs" ref={tabElRef}>
        {tabs.map((t, i) => (
          <button
            key={t}
            type="button"
            className={`mg-tab ${selectedTab === i ? "selected" : ""}`}
            onClick={() => {
              switchTab(i);
              onUserActivity();
            }}
          >
            {t === "Favorites" && <Star size={14} color={selectedTab === i ? "#b45309" : "#ffd700"} />}
            {t === "Recent" && <History size={14} color={selectedTab === i ? "#1d4ed8" : "#60a5fa"} />}
            {t === "Home" && <HomeIcon size={14} color={selectedTab === i ? "#1e293b" : "#38bdf8"} />}
            <span>{t}</span>
          </button>
        ))}
      </div>
      <div className="mg-divider" />
      {list.length === 0 ? (
        <div className="mg-empty">
          <Star size={40} color="rgba(255,255,255,0.3)" />
          <span className="mg-empty-title">{`No Channels in ${tabs[selectedTab]}`}</span>
          <span className="mg-empty-sub">Press Menu on any channel to favorite</span>
        </div>
      ) : (
        <div className="mg-list" ref={listElRef}>
          {list.map((c, i) => {
            const focused = i === focusedIndex;
            const playing = channelEq(c, currentChannel);
            const fav = isFavorite(c) || favSet.has(channelKey(c));
            const prog = getNow(c);
            return (
              <button
                type="button"
                key={`${channelKey(c)}-${i}`}
                data-mg-i={i}
                className={`mg-row ${focused ? "focused" : ""} ${playing && !focused ? "playing" : ""}`}
                onMouseEnter={() => setFocusedIndex(i)}
                onClick={() => onTune(c)}
              >
                <ChannelIcon channel={c} width={44} height={28} />
                <div className="mg-row-txt">
                  <span className="mg-row-name">{c.name}</span>
                  <div className="mg-row-sub">
                    {playing && <span className="mg-play-tag">PLAYING</span>}
                    <div className="mg-row-prog">
                      {prog ? <Play size={12} /> : null}
                      <span className={prog ? "" : "nopro"}>{prog ? prog.title : c.category}</span>
                    </div>
                  </div>
                </div>
                <span className="mg-res">{c.resolution}</span>
                <button
                  type="button"
                  className="mg-fav-btn"
                  aria-label={fav ? "Remove favourite" : "Add favourite"}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(c);
                    onUserActivity();
                  }}
                >
                  <Star size={16} color={fav ? "#ffd700" : "rgba(255,255,255,0.45)"} fill={fav ? "#ffd700" : "none"} />
                </button>
              </button>
            );
          })}
        </div>
      )}
      <div className="mg-footer">
        <span>OK to Watch</span>
        <span className="mg-footer-mid">
          Menu: <Star size={14} color="#ffd700" /> Fav
        </span>
        <span>Back to Exit</span>
      </div>
    </div>
  );
}

function channelKey(c: Channel) {
  return c.tvgId || `${c.category}|${c.name}`;
}

function channelEq(a: Channel, b: Channel) {
  return channelKey(a) === channelKey(b);
}
