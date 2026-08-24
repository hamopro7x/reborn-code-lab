import { useState } from "react";

/**
 * شعار التاجر بجانب الاسم — نفس منطق المركز الرئيسي (BybitLedgerPanel):
 * يحاول جلب أيقونة النطاق من اسم التاجر، وإلا يعرض أول حرف.
 */
export function MerchantLogo({ name, size = 24 }: { name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const clean = String(name ?? "").trim().toLowerCase();
  const first = clean.split(/[\s*_\-.,·/]+/)[0] ?? "";
  const domain = /^[a-z0-9]{2,}$/.test(first) ? `${first}.com` : null;
  const letter = String(name ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className="shrink-0 grid place-items-center overflow-hidden rounded-full bg-muted text-[10px] font-black"
      style={{ width: size, height: size }}
    >
      {domain && !failed ? (
        <img
          src={`https://www.google.com/s2/favicons?sz=64&domain=${domain}`}
          alt={`شعار ${name}`}
          loading="lazy"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        letter
      )}
    </span>
  );
}
