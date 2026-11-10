import { describe, expect, it } from "vitest";
import { createHmac } from "crypto";
import {
  okxSign,
  encodeOkxSecret,
  decodeOkxSecret,
  okxWithdrawStatus,
  okxDepositStatus,
  mapOkxDeposit,
  mapOkxWithdrawal,
  OKX_INTERNAL_CHAIN,
} from "./okx-core";
import { okxLedgerRows } from "./okx.server";

describe("OKX request signing", () => {
  it("signs timestamp + METHOD + path(with query) + body as base64 HMAC-SHA256", () => {
    const ts = "2026-11-10T08:00:00.000Z";
    const path = "/api/v5/asset/withdrawal-history?type=3&limit=100";
    const expected = createHmac("sha256", "SECRET").update(ts + "GET" + path).digest("base64");
    expect(okxSign("SECRET", ts, "get", path)).toBe(expected);
  });
});

describe("OKX key storage", () => {
  it("keeps secret and passphrase together and rejects Bybit-style secrets", () => {
    expect(decodeOkxSecret(encodeOkxSecret("s3cret", "pass phrase"))).toEqual({ secret: "s3cret", passphrase: "pass phrase" });
    expect(decodeOkxSecret("plainBybitSecret")).toBeNull();
  });
});

describe("OKX status labels", () => {
  it("withdrawal: only state 2 is successful; -1 failed; -2 canceled; others pending", () => {
    expect(okxWithdrawStatus("2")).toBe("ناجحة");
    expect(okxWithdrawStatus("-1")).toBe("فاشلة");
    expect(okxWithdrawStatus("-2")).toBe("ملغاة");
    expect(okxWithdrawStatus("10")).toBe("قيد التنفيذ");
  });
  it("deposit: credited/successful count as successful; blocked states fail", () => {
    expect(okxDepositStatus("2")).toBe("ناجحة");
    expect(okxDepositStatus("1")).toBe("ناجحة");
    expect(okxDepositStatus("12")).toBe("فاشلة");
    expect(okxDepositStatus("0")).toBe("قيد التنفيذ");
  });
});

describe("OKX movements reach the central ledger like Bybit", () => {
  const out = mapOkxWithdrawal({ wdId: "W1", ccy: "USDT", amt: "25.5", fee: "0", state: "2", ts: "1793500000000", to: "user@mail.com" }, true);
  const inn = mapOkxDeposit({ depId: "D1", ccy: "USDT", amt: "10", state: "2", ts: "1793500001000", from: "+20100" }, true);

  it("internal withdrawal is negative, uses the OKX withdrawal ID and the recipient", () => {
    expect(out).toMatchObject({ id: "W1", amount: -25.5, direction: "out", address: "user@mail.com", chain: OKX_INTERNAL_CHAIN });
  });

  it("maps to the same ledger kinds Bybit uses, scoped to the OKX account", () => {
    const rows = okxLedgerRows("acc-1", {
      internal: { deposits: [inn], withdrawals: [out] },
      onchain: { deposits: [], withdrawals: [] },
    });
    expect(rows.map((r) => [r.kind, r.ref_id, r.account_id])).toEqual([
      ["internal_in", "D1", "acc-1"],
      ["internal_out", "W1", "acc-1"],
    ]);
    expect(rows[1].detail.provider).toBe("okx");
  });
});
