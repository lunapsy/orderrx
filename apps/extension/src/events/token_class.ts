// 역할: 필드 value로부터 token_class를 계산한다.
// 절대 원칙: value 자체를 저장/해시/반환 금지. 오로지 분류 결과 문자열만 반환.
// 호출자 책임: 이 함수 호출 후 value 참조를 즉시 버릴 것.
// 상세 규칙: 03_architecture/event_schema_m1_detail.md "토큰 클래스 분류"

import { createLogger } from "../logging/logger.js";

const log = createLogger("events.token_class");

export type TokenClass =
  | "empty"
  | "digits"
  | "alpha_lower"
  | "alpha_upper"
  | "alpha_mixed"
  | "alphanumeric"
  | "korean"
  | "korean_mixed"
  | "email_like"
  | "phone_like"
  | "mixed_symbols"
  | "blocked";

const RE_DIGITS = /^\d+$/;
const RE_ALPHA_LOWER = /^[a-z]+$/;
const RE_ALPHA_UPPER = /^[A-Z]+$/;
const RE_ALPHA_MIXED = /^[a-zA-Z]+$/;
const RE_ALPHANUMERIC = /^[a-zA-Z0-9]+$/;
const RE_KOREAN = /^[\uAC00-\uD7A3ㄱ-ㅎㅏ-ㅣ]+$/;
const RE_KOREAN_MIXED = /[\uAC00-\uD7A3]/;
const RE_EMAIL_LIKE = /^[\w.+-]+@[\w-]+\.[\w.-]+$/;
const RE_PHONE_LIKE = /^[\d\s().+-]+$/;

/**
 * 필드 값을 분류한다.
 *
 * 주의: 이 함수는 value 인자를 받는 유일한 경로여야 한다. 결과 반환 후 호출 측은
 *       value 변수를 즉시 재사용하지 말 것. 값 기반 분기, 로깅, 직렬화 모두 금지.
 *
 * @param value 필드의 현재 값. **이 함수 외부로 빠져나가면 안 됨.**
 * @returns TokenClass
 */
export function classifyToken(value: string): TokenClass {
  // 단계 0: 길이 0이면 empty
  if (value.length === 0) {
    log.debug("classify", "empty");
    return "empty";
  }

  // 단계 1: 정확 매치 카테고리
  if (RE_DIGITS.test(value)) {
    // 휴대전화 패턴이면 phone_like로 승격 (순수 숫자라도 10자리 이상은 의심)
    if (value.length >= 10 && /^01\d/.test(value)) return "phone_like";
    return "digits";
  }
  if (RE_ALPHA_LOWER.test(value)) return "alpha_lower";
  if (RE_ALPHA_UPPER.test(value)) return "alpha_upper";
  if (RE_ALPHA_MIXED.test(value)) return "alpha_mixed";
  if (RE_ALPHANUMERIC.test(value)) return "alphanumeric";
  if (RE_KOREAN.test(value)) return "korean";
  if (RE_EMAIL_LIKE.test(value)) return "email_like";
  if (RE_PHONE_LIKE.test(value)) return "phone_like";

  // 단계 2: 한글 + 기타 혼합
  if (RE_KOREAN_MIXED.test(value)) return "korean_mixed";

  // 단계 3: 그 외
  return "mixed_symbols";
  // NOTE: 반환 후 호출 측은 value 참조를 즉시 놓아야 한다.
}
