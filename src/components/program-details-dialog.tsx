"use client";

// Ported from lib/widgets/tv_program_details_dialog.dart: full synopsis dialog
// with metadata chips, live progress, reminder toggle and D-pad actions.

import { useEffect, useRef, useState } from "react";
import {
  AlarmClock,
  Bell,
  BellRing,
  Calendar,
  CheckCircle2,
  FileText,
  History,
  PersonStanding,
  Play,
  Tag as CategoryIcon,
  Timer,
  Tv,
  Video,
  X,
} from "lucide-react";
import {
  type Channel,
  type Program,
  programCastHighlight,
  programDurationText,
  programEpisodeInfo,
  programIsLive,
  programProgress,
  programRemainingText,
  programSynopsis,
  programTimeRangeText,
} from "@/lib/live-tv";
import { useStore } from "@/lib/store";
import { ChannelIcon } from "./channel-icon";
import { buildReminderId } from "@/lib/store";

type FocusButton = 0 | 1 | 2;

export function ProgramDetailsDialog({
  channel,
  program,
  channelNumber,
  onTuneChannel,
  onClose,
}: {
  channel: Channel;
  program: Program | null;
  channelNumber?: number;
  onTuneChannel: () => void;
  onClose: () => void;
}) {
  const store = useStore();
  const { reminders, toggleReminder, isReminderSet } = store;
  const [focusedButtonIdx, setFocusedButtonIdx] = useState<FocusButton>(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const synopsisRef = useRef<HTMLDivElement>(null);

  const p = program;
  const ch = channel;
  const isLive = p ? programIsLive(p) : true;
  const isUpcoming = p ? nowMs !== null && nowMs < p.start.getTime() : false;

  useEffect(() => {
    setNowMs(Date.now());
  }, []);

  const reminderSet = p
    ? isReminderSet(channel.tvgId || channel.name, p) ||
      reminders.some((r) => r.id === buildReminderId(channel.tvgId || channel.name, p))
    : false;

  const toggleReminderAction = () => {
    if (!p) return;
    const added = toggleReminder(channel, p);
    setStatusMessage(
      added
        ? "Reminder set! We will notify you before the show starts."
        : "Reminder removed."
    );
  };

  const triggerFocusedButton = (idx: FocusButton) => {
    if (idx === 0) {
      onClose();
      onTuneChannel();
    } else if (idx === 1) {
      if (isUpcoming) toggleReminderAction();
    } else {
      onClose();
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === "ArrowLeft") {
        e.preventDefault();
        setFocusedButtonIdx((i) => (i > 0 ? (i - 1) as FocusButton : i));
      } else if (k === "ArrowRight") {
        e.preventDefault();
        setFocusedButtonIdx((i) => (i < 2 ? (i + 1) as FocusButton : i));
      } else if (k === "ArrowUp") {
        e.preventDefault();
        synopsisRef.current?.scrollBy({ top: -60, behavior: "smooth" });
      } else if (k === "ArrowDown") {
        e.preventDefault();
        synopsisRef.current?.scrollBy({ top: 60, behavior: "smooth" });
      } else if (k === "Enter" || k === "NumpadEnter") {
        e.preventDefault();
        triggerFocusedButton(focusedButtonIdx);
      } else if (k === "Escape" || k === "Backspace") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [focusedButtonIdx, onTuneChannel, onClose]);

  const chips: { icon: React.ReactNode; label: string; color: string }[] = [];
  if (p) {
    chips.push({ icon: <Calendar size={12} />, label: programTimeRangeText(p), color: "#ffd700" });
    chips.push({ icon: <Timer size={12} />, label: programDurationText(p), color: "#38bdf8" });
    const ep = programEpisodeInfo(p);
    if (ep) chips.push({ icon: <Video size={12} />, label: ep, color: "#a78bfa" });
  }
  if (ch.category) {
    chips.push({ icon: <CategoryIcon size={12} />, label: ch.category, color: "#2dd4bf" });
  }

  const cast = p ? programCastHighlight(p) : null;
  const synopsis = p ? programSynopsis(p) : `Live broadcast. Tune into ${ch.name} to watch current program.`;

  const actions: {
    icon: React.ReactNode;
    label: string;
    color: string;
    enabled: boolean;
    subtitle?: string;
  }[] = [
    {
      icon: <Play size={16} />,
      label: isLive ? "Watch Channel" : "Tune Channel",
      color: "#0284c7",
      enabled: true,
    },
    {
      icon: reminderSet ? <BellRing size={16} /> : <Bell size={16} />,
      label: reminderSet ? "Reminder Set" : "Add to Reminder",
      color: reminderSet ? "#059669" : "#d97706",
      enabled: isUpcoming,
      subtitle: !isUpcoming && isLive ? "Live Now" : undefined,
    },
    { icon: <X size={16} />, label: "Close", color: "#475569", enabled: true },
  ];

  const progress = p ? programProgress(p) : 0;

  return (
    <div className="dlg-overlay heavy" onClick={onClose}>
      <div
        className="prog-dlg"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {/* 1. channel header */}
        <div className="prog-dlg-head">
          <ChannelIcon channel={ch} width={44} height={28} />
          {channelNumber != null && <span className="num-chip">#{channelNumber}</span>}
          <span className="prog-dlg-channel" style={{ fontSize: 14.5, fontWeight: 700 }}>
            {ch.name}
          </span>
          {ch.resolution && <span className="res-chip">{ch.resolution}</span>}
          <div className="status-badge">
            {p ? (
              isLive ? (
                <span className="status-badge live">
                  <span className="badge-dot" /> LIVE NOW
                </span>
              ) : isUpcoming ? (
                <span className="status-badge upcoming">
                  <AlarmClock size={13} color="#38bdf8" /> {programRemainingText(p)}
                </span>
              ) : (
                <span className="status-badge ended">
                  <History size={13} color="#94a3b8" /> ENDED
                </span>
              )
            ) : (
              <span className="status-badge onair">
                <Tv size={13} color="#10b981" /> ON AIR
              </span>
            )}
          </div>
        </div>

        {/* 2. title + chips */}
        <div className="prog-dlg-title-wrap">
          <div className="prog-dlg-title">
            {p ? p.title : `Live Broadcast on ${ch.name}`}
          </div>
          <div className="chips-row">
            {chips.map((c, i) => (
              <span
                key={i}
                className="meta-chip"
                style={{ borderColor: `${c.color}59`, background: `${c.color}1f`, color: c.color }}
              >
                {c.icon}
                <span style={{ color: "rgba(255,255,255,0.95)" }}>{c.label}</span>
              </span>
            ))}
          </div>
        </div>

        {/* 3. progress */}
        {p && isLive && (
          <div className="prog-progress-wrap">
            <div className="prog-progress">
              <div style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <div className="prog-progress-labels">
              <span className="elapsed">{`${Math.round(progress * 100)}% Elapsed`}</span>
              <span className="remaining">{programRemainingText(p)}</span>
            </div>
          </div>
        )}

        {/* 4. synopsis */}
        <div className="synopsis-box">
          <div className="synopsis-head">
            <FileText size={14} color="#38bdf8" />
            <span>SYNOPSIS &amp; DETAILS</span>
            {cast && (
              <span className="cast-chip">
                <PersonStanding size={11} color="#22d3ee" />
                Featured Cast
              </span>
            )}
          </div>
          <div className="synopsis-text" ref={synopsisRef}>
            {synopsis}
          </div>
        </div>

        {/* 5. toast */}
        {statusMessage && (
          <div className="status-toast">
            <CheckCircle2 size={14} color="#34d399" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* 6. actions */}
        <div className="prog-actions">
          {actions.map((a, i) => {
            const focused = focusedButtonIdx === i;
            const effective = a.enabled ? a.color : "#334155";
            return (
              <button
                type="button"
                key={a.label}
                className={`tv-action ${i === 0 ? "flex4" : i === 2 ? "flex3" : "flex4"}`}
                style={{
                  background: focused ? effective : `${effective}33`,
                  borderColor: focused ? "#fff" : `${effective}80`,
                  borderWidth: focused ? 2 : 1,
                  boxShadow: focused ? `0 0 12px ${effective}` : undefined,
                }}
                onClick={() => {
                  setFocusedButtonIdx(i as FocusButton);
                  triggerFocusedButton(i as FocusButton);
                }}
                onMouseEnter={() => setFocusedButtonIdx(i as FocusButton)}
              >
                <span style={{ display: "grid", color: focused ? "#fff" : a.enabled ? "#fff" : "rgba(255,255,255,0.38)" }}>
                  {a.icon}
                </span>
                <span className="action-texts">
                  <span
                    className="action-label"
                    style={{ color: focused ? "#fff" : a.enabled ? "#fff" : "rgba(255,255,255,0.38)" }}
                  >
                    {a.label}
                  </span>
                  {a.subtitle && <span className="action-sub">{a.subtitle}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

