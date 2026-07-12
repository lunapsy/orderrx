// 역할: 설정(도메인 목록, consent 상태)의 읽기/쓰기 로직.
// popup과 background, content script가 동일 인터페이스로 접근.

import { createLogger } from "../logging/logger.js";
import {
  KEY,
  getItem,
  setItem,
  type ConsentState,
  type AllowedSite,
} from "../storage/chrome_storage.js";

const log = createLogger("background.settings");

/** 참여자별 도메인 상한. 30개를 넘으면 추가 거부. */
export const MAX_ALLOWED_SITES = 30;

/**
 * consent 상태를 조회. 기본값은 "paused" (명시적 opt-in 전까지 수집 금지).
 */
export async function getConsentState(): Promise<ConsentState> {
  const v = await getItem<ConsentState>(KEY.CONSENT_STATE);
  return v ?? "paused";
}

/**
 * consent 상태를 저장.
 */
export async function setConsentState(next: ConsentState): Promise<void> {
  log.info("consent_change", `next=${next}`);
  await setItem(KEY.CONSENT_STATE, next);
}

/**
 * 등록된 도메인 목록을 조회. 없으면 빈 배열.
 */
export async function getAllowedSites(): Promise<AllowedSite[]> {
  const v = await getItem<AllowedSite[]>(KEY.ALLOWED_SITES);
  return Array.isArray(v) ? v : [];
}

/**
 * 입력 문자열에서 hostname만 추출한다.
 *   - "https://example.com:443/path?q" → "example.com"
 *   - "example.com:8080"               → "example.com"
 *   - "  Example.COM  "                → "example.com"
 *   - "localhost:8765"                 → "localhost"
 *   - 잘못된 입력은 빈 문자열 반환.
 *
 * URL 생성자가 protocol 없는 입력을 base 없이 거부하므로 두 단계 fallback 사용.
 */
export function normalizeDomain(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return "";
  // 1차: protocol 포함 URL로 파싱 시도
  try {
    const u = new URL(trimmed);
    if (u.hostname) return u.hostname;
  } catch {
    // ignore, fall through
  }
  // 2차: protocol 없는 입력은 임의 protocol 붙여 재시도
  try {
    const u = new URL(`http://${trimmed}`);
    if (u.hostname) return u.hostname;
  } catch {
    // ignore
  }
  return "";
}

/**
 * 도메인을 추가한다. 이미 존재하면 무시. 상한 초과 시 false 반환.
 * 입력은 normalizeDomain 으로 hostname 만 추출 후 저장.
 */
export async function addAllowedSite(domain: string): Promise<boolean> {
  const normalized = normalizeDomain(domain);
  if (!normalized) return false;

  const list = await getAllowedSites();
  if (list.some((s) => s.domain === normalized)) {
    log.debug("add", "이미 존재, 무시");
    return true;
  }
  if (list.length >= MAX_ALLOWED_SITES) {
    log.warn("add_rejected", `상한(${MAX_ALLOWED_SITES}) 초과`);
    return false;
  }
  list.push({ domain: normalized, enabled: true, added_at: new Date().toISOString() });
  await setItem(KEY.ALLOWED_SITES, list);
  log.info("add", `domain=${normalized} size=${list.length}`);
  return true;
}

/**
 * 도메인을 제거한다. 입력은 동일 정규화 적용.
 */
export async function removeAllowedSite(domain: string): Promise<void> {
  const normalized = normalizeDomain(domain) || domain.trim().toLowerCase();
  const list = await getAllowedSites();
  const next = list.filter((s) => s.domain !== normalized);
  await setItem(KEY.ALLOWED_SITES, next);
  log.info("remove", `domain=${normalized} size=${next.length}`);
}

/**
 * 개별 도메인 ON/OFF 토글.
 */
export async function toggleAllowedSite(domain: string, enabled: boolean): Promise<void> {
  const normalized = normalizeDomain(domain) || domain.trim().toLowerCase();
  const list = await getAllowedSites();
  const target = list.find((s) => s.domain === normalized);
  if (!target) return;
  target.enabled = enabled;
  await setItem(KEY.ALLOWED_SITES, list);
  log.info("toggle", `domain=${normalized} enabled=${enabled}`);
}
