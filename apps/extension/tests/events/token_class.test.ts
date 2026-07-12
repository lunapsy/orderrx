// 역할: classifyToken 의 12개 클래스 분류 검증.
// 절대 원칙: 이 함수는 value 자체를 반환하면 안 됨 → 결과는 항상 enum 문자열.

import { describe, it, expect } from "vitest";
import { classifyToken } from "../../src/events/token_class.js";

describe("classifyToken — 12 클래스", () => {
  const cases: Array<[string, string, string]> = [
    ["empty", "", "empty"],
    ["digits short", "12345", "digits"],
    ["alpha_lower", "tylenol", "alpha_lower"],
    ["alpha_upper", "ABC", "alpha_upper"],
    ["alpha_mixed", "Tylenol", "alpha_mixed"],
    ["alphanumeric", "abc123", "alphanumeric"],
    ["korean", "타이레놀", "korean"],
    ["korean_mixed", "타이레놀500mg", "korean_mixed"],
    ["email_like", "user@example.com", "email_like"],
    ["phone_like punctuated", "010-1234-5678", "phone_like"],
    ["phone_like 10+ digits starting 01", "01012345678", "phone_like"],
    ["mixed_symbols", "$@!#%", "mixed_symbols"],
  ];

  for (const [label, input, expected] of cases) {
    it(`${label} → ${expected}`, () => {
      expect(classifyToken(input)).toBe(expected);
    });
  }

  it("순수 숫자 9자리 이하는 digits 유지", () => {
    expect(classifyToken("123456789")).toBe("digits");
  });

  it("01로 시작하지 않는 10자리 숫자는 digits", () => {
    expect(classifyToken("9876543210")).toBe("digits");
  });

  it("결과는 항상 string enum (값 누출 금지)", () => {
    const r = classifyToken("매우-민감한-값-12345");
    expect(typeof r).toBe("string");
    expect(r).not.toContain("민감");
    expect(r).not.toContain("12345");
  });
});
