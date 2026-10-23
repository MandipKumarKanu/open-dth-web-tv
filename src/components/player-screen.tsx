"use client";

// Ported from lib/screens/player.dart: full-screen live player with hls.js,
// quality switching, backup stream recovery, controls overlay, mini guide,
// DTH timeline guide, reminder toast and the full D-pad behaviour.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Hls from "hls.js";
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Circle,
  ChevronsUpDown,
  List,
  ListVideo,
  Mic,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Star,
  Volume2,
  WifiOff,
  X,
} from "lucide-react";
import { type Channel } from "@/lib/live-tv";
import {
  screenFitMeta,
  useStore,
  type ProgramReminder,
  type ScreenFitMode,
} from "@/lib/store";
import { ChannelIcon } from "./channel-icon";
import { MiniGuide } from "./mini-guide";
import { TimelineGuide } from "./timeline-guide";
import { TvSearchDialog } from "./tv-search-dialog";
import { TvAudioTrackDialog } from "./tv-audio-track-dialog";
import type { PlayRequest } from "./home-screen";

const START_TIMEOUT_MS = 5_000;
const MAX_STREAM_RETRIES = 3;

type ControlSection = "playPause" | "recall" | "quality" | "screenFit" | "audioTrack" | "topBarAudio" | "epgGuide";

