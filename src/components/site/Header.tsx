import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ShoppingCart, Globe, Menu, Search, LayoutGrid } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useCurrency } from "@/lib/currency-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import headerMark from "@/assets/mg-metallic-logo.png.asset.json";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const navLinks = [
  { to: "/", label: "الرئيسية" },
  { to: "/shop", label: "المتجر" },
  { to: "/track", label: "تتبع طلب" },
];

export function Header() {
  const { count } = useCart();
  const { currency, setCurrency, currencies } = useCurrency();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

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
    <header className="store-header sticky top-0 z-50">
      <div className="store-header-row">
        <Link to="/" className="store-header-brand" aria-label="MG Pro، اشتراكات وألعاب رقمية">
          <img
            src={`https://id-preview--335637d3-bc9b-407f-9e44-b28bda5c78dc.lovable.app${headerMark.url}`}
            alt=""
            width={82}
            height={54}
            className="store-header-mark"
          />
          <div className="store-header-words">
            <div className="store-header-name">MG <span className="store-header-pro">PRO</span></div>
            <div className="store-header-tag">اشتراكات وألعاب رقمية</div>
          </div>
        </Link>

        <div className="store-header-actions">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="store-header-icon"
            aria-label="بحث"
            title="بحث"
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((v) => !v)}
          >
            <Search className="size-5" />
          </Button>


          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="store-header-icon" aria-label="اختر العملة" title={`اختر العملة (${currency.code})`}>
                <Globe className="size-4" />
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

          <Button asChild variant="ghost" size="sm" className="store-header-icon" aria-label="سلة التسوق" title="سلة التسوق">
            <Link to="/cart">
              <ShoppingCart className="size-5" />
              {count > 0 && (
                <span className="store-header-badge">{count}</span>
              )}
            </Link>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="store-header-icon" aria-label="القائمة" title="القائمة">
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
                      <Link to="/category/$slug" params={{ slug: c.slug }} className="w-full cursor-pointer">
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

      {/* بحث الموبايل — يظهر عند الضغط على أيقونة البحث */}
      {searchOpen && (
        <form onSubmit={submitSearch} role="search" className="mx-auto max-w-xl px-4 pb-3">
          <label htmlFor="site-search-mobile" className="sr-only">ابحث عن منتج</label>
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              id="site-search-mobile"
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث عن اشتراكك أو لعبتك"
              className="h-10 pr-9 text-sm bg-card"
            />
          </div>
        </form>
      )}
    </header>
  );
}
