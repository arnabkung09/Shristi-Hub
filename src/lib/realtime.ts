/* Realtime bus: genuine cross-tab sync via BroadcastChannel + Web Audio chimes */

export type BusMessage =
  | { type: "state"; state: unknown; senderId: string }
  | { type: "ping"; senderName: string; urgent: boolean };

const CHANNEL = "shristi-council-state-v3";
let channel: BroadcastChannel | null = null;
let listener: ((msg: BusMessage) => void) | null = null;

export function connectBus(onMessage: (msg: BusMessage) => void): () => void {
  listener = onMessage;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (e) => listener?.(e.data as BusMessage);
  } catch {
    channel = null;
  }
  return () => {
    try { channel?.close(); } catch { /* noop */ }
    channel = null;
    listener = null;
  };
}

export function postBus(msg: BusMessage) {
  try { channel?.postMessage(msg); } catch { /* noop */ }
}

/* ---------------- Web Audio chime engine ---------------- */

let audioCtx: AudioContext | null = null;

function ctx(): AudioContext | null {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") void audioCtx.resume().catch(() => undefined);
    return audioCtx;
  } catch {
    return null;
  }
}

// unlock on first user gesture (autoplay policy)
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", () => ctx(), { once: true });
}

function tone(ac: AudioContext, freq: number, start: number, dur: number, gain = 0.12) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

export function chime(urgent = false) {
  const ac = ctx();
  if (!ac) return;
  const t = ac.currentTime;
  if (urgent) {
    // high-priority triple pulse, dual frequency
    [0, 0.22, 0.44].forEach((o) => {
      tone(ac, 1174.66, t + o, 0.35, 0.14); // D6
      tone(ac, 1567.98, t + o + 0.02, 0.3, 0.08); // G6
    });
    tone(ac, 587.33, t, 0.6, 0.06); // D5 underlay
  } else {
    // standard dual-frequency chime
    tone(ac, 987.77, t, 0.4, 0.12); // B5
    tone(ac, 1318.51, t + 0.06, 0.5, 0.08); // E6
  }
}

