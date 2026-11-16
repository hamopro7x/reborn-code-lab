export type IncomingChatCursor = { id: string; created_at: string } | null;

export function isNewIncomingChat(previous: IncomingChatCursor, next: IncomingChatCursor) {
  if (!next) return false;
  if (!previous) return true;
  return next.created_at > previous.created_at || (next.created_at === previous.created_at && next.id > previous.id);
}

// Browsers allow audio only after a user interaction. Never replay old messages on unlock.
export function createChatSound() {
  let context: AudioContext | undefined;
  const unlock = () => {
    try {
      context ??= new AudioContext();
      void context.resume().catch(() => {});
    } catch { /* Audio unavailable; visual notifications remain active. */ }
  };
  const play = () => {
    if (!context || context.state !== "running") return;
    const now = context.currentTime;
    for (const [delay, frequency] of [[0, 784], [0.12, 1046]]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.12, now + delay + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.16);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(now + delay); oscillator.stop(now + delay + 0.18);
    }
  };
  return { unlock, play, dispose: () => { void context?.close().catch(() => {}); } };
}