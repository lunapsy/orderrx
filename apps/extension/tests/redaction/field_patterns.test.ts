// 역할: 필드명 패턴 9종에 대한 positive/negative 케이스 검증.
// DoD: 03_architecture/event_schema_m1_detail.md 의 "민감정보 차단 규칙 — 필드명 패턴" 9종 모두 커버.

import { describe, it, expect } from "vitest";
import {
  checkFieldSensitivity,
  maskFieldName,
} from "../../src/redaction/field_patterns.js";

/**
 * 카테고리별 (positive 3건, negative 1건) 테이블 기반 케이스.
 * 각 row 의 첫 컬럼은 카테고리 이름, 두 번째는 (입력, 기대 reason | null) 튜플 배열.
 */
const CASES: Array<{
  category: string;
  positives: Array<[string, string]>;
  negatives: string[];
}> = [
  {
    category: "password",
    positives: [
      ["password", "field_name_pattern:password"],
      ["userPwd", "field_name_pattern:password"],
      ["confirm_passwd", "field_name_pattern:password"],
    ],
    negatives: ["username", "email", "address"],
  },
  {
    category: "otp",
    positives: [
      ["otp", "field_name_pattern:otp"],
      ["auth_code", "field_name_pattern:otp"],
      ["verifyCode", "field_name_pattern:otp"],
    ],
    negatives: ["zipcode", "promo"],
  },
  {
    category: "card",
    positives: [
      ["card_number", "field_name_pattern:card"],
      ["cvv", "field_name_pattern:card"],
      ["expDate", "field_name_pattern:card"],
    ],
    negatives: ["nickname", "discount"],
  },
  {
    category: "rrn",
    positives: [
      ["jumin", "field_name_pattern:rrn"],
      ["resident_no", "field_name_pattern:rrn"],
      ["주민번호", "field_name_pattern:rrn"],
    ],
    negatives: ["zipcode", "ordernum"],
  },
  {
    category: "patient",
    positives: [
      ["patient_name", "field_name_pattern:patient"],
      ["환자명", "field_name_pattern:patient"],
      ["birthDay", "field_name_pattern:patient"],
    ],
    negatives: ["product", "category"],
  },
  {
    category: "phone",
    positives: [
      ["phone", "field_name_pattern:phone"],
      ["mobile", "field_name_pattern:phone"],
      ["휴대폰", "field_name_pattern:phone"],
    ],
    negatives: ["fax_old", "address1"],
  },
  {
    category: "license",
    positives: [
      ["license_no", "field_name_pattern:license"],
      ["면허번호", "field_name_pattern:license"],
      ["pharmacist_cert", "field_name_pattern:license"],
    ],
    negatives: ["productCode", "memo"],
  },
  {
    category: "bank",
    positives: [
      ["bank_account", "field_name_pattern:bank"],
      ["account_no", "field_name_pattern:bank"],
      ["계좌번호", "field_name_pattern:bank"],
    ],
    negatives: ["bookmark", "delivery"],
  },
  {
    category: "token",
    positives: [
      ["session_token", "field_name_pattern:token"],
      ["api_key", "field_name_pattern:token"],
      ["cookie_consent", "field_name_pattern:token"],
    ],
    negatives: ["search", "filter"],
  },
];

describe("checkFieldSensitivity — 필드명 패턴 9종", () => {
  for (const { category, positives, negatives } of CASES) {
    describe(category, () => {
      for (const [name, expectedReason] of positives) {
        it(`positive: ${name}`, () => {
          const r = checkFieldSensitivity(name);
          expect(r.is_sensitive).toBe(true);
          expect(r.reason).toBe(expectedReason);
        });
      }
      for (const name of negatives) {
        it(`negative: ${name}`, () => {
          const r = checkFieldSensitivity(name);
          expect(r.is_sensitive).toBe(false);
          expect(r.reason).toBeNull();
        });
      }
    });
  }
});

describe("checkFieldSensitivity — 다중 식별자", () => {
  it("name 은 안전하지만 label 이 민감하면 sensitive", () => {
    const r = checkFieldSensitivity("f1", null, null, "주민등록번호");
    expect(r.is_sensitive).toBe(true);
  });

  it("모든 식별자가 안전하면 not sensitive", () => {
    const r = checkFieldSensitivity("search_query", "search", null, "검색어");
    expect(r.is_sensitive).toBe(false);
  });

  it("빈 입력은 not sensitive", () => {
    const r = checkFieldSensitivity(null, undefined, "");
    expect(r.is_sensitive).toBe(false);
  });
});

describe("maskFieldName", () => {
  it("민감 필드명은 [REDACTED]", () => {
    expect(maskFieldName("user_password")).toBe("[REDACTED]");
  });
  it("일반 필드명은 원본 유지", () => {
    expect(maskFieldName("search")).toBe("search");
  });
});
