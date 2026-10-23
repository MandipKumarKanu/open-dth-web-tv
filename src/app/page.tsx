import { StoreProvider } from "@/lib/store";
import { App } from "@/components/app-shell";
import {
  type Channel,
  type Program,
  storedChannelToChannel,
  storedProgramToProgram,
} from "@/lib/live-tv";

async function getChannels() {
  const res = await fetch("/api/channels", {
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    throw new Error("Failed to load channels");
  }
  const body = (await res.json()) as unknown[];
  if (!Array.isArray(body) || body.length === 0) {
    throw new Error("No channels found");
  }
  return body.map((j) => storedChannelToChannel(j as never)) as Channel[];
}

async function getEpg() {
  const res = await fetch("/api/epg", {
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    return {} as Record<string, Program[]>;
  }
  const body = (await res.json()) as Record<string, unknown[]>;
  const out: Record<string, Program[]> = {};
  for (const [key, raws] of Object.entries(body)) {
    if (!Array.isArray(raws)) continue;
    out[key] = raws.map((r) => storedProgramToProgram(r as never));
  }
  return out;
}

export default async function Page() {
  let channels: Channel[] = [];
  let channelError: string | null = null;
  try {
    channels = await getChannels();
  } catch (err) {
    channelError = err instanceof Error ? err.message : "Failed to load channels";
  }

  let epg: Record<string, Program[]> = {};
  try {
    epg = await getEpg();
  } catch {
    // EPG is non-critical — page still works without it
  }

  return (
    <StoreProvider initialChannels={channels} initialEpg={epg}>
      <App />
    </StoreProvider>
  );
}
