export type IncomingChatCursor = { id: string; created_at: string } | null;

export function isNewIncomingChat(previous: IncomingChatCursor, next: IncomingChatCursor) {
  if (!next) return false;
  if (!previous) return true;
  return next.created_at > previous.created_at || (next.created_at === previous.created_at && next.id > previous.id);
}

/** One sine note of the chat chime: offset from the chime start, in seconds. */
export type ChatToneNote = { frequency: number; start: number; duration: number; gain: number };

// A two-note ascending chime (B5 then E6) so a group message never sounds like the mail beep.
export const CHAT_TONE: ChatToneNote[] = [
  { frequency: 988, start: 0, duration: 0.22, gain: 0.2 },
  { frequency: 1319, start: 0.15, duration: 0.42, gain: 0.18 },
];

export function playChatTone(context: { currentTime: number; createOscillator: () => any; createGain: () => any; destination: any }, tone: ChatToneNote[] = CHAT_TONE) {
  const now = context.currentTime;
  for (const note of tone) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = note.frequency;
    const at = now + note.start;
    gain.gain.setValueAtTime(note.gain, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + note.duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + note.duration);
  }
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
    try {
      playChatTone(context);
    } catch { /* Audio unavailable; visual notifications remain active. */ }
  };
  return { unlock, play, dispose: () => { void context?.close().catch(() => {}); } };
}
