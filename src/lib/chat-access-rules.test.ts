import { expect, it } from "vitest";
import { chatGateExempt } from "./chat-access-rules";
it("allows reading and acknowledging chat without opening other employee interfaces", () => {
  expect(chatGateExempt("src/lib/chat.functions.ts", "getChatState")).toBe(true);
  expect(chatGateExempt("src/lib/chat.functions.ts", "mutateChat")).toBe(true);
  expect(chatGateExempt("src/lib/work.functions.ts", "getMyShiftTxns")).toBe(false);
  expect(chatGateExempt("src/lib/mail.functions.ts", "listMailAccounts")).toBe(false);
});
it("keeps device authorization reachable during mandatory reading without opening course data", () => {
  expect(chatGateExempt("src/lib/courses.functions.ts", "checkDevice")).toBe(true);
  expect(chatGateExempt("src\\lib\\courses.functions.ts", "checkDevice")).toBe(true);
  expect(chatGateExempt("src/lib/courses.functions.ts", "adminAddDevice")).toBe(false);
  expect(chatGateExempt("src/lib/courses.functions.ts", "getCourses")).toBe(false);
  expect(chatGateExempt("src/lib/other.functions.ts", "checkDevice")).toBe(false);
});
it("keeps only ongoing transaction save operations exempt, not new assignments or shift changes", () => {
  expect(chatGateExempt("src/lib/work.functions.ts", "saveMyTxnEntry")).toBe(true);
  expect(chatGateExempt("src/lib/work.functions.ts", "saveMyManualCardTxn")).toBe(true);
  expect(chatGateExempt("src/lib/work.functions.ts", "claimWorkShift")).toBe(false);
  expect(chatGateExempt("src/lib/work.functions.ts", "linkP2POrder")).toBe(false);
  expect(chatGateExempt("src/lib/other.functions.ts", "saveMyTxnEntry")).toBe(false);
});