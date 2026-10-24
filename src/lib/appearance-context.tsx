import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { APPEARANCE_KEY, resolveAppearance, type Appearance } from "./appearance";

const AppearanceContext = createContext<{ appearance: Appearance; setAppearance: (value: Appearance) => void } | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, updateAppearance] = useState<Appearance>("dark");
  useEffect(() => {
    try { updateAppearance(resolveAppearance(localStorage.getItem(APPEARANCE_KEY))); } catch {}
    const sync = (event: StorageEvent) => {
      if (event.key === APPEARANCE_KEY) updateAppearance(resolveAppearance(event.newValue));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("light", appearance === "light");
    document.documentElement.classList.toggle("dark", appearance === "dark");
  }, [appearance]);
  const setAppearance = (value: Appearance) => {
    updateAppearance(value);
    try { localStorage.setItem(APPEARANCE_KEY, value); } catch {}
  };
  return (
    <AppearanceContext.Provider value={{ appearance, setAppearance }}>
      {children}
      <Toaster position="top-center" richColors theme={appearance} />
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error("AppearanceProvider is required");
  return context;
}