"use client";

// Ported from lib/widgets/tv_search_dialog.dart: TV-style virtual keyboard on
// the left, 3-column result grid on the right, plus a mobile text layout.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Mic, Search as SearchIcon, Tv, X } from "lucide-react";
import { type Channel } from "@/lib/live-tv";
import { ChannelIcon } from "./channel-icon";

type SpeechRecognitionResultEvent = Event & {
  results: SpeechRecognitionResultList;
};

type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

const KEYS: string[][] = [
  ["A", "B", "C", "D", "E", "F"],
  ["G", "H", "I", "J", "K", "L"],
  ["M", "N", "O", "P", "Q", "R"],
  ["S", "T", "U", "V", "W", "X"],
  ["Y", "Z", "0", "1", "2", "3"],
  ["4", "5", "6", "7", "8", "9"],
  ["MIC", "SPACE", "DEL", "CLEAR", "CLOSE"],
];

export function TvSearchDialog({
  allChannels,
  isMobile,
  onChannelSelect,
  onClose,
}: {
  allChannels: Channel[];
  isMobile: boolean;
  onChannelSelect: (channel: Channel) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [kbRow, setKbRow] = useState(0);
  const [kbCol, setKbCol] = useState(0);
  const [focusedResultIdx, setFocusedResultIdx] = useState(0);
  const [inResults, setInResults] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return [] as Channel[];
    return allChannels
      .filter(
        (c) =>
          [c.name, c.category, c.tvgId]
            .filter(Boolean)
            .some((value) => value.toLocaleLowerCase().includes(q))
      )
      .slice(0, 300);
  }, [query, allChannels]);

  const updateQuery = useCallback((next: string) => {
    setQuery(next);
    setInResults(false);
    setFocusedResultIdx(0);
  }, []);

  const startVoiceSearch = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognition =
      (window as SpeechWindow).SpeechRecognition ??
      (window as SpeechWindow).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMicError("Voice search is not supported in this browser");
      return;
    }

    recognitionRef.current?.stop();
    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) updateQuery(transcript);
      setMicError(null);
    };
    recognition.onerror = (event) => {
      const error = event as Event & { error?: string };
      setMicError(
        error.error === "not-allowed"
          ? "Microphone permission was blocked"
          : "Could not hear that, please try again"
      );
      setIsListening(false);
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    setMicError(null);
    setIsListening(true);
    try {
      recognition.start();
    } catch {
      setIsListening(false);
      setMicError("Could not start the microphone");
    }
  }, [isListening, updateQuery]);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  useEffect(() => {
    if (focusedResultIdx >= results.length) {
      setFocusedResultIdx(0);
    }
  }, [results.length, focusedResultIdx]);

  useEffect(() => {
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-ri="${focusedResultIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [focusedResultIdx, inResults]);

  // ------------------------------------------------ mobile layout
  useEffect(() => {
    if (!isMobile) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isMobile, onClose]);

  // ------------------------------------------------ TV layout
  const onKeyPress = (key: string) => {
    if (key === "MIC") {
      startVoiceSearch();
      return;
    }
    if (key === "SPACE") updateQuery(`${query} `);
    else if (key === "DEL") updateQuery(query.slice(0, -1));
    else if (key === "CLEAR") updateQuery("");
    else if (key === "CLOSE") onClose();
    else updateQuery(`${query}${key}`);
  };

  // ------------------------------------------------ TV layout
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ch = e.key;

      // physical typing support (voice remotes, USB keyboards)
      if (ch && ch.length === 1 && ch.codePointAt(0)! >= 32 && ch.codePointAt(0)! <= 126) {
        e.preventDefault();
        updateQuery(`${query}${ch === " " ? " " : ch.toLocaleUpperCase()}`);
        return;
      }
      if (ch === "F5") {
        e.preventDefault();
        return;
      }
      if (ch === "Backspace") {
        e.preventDefault();
        updateQuery(query.slice(0, -1));
        return;
      }
      if (ch === "Escape") {
        e.preventDefault();
        if (inResults) {
          setInResults(false);
        } else {
          onClose();
        }
        return;
      }
      if (ch === "ArrowUp" || ch === "ArrowDown" || ch === "ArrowLeft" || ch === "ArrowRight" || ch === "Enter" || ch === "NumpadEnter") {
        e.preventDefault();
      }

      if (inResults) {
        if (results.length === 0) {
          setInResults(false);
          return;
        }
        const cols = 3;
        if (ch === "ArrowUp") {
          if (focusedResultIdx >= cols) setFocusedResultIdx((i) => i - cols);
        } else if (ch === "ArrowDown") {
          if (focusedResultIdx + cols < results.length) setFocusedResultIdx((i) => i + cols);
        } else if (ch === "ArrowLeft") {
          if (focusedResultIdx % cols > 0) setFocusedResultIdx((i) => i - 1);
          else setInResults(false);
        } else if (ch === "ArrowRight") {
          if (focusedResultIdx < results.length - 1 && focusedResultIdx % cols < cols - 1) {
            setFocusedResultIdx((i) => i + 1);
          }
        } else if (ch === "Enter" || ch === "NumpadEnter") {
          if (focusedResultIdx < results.length) onChannelSelect(results[focusedResultIdx]);
        }
        return;
      }

      const cur = KEYS[kbRow];
      if (ch === "ArrowUp") {
        if (kbRow > 0) {
          setKbRow(kbRow - 1);
          setKbCol((c) => Math.min(c, KEYS[kbRow - 1].length - 1));
        }
      } else if (ch === "ArrowDown") {
        if (kbRow < KEYS.length - 1) {
          setKbRow(kbRow + 1);
          setKbCol((c) => Math.min(c, KEYS[kbRow + 1].length - 1));
        }
      } else if (ch === "ArrowLeft") {
        if (kbCol > 0) setKbCol(kbCol - 1);
      } else if (ch === "ArrowRight") {
        if (kbCol < cur.length - 1) setKbCol(kbCol + 1);
        else if (results.length > 0) {
          setInResults(true);
          setFocusedResultIdx(0);
        }
      } else if (ch === "Enter" || ch === "NumpadEnter") {
        onKeyPress(cur[kbCol]);
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [kbRow, kbCol, inResults, focusedResultIdx, results, query, onChannelSelect, onClose, onKeyPress, updateQuery]);

  // ------------------------------------------------ mobile layout
  if (isMobile) {
    return (
      <div className="search-mobile-backdrop">
        <div className="search-mobile">
          <div className="search-mobile-top">
            <SearchIcon size={24} color="#38bdf8" />
            <span className="search-mobile-title">Search channels</span>
            <button type="button" className="search-mobile-close" onClick={onClose} aria-label="Close search">
              <X size={22} color="rgba(255,255,255,0.7)" />
            </button>
          </div>
          <div className="search-mobile-field">
            <SearchIcon size={18} color="#38bdf8" />
            <input
              autoFocus
              value={query}
              placeholder="Name, category or channel ID"
              onChange={(e) => updateQuery(e.target.value)}
            />
            <button
              type="button"
              className={`search-mic-button ${isListening ? "listening" : ""}`}
              onClick={startVoiceSearch}
              aria-label={isListening ? "Stop voice search" : "Start voice search"}
            >
              <Mic size={17} />
            </button>
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear">
                <X size={16} color="rgba(255,255,255,0.54)" />
              </button>
            )}
          </div>
          {micError && <div className="search-mic-error">{micError}</div>}
          <div className="search-mobile-results">
            {query.trim().length === 0 ? (
              <div className="center-empty">
                <Tv size={44} color="rgba(255,255,255,0.24)" />
                <span>Search for your favourite channel</span>
              </div>
            ) : results.length === 0 ? (
              <div className="center-empty">
                <span>No matching channels found</span>
              </div>
            ) : (
              results.map((ch) => (
                <button
                  key={searchKey(ch)}
                  type="button"
                  className="search-mobile-row"
                  onClick={() => onChannelSelect(ch)}
                >
                  <ChannelIcon channel={ch} width={58} height={38} />
                  <div className="search-mobile-txt">
                    <span>{ch.name}</span>
                    <small>{`${ch.category} · ${ch.resolution}`}</small>
                  </div>
                  <span style={{ color: "#38bdf8" }}>▶</span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------
  return (
    <div className="search-tv-backdrop">
      <div className="search-tv">
        <div className="search-tv-bar">
          <div className="search-tv-badge">
            <SearchIcon size={20} color="#fff" />
          </div>
          {micError && <div className="search-mic-error search-mic-error-tv">{micError}</div>}
          <div className={`search-tv-input ${inResults ? "muted-border" : ""}`}>
            <span className={query.length === 0 ? "placeholder" : ""}>
              {query.length === 0 ? "Type to search channels..." : query}
            </span>
            {!inResults && <span className="caret" />}
            <div style={{ flex: 1 }} />
            {query.length > 0 && <span className="found">{results.length} found</span>}
          </div>
          <div className={`search-tv-hint ${inResults ? "" : ""}`}>
            {inResults ? <ChevronLeft size={13} color="rgba(255,255,255,0.54)" /> : <ChevronRight size={13} color="rgba(255,255,255,0.54)" />}
            <span>{inResults ? "Keyboard · OK: Play" : "Results · Back: Exit"}</span>
          </div>
        </div>
        <div className="search-tv-body">
          <div className="search-kbd">
            {KEYS.map((row, r) => (
              <div className="search-kbd-row" key={r}>
                {row.map((label, c) => {
                  const focused = !inResults && kbRow === r && kbCol === c;
                  const isAction = label.length > 1;
                  const isMic = label === "MIC";
                  return (
                    <button
                      type="button"
                      key={label}
                      className={`kbd-key ${isAction ? "action" : ""} ${isMic ? "mic" : ""} ${focused ? "focused" : ""}`}
                      style={{ flex: isAction ? "2 1 0%" : "1 1 0%" }}
                      onClick={() => {
                        setKbRow(r);
                        setKbCol(c);
                        onKeyPress(label);
                      }}
                      onMouseEnter={() => {
                        if (inResults) return;
                        setKbRow(r);
                        setKbCol(c);
                      }}
                    >
                      {isMic ? (
                        <>
                          <Mic size={14} color={focused ? "#000" : "#2dd4bf"} />
                          <span>MIC</span>
                        </>
                      ) : (
                        label
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className={`search-results ${inResults ? "active" : ""}`} ref={gridRef}>
            {query.length === 0 ? (
              <div className="center-empty">
                <SearchIcon size={48} color="rgba(255,255,255,0.24)" />
                <span style={{ whiteSpace: "pre-line", textAlign: "center" }}>
                  {"Use remote arrows to type\nor use microphone / phone keyboard"}
                </span>
              </div>
            ) : results.length === 0 ? (
              <div className="center-empty">
                <span>No matching channels found</span>
              </div>
            ) : (
              <div className="search-grid">
                {results.map((ch, i) => {
                  const focused = inResults && i === focusedResultIdx;
                  return (
                    <button
                      type="button"
                      key={searchKey(ch)}
                      data-ri={i}
                      className={`search-result-row ${focused ? "focused" : ""}`}
                      onClick={() => onChannelSelect(ch)}
                      onMouseEnter={() => {
                        setInResults(true);
                        setFocusedResultIdx(i);
                      }}
                    >
                      <ChannelIcon channel={ch} width={48} height={32} />
                      <div className="search-result-txt">
                        <span>{ch.name}</span>
                        <small>{`${ch.category} · ${ch.resolution}`}</small>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function searchKey(c: Channel) {
  return `${c.tvgId}:${c.name}:${c.category}`;
}
