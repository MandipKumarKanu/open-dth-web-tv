"use client";

// Ported from lib/widgets/tv_category_dialog.dart (language variant used by
// home.dart): TV-styled grid of language chips with D-pad navigation.

import { useEffect, useRef, useState } from "react";
import { Languages, X } from "lucide-react";
import { indianLanguages, languageFlags } from "@/lib/live-tv";

export function LanguageDialog({
  currentLanguage,
  onSelect,
  onClose,
}: {
  currentLanguage: string;
  onSelect: (lang: string) => void;
  onClose: () => void;
}) {
  const [focusIndex, setFocusIndex] = useState(0);
  const langs = indianLanguages;
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFocusIndex(Math.max(0, langs.indexOf(currentLanguage)));
  }, [currentLanguage, langs.length]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-l="${focusIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [focusIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const perRow = listRef.current
        ? Math.max(1, Math.floor((listRef.current.clientWidth - 48) / 200))
        : 3;
      if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setFocusIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setFocusIndex((i) => Math.min(langs.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((i) => Math.max(0, i - perRow));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIndex((i) => Math.min(langs.length - 1, i + perRow));
      } else if (e.key === "Enter" || e.key === "NumpadEnter") {
        e.preventDefault();
        onSelect(langs[focusIndex]);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [focusIndex, langs, onSelect, onClose]);

  return (
    <div className="dlg-overlay" onClick={onClose}>
      <div className="dlg-card" style={{ width: 720 }} onClick={(e) => e.stopPropagation()}>
        <div className="dlg-head-row">
          <div className="dlg-icon-sq">
            <Languages size={20} color="#38bdf8" />
          </div>
          <div>
            <div className="dlg-title">Filter by Language</div>
            <div className="dlg-sub">
              Currently showing: {currentLanguage === "All" ? "All Languages" : currentLanguage}
            </div>
          </div>
          <button type="button" className="dlg-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="dlg-body">
          <div className="lang-grid" ref={listRef}>
            {langs.map((lang, i) => {
              const focused = focusIndex === i;
              const selected = lang === currentLanguage;
              return (
                <button
                  key={lang}
                  type="button"
                  data-l={i}
                  className={`lang-item ${focused ? "focused" : ""} ${selected ? "current" : ""}`}
                  onClick={() => onSelect(lang)}
                  onMouseEnter={() => setFocusIndex(i)}
                >
                  <span className="lang-flag">{languageFlags[lang] ?? "🌐"}</span>
                  <span className="lang-label">{lang}</span>
                  {selected && <span className="check">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="dlg-hint-bar">
          <span className="hint-group">◀ ▶ ▲ ▼ navigate · OK apply</span>
          <span className="hint-group">ESC / Back — close</span>
        </div>
      </div>
    </div>
  );
}
