// 역할: URL 정규화. fragment 제거, 블랙리스트 파라미터 제거, 허용 파라미터 값에 text redaction 적용.
// 상세 규칙: 03_architecture/event_schema_m1_detail.md "URL 정규화 규칙"

import { createLogger } from "../logging/logger.js";
import { redactText } from "./text_patterns.js";

const log = createLogger("redaction.url_canonicalize");

/**
 * 제거 대상 파라미터 이름 (case-insensitive, substring 매치).
 * 모든 웹사이트에서 공통적으로 위험한 세션/토큰/CSRF 계열.
 */
const BLACKLIST_PARAM_PATTERNS: ReadonlyArray<RegExp> = [
  /^session$/i,
  /^sid$/i,
  /^jsessionid$/i,
  /^phpsessid$/i,
  /^aspsessionid/i,
  /^sessionid$/i,
  /^token$/i,
  /^access_token$/i,
  /^refresh_token$/i,
  /^id_token$/i,
  /^auth$/i,
  /^authorization$/i,
  /^api_key$/i,
  /^apikey$/i,
  /^csrf/i,
  /^xsrf/i,
  /^_csrf$/i,
  /^password$/i,
  /^pwd$/i,
  /^otp$/i,
];

/**
 * 파라미터 이름이 블랙리스트에 해당하는지 검사.
 * @param name 파라미터 이름
 */
function isBlacklisted(name: string): boolean {
  return BLACKLIST_PARAM_PATTERNS.some((re) => re.test(name));
}

/**
 * URL을 정규화한다.
 *   - fragment 제거
 *   - userinfo 제거
 *   - query 블랙리스트 파라미터 제거
 *   - 남은 파라미터 값에 text redaction 패턴 적용
 *   - 실패 시 원본 host만이라도 남도록 try/catch
 *
 * @param raw 원본 URL 문자열
 * @returns 정규화된 URL 문자열
 */
export function canonicalizeUrl(raw: string): string {
  log.debug("start", `input len=${raw.length}`);
  try {
    const u = new URL(raw);

    // 단계 1: userinfo 제거
    u.username = "";
    u.password = "";

    // 단계 2: fragment 제거
    u.hash = "";

    // 단계 3: query 필터링
    const filtered = new URLSearchParams();
    for (const [key, value] of u.searchParams.entries()) {
      if (isBlacklisted(key)) {
        log.info("drop_param", `key=${key}`);
        continue;
      }
      // 단계 3a: 허용된 파라미터의 값에 redaction 패턴 적용
      const { text: redactedValue } = redactText(value, 2048);
      filtered.append(key, redactedValue);
    }
    // URLSearchParams 자체 대입은 어떤 브라우저에선 허용되지 않으므로 문자열 치환
    const qs = filtered.toString();
    u.search = qs ? `?${qs}` : "";

    const out = u.toString();
    log.debug("done", `output len=${out.length}`);
    return out;
  } catch (err) {
    // URL 파싱 실패: 안전한 기본값 반환
    log.warn("parse_fail", "원본 URL 파싱 실패, 빈 문자열 반환", err);
    return "";
  }
}

/**
 * URL에서 host만 추출. form_action_domain 생성에 사용.
 * @param raw 원본 URL 또는 상대 URL
 * @param baseHref 상대 URL 해석용 base
 */
export function extractHost(raw: string, baseHref: string): string {
  try {
    const u = new URL(raw, baseHref);
    return u.host;
  } catch (err) {
    log.warn("extract_host_fail", "host 추출 실패", err);
    return "";
  }
}
