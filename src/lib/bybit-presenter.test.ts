import { describe, expect, it, vi } from "vitest";
import { LEDGER_CARD_FILTERS, cardFilterMatches, cardPurchasePresenter, cardRecordOutcome, findLinkedReversals } from "./bybit-spend";
import { isUnsupportedCardTypeError, mergeCardTypeResults } from "./bybit.server";

const label = (x: Parameters<typeof cardPurchasePresenter>[0]) => cardPurchasePresenter(x).text;

describe("card purchase presenter (one rule for every Bybit purchase screen)", () => {
  it("pending (tradeStatus 0) shows «ناجحة» in green", () => {
    const p = cardPurchasePresenter({ kind: "card", status: "success", detail: { tradeStatus: "0" } });
    expect(p.text).toBe("ناجحة");
    expect(p.group).toBe("success");
    expect(p.cls).toContain("emerald");
  });
  it("raw 'pending' status is also «ناجحة»", () => {
    expect(label({ status: "pending" })).toBe("ناجحة");
  });
  it("completed (tradeStatus 1) shows «ناجحة»", () => {
    expect(label({ kind: "card", status: "success", detail: { tradeStatus: "1" } })).toBe("ناجحة");
  });
  it("declined shows «فاشلة» in red", () => {
    const p = cardPurchasePresenter({ kind: "card", status: "failed", detail: { tradeStatus: "2" } });
    expect(p.text).toBe("فاشلة");
    expect(p.cls).toContain("red");
  });
  it("reversed shows plain «فاشلة»", () => {
    expect(label({ kind: "card", status: "reversed" })).toBe("فاشلة");
    expect(label({ status: "failed", reversed: true })).toBe("فاشلة");
  });
  it("linkedReversal shows «فاشلة» even if stored success", () => {
    expect(label({ kind: "card", status: "success", detail: { linkedReversal: 1 } })).toBe("فاشلة");
  });
  it("a real refund shows «مسترد»", () => {
    expect(label({ kind: "refund", status: "refund" })).toBe("مسترد");
    expect(label({ status: "refund" })).toBe("مسترد");
  });
  it("never produces the old labels", () => {
    const inputs = [
      { status: "pending" }, { status: "reversed" }, { status: "failed", reversed: true },
      { status: "success", detail: { tradeStatus: "0" } }, { status: "success", detail: { linkedReversal: 1 } },
    ];
    for (const i of inputs) expect(["قيد التنفيذ", "معكوسة", "فاشلة — معكوسة"]).not.toContain(label(i));
  });
});

describe("filter grouping", () => {
  it("«المشتريات الناجحة» includes pending and success", () => {
    expect(cardFilterMatches("success", cardPurchasePresenter({ status: "success", detail: { tradeStatus: "0" } }).group)).toBe(true);
    expect(cardFilterMatches("success", cardPurchasePresenter({ status: "success" }).group)).toBe(true);
  });
  it("«المشتريات الفاشلة» includes failed and reversed, not success", () => {
    expect(cardFilterMatches("failed", cardPurchasePresenter({ status: "failed" }).group)).toBe(true);
    expect(cardFilterMatches("failed", cardPurchasePresenter({ status: "reversed" }).group)).toBe(true);
    expect(cardFilterMatches("failed", cardPurchasePresenter({ status: "success" }).group)).toBe(false);
  });
  it("count of each tab equals the rows it shows", () => {
    const rows = [
      { status: "success", detail: { tradeStatus: "0" } }, { status: "success" }, { status: "failed" },
      { status: "reversed" }, { status: "refund", kind: "refund" }, { status: "success", detail: { linkedReversal: 1 } },
    ];
    const groups = rows.map((r) => cardPurchasePresenter(r).group);
    expect(groups.filter((g) => cardFilterMatches("success", g)).length).toBe(2);
    expect(groups.filter((g) => cardFilterMatches("failed", g)).length).toBe(3);
    expect(groups.filter((g) => cardFilterMatches("refund", g)).length).toBe(1);
    expect(groups.filter((g) => cardFilterMatches("all", g)).length).toBe(6);
  });
});

