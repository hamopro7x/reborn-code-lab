/**
 * Employee execution view — visual design is fixed by the approved reference:
 * black surface with blue neon accents, a top section bar, a horizontal shift
 * strip, the shift's inner section bar, then the transactions grid.
 *
 * Data is real: it comes from the employee's own open shift only.
 *
 * Column ownership is strict:
 *  - "آخر 4 أرقام للبطاقة" and "الإجراء" (details) come from the ORIGINAL
 *    transaction row in the central ledger, matched by its ledger id.
 *  - "جنيه" and "الكمية" are entered by the employee, saved automatically on
 *    blur, then locked for good (enforced on the server).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  User,
  KeyRound,
  Clock,
  ListOrdered,
  AlertTriangle,
  ArrowLeftRight,
  ArrowDownUp,

  Users,
  Settings,
  CreditCard,
  CalendarClock,
  Package,
  DollarSign,
  Wallet,
  Trash2,
  Plus,

  

} from "lucide-react";
import { toast } from "sonner";
import { MerchantLogo } from "./MerchantLogo";
import { P2PShiftLinkMenu } from "./P2PShiftLinkMenu";
import { formatDateTime, formatTime } from "@/lib/format";
import { PAGE_SIZE } from "@/lib/pagination";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { supabase } from "@/integrations/supabase/client";
import {
  getMyShiftTxns,
  saveMyTxnEntry,
  saveTransferNote,
  getMyManualTxns,
  addMyManualTxn,
  saveMyManualTxn,
  getMyManualCardTxns,
  getShiftManualCardTxns,
  getEmployeeManualCardTxns,
  addMyManualCardTxn,
  saveMyManualCardTxn,
  clearMyManualTxns,
  getWorkP2PCompleted,
  getWorkTransfers,
  getWorkTransferPage,

  getEmployeeShiftTxns,
  getEmployeeManualTxns,
  getEmployeeShiftP2P,
  getShiftTxns,
  getShiftManualTxns,
  getShiftTransfers,
  getShiftP2P,
  getMyShiftP2P,

  getMyAvatarUrl,
  getWorkSheetSummary,
} from "@/lib/work.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getBybitCardBrands } from "@/lib/bybit.functions";
import { usePinClaim } from "@/components/admin/PinGate";
import { BrandBadge, LedgerRowDetails, statusBadge } from "@/components/admin/BybitLedgerPanel";
import { useWorkRealtime } from "@/lib/use-work-realtime";
import { useLedgerAutoSync } from "@/lib/use-ledger-sync";
import { livePoll } from "@/lib/live-poll";
import { useUiState } from "@/lib/ui-state";
import { Button } from "@/components/ui/button";
import { shiftEgpTotal } from "@/lib/shift-egp-total";
import { shiftSectionNotifications, type ShiftSection } from "@/lib/shift-section-notifications";

import { P2POrdersTable } from "@/components/admin/P2POrdersTable";
import { num } from "@/components/admin/EmployeeWorkFormatters";
import { FlowChip, TransfersTable } from "@/components/admin/EmployeeTransfersTable";

type ManualKind = "wrong" | "employee" | "receive" | "transfer";

/** DOM order = right-to-left order in the reference. */
const TOP_TABS: { key: ShiftSection; label: string; icon: typeof ListOrdered }[] = [
  { key: "all", label: "المعاملات", icon: ListOrdered },
  { key: "employee", label: "الخاص بالموظف", icon: User },
  { key: "wrong", label: "المعاملات الغلط", icon: AlertTriangle },
  { key: "receive", label: "الاستلام من", icon: ArrowDownUp },
  { key: "transfer", label: "التحويل الي", icon: ArrowLeftRight },
  { key: "p2p", label: "طلبات p2p", icon: Users },
  { key: "ext", label: "الإيداع والسحب الخارجي", icon: ArrowDownUp },
  { key: "int", label: "الإيداع والسحب الداخلي", icon: ArrowLeftRight },
];




const COLUMNS: { label: string; icon: typeof ListOrdered }[] = [
  { label: "اسم التاجر", icon: User },
  { label: "إجمالي المبلغ", icon: Wallet },
  { label: "جنية", icon: DollarSign },
  { label: "الكمية", icon: Package },
  { label: "تاريخ وقت المعاملة", icon: CalendarClock },
  { label: "آخر 4 أرقام للبطاقة", icon: CreditCard },
  { label: "الإجراء", icon: Settings },
];

const GLOW_ACTIVE =
  "border-[oklch(0.55_0.14_255)] bg-[linear-gradient(180deg,oklch(0.34_0.12_258),oklch(0.26_0.09_258))] text-[oklch(0.96_0.01_255)] shadow-[0_0_0_1px_oklch(0.55_0.14_255/0.35)]";
const GLOW_IDLE =
  "border-border/60 bg-[oklch(0.14_0.02_270)] text-foreground/90 hover:border-[oklch(0.45_0.1_258)] hover:text-foreground";



/* ------------------------- P2P orders table (طلبات P2P) -------------------------
 * Same look as the approved reference: blue pill header row, buy/sell toggle,
 * dark rows with green side + gold owner link. Presentation only. */
const AR_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/** توقيت موحّد (القاهرة) بأرقام لاتينية حتى تتطابق شاشة الموظف مع الأدمن. */

