// 역할: 페이지 내 텍스트(타이틀, 버튼 텍스트, 라벨)의 민감 문자열을 치환.
// 적용 대상: page_title_redacted, target_text_redacted, field_label_redacted, URL query value
// 상세 규칙: 03_architecture/event_schema_m1_detail.md "페이지 텍스트 redaction 패턴"

import { createLogger } from "../logging/logger.js";

const log = createLogger("redaction.text_patterns");

/**
 * 텍스트 치환 규칙.
 *
 * 적용 순서 원칙: **자릿수가 많은(=가장 구체적인) 패턴부터** 적용한다.
 *   1) card (16자리): RRN regex가 16자리 카드의 앞 13자리를 먹어버리는 사고를 막기 위해 RRN보다 먼저.
 *   2) rrn (13자리)
 *   3) phone (10~11자리, 하이픈 포함 가능)
 *   4) email
 *   5) long_digits: 위 어디에도 안 걸린 긴 숫자열의 백업.
 *
 * 모든 숫자 패턴은 \b 단어경계를 사용해 카드/RRN의 부분 매치를 방지한다.
 */
const TEXT_PATTERNS: ReadonlyArray<{ name: string; regex: RegExp; replacement: string }> = [
  { name: "card", regex: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, replacement: "[CARD]" },
  { name: "rrn", regex: /\b\d{6}[-\s]?\d{7}\b/g, replacement: "[RRN]" },
  { name: "phone", regex: /01\d[-.\s]?\d{3,4}[-.\s]?\d{4}/g, replacement: "[PHONE]" },
  { name: "email", regex: /[\w.+-]+@[\w-]+\.[\w.-]+/g, replacement: "[EMAIL]" },
  { name: "long_digits", regex: /\b\d{10,}\b/g, replacement: "[DIGITS]" },
];

/** 치환 결과. did_redact가 true면 이벤트의 redaction_status는 "redacted". */
export interface RedactResult {
  text: string;
  did_redact: boolean;
}

/**
 * 입력 텍스트에 모든 패턴을 순차 적용한다.
 * @param input 원본 텍스트 (null/undefined 허용)
 * @param maxLen 결과 최대 길이. 초과 시 앞부분만 반환.
 * @returns 치환된 텍스트와 치환 여부
 */
export function redactText(input: string | null | undefined, maxLen: number): RedactResult {
  if (input === null || input === undefined || input.length === 0) {
    return { text: "", did_redact: false };
  }

  log.debug("redact", `원본 길이=${input.length}`);
  let out = input;
  let redacted = false;

  // 단계 1: 각 패턴 순차 적용
  for (const { name, regex, replacement } of TEXT_PATTERNS) {
    const before = out;
    out = out.replace(regex, replacement);
    if (out !== before) {
      redacted = true;
      log.info("match", `pattern=${name}`);
    }
  }

  // 단계 2: 길이 제한
  if (out.length > maxLen) {
    log.debug("truncate", `길이=${out.length} → ${maxLen}`);
    out = out.slice(0, maxLen);
  }

  return { text: out, did_redact: redacted };
}
