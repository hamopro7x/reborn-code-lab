import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { refreshQueries } from "./refresh-queries";

describe("live refresh while a section is loading", () => {
  it("does not restart an in-flight section read for repeated live events", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    client.setQueryData(["mail-msgs"], "previous");
    let release: ((value: string) => void) | undefined;
    const queryFn = vi.fn(() => new Promise<string>((resolve) => { release = resolve; }));
    const observer = new QueryObserver(client, { queryKey: ["mail-msgs"], queryFn, staleTime: Infinity });
    const unsubscribe = observer.subscribe(() => undefined);
    const first = observer.refetch();
    const events = Array.from({ length: 20 }, () => refreshQueries(client, [["mail-msgs"]]));
    expect(queryFn).toHaveBeenCalledTimes(1);
    release?.("latest");
    await Promise.all([first, ...events]);
    expect(client.getQueryData(["mail-msgs"])).toBe("latest");
    expect(queryFn).toHaveBeenCalledTimes(1);
    unsubscribe();
    client.clear();
  });

  it("does not load inactive sections when another section changes", async () => {
    const client = new QueryClient();
    const queryFn = vi.fn(async () => "orders");
    await client.fetchQuery({ queryKey: ["orders"], queryFn });
    await refreshQueries(client, [["orders"]]);
    expect(queryFn).toHaveBeenCalledTimes(1);
    client.clear();
  });
});