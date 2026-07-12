// 역할: 필드명 기반 민감정보 탐지.
// 입력: field 요소의 name / autocomplete / id / label 텍스트
// 출력: { is_sensitive, reason } — is_sensitive가 true면 값 접근 금지, token_class = "blocked"
// 상세 규칙: 03_architecture/event_schema_m1_detail.md "민감정보 차단 규칙" 참조.

import { createLogger } from "../logging/logger.js";

const log = createLogger("redaction.field_patterns");

/**
 * 필드명 패턴 카테고리.
 * 각 항목은 (regex, sensitive_reason) 튜플.
 * 규칙 변경 시 반드시 관련 테스트도 함께 갱신.
 */
const FIELD_NAME_PATTERNS: ReadonlyArray<{ regex: RegExp; reason: string }> = [
  { regex: /password|passwd|pwd|pass/i, reason: "field_name_pattern:password" },
  { regex: /otp|otc|2fa|auth.?code|verify.?code/i, reason: "field_name_pattern:otp" },
  { regex: /card|cvv|cvc|exp.?date|expiry/i, reason: "field_name_pattern:card" },
  { regex: /ssn|jumin|rrn|resident|주민/i, reason: "field_name_pattern:rrn" },
  // 'name' 단독 매치는 username/nickname/filename 등 일반 식별자 오탐을 유발하므로
  // patient_name, first_name, last_name, full_name 형태로만 한정. 한국어는 '이름' 단독 허용.
  {
    regex: /patient|환자|이름|birth|생년|dob|(?:^|[_\W])(?:patient|first|last|full|family|given)[_\W]?name|(?:^|[_\W])name[_\W]?(?:kanji|en|ko)?$/i,
    reason: "field_name_pattern:patient",
  },
  { regex: /phone|tel|mobile|휴대|연락/i, reason: "field_name_pattern:phone" },
  { regex: /license|면허|cert/i, reason: "field_name_pattern:license" },
  { regex: /bank|account|계좌|routing/i, reason: "field_name_pattern:bank" },
  { regex: /token|session|cookie|auth.?key|api.?key/i, reason: "field_name_pattern:token" },
];

/** 민감도 판정 결과 */
export interface FieldSensitivityResult {
  is_sensitive: boolean;
  reason: string | null;
}

/**
 * 주어진 식별자 문자열들 중 하나라도 민감 패턴에 매치되는지 검사한다.
 * 여러 식별자(name, id, autocomplete, label)를 모두 검사하여 하나라도 걸리면 민감으로 판정.
 *
 * @param identifiers 검사할 문자열들 (null/undefined는 무시)
 * @returns 판정 결과. 매치되지 않으면 { is_sensitive: false, reason: null }
 */
export function checkFieldSensitivity(
  ...identifiers: Array<string | null | undefined>
): FieldSensitivityResult {
  log.debug("check", `입력 식별자 ${identifiers.length}개`);
  // 단계 1: 유효한 식별자만 소문자로 정규화
  const normalized = identifiers
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .map((s) => s.toLowerCase());

  if (normalized.length === 0) {
    log.debug("check", "검사 가능한 식별자 없음 → not sensitive");
    return { is_sensitive: false, reason: null };
  }

  // 단계 2: 각 패턴에 대해 식별자 집합에 매치되는지 검사
  for (const { regex, reason } of FIELD_NAME_PATTERNS) {
    for (const id of normalized) {
      if (regex.test(id)) {
        log.info("match", `reason=${reason}`);
        return { is_sensitive: true, reason };
      }
    }
  }

  // 단계 3: 모든 패턴 미매치
  log.debug("check", "no match");
  return { is_sensitive: false, reason: null };
}

/**
 * 필드명이 민감 패턴에 걸리면 "[REDACTED]", 아니면 원본 반환.
 * field_names_redacted 배열 생성 시 사용.
 * @param name 원본 필드명
 */
export function maskFieldName(name: string): string {
  const { is_sensitive } = checkFieldSensitivity(name);
  return is_sensitive ? "[REDACTED]" : name;
}
