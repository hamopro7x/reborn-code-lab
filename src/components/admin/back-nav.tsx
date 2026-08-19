import { createContext, useContext, useEffect, useId, useState, type ReactNode } from "react";

type Handler = () => void;

const Ctx = createContext<{
  stack: { id: string; handler: Handler }[];
  push: (id: string, handler: Handler) => void;
  pop: (id: string) => void;
}>({ stack: [], push: () => {}, pop: () => {} });

export function AdminBackProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<{ id: string; handler: Handler }[]>([]);
  return (
    <Ctx.Provider
      value={{
        stack,
        push: (id, handler) =>
          setStack((s) => [...s.filter((e) => e.id !== id), { id, handler }]),
        pop: (id) => setStack((s) => s.filter((e) => e.id !== id)),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

/** Back action currently owned by the deepest open view. */
export function useAdminBackTarget(): Handler | null {
  const { stack } = useContext(Ctx);
  return stack.length ? stack[stack.length - 1].handler : null;
}

/**
 * Register a back action that the admin top banner renders.
 * Pass null when the view has nothing to go back from.
 */
export function useAdminBack(handler: Handler | null, deps: unknown[] = []) {
  const { push, pop } = useContext(Ctx);
  const id = useId();
  useEffect(() => {
    if (handler) push(id, handler);
    else pop(id);
    return () => pop(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, !!handler, ...deps]);
}
