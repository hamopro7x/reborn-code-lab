/**
 * خريطة واحدة: أي جدول في قاعدة البيانات يؤثر على أي queries في الواجهة.
 *
 * هذه الطبقة إضافية فقط — لا تغيّر أي منطق بيانات قائم. الـRealtime العام
 * يستخدم الخريطة لعمل invalidate للـqueries المتأثرة فقط (تحديث جزئي)،
 * بدون إعادة تحميل الصفحة وبدون فقدان الصفحة/البحث/الفلاتر.
 */

/** بادئات مفاتيح الـqueries المتأثرة بكل جدول. */
export const TABLE_QUERY_KEYS: Record<string, string[]> = {
  // ---- بيانات الشغل / المعاملات المركزية ----
  bybit_ledger: [
    "bybit-ledger", "bybit-spend-totals", "bybit-overview", "admin-stats",
    "shift-txns", "shift-p2p", "shift-transfers", "work-transfers", "work-p2p-open",
    "my-shift-txns", "my-shift-p2p", "emp-shift-txns", "emp-shift-p2p", "emp-archive",
  ],
  work_txn_assignments: [
    "shift-txns", "shift-p2p", "shift-transfers", "work-transfers", "work-p2p-open",
    "my-shift-txns", "my-shift-p2p", "emp-shift-txns", "emp-shift-p2p", "emp-archive",
    "admin-employee-shifts", "work-my-shifts-link",
  ],
  work_txn_entries: [
    "shift-txns", "shift-p2p", "shift-transfers", "work-transfers",
    "my-shift-txns", "my-shift-p2p", "emp-shift-txns", "emp-shift-p2p", "emp-archive",
  ],
  work_transfer_notes: ["shift-transfers", "work-transfers", "emp-archive"],
  work_manual_card_txns: ["my-manual-card-txns", "emp-archive", "emp-manual-card-txns"],
  work_manual_txns: ["my-manual-txns", "emp-archive", "emp-manual-txns"],
  work_shifts: [
    "my-work-state", "work-my-shifts-link", "admin-employee-shifts",
    "employee-panels", "emp-archive",
  ],

  // ---- Bybit / الأرصدة والكروت ----
  bybit_card_txns: ["bybit-card", "bybit-card-brands", "bybit-overview", "bybit-spend-totals"],
  bybit_accounts: ["bybit-accounts", "bybit-overview", "bybit-docs", "bybit-account-info"],
  bybit_account_info: ["bybit-account-info"],
  bybit_cards: ["bybit-cards", "bybit-card-brands"],
  card_transactions: ["bybit-card", "admin-stats"],

  // ---- الأجهزة والوصول ----
  agent_devices: ["agent-devices", "admin-devices", "admin-devices-employees", "employee-panels"],
  remote_access: ["remote-access"],

  // ---- المتجر ----
  products: ["admin-products", "products", "product", "shop-products", "featured-products", "admin-stats"],
  product_prices: ["admin-products", "products", "product", "shop-products", "featured-products"],
  categories: ["admin-cats", "admin-categories", "categories", "shop-categories"],
  orders: ["admin-orders", "orders", "order", "admin-stats", "my-orders"],
  order_items: ["admin-orders", "order", "my-orders"],
  payment_methods: ["admin-pm", "payment-methods"],
  currencies: ["admin-currencies", "currencies"],
  exchange_rates: ["admin-rates", "rates", "exchange-rates"],
  countdown_timers: ["admin-timers", "timers", "countdown"],
  site_settings: ["settings", "checkout-banner", "bybit-visibility"],
  reviews: ["reviews", "admin-reviews", "product"],
  admin_notifications: ["admin-notifications", "admin-stats"],

  // ---- الكورسات ----
  courses: ["admin-courses", "courses", "course"],
  course_lessons: ["admin-lessons", "course-lessons", "course"],
  course_access: ["course-access", "courses", "admin-employees-for-access"],
  course_progress: ["course-progress", "course-lessons"],

  // ---- المستخدمون والصلاحيات ----
  user_roles: ["employee-panels", "admin-employees-for-access", "admin-devices-employees", "my-role"],
  profiles: ["my-profile-identity", "employee-panels", "admin-employees-for-access"],
};

/** كل الجداول التي نستمع لها في القناة العامة. */
export const REALTIME_TABLES = Object.keys(TABLE_QUERY_KEYS);
