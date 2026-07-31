import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Currency = { code: string; name: string; symbol: string };

const DEFAULT_CURRENCIES: Currency[] = [
  { code: "EGP", name: "جنيه مصري", symbol: "ج.م" },
  { code: "USD", name: "دولار أمريكي", symbol: "$" },
  { code: "SAR", name: "ريال سعودي", symbol: "ر.س" },
  { code: "AED", name: "درهم إماراتي", symbol: "د.إ" },
  { code: "IQD", name: "دينار عراقي", symbol: "د.ع" },
];

type Ctx = {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  rates: Record<string, number>;
  currencies: Currency[];
  setRates: (r: Record<string, number>) => void;
  setCurrencies: (c: Currency[]) => void;
};

const CurrencyCtx = createContext<Ctx | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currencies, setCurrencies] = useState<Currency[]>(DEFAULT_CURRENCIES);
  const [currency, setCurrencyState] = useState<Currency>(DEFAULT_CURRENCIES[0]);
  const [rates, setRates] = useState<Record<string, number>>({ EGP: 1, USD: 0.021, SAR: 0.078, AED: 0.076, IQD: 27.3 });

  useEffect(() => {
    try {
      const raw = localStorage.getItem("currency");
      if (raw) {
        const c = JSON.parse(raw);
        if (c?.code) setCurrencyState(c);
      }
    } catch {}
  }, []);

  const setCurrency = (c: Currency) => {
    setCurrencyState(c);
    try { localStorage.setItem("currency", JSON.stringify(c)); } catch {}
  };

  return <CurrencyCtx.Provider value={{ currency, setCurrency, rates, currencies, setRates, setCurrencies }}>{children}</CurrencyCtx.Provider>;
}

export function useCurrency() {
  const ctx = useContext(CurrencyCtx);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}