export function PlayerScreen({
  request,
  allChannels,
  onExit,
}: {
  request: PlayRequest;
  allChannels: Channel[];
  onExit: (lastIndex: number) => void;
}) {
  const store = useStore();
  const {
    addRecent,
    getPreferredStreamIndex,
    rememberWorkingStream,
    reportStreamFailure,
    screenFit,
    cycleScreenFit,
    setPreferredAudioLanguage,
    setOnReminderDue,
    getNow,
    getNext,
    isFavorite,
    toggleFavorite,
    favorites,
  } = store;

  const [activeChannels, setActiveChannels] = useState<Channel[]>(request.channels);
  const baseChannels = useMemo(
    () => (allChannels.length > 0 ? allChannels : request.channels),
    [allChannels, request.channels]
  );
  const allRef = useRef<Channel[]>(allChannels.length > 0 ? allChannels : request.channels);
  useEffect(() => {
    allRef.current = baseChannels;
  }, [baseChannels]);
  const [index, setIndex] = useState(request.index);
  const [streamIdx, setStreamIdx] = useState(() => {
    const ch = request.channels[request.index];
    return ch ? getPreferredStreamIndex(ch) : 0;
  });
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const [showGuide, setShowGuide] = useState(false);
  const [showTimelineGuide, setShowTimelineGuide] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [controlSection, setControlSection] = useState<ControlSection>("playPause");
  const [selectedQuality, setSelectedQuality] = useState("Auto");
  const [focusedQualityIdx, setFocusedQualityIdx] = useState(0);
  const [qualityNotice, setQualityNotice] = useState<string | null>(null);
  const [audioTracks, setAudioTracks] = useState<{ id: string; lang: string; name: string }[]>([]);
  const [selectedAudioTrackId, setSelectedAudioTrackId] = useState("");
  const [activeReminderAlert, setActiveReminderAlert] = useState<ProgramReminder | null>(null);
  const [recoveryAttempts, setRecoveryAttempts] = useState(0);
  const [isMobileWidth, setIsMobileWidth] = useState(false);
  const [videoW, setVideoW] = useState(16);
  const [videoH, setVideoH] = useState(9);

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const genRef = useRef(0);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);
  const recoveryTimerRef = useRef<number | null>(null);
  const bufferingStepDownRef = useRef<number | null>(null);
  const bufferEventsRef = useRef<number[]>([]);
  const noticeTimerRef = useRef<number | null>(null);
  const infoTimerRef = useRef<number | null>(null);
  const controlsTimerRef = useRef<number | null>(null);
  const guideTimerRef = useRef<number | null>(null);
  const timelineGuideTimerRef = useRef<number | null>(null);
  const reminderTimerRef = useRef<number | null>(null);
  const zapTimerRef = useRef<number | null>(null);
  const lastCloseRef = useRef({ info: 0, controls: 0, guide: 0, timeline: 0 });

  const indexRef = useRef(index);
  const streamIdxRef = useRef(streamIdx);
  const qualityRef = useRef(selectedQuality);
  const sectionRef = useRef<ControlSection>(controlSection);
  const timelineOpenRef = useRef(false);
  const guideOpenRef = useRef(false);
  const controlsOpenRef = useRef(false);
  const infoOpenRef = useRef(true);
  const failedRef = useRef(false);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  useEffect(() => {
    streamIdxRef.current = streamIdx;
  }, [streamIdx]);
  useEffect(() => {
    qualityRef.current = selectedQuality;
  }, [selectedQuality]);
  useEffect(() => {
    sectionRef.current = controlSection;
  }, [controlSection]);
  useEffect(() => {
    timelineOpenRef.current = showTimelineGuide;
  }, [showTimelineGuide]);
  useEffect(() => {
    guideOpenRef.current = showGuide;
  }, [showGuide]);
  useEffect(() => {
    controlsOpenRef.current = showControls;
  }, [showControls]);
  useEffect(() => {
    infoOpenRef.current = showInfo;
  }, [showInfo]);
  useEffect(() => {
    failedRef.current = failed;
  }, [failed]);

  useEffect(() => {
    const update = () =>
      setIsMobileWidth(window.innerWidth < 720 || window.innerHeight < 600);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Release the mobile landscape lock and fullscreen mode when the player closes.
  useEffect(() => {
    return () => {
      try {
        screen.orientation?.unlock?.();
      } catch {
        // Ignore browsers without orientation-lock support.
      }
      if (document.fullscreenElement && document.exitFullscreen) {
        void document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  const activeListRef = useRef(activeChannels);
  useEffect(() => {
    activeListRef.current = activeChannels;
  }, [activeChannels]);

  const channel = activeChannels[index];

  const availableQualities = useMemo(() => {
    if (!channel) return ["Auto"];
    const set = new Set<string>();
    for (const r of channel.streamResolutions) if (r) set.add(r);
    if (set.size === 0 && channel.resolution) set.add(channel.resolution);
    return ["Auto", ...set];
  }, [channel]);

  const showQualityNotice = useCallback((msg: string) => {
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    setQualityNotice(msg);
    noticeTimerRef.current = window.setTimeout(() => setQualityNotice(null), 4_000);
  }, []);

  const flashInfo = useCallback(() => {
    setShowInfo(true);
    if (infoTimerRef.current) window.clearTimeout(infoTimerRef.current);
    infoTimerRef.current = window.setTimeout(() => {
      setShowInfo(false);
    }, 5_000);
  }, []);

  const closeInfo = useCallback(() => {
    lastCloseRef.current.info = Date.now();
    if (infoTimerRef.current) window.clearTimeout(infoTimerRef.current);
    setShowInfo(false);
  }, []);

  // ------------------------------------------------ reminders
  const showReminderAlert = useCallback((r: ProgramReminder) => {
    if (reminderTimerRef.current) window.clearTimeout(reminderTimerRef.current);
    setActiveReminderAlert(r);
    reminderTimerRef.current = window.setTimeout(() => setActiveReminderAlert(null), 14_000);
  }, []);

  useEffect(() => {
    setOnReminderDue(showReminderAlert);
    return () => setOnReminderDue(null);
  }, [setOnReminderDue, showReminderAlert]);

  // ------------------------------------------------ open stream
  const open = useCallback(
    (persistWorkingStream = true) => {
      const gen = ++genRef.current;
      const ch = activeListRef.current[indexRef.current];
      if (!ch) return;
      const urls = ch.streamUrls;
      let si = streamIdxRef.current;
      if (si >= urls.length) si = 0;

      setFailed(false);
      setInitialized(false);
      setBuffering(true);
      setPlaying(false);
      setAudioTracks([]);
      setSelectedAudioTrackId("");
      flashInfo();

      const url = urls[si];
      const video = videoRef.current;
      if (!video || !url) {
        setFailed(true);
        return;
      }

      const openInner = (_persist: boolean) => {
        // re-run open with the same channel but a fresh generation
        window.setTimeout(() => open(), 50);
      };

      // Stop any previous player BEFORE opening a new stream — otherwise the
      // old HLS/MSE instance stays attached and keeps playing in the
      // background after zapping or exiting to the channel list.
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.pause();

      if (Hls.isSupported()) {
        const hls = new Hls({
          liveDurationInfinity: true,
          backBufferLength: 30,
          maxBufferLength: 18,
          manifestLoadingTimeOut: START_TIMEOUT_MS,
        });
        hlsRef.current = hls;
        hls.loadSource(url);
        hls.attachMedia(video);
        let startTimer: number | null = window.setTimeout(() => {
          if (gen === genRef.current && !videoRef.current?.readyState) {
            handleStreamError(gen, false);
          }
        }, START_TIMEOUT_MS);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (gen !== genRef.current) return;
          if (startTimer) {
            window.clearTimeout(startTimer);
            startTimer = null;
          }
          void video.play().then(
            () => setPlaying(true),
            () => setPlaying(false)
          );
          setInitialized(true);
          retryCountRef.current = 0;
          stopAutoRecovery();
          if (si > 0) {
            const res = si < ch.streamResolutions.length ? ch.streamResolutions[si] : "Backup";
            showQualityNotice(`Connected to backup stream (${res}) · Saved as default`);
            if (persistWorkingStream) rememberWorkingStream(ch, url);
          } else if (persistWorkingStream) {
            rememberWorkingStream(ch, url);
          }
          if (hls.audioTracks.length > 0) {
            setAudioTracks(hls.audioTracks.map((t) => ({ id: String(t.id), lang: t.lang ?? "", name: t.name ?? "" })));
            setSelectedAudioTrackId(String(hls.audioTrack));
          }
          addRecent(ch);
          flashInfo();
        });
        hls.on(Hls.Events.LEVEL_SWITCHED, () => setBuffering(false));
        hls.on(Hls.Events.FRAG_BUFFERED, () => {
          setBuffering(false);
        });
        hls.on(Hls.Events.FRAG_CHANGED, () => setBuffering(false));
        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_e, data) => {
          if (gen !== genRef.current) return;
          setAudioTracks(data.audioTracks.map((t) => ({ id: String(t.id), lang: t.lang ?? "", name: t.name ?? "" })));
          setSelectedAudioTrackId(String(hls.audioTrack));
        });
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (gen !== genRef.current) return;
          if (!data.fatal) {
            setBuffering(true);
            onBufferEvent();
            return;
          }
          if (
            data.type === Hls.ErrorTypes.NETWORK_ERROR &&
            data.details === "manifestLoadError" &&
            retryCountRef.current < 3
          ) {
            // CORS / offline feeds: fall through to error handling like codec errors below
          }
          handleStreamError(gen, false);
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = url;
        video.addEventListener("loadedmetadata", () => {
          if (gen !== genRef.current) return;
          void video.play().then(
            () => setPlaying(true),
            () => setPlaying(false)
          );
          setInitialized(true);
          setBuffering(false);
        });
        video.addEventListener("waiting", () => {
          setBuffering(true);
          onBufferEvent();
        });
        video.addEventListener("playing", () => setBuffering(false));
      } else {
        setFailed(true);
      }

      function handleStreamError(gen: number, _silent: boolean) {
        void _silent;
        if (gen !== genRef.current) return;
        if (retryTimerRef.current) return;
        if (retryCountRef.current < MAX_STREAM_RETRIES) {
          retryCountRef.current += 1;
          setIsReconnecting(true);
          showQualityNotice(
            `Signal drop detected · Auto-reconnecting (${retryCountRef.current}/${MAX_STREAM_RETRIES})...`
          );
          const delay = retryCountRef.current * 700;
          const n = retryCountRef.current;
          retryTimerRef.current = window.setTimeout(() => {
            retryTimerRef.current = null;
            if (n >= MAX_STREAM_RETRIES) setIsReconnecting(false);
            openInner(false);
          }, delay);
        } else {
          nextStream(gen);
        }
      }

      function nextStream(gen: number) {
        if (gen !== genRef.current) return;
        if (retryTimerRef.current) {
          window.clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }
        retryCountRef.current = 0;
        reportStreamFailure(ch, url);
        if (si + 1 < urls.length) {
          streamIdxRef.current = si + 1;
          const nsi = si + 1;
          const nextRes = nsi < ch.streamResolutions.length ? ch.streamResolutions[nsi] : `backup ${nsi + 1}`;
          setStreamIdx(nsi);
          showQualityNotice(`Stream ${si} unavailable · Trying backup ${nextRes}...`);
          window.setTimeout(() => open(false), 50);
        } else {
          setFailed(true);
          setShowInfo(true);
          setIsReconnecting(false);
          startAutoRecovery();
        }
      }

      function onBufferEvent() {
        if (qualityRef.current !== "Auto") return;
        const now = Date.now();
        const evs = bufferEventsRef.current.filter((t) => now - t < 15_000);
        evs.push(now);
        bufferEventsRef.current = evs;
        if (bufferingStepDownRef.current) window.clearTimeout(bufferingStepDownRef.current);
        bufferingStepDownRef.current = window.setTimeout(() => {
          if (bufferEventsRef.current.length >= 2) stepDownToBackup();
        }, 3_500);
        if (evs.length >= 2) stepDownToBackup();
      }

      function stepDownToBackup() {
        if (bufferingStepDownRef.current) window.clearTimeout(bufferingStepDownRef.current);
        bufferEventsRef.current = [];
        if (streamIdxRef.current + 1 < urls.length) {
          streamIdxRef.current += 1;
          const nsi = streamIdxRef.current;
          const newRes = nsi < ch.streamResolutions.length ? ch.streamResolutions[nsi] : "backup stream";
          setStreamIdx(nsi);
          showQualityNotice(`Network slow · Auto-switched to ${newRes}`);
          window.setTimeout(() => open(false), 50);
        }
      }

      function startAutoRecovery() {
        if (recoveryTimerRef.current) window.clearInterval(recoveryTimerRef.current);
        let attempts = 0;
        recoveryTimerRef.current = window.setInterval(() => {
          attempts += 1;
          setRecoveryAttempts(attempts);
          if (attempts > 30 || !failedRef.current) {
            if (recoveryTimerRef.current) window.clearInterval(recoveryTimerRef.current);
            recoveryTimerRef.current = null;
            return;
          }
          streamIdxRef.current = 0;
          retryCountRef.current = 0;
          window.setTimeout(() => open(false), 50);
          // keep interval ticking; it stops when playback succeeds
        }, 4_000);
      }

      function stopAutoRecovery() {
        if (recoveryTimerRef.current) {
          window.clearInterval(recoveryTimerRef.current);
          recoveryTimerRef.current = null;
        }
        setRecoveryAttempts(0);
      }
    },
    [addRecent, flashInfo, rememberWorkingStream, reportStreamFailure, showQualityNotice]
  );

  useEffect(() => {
    open(true);
    return () => {
      genRef.current += 1;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      const v = videoRef.current;
      if (v) {
        v.pause();
        v.removeAttribute("src");
        v.load();
      }
      // stop background timers so nothing keeps retrying/playing after exit
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
      if (recoveryTimerRef.current) window.clearInterval(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
      if (zapTimerRef.current) window.clearTimeout(zapTimerRef.current);
      zapTimerRef.current = null;
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
      if (infoTimerRef.current) window.clearTimeout(infoTimerRef.current);
      infoTimerRef.current = null;
      if (controlsTimerRef.current) window.clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = null;
      if (bufferingStepDownRef.current) window.clearTimeout(bufferingStepDownRef.current);
      bufferingStepDownRef.current = null;
      if (guideTimerRef.current) window.clearTimeout(guideTimerRef.current);
      guideTimerRef.current = null;
      if (timelineGuideTimerRef.current) window.clearTimeout(timelineGuideTimerRef.current);
      timelineGuideTimerRef.current = null;
      if (reminderTimerRef.current) window.clearTimeout(reminderTimerRef.current);
      reminderTimerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, streamIdx]);

  // fail-safe info hiding on mount
  useEffect(() => {
    const t = window.setTimeout(() => setShowInfo(false), 5_000);
    return () => window.clearTimeout(t);
  }, []);

  // ------------------------------------------------ zap / tune
  const zap = useCallback(
    (delta: number) => {
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      retryCountRef.current = 0;
      setIsReconnecting(false);
      setSelectedQuality("Auto");
      setShowControls(false);
      setShowTimelineGuide(false);
      const n = activeListRef.current.length;
      if (n === 0) return;
      const ni = ((indexRef.current + delta) % n + n) % n;
      const ch = activeListRef.current[ni];
      indexRef.current = ni;
      setIndex(ni);
      const pref = getPreferredStreamIndex(ch);
      streamIdxRef.current = pref;
      setStreamIdx(pref);
      setShowInfo(true);
      if (zapTimerRef.current) window.clearTimeout(zapTimerRef.current);
      zapTimerRef.current = window.setTimeout(() => open(true), 350);
    },
    [getPreferredStreamIndex, open]
  );

  const tuneToChannel = useCallback(
    (ch: Channel) => {
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      retryCountRef.current = 0;
      setIsReconnecting(false);
      const key = (c: Channel) => c.tvgId || c.name;
      const cur = activeListRef.current[indexRef.current];
      if (key(cur) === key(ch)) {
        if (timelineOpenRef.current) setShowTimelineGuide(false);
        if (guideOpenRef.current) setShowGuide(false);
        return;
      }
      let n = activeListRef.current.findIndex((c) => key(c) === key(ch));
      if (n < 0) {
        setActiveChannels((cur2) => {
          activeListRef.current = [...cur2, ch];
          return activeListRef.current;
        });
        n = activeListRef.current.length - 1;
      }
      indexRef.current = n;
      setIndex(n);
      const pref = getPreferredStreamIndex(ch);
      streamIdxRef.current = pref;
      setStreamIdx(pref);
      setSelectedQuality("Auto");
      setShowControls(false);
      if (timelineOpenRef.current) setShowTimelineGuide(false);
      if (guideOpenRef.current) setShowGuide(false);
      open(true);
    },
    [getPreferredStreamIndex, open]
  );

  // ------------------------------------------------ overlays
  const openGuide = useCallback(() => {
    setShowGuide(true);
    setShowInfo(false);
    setShowControls(false);
    setShowTimelineGuide(false);
    if (guideTimerRef.current) window.clearTimeout(guideTimerRef.current);
    guideTimerRef.current = window.setTimeout(() => setShowGuide((g) => (g ? false : g)), 14_000);
  }, []);

  const closeGuide = useCallback(() => {
    lastCloseRef.current.guide = Date.now();
    if (guideTimerRef.current) window.clearTimeout(guideTimerRef.current);
    setShowGuide(false);
  }, []);

  const openTimelineGuide = useCallback(() => {
    setShowTimelineGuide(true);
    setShowGuide(false);
    setShowControls(false);
    setShowInfo(false);
    if (timelineGuideTimerRef.current) window.clearTimeout(timelineGuideTimerRef.current);
    timelineGuideTimerRef.current = window.setTimeout(() => setShowTimelineGuide((g) => (g ? false : g)), 30_000);
  }, []);

  const closeTimelineGuide = useCallback(() => {
    lastCloseRef.current.timeline = Date.now();
    if (timelineGuideTimerRef.current) window.clearTimeout(timelineGuideTimerRef.current);
    setShowTimelineGuide(false);
  }, []);

  const openControls = useCallback(() => {
    setShowControls(true);
    setShowInfo(false);
    setShowGuide(false);
    setShowTimelineGuide(false);
    setControlSection("playPause");
    setFocusedQualityIdx((i) => {
      const q = availableQualities;
      return q.includes(qualityRef.current) ? q.indexOf(qualityRef.current) : 0;
    });
    if (controlsTimerRef.current) window.clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = window.setTimeout(() => setShowControls(false), 8_000);
  }, [availableQualities]);

  const resetControlsTimer = useCallback(() => {
    if (controlsTimerRef.current) window.clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = window.setTimeout(() => setShowControls(false), 8_000);
  }, []);

  const setQuality = useCallback(
    (q: string) => {
      const ch = activeListRef.current[indexRef.current];
      retryCountRef.current = 0;
      if (q === "Auto") {
        streamIdxRef.current = 0;
        setStreamIdx(0);
        showQualityNotice("Quality: Auto (Network Adaptive)");
        setSelectedQuality("Auto");
      } else {
        let target = -1;
        for (let i = 0; i < ch.streamResolutions.length; i++) {
          if (ch.streamResolutions[i].toLowerCase() === q.toLowerCase()) {
            target = i;
            break;
          }
        }
        const si = target >= 0 ? target : 0;
        streamIdxRef.current = si;
        setStreamIdx(si);
        rememberWorkingStream(ch, ch.streamUrls[si]);
        showQualityNotice(`Quality locked to ${q}`);
        setSelectedQuality(q);
      }
      open(true);
    },
    [open, rememberWorkingStream, showQualityNotice]
  );

  const [searchOpen, setSearchOpen] = useState(false);

  const openVoiceSearch = useCallback(() => {
    if (timelineOpenRef.current) setShowTimelineGuide(false);
    if (guideOpenRef.current) setShowGuide(false);
    setShowControls(false);
    setSearchOpen(true);
  }, []);

  const [audioDialogOpen, setAudioDialogOpen] = useState(false);
  const openAudioTrackDialog = useCallback(() => {
    if (audioTracks.length === 0) {
      showQualityNotice("Single Audio Track (Stereo) active");
      return;
    }
    setAudioDialogOpen(true);
  }, [audioTracks.length, showQualityNotice]);

  const selectAudioTrack = useCallback(
    (trackId: string) => {
      const hls = hlsRef.current;
      if (!hls) return;
      hls.audioTrack = Number(trackId);
      const track = audioTracks.find((t) => t.id === trackId);
      if (track?.lang) setPreferredAudioLanguage(track.lang);
      setSelectedAudioTrackId(trackId);
      setAudioDialogOpen(false);
      showQualityNotice(
        `Audio: ${hls.audioTracks[Number(trackId)]?.name ?? track?.name ?? ""} · Saved as preferred`
      );
    },
    [audioTracks, setPreferredAudioLanguage, showQualityNotice]
  );

  const toggleScreenFit = useCallback(() => {
    const next = cycleScreenFit();
    showQualityNotice(`Screen Fit: ${screenFitMeta[next].label} (${screenFitMeta[next].description})`);
  }, [cycleScreenFit, showQualityNotice]);

  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().then(
        () => setPlaying(true),
        () => setPlaying(false)
      );
    } else {
      video.pause();
      setPlaying(false);
    }
  }, []);

  // ------------------------------------------------ keyboard D-pad
  useEffect(() => {
    if (searchOpen || audioDialogOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;

      if (e.code === "F5") {
        e.preventDefault();
        openVoiceSearch();
        return;
      }
      if (activeReminderAlert) {
        if (k === "Enter" || k === "NumpadEnter") {
          e.preventDefault();
          setActiveReminderAlert(null);
          const target =
            allRef.current.find((c) => (c.tvgId || c.name) === (activeReminderAlert.ck)) ??
            activeListRef.current.find(
              (c) => c.name.toLowerCase() === activeReminderAlert.cn.toLowerCase()
            );
          if (target) tuneToChannel(target);
          return;
        }
        if (k === "Escape" || k === "Backspace") {
          e.preventDefault();
          setActiveReminderAlert(null);
          return;
        }
      }

      const isBack = k === "Escape" || k === "Backspace";
      const isSelect = k === "Enter" || k === "NumpadEnter";

      // 1. controls overlay
      if (controlsOpenRef.current) {
        resetControlsTimer();
        const qList = availableQualities;
        const hasMultiAudio = audioTracks.length > 1;
        const section = sectionRef.current;

        if (k === "ArrowUp") {
          e.preventDefault();
          if (section !== "quality" && section !== "topBarAudio") {
            setControlSection(hasMultiAudio && (section === "audioTrack" || section === "screenFit") ? "topBarAudio" : "quality");
          }
          return;
        }
        if (k === "ArrowDown") {
          e.preventDefault();
          if (section === "topBarAudio") {
            setControlSection(hasMultiAudio ? "audioTrack" : "screenFit");
          } else if (section === "quality") {
            setControlSection("playPause");
          } else {
            setShowControls(false);
          }
          return;
        }
        if (k === "ArrowLeft") {
          e.preventDefault();
          if (section === "topBarAudio") {
            setControlSection("quality");
            setFocusedQualityIdx(qList.length > 0 ? qList.length - 1 : 0);
          } else if (section === "quality") {
            setFocusedQualityIdx((i) => Math.max(0, i - 1));
          } else if (section === "audioTrack") {
            setControlSection("screenFit");
          } else if (section === "screenFit") {
            setControlSection("epgGuide");
          } else if (section === "epgGuide") {
            setControlSection("playPause");
          } else if (section === "playPause") {
            setControlSection("recall");
          } else {
            setShowControls(false);
            openGuide();
          }
          return;
        }
        if (k === "ArrowRight") {
          e.preventDefault();
          if (section === "quality") {
            if (focusedQualityIdx < qList.length - 1) setFocusedQualityIdx((i) => i + 1);
            else if (hasMultiAudio) setControlSection("topBarAudio");
          } else if (section === "recall") {
            setControlSection("playPause");
          } else if (section === "playPause") {
            setControlSection("epgGuide");
          } else if (section === "epgGuide") {
            setControlSection("screenFit");
          } else if (section === "screenFit" && hasMultiAudio) {
            setControlSection("audioTrack");
          }
          return;
        }
        if (isSelect) {
          e.preventDefault();
          if (section === "playPause" || section === "recall") {
            togglePlayPause();
          } else if (section === "epgGuide") {
            openTimelineGuide();
          } else if (section === "screenFit") {
            toggleScreenFit();
          } else if (section === "audioTrack" || section === "topBarAudio") {
            openAudioTrackDialog();
          } else if (section === "quality") {
            if (focusedQualityIdx >= 0 && focusedQualityIdx < qList.length) setQuality(qList[focusedQualityIdx]);
          }
          return;
        }
        return;
      }

      // 2. guid / timers still reset on activity
      if (guideOpenRef.current) {
        if (guideTimerRef.current) window.clearTimeout(guideTimerRef.current);
        guideTimerRef.current = window.setTimeout(() => setShowGuide(false), 14_000);
      }
      if (!timelineOpenRef.current && !guideOpenRef.current) {
        // fallthrough
      }

      // 3. default video controls
      if (k === "ArrowUp") {
        e.preventDefault();
        zap(-1);
      } else if (k === "ArrowDown") {
        e.preventDefault();
        zap(1);
      } else if (k === "ContextMenu" || k === "f1" || k === "F1" || k === "f3" || k === "F3") {
        e.preventDefault();
        openControls();
      } else if (k === "0" || k === "f2" || k === "F2") {
        e.preventDefault();
        toggleScreenFit();
      } else if (k === "MediaPlayPause") {
        e.preventDefault();
        const ch = activeListRef.current[indexRef.current];
        toggleFavorite(ch);
        flashInfo();
      } else if (k === "ArrowLeft") {
        e.preventDefault();
        openGuide();
      } else if (isBack) {
        e.preventDefault();
        const now = Date.now();
        if (
          now - lastCloseRef.current.info < 450 ||
          now - lastCloseRef.current.controls < 450 ||
          now - lastCloseRef.current.guide < 450 ||
          now - lastCloseRef.current.timeline < 450
        ) {
          return;
        }
        if (timelineOpenRef.current) {
          closeTimelineGuide();
          return;
        }
        if (controlsOpenRef.current) {
          lastCloseRef.current.controls = now;
          setShowControls(false);
          return;
        }
        if (guideOpenRef.current) {
          closeGuide();
          return;
        }
        if (infoOpenRef.current && !failedRef.current) {
          closeInfo();
          return;
        }
        onExit(indexRef.current);
      } else if (isSelect) {
        e.preventDefault();
        if (failedRef.current) {
          streamIdxRef.current = 0;
          setStreamIdx(0);
          retryCountRef.current = 0;
          showQualityNotice("Retrying connection...");
          open(true);
          return;
        }
        const now = Date.now();
        if (
          now - lastCloseRef.current.guide < 350 ||
          now - lastCloseRef.current.timeline < 350 ||
          now - lastCloseRef.current.controls < 350 ||
          now - lastCloseRef.current.info < 350
        ) {
          return;
        }
        openControls();
      } else if (k === "ArrowRight") {
        e.preventDefault();
        if (!infoOpenRef.current) {
          flashInfo();
        } else {
          openTimelineGuide();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [
    activeReminderAlert,
    allRef,
    audioDialogOpen,
    audioTracks.length,
    availableQualities,
    closeGuide,
    closeInfo,
    closeTimelineGuide,
    flashInfo,
    focusedQualityIdx,
    open,
    openAudioTrackDialog,
    openControls,
    openGuide,
    openTimelineGuide,
    openVoiceSearch,
    resetControlsTimer,
    searchOpen,
    setQuality,
    showQualityNotice,
    toggleFavorite,
    togglePlayPause,
    toggleScreenFit,
    tuneToChannel,
    zap,
    onExit,
  ]);

  // previous channel for Recall
  const previousChannel = useMemo(() => {
    const key = (c: Channel) => c.tvgId || `${c.category}|${c.name}`;
    const recent = store.recents;
    const cur = activeChannels[index];
    if (!cur) return null;
    const curKey = key(cur);
    for (const k of recent) {
      if (k === curKey) continue;
      const found =
        baseChannels.find((c) => key(c) === k) ??
        activeChannels.find((c) => key(c) === k);
      if (found) return found;
    }
    return null;
  }, [store.recents, index, activeChannels, baseChannels]);

  const isFav = channel ? favorites.includes(channel.tvgId) : false;

  const current = channel;
  const nowProg = current ? getNow(current) : null;
  const nextProg = current ? getNext(current) : null;
  void nextProg;
  const now = new Date();
  const hour = now.getHours() % 12 === 0 ? 12 : now.getHours() % 12;
  const minute = String(now.getMinutes()).padStart(2, "0");
  const ampm = now.getHours() >= 12 ? "PM" : "AM";
  const timeStr = `${hour}:${minute} ${ampm}`;

  const resText = current
    ? current.streamResolutions.length > streamIdx
      ? current.streamResolutions[streamIdx]
      : current.resolution
    : "";

  if (!current) {
    return <div className="player-root" />;
  }

  const fit = screenFitMeta[screenFit];

  return (
    <div className="player-root">
      <video
        ref={videoRef}
        className="player-video"
        style={{
          objectFit: fit.objectFit,
          width: "100%",
          height: "100%",
          background: "#000",
          cursor: "pointer",
        }}
        title="Click to toggle controls"
        onClick={() => {
          if (showGuide || showTimelineGuide) return;
          if (showControls) {
            setShowControls(false);
          } else {
            setShowControls(true);
            flashInfo();
          }
        }}
        autoPlay
        muted={false}
        playsInline
      />

      {/* buffering chip */}
      {!failed && (buffering || isReconnecting || !initialized) && (
        <div className="player-buffer-chip">
          <span className={`spinner ${isReconnecting ? "sky" : "white"}`} />
          <span style={{ fontSize: 13, fontWeight: 600, color: isReconnecting ? "#90caf9" : "rgba(255,255,255,0.9)" }}>
            {isReconnecting
              ? "Reconnecting stream..."
              : "Buffering stream..."}
          </span>
        </div>
      )}

      {/* failed card */}
      {failed && !showControls && (
        <div className="player-failed-card">
          <WifiOff size={44} color="#ef5350" />
          <span className="player-failed-title">This channel isn’t available right now</span>
          {recoveryAttempts > 0 && recoveryAttempts <= 30 && (
            <span className="player-failed-recovery">
              Auto-reconnecting in background (Attempt {recoveryAttempts})...
            </span>
          )}
          <span className="player-failed-sub">
            <b>OK: Retry Now</b> · Menu: Controls · <ChevronsUpDown size={14} /> Zap · <ArrowLeft size={13} /> Channels
          </span>
          <button
            type="button"
            className="quality-pill"
            style={{ marginTop: 6 }}
            onClick={() => {
              streamIdxRef.current = 0;
              setStreamIdx(0);
              retryCountRef.current = 0;
              showQualityNotice("Retrying connection...");
              open(true);
            }}
          >
            <RotateCcw size={14} /> Retry Now
          </button>
        </div>
      )}

      {/* bottom info bar */}
      <div className={`player-info-bar ${showInfo && !showGuide && !showControls && !showTimelineGuide ? "visible" : ""}`}>
        <div className="pib-logo">
          <ChannelIcon channel={current} width={90} height={52} />
        </div>
        <div className="pib-main">
          <div className="pib-top">
            <span className="pib-num">{index + 1}</span>
            <span className="pib-name">{current.name}</span>
            {isFav && <Star size={20} color="#ffd700" />}
            <span className="pib-cat">{current.category}</span>
            <span className="pib-res">{resText.toUpperCase()}</span>
            {audioTracks.length > 1 && (
              <span className="pib-audio">
                <Volume2 size={10} color="#f59e0b" />
                {(audioTracks.find((t) => t.id === selectedAudioTrackId)?.name ?? "AUDIO").toUpperCase()}
                <em>({audioTracks.length})</em>
              </span>
            )}
            <div className="pib-spacer" />
            <span className="pib-clock">{timeStr}</span>
          </div>
          {nowProg ? (
            <>
              <div className="pib-now">
                <span className="pib-now-label">NOW</span>
                <span className="pib-now-title">{nowProg.title}</span>
                <span className="pib-now-range">
                  {`${String(nowProg.start.getHours() % 12 === 0 ? 12 : nowProg.start.getHours() % 12)}:${String(nowProg.start.getMinutes()).padStart(2, "0")} ${nowProg.start.getHours() >= 12 ? "PM" : "AM"} - ${String(nowProg.stop.getHours() % 12 === 0 ? 12 : nowProg.stop.getHours() % 12)}:${String(nowProg.stop.getMinutes()).padStart(2, "0")} ${nowProg.stop.getHours() >= 12 ? "PM" : "AM"}`}
                </span>
                <span className="pib-now-remaining">{remainingText(nowProg)}</span>
              </div>
              <div className="pib-progress">
                <div
                  style={{
                    width: `${Math.round(progressOf(nowProg) * 100)}%`,
                  }}
                />
              </div>
              <div className="pib-next">
                {nextProg ? (
                  <>
                    <span className="pib-next-label">NEXT</span>
                    <span className="pib-next-title">
                      {`${nextProg.title} (${nextTimeRange(nextProg)})`}
                    </span>
                  </>
                ) : (
                  <span className="pib-nopro">Live Streaming</span>
                )}
                <div className="pib-spacer" />
                <Hints audio={audioTracks.length > 1} />
              </div>
            </>
          ) : (
            <div className="pib-now">
              <span className="pib-live-broadcast">Live Broadcast</span>
              <span className="pib-of">{`Channel ${index + 1} of ${activeChannels.length}  ·  ${selectedQuality}`}</span>
              <div className="pib-spacer" />
              <Hints audio={audioTracks.length > 1} />
            </div>
          )}
        </div>
      </div>

      {/* controls overlay */}
      {showControls && !showGuide && !showTimelineGuide && (
        <div className="player-controls">
          <div className="pc-top">
            <button
              type="button"
              className="pc-back-btn"
              onClick={() => {
                onExit(indexRef.current);
              }}
              title="Back to channel list"
            >
              <ArrowLeft size={18} />
              <span>CHANNELS</span>
            </button>
            <span className="pib-live-badge">
              <Circle size={7} color="#fff" fill="#fff" />
              LIVE
            </span>
            <span className="pc-channel-name">{current.name}</span>
            <div className="pib-spacer" />
            <span className="pc-quality-label">
              <SlidersHorizontal size={16} color="rgba(255,255,255,0.7)" />
              Quality:
            </span>
            {availableQualities.map((q, i) => (
              <QualityPill
                key={q}
                q={q}
                i={i}
                selected={q === selectedQuality}
                focused={controlSection === "quality" && focusedQualityIdx === i}
                onTap={() => {
                  setQuality(q);
                  resetControlsTimer();
                }}
              />
            ))}
            {audioTracks.length > 1 && (
              <>
                <span className="pc-divider" />
                <button
                  type="button"
                  className={`pc-audio-pill ${controlSection === "topBarAudio" ? "focused" : ""}`}
                  onClick={() => {
                    openAudioTrackDialog();
                    resetControlsTimer();
                  }}
                >
                  <AudioLines size={15} color={controlSection === "topBarAudio" ? "#000" : "#f59e0b"} />
                  <span>
                    Audio:{" "}
                    {audioTracks.find((t) => t.id === selectedAudioTrackId)?.name ?? audioTracks[0]?.name ?? "Stereo"}
                    {` (${audioTracks.length})`}
                  </span>
                  <ArrowRight size={16} />
                </button>
              </>
            )}
          </div>
          {qualityNotice && (
            <div className="pc-notice">
              <Sparkles size={14} color="#38bdf8" />
              <span>{qualityNotice}</span>
            </div>
          )}
          <div className="pc-center">
            {previousChannel && (
              <ControlHub
                icon={<RotateCcw size={40} />}
                label={`LAST: ${previousChannel.name}`}
                focused={controlSection === "recall"}
                focusedColor="#fff"
                onClick={() => {
                  tuneToChannel(previousChannel);
                  resetControlsTimer();
                }}
                widest
              />
            )}
            <ControlHub
              icon={playing ? <Pause size={44} /> : <Play size={44} />}
              label={playing ? "PAUSE" : "PLAY"}
              focused={controlSection === "playPause"}
              focusedColor="#fff"
              onClick={() => togglePlayPause()}
            />
            <ControlHub
              icon={<ListVideo size={38} />}
              label="TV GUIDE"
              focused={controlSection === "epgGuide"}
              focusedColor="#6366f1"
              onClick={() => openTimelineGuide()}
            />
            <ControlHub
              icon={<AspectRatioIcon />}
              label={`FIT: ${screenFitMeta[screenFit].label.toUpperCase()}`}
              focused={controlSection === "screenFit"}
              focusedColor="#38bdf8"
              labelColor={controlSection === "screenFit" ? "#38bdf8" : undefined}
              onClick={() => {
                toggleScreenFit();
                resetControlsTimer();
              }}
            />
            {audioTracks.length > 1 && (
              <ControlHub
                icon={<AudioLines size={38} />}
                label={`AUDIO: ${(audioTracks.find((t) => t.id === selectedAudioTrackId)?.name ?? "Stereo").toUpperCase()}`}
                focused={controlSection === "audioTrack"}
                focusedColor="#f59e0b"
                labelColor={controlSection === "audioTrack" ? "#f59e0b" : undefined}
                onClick={() => {
                  openAudioTrackDialog();
                  resetControlsTimer();
                }}
              />
            )}
          </div>
          <div className="pc-bottom">
            <ChannelIcon channel={current} width={84} height={48} />
            <div className="pc-bottom-txt">
              <div className="pc-bottom-name">
                {current.name}
                {isFav && <Star size={20} color="#ffd700" />}
              </div>
              <div className="pc-bottom-sub">
                {`${current.category}  ·  Quality: ${selectedQuality} (${
                  current.streamResolutions.length > streamIdx ? current.streamResolutions[streamIdx] : current.resolution
                })`}
              </div>
            </div>
            <span className="pc-bottom-hints">
              {`OK: Select  ·  Left/Right: Switch  ·  Up: Quality  ·  Back: Close`}
            </span>
          </div>
        </div>
      )}

      {/* mini guide */}
      {showGuide && !showTimelineGuide && (
        <div className="player-miniguide">
          <MiniGuide
            allChannels={baseChannels}
            currentChannel={current}
            initialCategory={request.initialCategory}
            onTune={tuneToChannel}
            onClose={() => setShowGuide(false)}
            onUserActivity={() => {
              if (guideTimerRef.current) window.clearTimeout(guideTimerRef.current);
              guideTimerRef.current = window.setTimeout(() => setShowGuide(false), 14_000);
              void openGuide;
            }}
            isMobileWidth={isMobileWidth}
          />
        </div>
      )}

      {/* timeline guide */}
      {showTimelineGuide && (
        <div className="player-timeline">
          <TimelineGuide
            allChannels={baseChannels}
            currentChannel={current}
            initialCategory={request.initialCategory}
            onTune={tuneToChannel}
            onClose={closeTimelineGuide}
            onUserActivity={() => {
              if (timelineGuideTimerRef.current) window.clearTimeout(timelineGuideTimerRef.current);
              timelineGuideTimerRef.current = window.setTimeout(() => setShowTimelineGuide(false), 30_000);
            }}
            isMobileWidth={isMobileWidth}
          />
        </div>
      )}

      {/* reminder toast */}
      {activeReminderAlert && (
        <div className="reminder-toast">
          <div className="reminder-toast-icon">
            <Star size={18} color="#fbbf24" />
          </div>
          <div className="reminder-toast-txt">
            <div className="reminder-toast-top">
              <span>PROGRAM REMINDER</span>
              <span className="reminder-oktag">OK: Tune</span>
            </div>
            <div className="reminder-toast-title">{activeReminderAlert.pt}</div>
            <div className="reminder-toast-sub">{`Starting now on ${activeReminderAlert.cn}`}</div>
          </div>
        </div>
      )}

      {audioDialogOpen && (
        <TvAudioTrackDialog
          tracks={audioTracks.map((t, i) => ({ id: t.id, lang: t.lang, name: t.name, i }))}
          selectedTrackId={selectedAudioTrackId}
          onSelect={selectAudioTrack}
          onClose={() => setAudioDialogOpen(false)}
        />
      )}
      {searchOpen && (
        <TvSearchDialog
          allChannels={baseChannels}
          isMobile={isMobileWidth}
          onChannelSelect={(ch) => {
            setSearchOpen(false);
            tuneToChannel(ch);
          }}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- helpers

function remainingText(p: { stop: Date; start: Date }) {
  const now = Date.now();
  if (now < p.start.getTime()) {
    const inMin = Math.round((p.start.getTime() - now) / 60000);
    return inMin > 60 ? `Starts in ${Math.floor(inMin / 60)}h ${inMin % 60}m` : `Starts in ${inMin} min`;
  }
  const rem = Math.round((p.stop.getTime() - now) / 60000);
  return rem > 0 ? `${rem} min left` : "Ending soon";
}

function progressOf(p: { stop: Date; start: Date }) {
  const now = Date.now();
  const total = p.stop.getTime() - p.start.getTime();
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, (now - p.start.getTime()) / total));
}

function nextTimeRange(p: { start: Date; stop: Date }) {
  const fmt = (d: Date) =>
    `${String(d.getHours() % 12 === 0 ? 12 : d.getHours() % 12)}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() >= 12 ? "PM" : "AM"}`;
  return `${fmt(p.start)} - ${fmt(p.stop)}`;
}

function AspectRatioIcon() {
  return (
    <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M8 19v-4M16 5v4" />
      <path d="M3 15h5M21 9h-5" />
    </svg>
  );
}

function Hints({ audio }: { audio: boolean }) {
  return (
    <span className="pib-hints">
      {audio && (
        <>
          <AudioLines size={12} color="#f59e0b" />
          <span className="pib-hint-audio">Multi-Audio</span>
          <span className="pib-hint-gap" />
        </>
      )}
      <span className="pib-hint">OK: Guide</span>
      <span className="pib-hint">Back: Hide</span>
      <span className="pib-hint">
        <ArrowLeft size={12} /> Channels
      </span>
      <span className="pib-hint">
        <ChevronsUpDown size={13} /> Zap
      </span>
      <span className="pib-hint">
        Menu: <Star size={13} color="#ffd700" /> Fav
      </span>
    </span>
  );
}

function QualityPill({
  q,
  selected,
  focused,
  onTap,
}: {
  q: string;
  i: number;
  selected: boolean;
  focused: boolean;
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      className={`quality-pill ${focused ? "focused" : ""} ${selected ? "selected" : ""}`}
      onClick={onTap}
    >
      {q === "Auto" && <Sparkles size={13} />}
      <span>{q}</span>
    </button>
  );
}

function ControlHub({
  icon,
  label,
  focused,
  focusedColor,
  labelColor,
  onClick,
  widest,
}: {
  icon: React.ReactNode;
  label: string;
  focused: boolean;
  focusedColor: string;
  labelColor?: string;
  onClick: () => void;
  widest?: boolean;
}) {
  void widest;
  return (
    <div className="control-hub-col">
      <button
        type="button"
        className={`control-hub ${focused ? "focused" : ""}`}
        style={
          focused
            ? {
                background: focusedColor,
                color: focusedColor === "#fff" || focusedColor === "#38bdf8" || focusedColor === "#f59e0b" ? "#000" : "#fff",
                borderColor: "#fff",
                boxShadow: `0 0 20px ${focusedColor}cc`,
              }
            : undefined
        }
        onClick={onClick}
      >
        {icon}
      </button>
      <span className="control-hub-label" style={{ color: focused ? labelColor ?? "#fff" : "rgba(255,255,255,0.7)" }}>
        {label}
      </span>
    </div>
  );
}
