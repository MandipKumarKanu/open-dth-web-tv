"use client";

// Ported from lib/widgets/timeline_guide.dart: DTH EPG timeline overlay with a
// 4-hour window that pages instead of scrolling, focused-program summary and
// category picker integration.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ArrowLeftRight,
  Clock,
  Info,
  CornerDownLeft,
  List,
  Tv,
  ChevronsUpDown,
  X,
} from "lucide-react";
import {
  type Channel,
  type Program,
  formatTime,
  programIsLive,
  programRemainingText,
  programTimeRangeText,
} from "@/lib/live-tv";
import { useStore } from "@/lib/store";
import { ChannelIcon } from "./channel-icon";
import { CategoryPickerDialog } from "./category-picker-dialog";
import { ProgramDetailsDialog } from "./program-details-dialog";

const CHANNEL_COL_WIDTH = 240;
const ROW_HEIGHT = 44;
const TOTAL_SLOTS = 8; // 4 hours window (8 x 30m)

function floorToHalfHour(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes() >= 30 ? 30 : 0, 0, 0);
}

function formatDayMonth(dt: Date) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${dt.getDate()} ${months[dt.getMonth()]}`;
}

function formatFullClock(dt: Date) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const day = days[dt.getDay() === 0 ? 6 : dt.getDay() - 1];
  const hour = dt.getHours() % 12 === 0 ? 12 : dt.getHours() % 12;
  const min = String(dt.getMinutes()).padStart(2, "0");
  const ampm = dt.getHours() >= 12 ? "pm" : "am";
  return `${day} ${dt.getDate()} ${formatDayMonth(dt)} ${hour}:${min} ${ampm}`;
}

function formatSlotTime(dt: Date) {
  return formatTime(dt).replace(/\s?(AM|PM)/, (_m, p) => ` ${String(p).toLowerCase()}`);
}

export function TimelineGuide({
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
  const { getSchedule, getNow } = store;

  const [categories, setCategories] = useState<string[]>(["All"]);
  const [selectedCategoryIdx, setSelectedCategoryIdx] = useState(0);
  const [focusedChannelIdx, setFocusedChannelIdx] = useState(0);
  const [focusedProgIdx, setFocusedProgIdx] = useState(-1);
  const [categoryFocused, setCategoryFocused] = useState(false);
  const [baseTime, setBaseTime] = useState(() => floorToHalfHour(new Date()));
  const [tick, setTick] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [details, setDetails] = useState<{
    channel: Channel;
    program: Program | null;
    channelNumber: number;
  } | null>(null);
  const listElRef = useRef<HTMLDivElement>(null);

  // load categories once
  useEffect(() => {
    const set = new Set<string>();
    for (const c of allChannels) if (c.category) set.add(c.category);
    const cats = ["All", ...set];
    setCategories(cats);
    const catToFind = currentChannel.category || initialCategory;
    const idx = cats.indexOf(catToFind);
    const catIdx = idx >= 0 ? idx : 0;
    setSelectedCategoryIdx(catIdx);
    const chans =
      catIdx === 0 ? allChannels : allChannels.filter((c) => c.category === cats[catIdx]);
    const curIdx = chans.findIndex((c) => c.tvgId === currentChannel.tvgId && c.name === currentChannel.name);
    setFocusedChannelIdx(curIdx >= 0 ? curIdx : 0);
  }, [allChannels, currentChannel, initialCategory]);

  // 30s clock tick
  useEffect(() => {
    const t = window.setInterval(() => setTick((v) => v + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const activeChannelList = useMemo(() => {
    const cat = categories[selectedCategoryIdx] ?? "All";
    if (cat === "All") return allChannels;
    return allChannels.filter((c) => c.category === cat);
  }, [categories, selectedCategoryIdx, allChannels]);

  const clampedChannelIdx = Math.min(focusedChannelIdx, Math.max(0, activeChannelList.length - 1));
  const focusedChannel = activeChannelList[clampedChannelIdx] ?? null;

  const windowStart = baseTime;
  const windowEnd = new Date(baseTime.getTime() + TOTAL_SLOTS * 30 * 60_000);
  const windowMinutes = TOTAL_SLOTS * 30;

  const focusedProgs = useMemo(
    () => (focusedChannel ? getSchedule(focusedChannel, windowStart, windowEnd) : []),
    [focusedChannel, getSchedule, tick, windowStart, windowEnd]
  );

  useEffect(() => {
    // sync focused program whenever channel/window changes
    if (!focusedChannel || focusedProgs.length === 0) {
      setFocusedProgIdx(-1);
      return;
    }
    const liveIdx = focusedProgs.findIndex((p) => programIsLive(p));
    setFocusedProgIdx(liveIdx >= 0 ? liveIdx : 0);
  }, [focusedChannel, focusedProgs]);

  const scrollToFocusedChannel = useCallback((i: number) => {
    const el = listElRef.current;
    const targetY = Math.max(0, (i - 1) * ROW_HEIGHT);
    el?.scrollTo({ top: targetY, behavior: "smooth" });
  }, []);

  const prevCategory = useCallback(() => {
    setSelectedCategoryIdx((i) => (i - 1 + categories.length) % categories.length);
    setFocusedChannelIdx(0);
  }, [categories.length]);

  const nextCategory = useCallback(() => {
    setSelectedCategoryIdx((i) => (i + 1) % categories.length);
    setFocusedChannelIdx(0);
  }, [categories.length]);

  const pageTimeline = useCallback((direction: number) => {
    setBaseTime((bt) => {
      const next = new Date(bt.getTime() + direction * TOTAL_SLOTS * 30 * 60_000);
      const floored = floorToHalfHour(new Date());
      const minBase = new Date(floored.getTime() - 4 * 3600_000);
      const maxBase = new Date(floored.getTime() + 24 * 3600_000);
      return next < minBase ? minBase : next > maxBase ? maxBase : next;
    });
  }, []);

  const openProgramDetails = useCallback(
    (ch: Channel, prog: Program | null, num: number) => {
      setDetails({ channel: ch, program: prog, channelNumber: num });
    },
    []
  );

  useEffect(() => {
    if (pickerOpen || details) return;
    const onKey = (e: KeyboardEvent) => {
      onUserActivity();
      const k = e.key;

      if (k === "PageUp") {
        e.preventDefault();
        const ni = Math.max(0, clampedChannelIdx - 5);
        setFocusedChannelIdx(ni);
        scrollToFocusedChannel(ni);
        return;
      }
      if (k === "PageDown") {
        e.preventDefault();
        const ni = Math.min(activeChannelList.length - 1, clampedChannelIdx + 5);
        setFocusedChannelIdx(ni);
        scrollToFocusedChannel(ni);
        return;
      }
      if (k === "ContextMenu" || k === "f2" || k === "F2" || k === "c" || k === "C") {
        e.preventDefault();
        setPickerOpen(true);
        return;
      }

      if (categoryFocused) {
        if (k === "ArrowDown") {
          e.preventDefault();
          setCategoryFocused(false);
        } else if (k === "ArrowLeft") {
          e.preventDefault();
          prevCategory();
        } else if (k === "ArrowRight") {
          e.preventDefault();
          nextCategory();
        } else if (k === "Enter" || k === "NumpadEnter") {
          e.preventDefault();
          setPickerOpen(true);
        } else if (k === "Escape" || k === "Backspace") {
          e.preventDefault();
          setCategoryFocused(false);
        }
        return;
      }

      if (k === "ArrowUp") {
        e.preventDefault();
        if (clampedChannelIdx > 0) {
          const ni = clampedChannelIdx - 1;
          setFocusedChannelIdx(ni);
          scrollToFocusedChannel(ni);
        } else {
          setCategoryFocused(true);
        }
      } else if (k === "ArrowDown") {
        e.preventDefault();
        if (clampedChannelIdx < activeChannelList.length - 1) {
          const ni = clampedChannelIdx + 1;
          setFocusedChannelIdx(ni);
          scrollToFocusedChannel(ni);
        }
      } else if (k === "ArrowRight") {
        e.preventDefault();
        if (focusedProgs.length > 0 && focusedProgIdx < focusedProgs.length - 1) {
          setFocusedProgIdx((i) => i + 1);
        } else {
          pageTimeline(1);
        }
      } else if (k === "ArrowLeft") {
        e.preventDefault();
        if (focusedProgs.length > 0 && focusedProgIdx > 0) {
          setFocusedProgIdx((i) => i - 1);
        } else {
          pageTimeline(-1);
        }
      } else if (k === "Enter" || k === "NumpadEnter" || k === "f1" || k === "F1" || k === "f3" || k === "F3" || k === "i" || k === "I") {
        e.preventDefault();
        if (focusedChannel) {
          const prog =
            focusedProgs.length > 0 && focusedProgIdx >= 0 && focusedProgIdx < focusedProgs.length
              ? focusedProgs[focusedProgIdx]
              : getNow(focusedChannel) ?? (focusedProgs.length > 0 ? focusedProgs[0] : null);
          openProgramDetails(focusedChannel, prog, clampedChannelIdx + 1);
        }
      } else if (k === "Escape" || k === "Backspace") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [
    categoryFocused,
    clampedChannelIdx,
    activeChannelList.length,
    focusedProgs,
    focusedProgIdx,
    focusedChannel,
    categories,
    pickerOpen,
    details,
    prevCategory,
    nextCategory,
    pageTimeline,
    getNow,
    openProgramDetails,
    onClose,
    onUserActivity,
    scrollToFocusedChannel,
  ]);

  useEffect(() => {
    const el = listElRef.current;
    if (el) el.scrollTo({ top: Math.max(0, (clampedChannelIdx - 1) * ROW_HEIGHT) });
  }, [selectedCategoryIdx]);

  const now = new Date();
  const activeCat = categories[selectedCategoryIdx] ?? "All";
  const currentProgram = focusedChannel ? getNow(focusedChannel) : null;
  const displayedProgram =
    focusedProgs.length > 0 && focusedProgIdx >= 0 && focusedProgIdx < focusedProgs.length
      ? focusedProgs[focusedProgIdx]
      : currentProgram;

  // slot width fitted to the viewport so the window never scrolls horizontally
  const [slotWidth, setSlotWidth] = useState(180);
  useEffect(() => {
    const update = () => setSlotWidth((window.innerWidth - CHANNEL_COL_WIDTH) / TOTAL_SLOTS);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // ------------------------------------------------ mobile guide
  if (isMobileWidth) {
    return (
      <div className="tl-mobile">
        <div className="tl-mobile-head">
          <Tv size={19} color="#38bdf8" />
          <span className="tl-mobile-title">Channel guide</span>
          <span className="tl-mobile-count">{activeChannelList.length} channels</span>
          <button type="button" className="tl-mobile-close" onClick={onClose} aria-label="Close guide">
            <X size={20} color="rgba(255,255,255,0.7)" />
          </button>
        </div>
        <div className="tl-mobile-cats">
          {categories.map((cat, i) => (
            <button
              type="button"
              key={cat}
              className={`tl-mobile-cat ${i === selectedCategoryIdx ? "selected" : ""}`}
              onClick={() => {
                setSelectedCategoryIdx(i);
                setFocusedChannelIdx(0);
                onUserActivity();
              }}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="tl-mobile-list">
          {activeChannelList.length === 0 ? (
            <div className="center-empty">
              <span>No channels in this category</span>
            </div>
          ) : (
            activeChannelList.map((ch) => {
              const playing = ch.tvgId === currentChannel.tvgId && ch.name === currentChannel.name;
              const prog = getNow(ch);
              return (
                <button
                  type="button"
                  key={ch.tvgId + ch.name}
                  className={`tl-mobile-row ${playing ? "playing" : ""}`}
                  onClick={() => {
                    onUserActivity();
                    onTune(ch);
                  }}
                >
                  <ChannelIcon channel={ch} width={54} height={34} />
                  <div className="tl-mobile-row-txt">
                    <div className="tl-mobile-row-top">
                      <span>{ch.name}</span>
                      {playing && <em>PLAYING</em>}
                    </div>
                    <small>{prog ? prog.title : ch.category}</small>
                  </div>
                  <span className="tl-mobile-play">{playing ? "≡" : "▶"}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // ------------------------------------------------ TV guide
  return (
    <div className="tl-guide">
      {/* 1. top header bar */}
      <div className="tl-header">
        <div className="tl-guide-tag">
          <Tv size={14} color="#38bdf8" />
          <span>Guide</span>
        </div>
        <button
          type="button"
          className={`tl-cat-pill ${categoryFocused ? "focused" : ""}`}
          onClick={() => setPickerOpen(true)}
        >
          {categoryFocused && <ChevronLeft size={18} color="#fff" />}
          <span>{activeCat}</span>
          {categoryFocused ? <ChevronRight size={18} color="#fff" /> : <ChevronDown size={16} color="#fff" />}
          {categoryFocused && <span className="tl-cat-ok">OK: All</span>}
        </button>
        {!categoryFocused && (
          <span className="tl-hint-chip">▲ Up: Category</span>
        )}
        <span className="tl-date">Today {formatDayMonth(now)}</span>
        <div className="tl-spacer" />
        <div className="tl-clock">
          <Clock size={13} color="#38bdf8" />
          <span>{formatFullClock(now)}</span>
        </div>
        <button
          type="button"
          className="tl-close"
          onClick={onClose}
          aria-label="Close guide"
        >
          <X size={16} color="rgba(255,255,255,0.7)" />
        </button>
      </div>

      {/* 2. focused program summary */}
      {focusedChannel && (
        <div
          className="tl-summary"
          onClick={() => openProgramDetails(focusedChannel, displayedProgram, clampedChannelIdx + 1)}
        >
          <ChannelIcon channel={focusedChannel} width={44} height={28} />
          <div className="tl-summary-txt">
            <div className="tl-summary-top">
              <span className="tl-summary-title">
                {displayedProgram ? displayedProgram.title : `Live Broadcast on ${focusedChannel.name}`}
              </span>
              {displayedProgram && (
                <>
                  <span className="tl-summary-range">({programTimeRangeText(displayedProgram)})</span>
                  <span className="tl-summary-remaining">{programRemainingText(displayedProgram)}</span>
                </>
              )}
            </div>
            {displayedProgram && displayedProgram.desc && (
              <div className="tl-summary-desc">{displayedProgram.desc}</div>
            )}
          </div>
          <div className="tl-synopsis-chip">
            <Info size={12} color="#38bdf8" />
            <span>Synopsis (OK)</span>
          </div>
        </div>
      )}

      {/* 3. timeline header */}
      <div className="tl-ruler">
        <div className="tl-ruler-corner" style={{ width: CHANNEL_COL_WIDTH }}>
          CHANNELS
        </div>
        <div className="tl-ruler-slots" style={{ width: slotWidth * TOTAL_SLOTS }}>
          {Array.from({ length: TOTAL_SLOTS }, (_, idx) => (
            <div key={idx} className="tl-slot" style={{ width: slotWidth }}>
              {formatSlotTime(new Date(baseTime.getTime() + idx * 30 * 60_000))}
            </div>
          ))}
        </div>
      </div>

      {/* 4. channel rows */}
      {activeChannelList.length === 0 ? (
        <div className="center-empty">
          <span>No channels in this category</span>
        </div>
      ) : (
        <div className="tl-rows" ref={listElRef}>
          {activeChannelList.map((ch, rowIdx) => {
            const isFocused = !categoryFocused && rowIdx === clampedChannelIdx;
            const progs = getSchedule(ch, windowStart, windowEnd);
            return (
              <div
                key={ch.tvgId + ch.name}
                className={`tl-row ${isFocused ? "focused" : ""}`}
                style={{ height: ROW_HEIGHT }}
                onMouseEnter={() => {
                  if (categoryFocused) return;
                  setFocusedChannelIdx(rowIdx);
                }}
              >
                <div
                  className="tl-row-channel"
                  style={{ width: CHANNEL_COL_WIDTH }}
                  onClick={() => {
                    setFocusedChannelIdx(rowIdx);
                    openProgramDetails(ch, getNow(ch), rowIdx + 1);
                  }}
                >
                  <span className="tl-row-num">{rowIdx + 1}</span>
                  <span className="tl-row-name">{ch.name}</span>
                </div>
                <div className="tl-row-progs" style={{ width: slotWidth * TOTAL_SLOTS }}>
                  {progs.length === 0 ? (
                    <div
                      className="tl-empty-block"
                      style={{ width: slotWidth * TOTAL_SLOTS }}
                      onClick={() => {
                        setFocusedChannelIdx(rowIdx);
                        openProgramDetails(ch, null, rowIdx + 1);
                      }}
                    >
                      Live Broadcast · {ch.name}
                    </div>
                  ) : (
                    progs.map((p, i) => {
                      const startOffset = Math.max(
                        0,
                        Math.floor((p.start.getTime() - windowStart.getTime()) / 60_000)
                      );
                      const endOffset = Math.min(
                        windowMinutes,
                        Math.ceil((p.stop.getTime() - windowStart.getTime()) / 60_000)
                      );
                      if (endOffset <= startOffset) return null;
                      const duration = endOffset - startOffset;
                      const blockWidth = (duration / windowMinutes) * slotWidth * TOTAL_SLOTS;
                      const live = programIsLive(p);
                      const progFocused = isFocused && focusedProgIdx === i;
                      return (
                        <div
                          key={`${ch.tvgId || ch.name}-${p.title}-${p.start.getTime()}-${i}`}
                          className={`tl-block ${progFocused ? "focused" : ""} ${live ? "live" : ""}`}
                          style={{ width: blockWidth, height: ROW_HEIGHT - 4 }}
                          onClick={() => {
                            setFocusedChannelIdx(rowIdx);
                            setFocusedProgIdx(i);
                            openProgramDetails(ch, p, rowIdx + 1);
                          }}
                        >
                          <div className="tl-block-title">
                            {live && <span className="tl-dot" />}
                            <span>{p.title}</span>
                          </div>
                          <div className="tl-block-time">{programTimeRangeText(p)}</div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. bottom bar */}
      <div className="tl-bottom">
        {categoryFocused ? (
          <>
            <KeyHint icon={<ArrowLeftRight size={13} />} text="◄/►: Switch Category" />
            <KeyHint icon={<List size={13} />} text="OK: All Categories List" />
            <KeyHint icon={<ArrowDown size={13} />} text="Down: Return to Channels" />
            <div className="tl-bottom-spacer" />
            <KeyHint icon={<CornerDownLeft size={13} />} text="Back: Channels" />
          </>
        ) : (
          <>
            <KeyHint icon={<ChevronsUpDown size={13} />} text="Ch Up/Down" />
            <KeyHint icon={<ArrowLeftRight size={13} />} text="Shows Left/Right" />
            <KeyHint icon={<Info size={13} />} text="OK: Details & Tune" />
            <KeyHint icon={<ArrowUp size={13} />} text="Up at top: Category (◄/► or OK)" />
            <div className="tl-bottom-spacer" />
            <KeyHint icon={<CornerDownLeft size={13} />} text="Back: Close" />
          </>
        )}
      </div>

      {pickerOpen && (
        <CategoryPickerDialog
          categories={categories}
          counts={(() => {
            const map: Record<string, number> = { All: allChannels.length };
            for (const c of allChannels) {
              if (c.category) map[c.category] = (map[c.category] ?? 0) + 1;
            }
            return map;
          })()}
          selectedCategory={activeCat}
          onSelect={(cat) => {
            const idx = categories.indexOf(cat);
            if (idx >= 0 && idx !== selectedCategoryIdx) {
              setSelectedCategoryIdx(idx);
              setCategoryFocused(false);
              setFocusedChannelIdx(0);
            } else {
              setCategoryFocused(false);
            }
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
      {details && (
        <ProgramDetailsDialog
          channel={details.channel}
          program={details.program}
          channelNumber={details.channelNumber}
          onTuneChannel={() => {
            onClose();
            onTune(details.channel);
          }}
          onClose={() => setDetails(null)}
        />
      )}
    </div>
  );
}

function KeyHint({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="tl-keyhint">
      {icon}
      {text}
    </span>
  );
}
