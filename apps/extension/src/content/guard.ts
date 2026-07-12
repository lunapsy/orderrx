// 역할: content script 활성화 전 게이트.
// consent가 active이고, 현재 host가 allowed_sites에 등록되어 있으며 enabled인 경우에만 이벤트 캡처 시작.

import { createLogger } from "../logging/logger.js";
import { getConsentState, getAllowedSites } from "../background/settings.js";

const log = createLogger("content.guard");

/**
 * 현재 탭에서 수집을 해야 하는지 판정.
 * @returns 수집해야 하면 { allowed: true, site_id }, 아니면 { allowed: false }
 */
export async function shouldCollect(): Promise<
  { allowed: true; site_id: string } | { allowed: false; reason: string }
> {
  // 비교는 location.hostname 기준 (포트 제외). localhost:8765 같은 dev 환경에서도 매치되도록.
  log.debug("check", `hostname=${location.hostname}`);

  // 단계 1: consent 확인
  const consent = await getConsentState();
  if (consent !== "active") {
    log.info("block", "consent != active");
    return { allowed: false, reason: "consent_paused" };
  }

  // 단계 2: 도메인 목록 확인
  const sites = await getAllowedSites();
  const host = location.hostname.toLowerCase();
  const match = sites.find((s) => {
    // 단순 host 매치 또는 서브도메인 허용 (www.example.com이 example.com에 매치)
    return host === s.domain || host.endsWith(`.${s.domain}`);
  });

  if (!match) {
    log.info("block", "host not in allowed sites");
    return { allowed: false, reason: "host_not_allowed" };
  }
  if (!match.enabled) {
    log.info("block", "site disabled");
    return { allowed: false, reason: "site_disabled" };
  }

  log.info("allow", `site_id=${match.domain}`);
  return { allowed: true, site_id: match.domain };
}
