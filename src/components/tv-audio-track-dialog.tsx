"use client";

// Ported from lib/widgets/tv_audio_track_dialog.dart: golden-themed multi
// audio track picker with D-pad navigation and key hints.

import { useEffect, useRef, useState } from "react";
import { Music, X } from "lucide-react";

export interface TrackInfo {
  id: string;
  lang: string;
  name: string;
  i: number;
}

const LANG_NAMES: Record<string, string> = {
  hi: "Hindi",
  hin: "Hindi",
  en: "English",
  eng: "English",
  bn: "Bengali",
  ben: "Bengali",
  ta: "Tamil",
  tam: "Tamil",
  te: "Telugu",
  tel: "Telugu",
  kn: "Kannada",
  kan: "Kannada",
  ml: "Malayalam",
  mal: "Malayalam",
  mr: "Marathi",
  mar: "Marathi",
  pa: "Punjabi",
  pan: "Punjabi",
  gu: "Gujarati",
  guj: "Gujarati",
  or: "Odia",
  ori: "Odia",
  ur: "Urdu",
  urd: "Urdu",
  as: "Assamese",
  asm: "Assamese",
  bho: "Bhojpuri",
};

export function displayName(t: TrackInfo) {
  const label = t.name.trim();
  if (label && !/^\d+$/.test(label)) return capitalize(label);
  const lang = (t.lang ?? "").trim().toLowerCase();
  if (LANG_NAMES[lang]) return LANG_NAMES[lang];
  if (!lang || lang === "und") return `Track ${t.i + 1}`;
  return lang.length <= 3 ? lang.toUpperCase() : capitalize(lang);
}

function capitalize(s: string) {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1).toLowerCase();
}

export function TvAudioTrackDialog({
  tracks,
  selectedTrackId,
  onSelect,
  onClose,
}: {
  tracks: TrackInfo[];
  selectedTrackId: string;
  onSelect: (trackId: string) => void;
  onClose: () => void;
}) {
  const [focusIndex, setFocusIndex] = useState(() => {
    const idx = tracks.findIndex((t) => t.id === selectedTrackId);
    return idx >= 0 ? idx : 0;
  });
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-t="${focusIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [focusIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIndex((i) => Math.min(tracks.length - 1, i + 1));
      } else if (e.key === "Enter" || e.key === "NumpadEnter") {
        e.preventDefault();
        onSelect(tracks[focusIndex].id);
      } else if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [focusIndex, tracks, onSelect, onClose]);

  return (
    <div className="dlg-overlay" onClick={onClose}>
      <div className="audio-dlg" onClick={(e) => e.stopPropagation()}>
        <div className="dlg-head-row">
          <div className="audio-icon-badge">
            <Music size={20} color="#ffc107" />
          </div>
          <div>
            <div className="dlg-title">Select Audio Track</div>
            <div className="dlg-sub">
              {tracks.length} tracks available · Currently:{" "}
              {displayName(
                tracks.find((t) => t.id === selectedTrackId) ?? tracks[0]
              )}
            </div>
          </div>
          <button type="button" className="dlg-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="dlg-divider" />
        <div className="track-list" ref={listRef}>
          {tracks.map((t, i) => {
            const focused = focusIndex === i;
            const selected = t.id === selectedTrackId;
            return (
              <button
                type="button"
                key={t.id}
                data-t={i}
                className={`track-item ${focused ? "focused" : ""} ${selected ? "selected" : ""}`}
                onClick={() => onSelect(t.id)}
                onMouseEnter={() => setFocusIndex(i)}
              >
                <span className="track-radio">{selected ? <span className="track-radio-dot" /> : null}</span>
                <span className="track-texts">
                  <span className="track-name">{displayName(t)}</span>
                  <span className="track-sub">
                    {t.lang ? t.lang.toUpperCase() : "Undetermined"} · Track {t.i + 1}
                  </span>
                </span>
                {selected && <span className="active-tag">ACTIVE</span>}
                <span className="keyhint-box">
                  <span className="key-kbd">OK</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="dlg-hint-bar">
          <span className="hint-group">▲▼ Move · OK — Switch</span>
          <span className="hint-group">ESC / Back — Close</span>
        </div>
      </div>
    </div>
  );
}
