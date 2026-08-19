import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Handler = (() => void) | null;

const Ctx = createContext<{
  handler: Handler;
  register: (h: Handler) => void;
}>({ handler: null, register: () => {} });

export function AdminBackProvider({ children }: { children: ReactNode }) {
  const [handler, setHandler] = useState<Handler>(null);
  return (
    <Ctx.Provider value={{ handler, register: (h) => setHandler(() => h) }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAdminBackTarget() {
  return useContext(Ctx).handler;
}

/** Register a back action rendered by the admin top banner. */
export function useAdminBack(handler: Handler, deps: unknown[] = []) {
  const { register } = useContext(Ctx);
  useEffect(() => {
    register(handler ?? null);
    return () => register(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!handler, ...deps]);
}
