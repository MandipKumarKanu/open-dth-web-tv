"use client";

// Ported from lib/widgets/channel_icon.dart: logo on a tone-matched card
// (white for dark logos, near-black for light ones) with a generated
// colour-hash icon (initials on a gradient) as the no-logo fallback.

import { useEffect, useRef, useState } from "react";
import { Tv } from "lucide-react";
import {
  type Channel,
  channelInitials,
  colorFor,
  hasLogo,
} from "@/lib/live-tv";

type ToneCache = Record<string, boolean>;

function loadTones(): ToneCache {
  try {
    const raw = localStorage.getItem("logo_tones_v1");
    return raw ? (JSON.parse(raw) as ToneCache) : {};
  } catch {
    return {};
  }
}

const toneCache: ToneCache = loadTones();

function saveTones() {
  try {
    localStorage.setItem("logo_tones_v1", JSON.stringify(toneCache));
  } catch {
    /* ignore */
  }
}

/** Samples ~4000 pixels: light logos drawn on transparency need a dark card. */
function needsDarkCard(imageUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const w = 40;
        const h =
          Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w)) ||
          40;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(false);
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        let opaque = 0;
        let transparent = 0;
        let lum = 0;
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a < 40) {
            transparent++;
            continue;
          }
          opaque++;
          lum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        }
        if (opaque === 0 || transparent === 0) resolve(false);
        else resolve(lum / opaque / 255 > 0.6);
      } catch {
        resolve(false);
      }
    };
    img.onerror = () => resolve(false);
    img.src = imageUrl;
  });
}

export function GeneratedChannelIcon({
  name,
  width,
  height,
}: {
  name: string;
  width: number;
  height: number;
}) {
  const base = colorFor(name);
  const dark = {
    h: base.h,
    s: base.s,
    l: Math.min(100, Math.max(0, base.l - 16)),
  };
  const initials = channelInitials(name);
  const fontSize = height * (initials.length > 3 ? 0.3 : 0.36);
  return (
    <div
      className="chan-icon chan-icon-gen"
      style={{
        width,
        height,
        background: `linear-gradient(to bottom right, hsl(${base.h} ${base.s}% ${base.l}%), hsl(${dark.h} ${dark.s}% ${dark.l}%))`,
      }}
    >
      <Tv
        className="chan-icon-gen-tv"
        style={{ width: height * 0.18, height: height * 0.18 }}
      />
      <span
        className="chan-icon-gen-initials"
        style={{ fontSize, letterSpacing: 1, fontWeight: 800 }}
      >
        {initials}
      </span>
    </div>
  );
}

export function ChannelIcon({
  channel,
  width = 104,
  height = 60,
  home,
}: {
  channel: Channel;
  width?: number;
  height?: number;
  home?: boolean;
}) {
  const generated = (
    <GeneratedChannelIcon name={channel.name} width={width} height={height} />
  );
  if (!hasLogo(channel)) return <>{generated}</>;
  return (
    <LogoCard
      channel={channel}
      width={width}
      height={height}
      home={home}
      fallback={generated}
    />
  );
}

function LogoCard({
  channel,
  width,
  height,
  fallback,
  home,
}: {
  channel: Channel;
  width: number;
  height: number;
  fallback: React.ReactNode;
  home?: boolean;
}) {
  const url = channel.logoUrl;
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [dark, setDark] = useState<boolean>(() => !!toneCache[url]);
  const probedRef = useRef(false);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
    setDark(!!toneCache[url]);
    probedRef.current = !!toneCache[url];
  }, [url]);

  useEffect(() => {
    if (!loaded || probedRef.current) return;
    probedRef.current = true;
    needsDarkCard(url).then((needsDark) => {
      toneCache[url] = needsDark;
      setDark(needsDark);
      saveTones();
    });
  }, [loaded, url]);

  if (failed) return <>{fallback}</>;
  return (
    <div
      className={`${home ? "" : `chan-icon ${dark ? "chan-icon-dark" : "chan-icon-light"}`}`}
      style={{ width, height }}
    >
      {!loaded && <div className="chan-icon-skeleton" aria-hidden="true" />}
      {loaded ? (
        <img
          src={url}
          alt=""
          className="chan-icon-img"
          draggable={false}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : null}
      <img
        src={url}
        alt=""
        className="chan-icon-probe"
        draggable={false}
        referrerPolicy="no-referrer"
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => {
          setFailed(true);
          setLoaded(true);
        }}
      />
    </div>
  );
}
