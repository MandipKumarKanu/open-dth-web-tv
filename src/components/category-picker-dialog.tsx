"use client";

// Ported from lib/widgets/tv_category_dialog.dart: DTH-style category picker
// shown over the timeline guide (OK on the category pill / Menu / F2 / C).

import { useEffect, useRef, useState } from "react";
import { Layers } from "lucide-react";

export function CategoryPickerDialog({
  categories,
  counts,
  selectedCategory,
  onSelect,
  onClose,
}: {
  categories: string[];
  counts: Record<string, number>;
  selectedCategory: string;
  onSelect: (cat: string) => void;
  onClose: () => void;
}) {
  const [focusIndex, setFocusIndex] = useState(() =>
    Math.max(0, categories.indexOf(selectedCategory))
  );
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-c="${focusIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [focusIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIndex((i) => Math.min(categories.length - 1, i + 1));
      } else if (e.key === "PageUp") {
        e.preventDefault();
        setFocusIndex((i) => Math.max(0, i - 8));
      } else if (e.key === "PageDown") {
        e.preventDefault();
        setFocusIndex((i) => Math.min(categories.length - 1, i + 8));
      } else if (e.key === "Enter" || e.key === "NumpadEnter") {
        e.preventDefault();
        onSelect(categories[focusIndex]);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [focusIndex, categories, onSelect, onClose]);

  return (
    <div className="dlg-overlay" onClick={onClose}>
      <div className="cat-dlg" onClick={(e) => e.stopPropagation()}>
        <div className="dlg-head-row">
          <div className="cat-icon-badge">
            <Layers size={20} color="#2dd4bf" />
          </div>
          <div>
            <div className="dlg-title" style={{ fontSize: 16 }}>
              Select Category
            </div>
            <div className="dlg-sub">Currently browsing: {selectedCategory}</div>
          </div>
        </div>
        <div className="dlg-divider" />
        <div className="cat-list" ref={listRef}>
          {categories.map((cat, i) => {
            const focused = focusIndex === i;
            const selected = cat === selectedCategory;
            return (
              <button
                type="button"
                key={cat}
                data-c={i}
                className={`cat-item ${focused ? "focused" : ""} ${selected ? "selected" : ""}`}
                onClick={() => onSelect(cat)}
                onMouseEnter={() => setFocusIndex(i)}
              >
                <span className="cat-label">{cat}</span>
                <span className="cat-count-chip">{counts[cat] ?? 0}</span>
              </button>
            );
          })}
        </div>
        <div className="dlg-hint-bar">
          <span className="hint-group">▲▼ Move · PageUp/Down jump</span>
          <span className="hint-group">OK — Select · Back — Close</span>
        </div>
      </div>
    </div>
  );
}
