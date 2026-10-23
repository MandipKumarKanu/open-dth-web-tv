"use client";

// Ported from the old src/app/page.tsx client shell: swaps between the Home grid
// and the full-screen Player, feeding the player the active channel list, the full
// catalog for search/guides and honoring the returned channel index.

import { useState } from "react";
import { type Channel } from "@/lib/live-tv";
import { useStore } from "@/lib/store";
import { HomeScreen, type PlayRequest } from "./home-screen";
import { PlayerScreen } from "./player-screen";

export function App() {
  const store = useStore();
  const [view, setView] = useState<
    { screen: "home" } | { screen: "player"; request: PlayRequest }
  >({ screen: "home" });

  if (view.screen === "home") {
    return (
      <HomeScreen
        onPlay={(req) => setView({ screen: "player", request: req })}
      />
    );
  }

  const allChannels: Channel[] = store.channels ?? view.request.channels;

  return (
    <PlayerScreen
      request={view.request}
      allChannels={allChannels}
      onExit={(lastIndex) => {
        void lastIndex;
        setView({ screen: "home" });
      }}
    />
  );
}