describe("reversal linking", () => {
  const auth = (id: string, scope: string, orderNo: string) => ({ id, scope, orderNo, txnId: id, tradeStatus: "0", side: "1" });
  it("voids the purchase in the same account", () => {
    const out = findLinkedReversals([auth("a", "acc1", "O1"), { id: "r", scope: "acc1", orderNo: "O1", txnId: "r", tradeStatus: "1", side: "2" }]);
    expect([...out]).toEqual(["a"]);
  });
  it("never voids a purchase in a different account", () => {
    const out = findLinkedReversals([auth("a", "acc2", "O1"), { id: "r", scope: "acc1", orderNo: "O1", txnId: "r", tradeStatus: "1", side: "2" }]);
    expect(out.size).toBe(0);
  });
  it("a legitimate refund with the same orderNo does not void the purchase", () => {
    const out = findLinkedReversals([auth("a", "acc1", "O1"), { id: "f", scope: "acc1", orderNo: "O1", txnId: "f", tradeStatus: "1", side: "5" }]);
    expect(out.size).toBe(0);
    expect(cardRecordOutcome("1", "5")).toBe("refund");
  });
});

describe("unsupported Bybit query types", () => {
  it("classifies a request rejection as unsupported, but not rate limit / auth", () => {
    expect(isUnsupportedCardTypeError(new Error("Bybit 10001: params error"))).toBe(true);
    expect(isUnsupportedCardTypeError(new Error("Bybit 10006: too many"))).toBe(false);
    expect(isUnsupportedCardTypeError(new Error("Bybit 10003: invalid key"))).toBe(false);
    expect(isUnsupportedCardTypeError(new Error("Bybit HTTP 503: x"))).toBe(false);
  });
  it("keeps rows of working types and reports the rejected one", () => {
    const warn = vi.fn();
    const rows = mergeCardTypeResults(
      [
        { status: "fulfilled", value: { data: [{ txnId: "1", tradeStatus: "1", side: "1" }] } },
        { status: "rejected", reason: new Error("Bybit 10001: unsupported type") },
      ],
      ["SIDE_QUERY_AUTH", "SIDE_QUERY_AUTH_REVERSAL"],
      warn,
    );
    expect(rows.map((r) => r.txnId)).toEqual(["1"]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("SIDE_QUERY_AUTH_REVERSAL");
  });
  it("throws only when every type failed", () => {
    expect(() =>
      mergeCardTypeResults([{ status: "rejected", reason: new Error("Bybit 10001: x") }], ["A"], () => {}),
    ).toThrow();
  });
});

describe("raw Bybit codes win over a stale stored status", () => {
  const g = (status: string, detail: Record<string, unknown>, kind = "card") => cardPurchasePresenter({ kind, status, detail });
  it("stale success + tradeStatus 3 → فاشلة", () => expect(g("success", { tradeStatus: "3" }).text).toBe("فاشلة"));
  it("stale success + side 2 → فاشلة", () => expect(g("success", { tradeStatus: "1", side: "2" }).text).toBe("فاشلة"));
  it("stale success + tradeStatus 2 → فاشلة", () => expect(g("success", { tradeStatus: "2" }).text).toBe("فاشلة"));
  it("pending 0 → ناجحة", () => expect(g("success", { tradeStatus: "0", side: "1" }).text).toBe("ناجحة"));
  it("settled 1 → ناجحة", () => expect(g("success", { tradeStatus: "1", side: "3" }).text).toBe("ناجحة"));
  it("refund tradeStatus 5 → مسترد", () => expect(g("success", { tradeStatus: "5" }).text).toBe("مسترد"));
  it("refund side + tradeStatus 3 stays مسترد", () => expect(g("refund", { tradeStatus: "3", side: "5" }, "refund").text).toBe("مسترد"));
  it("hang-voided failed never becomes success from raw pending", () =>
    expect(g("failed", { tradeStatus: "0", side: "1" }).text).toBe("فاشلة"));
});

describe("ledger SQL filters mirror the presenter", () => {
  it("failed filter covers raw tradeStatus 3 and side 2", () => {
    expect(LEDGER_CARD_FILTERS.failed).toContain("detail->>side.eq.2");
    expect(LEDGER_CARD_FILTERS.failed).toContain("detail->>tradeStatus.in.(2,3,4)");
  });
  it("success filter excludes raw failure codes and keeps nulls", () => {
    const f = LEDGER_CARD_FILTERS.success.join(" ");
    expect(f).toContain("detail->>tradeStatus.not.in.(2,3,4,5)");
    expect(f).toContain("detail->>side.is.null");
  });
});

describe("central ledger badge", () => {
  it("statusBadge passes detail to the presenter", async () => {
    const { statusBadge } = await import("@/components/admin/BybitLedgerPanel");
    expect(statusBadge("card", "success", "3", { tradeStatus: "3" }).text).toBe("فاشلة");
    expect(statusBadge("card", "success", "0", { tradeStatus: "0" }).text).toBe("ناجحة");
    expect(statusBadge("card", "success", undefined, { linkedReversal: 1 }).text).toBe("فاشلة");
  });
});
