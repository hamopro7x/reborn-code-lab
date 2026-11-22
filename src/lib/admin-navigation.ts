import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, Package, Layers, ShoppingCart, CreditCard, Coins, Clock,
  Settings2, Users, Star, UserCog, GraduationCap, MonitorPlay, WalletCards,
  KeyRound, ClipboardList, Table2, MessagesSquare, Mail, FileBarChart,
} from "lucide-react";
import type { PanelKey } from "./admin-panel-access";

type AdminNavItem = { key: PanelKey; label: string; icon: LucideIcon; adminOnly?: boolean };
export type AdminNavGroup = { label: string; items: AdminNavItem[] };

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    label: "العمليات",
    items: [
      { key: "overview", label: "نظرة عامة", icon: LayoutDashboard },
      { key: "orders", label: "الطلبات", icon: ShoppingCart },
      { key: "customers", label: "العملاء", icon: Users },
      { key: "reviews", label: "المراجعات", icon: Star },
      { key: "reports", label: "التقارير", icon: FileBarChart, adminOnly: true },
      { key: "cardtx", label: "معاملات الفيزا", icon: WalletCards, adminOnly: true },
      { key: "worksheet", label: "جدول بيانات الشغل", icon: ClipboardList },
      { key: "sheet", label: "جدول بيانات خاص", icon: Table2, adminOnly: true },
      { key: "mail", label: "البريد", icon: Mail },
      { key: "chat", label: "جروب MG Pro", icon: MessagesSquare },
    ],
  },
  {
    label: "الكتالوج",
    items: [
      { key: "products", label: "المنتجات", icon: Package, adminOnly: true },
      { key: "categories", label: "الأقسام", icon: Layers, adminOnly: true },
      { key: "timers", label: "مؤقتات العروض", icon: Clock },
    ],
  },
  {
    label: "الإدارة",
    items: [
      { key: "employees", label: "الموظفون", icon: UserCog, adminOnly: true },
      { key: "courses", label: "كورسات التدريب", icon: GraduationCap },
      { key: "remote", label: "الوصول عن بُعد", icon: MonitorPlay, adminOnly: true },
      { key: "payments", label: "طرق الدفع", icon: CreditCard, adminOnly: true },
      { key: "currencies", label: "العملات", icon: Coins, adminOnly: true },
      { key: "apikey", label: "مفاتيح API (Bybit)", icon: KeyRound, adminOnly: true },
      { key: "settings", label: "الإعدادات", icon: Settings2, adminOnly: true },
    ],
  },
];
