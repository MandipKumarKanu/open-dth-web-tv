"use client";

// Ported from the old src/app/page.tsx client shell: swaps between the Home grid
// and the full-screen Player, feeding the player the active channel list, the full
// catalog for search/guides and honoring the returned channel index.

import { useEffect, useRef, useState } from "react";
import { type Channel } from "@/lib/live-tv";
import { useStore } from "@/lib/store";
import { HomeScreen, type PlayRequest } from "./home-screen";
import { PlayerScreen } from "./player-screen";

export function App() {
  const store = useStore();
  const viewRef = useRef<"home" | "player">("home");
  const [view, setView] = useState<
    { screen: "home" } | { screen: "player"; request: PlayRequest }
  >({ screen: "home" });

  useEffect(() => {
    const currentState = window.history.state;
    if (!currentState?.openDthApp) {
      window.history.replaceState({ openDthApp: true, screen: "home" }, "", window.location.href);
    }

    const onPopState = (event: PopStateEvent) => {
      if (viewRef.current !== "player") return;
      if (event.state?.openDthApp && event.state.screen === "home") {
        viewRef.current = "home";
        setView({ screen: "home" });
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    viewRef.current = view.screen;
  }, [view.screen]);

  const openPlayer = (req: PlayRequest) => {
    // A channel tap is a user gesture, so request fullscreen here before the
    // player mounts. Mobile browsers generally require fullscreen + a gesture
    // before they allow the Screen Orientation API to lock to landscape.
    if (window.matchMedia("(max-width: 719px)").matches) {
      const enterLandscape = async () => {
        try {
          if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
            await document.documentElement.requestFullscreen();
          }
          if (screen.orientation?.lock) {
            await screen.orientation.lock("landscape");
          }
        } catch {
          // Orientation locking is not supported in every mobile browser.
          // Playback still works and the user can rotate their device manually.
        }
      };
      void enterLandscape();
    }

    window.history.pushState({ openDthApp: true, screen: "player" }, "", window.location.href);
    viewRef.current = "player";
    setView({ screen: "player", request: req });
  };

  if (view.screen === "home") {
    return (
      <HomeScreen
        onPlay={openPlayer}
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
        if (window.history.state?.openDthApp && window.history.state.screen === "player") {
          window.history.back();
          return;
        }
        setView({ screen: "home" });
      }}
    />
  );
}
