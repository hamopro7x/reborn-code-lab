import { useSyncExternalStore } from "react";

// Device-local count of new group messages since the group was last opened.
let count = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export const chatBadge = {
  bump() { count += 1; emit(); },
  clear() { if (count) { count = 0; emit(); } },
};
export function useChatBadge() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => count, () => 0);
}
