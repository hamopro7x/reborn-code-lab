import type { QueryClient, QueryKey } from "@tanstack/react-query";

/** Reuse an active read instead of aborting and restarting it on each live event. */
export function refreshQueries(client: QueryClient, keys: readonly QueryKey[]): Promise<void> {
  return Promise.all(keys.map((queryKey) => client.invalidateQueries(
    { queryKey, refetchType: "active" },
    { cancelRefetch: false },
  ))).then(() => undefined);
}