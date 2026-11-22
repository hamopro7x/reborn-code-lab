import type { BybitCard } from "./bybit-cards.server";

/**
 * Full payment-card credentials are only returned to admins.
 * Employee-shared Bybit panels receive safe metadata and the last four digits.
 */
export function cardsVisibleTo(
  role: "admin" | "employee",
  cards: readonly BybitCard[],
): BybitCard[] {
  if (role === "admin") return [...cards];

  return cards.map(({ fullNumber: _fullNumber, cvv: _cvv, expiry: _expiry, ...safe }) => {
    void _fullNumber;
    void _cvv;
    void _expiry;
    return safe;
  });
}
