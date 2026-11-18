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
    // Same tone as the mail notification.
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.start(now); oscillator.stop(now + 0.6);
  };
  return { unlock, play, dispose: () => { void context?.close().catch(() => {}); } };
}