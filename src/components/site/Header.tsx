import { Link, useRouterState } from "@tanstack/react-router";
import { ShoppingCart, Globe, Menu } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useCurrency } from "@/lib/currency-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const navLinks = [
  { to: "/", label: "الرئيسية" },
  { to: "/shop", label: "المتجر" },
  { to: "/track", label: "تتبع طلب" },
];

function NavLink({ to, label, active }: { to: string; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      className={`px-4 py-2 rounded-lg text-sm transition-colors ${
        active ? "bg-primary/20 text-primary" : "hover:bg-secondary text-foreground/80 hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );
}

export function Header() {
  const { count } = useCart();
  const { currency, setCurrency, currencies } = useCurrency();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <header className="sticky top-0 z-50 border-b border-border/40 backdrop-blur-xl bg-background/80">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="size-9 rounded-xl gradient-primary flex items-center justify-center glow-purple">
            <span className="text-lg font-black text-white">م</span>
          </div>
          <div className="hidden sm:block">
            <div className="font-bold text-sm leading-none text-gradient">متجر الاشتراكات</div>
            <div className="text-[10px] text-muted-foreground mt-1">الرقمية الاحترافية</div>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((l) => (
            <NavLink key={l.to} to={l.to} label={l.label} active={pathname === l.to} />
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5" aria-label="اختر العملة">
                <Globe className="size-4" />
                <span className="hidden sm:inline text-xs font-medium">العملة: {currency.code}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>اختر العملة</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {currencies.map((c) => (
                <DropdownMenuItem key={c.code} onClick={() => setCurrency(c)} className={currency.code === c.code ? "bg-primary/10" : ""}>
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
                <span className="absolute -top-0.5 -right-0.5 size-5 rounded-full gradient-primary text-white text-[10px] font-bold flex items-center justify-center animate-glow-pulse">{count}</span>
              )}
            </Button>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="md:hidden" aria-label="القائمة">
                <Menu className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {navLinks.map((l) => {
                const Icon = (l as any).icon;
                return (
                  <DropdownMenuItem key={l.to} asChild>
                    <Link to={l.to} className="flex items-center justify-between w-full cursor-pointer">
                      <span>{l.label}</span>
                      {Icon && <Icon className="size-4 text-muted-foreground" />}
                    </Link>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}