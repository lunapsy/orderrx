// 역할: 페이지 텍스트 redaction 패턴 5종 검증.
// 패턴: rrn, phone, email, card, long_digits

import { describe, it, expect } from "vitest";
import { redactText } from "../../src/redaction/text_patterns.js";

describe("redactText — 패턴별 치환", () => {
  it("RRN 치환", () => {
    const r = redactText("환자: 901011-1234567 입니다", 200);
    expect(r.text).toContain("[RRN]");
    expect(r.text).not.toContain("901011-1234567");
    expect(r.did_redact).toBe(true);
  });

  it("RRN 하이픈 없는 13자리도 치환 (RRN 우선, long_digits 백업)", () => {
    const r = redactText("9010111234567", 200);
    // 13자리는 RRN regex(\b\d{6}\d{7}\b)로 직접 매치되는 게 정확. 만일 향후 패턴이 변경되어도
    // long_digits 백업이 동작해야 하므로 둘 중 하나는 반드시 들어가야 한다.
    const hasMask =
      r.text.includes("[RRN]") || r.text.includes("[DIGITS]");
    expect(hasMask).toBe(true);
    expect(r.text).not.toContain("9010111234567");
    expect(r.did_redact).toBe(true);
  });

  it("국내 휴대전화 치환", () => {
    const r = redactText("연락처 010-1234-5678 로 주세요", 200);
    expect(r.text).toContain("[PHONE]");
    expect(r.text).not.toContain("010-1234-5678");
  });

  it("이메일 치환", () => {
    const r = redactText("주문 확인은 user@example.com 으로", 200);
    expect(r.text).toContain("[EMAIL]");
    expect(r.text).not.toContain("user@example.com");
  });

  it("카드번호 치환", () => {
    const r = redactText("카드 4111-1111-1111-1111", 200);
    expect(r.text).toContain("[CARD]");
    expect(r.text).not.toContain("4111-1111-1111-1111");
  });

  it("10자리 이상 숫자열 치환", () => {
    const r = redactText("주문번호 12345678901", 200);
    expect(r.text).toContain("[DIGITS]");
  });

  it("9자리 이하 숫자열은 유지 (상품 ID 보호)", () => {
    const r = redactText("상품 12345 / 78901234", 200);
    expect(r.text).toContain("12345");
    expect(r.text).toContain("78901234");
    expect(r.did_redact).toBe(false);
  });

  it("일반 텍스트는 변경 없음", () => {
    const r = redactText("타이레놀 500mg 30정", 200);
    expect(r.text).toBe("타이레놀 500mg 30정");
    expect(r.did_redact).toBe(false);
  });

  it("길이 제한 적용", () => {
    const r = redactText("a".repeat(100), 40);
    expect(r.text.length).toBe(40);
  });

  it("null/undefined/빈 문자열은 안전 처리", () => {
    expect(redactText(null, 40).text).toBe("");
    expect(redactText(undefined, 40).text).toBe("");
    expect(redactText("", 40).text).toBe("");
    expect(redactText(null, 40).did_redact).toBe(false);
  });

  it("복합 케이스: 여러 패턴 동시 매치", () => {
    const r = redactText("user@example.com 010-1111-2222 카드 4111111111111111", 200);
    expect(r.text).toContain("[EMAIL]");
    expect(r.text).toContain("[PHONE]");
    expect(r.text).toContain("[CARD]");
    expect(r.did_redact).toBe(true);
  });
});
