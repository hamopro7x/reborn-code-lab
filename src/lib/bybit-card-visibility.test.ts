import { describe, expect, it } from "vitest";
import type { BybitCard } from "./bybit-cards.server";
import { cardsVisibleTo } from "./bybit-card-visibility";

const card: BybitCard = {
  id: "card-1",
  pan4: "4938",
  brand: "Visa",
  currency: "USD",
  status: "active",
  fullNumber: "4111111111114938",
  cvv: "123",
  expiry: "07/29",
  txnCount: 0,
  spend: 0,
  lastUsed: 0,
};

describe("cardsVisibleTo", () => {
  it("removes full PAN, CVV and expiry from employee responses", () => {
    const [visible] = cardsVisibleTo("employee", [card]);
    expect(visible).toMatchObject({ id: "card-1", pan4: "4938", brand: "Visa" });
    expect(visible).not.toHaveProperty("fullNumber");
    expect(visible).not.toHaveProperty("cvv");
    expect(visible).not.toHaveProperty("expiry");
  });

  it("preserves complete card data for admins", () => {
    expect(cardsVisibleTo("admin", [card])).toEqual([card]);
  });
});
