import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ShoppingCart, Globe, Menu, Search, LayoutGrid } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useCurrency } from "@/lib/currency-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import logoAsset from "@/assets/magpro-logo.jpg.asset.json";

const navLinks = [
  { to: "/", label: "الرئيسية" },
  { to: "/shop", label: "المتجر" },
  { to: "/track", label: "تتبع طلب" },
];

const pillBase =
  "px-4 py-2 rounded-lg text-sm font-bold transition-colors duration-150 whitespace-nowrap";
const pillActive = "bg-panel text-panel-foreground";
const pillIdle = "bg-panel/85 text-panel-foreground hover:bg-panel";

function NavLink({ to, label, active }: { to: string; label: string; active: boolean }) {
  return (
    <Link to={to} className={`${pillBase} ${active ? pillActive : pillIdle}`}>
      {label}
    </Link>
  );
}

export function Header() {
  const { count } = useCart();
  const { currency, setCurrency, currencies } = useCurrency();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeCategory = useRouterState({
    select: (s) => (s.location.search as any)?.category as string | undefined,
  });
  const [q, setQ] = useState("");

  // نفس مصدر الأقسام المستخدم في باقي الموقع.
  const categoriesQ = useQuery({
    queryKey: ["categories"],
    queryFn: async () =>
      (await supabase.from("categories").select("*").eq("active", true).order("sort_order")).data ?? [],
    staleTime: 5 * 60 * 1000,
  });
  const categories = categoriesQ.data ?? [];

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({ to: "/shop", search: (q.trim() ? { q: q.trim() } : {}) as any });
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
      <div className="container mx-auto px-4 h-16 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <img
            src={logoAsset.url}
            alt="شعار متجر الاشتراكات الرقمية"
            width={36}
            height={36}
            className="size-9 rounded-lg border border-border"
          />
          <div className="hidden sm:block">
            <div className="font-bold text-sm leading-none">MG Pro</div>
            <div className="text-[10px] text-muted-foreground mt-1">الاشتراكات الرقمية</div>
          </div>
        </Link>

        {/* التنقل + البحث */}
        <div className="flex min-w-0 items-center gap-3">
          <nav className="hidden lg:flex items-center gap-1 shrink-0">
            {navLinks.map((l) => (
              <NavLink key={l.to} to={l.to} label={l.label} active={pathname === l.to} />
            ))}
            {categories.slice(0, 2).map((c: any) => (
              <Link
                key={c.id}
                to="/shop"
                search={{ category: c.slug } as any}
                className={`px-4 py-2 rounded-lg text-sm transition-colors duration-150 ${
                  activeCategory === c.slug
                    ? "bg-secondary text-lime font-bold"
                    : "hover:bg-secondary text-foreground/80 hover:text-foreground"
                }`}
              >
                {c.name}
              </Link>
            ))}
          </nav>

          <form onSubmit={submitSearch} role="search" className="relative min-w-0 flex-1 hidden md:block">
            <label htmlFor="site-search" className="sr-only">ابحث عن منتج</label>
            <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              id="site-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث عن اشتراكك أو لعبتك"
              className="h-10 pr-9 text-sm bg-card"
            />
          </form>
        </div>

        <div className="flex items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5" aria-label="اختر العملة">
                <Globe className="size-4" />
                <span className="hidden sm:inline text-xs font-medium">{currency.code}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>اختر العملة</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {currencies.map((c) => (
                <DropdownMenuItem key={c.code} onClick={() => setCurrency(c)} className={currency.code === c.code ? "bg-secondary" : ""}>
                  <span className="font-mono w-10">{c.symbol}</span>
                  <span className="mr-2">{c.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Link to="/cart">
            <Button variant="ghost" size="sm" className="relative" aria-label="سلة التسوق">
              <ShoppingCart className="size-5" />
              {count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 size-5 rounded-full bg-lime text-lime-foreground text-[10px] font-bold flex items-center justify-center">{count}</span>
              )}
            </Button>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="lg:hidden" aria-label="القائمة">
                <Menu className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {navLinks.map((l) => (
                <DropdownMenuItem key={l.to} asChild>
                  <Link to={l.to} className="w-full cursor-pointer">{l.label}</Link>
                </DropdownMenuItem>
              ))}
              {categories.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="flex items-center gap-2">
                    <LayoutGrid className="size-3.5" /> الأقسام
                  </DropdownMenuLabel>
                  {categories.map((c: any) => (
                    <DropdownMenuItem key={c.id} asChild>
                      <Link to="/shop" search={{ category: c.slug } as any} className="w-full cursor-pointer">
                        {c.name}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* بحث الموبايل */}
      <form onSubmit={submitSearch} role="search" className="md:hidden container mx-auto px-4 pb-3">
        <label htmlFor="site-search-mobile" className="sr-only">ابحث عن منتج</label>
        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            id="site-search-mobile"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث عن اشتراكك أو لعبتك"
            className="h-10 pr-9 text-sm bg-card"
          />
        </div>
      </form>
    </header>
  );
}
