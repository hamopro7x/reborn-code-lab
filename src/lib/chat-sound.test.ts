import { describe, expect, it } from "vitest";
import { CHAT_TONE, isNewIncomingChat, playChatTone } from "./chat-sound";

function fakeContext() {
  const notes: { frequency: number; start: number; stop: number }[] = [];
  const context = {
    currentTime: 10,
    destination: {},
    createOscillator: () => {
      const note = { frequency: 0, start: 0, stop: 0 };
      notes.push(note);
      const oscillator = {
        type: "",
        frequency: { value: 0 },
        connect: () => {},
        start: (at: number) => { note.frequency = oscillator.frequency.value; note.start = at; },
        stop: (at: number) => { note.stop = at; },
      };
      return oscillator;
    },
    createGain: () => ({
      gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      connect: () => {},
    }),
  };
  return { context, notes };
}

describe("chat chime", () => {
  it("is a multi-note chime, not the single mail beep", () => {
    expect(CHAT_TONE.length).toBeGreaterThan(1);
    expect(new Set(CHAT_TONE.map((note) => note.frequency)).size).toBe(CHAT_TONE.length);
  });
  it("plays every note of the chime, ascending and staggered", () => {
    const { context, notes } = fakeContext();
    playChatTone(context);
    expect(notes.length).toBe(CHAT_TONE.length);
    expect(notes.map((note) => note.start)).toEqual([10, 10.15]);
    expect(notes[0].stop - notes[0].start).toBeCloseTo(0.22, 6);
    expect(notes[1].stop - notes[1].start).toBeCloseTo(0.42, 6);
    expect(notes[1].frequency).toBeGreaterThan(notes[0].frequency);
  });
});


describe("incoming chat sound cursor", () => {
  const first = { id: "a", created_at: "2026-11-16T23:00:00Z" };
  it("sounds for a new received message after an empty baseline", () => {
    expect(isNewIncomingChat(null, first)).toBe(true);
  });
  it("does not repeat for edits, read confirmations or polls with the same incoming message", () => {
    expect(isNewIncomingChat(first, { ...first })).toBe(false);
  });
  it("sounds for later arrivals including the same timestamp cursor", () => {
    expect(isNewIncomingChat(first, { id: "b", created_at: first.created_at })).toBe(true);
    expect(isNewIncomingChat(first, { id: "c", created_at: "2026-11-16T23:01:00Z" })).toBe(true);
  });
  it("does not sound when deletion restores an older message or empties the chat", () => {
    expect(isNewIncomingChat(first, { id: "z", created_at: "2026-11-16T22:00:00Z" })).toBe(false);
    expect(isNewIncomingChat(first, null)).toBe(false);
  });
});