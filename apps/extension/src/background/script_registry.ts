// 역할: 등록 도메인 ↔ 동적 content script 등록 상태의 동기화.
// 0.3.0부터 manifest의 <all_urls> 정적 주입을 제거하고, 사용자가 popup에서 등록·허가한
// 도메인에만 chrome.scripting.registerContentScripts 로 주입한다.
// (Chrome Web Store 심사 정책 "최소 권한" 대응 + chrome_policy_notes.md 원칙)
//
// 동작 원칙:
//   - 원하는 상태 = enabled인 등록 도메인 중 host permission이 실제로 granted인 것
//   - syncContentScripts() 는 현재 등록 상태와 diff를 내서 register/unregister (멱등)
//   - 호출 시점: service worker 기동, popup의 도메인 추가/삭제/토글 후 "sync_scripts" 메시지

import { createLogger } from "../logging/logger.js";
import { getAllowedSites } from "./settings.js";
import { IS_STORE_BUILD } from "../build_flags.js";

const log = createLogger("background.script_registry");

/** 동적 등록 ID 접두사. 도메인별 1개. */
const SCRIPT_ID_PREFIX = "orderrx-site-";

/** 2차 빌드 산출물의 고정 경로 (vite.content.config.ts) */
const CONTENT_SCRIPT_FILE = "content/orderrx-content.js";

/**
 * 도메인 하나에 대한 host permission origin 패턴들.
 * guard.ts 의 서브도메인 매칭과 동일한 범위 (도메인 본체 + 모든 서브도메인).
 */
export function originsForDomain(domain: string): string[] {
  return [`*://${domain}/*`, `*://*.${domain}/*`];
}

/**
 * 도메인의 host permission이 granted 상태인지 확인.
 */
async function hasOriginPermission(domain: string): Promise<boolean> {
  try {
    return await chrome.permissions.contains({ origins: originsForDomain(domain) });
  } catch (err) {
    log.warn("perm_check_fail", `domain=${domain}`, err);
    return false;
  }
}

/**
 * 등록 도메인 목록과 실제 동적 content script 등록 상태를 동기화한다. 멱등.
 * @returns 동기화 후 등록된 도메인 수
 */
export async function syncContentScripts(): Promise<number> {
  // pilot 빌드: <all_urls> 정적 주입을 쓰므로 동적 등록은 전부 해제한다.
  // (같은 unpacked 폴더에 store↔pilot 빌드를 덮어쓰면 extension ID가 같아
  //  이전 동적 등록이 살아남고, 정적 주입과 겹쳐 이벤트가 이중 기록될 수 있음)
  if (!IS_STORE_BUILD) {
    const stale = (await chrome.scripting.getRegisteredContentScripts())
      .map((r) => r.id)
      .filter((id) => id.startsWith(SCRIPT_ID_PREFIX));
    if (stale.length > 0) {
      log.info("pilot_cleanup", `동적 등록 ${stale.length}건 해제 (정적 주입과 중복 방지)`);
      await chrome.scripting.unregisterContentScripts({ ids: stale });
    }
    return 0;
  }

  // 단계 1: 원하는 상태 계산 (enabled + permission granted)
  const sites = await getAllowedSites();
  const desired = new Map<string, string>(); // scriptId -> domain
  for (const s of sites) {
    if (!s.enabled) continue;
    if (!(await hasOriginPermission(s.domain))) {
      log.warn("skip", `permission 미보유: ${s.domain} — popup에서 재등록 필요`);
      continue;
    }
    desired.set(`${SCRIPT_ID_PREFIX}${s.domain}`, s.domain);
  }

  // 단계 2: 현재 등록 상태 조회
  const registered = await chrome.scripting.getRegisteredContentScripts();
  const registeredIds = new Set(
    registered.map((r) => r.id).filter((id) => id.startsWith(SCRIPT_ID_PREFIX))
  );

  // 단계 3: 제거 대상 (등록돼 있지만 더 이상 원하지 않음)
  const toRemove = [...registeredIds].filter((id) => !desired.has(id));
  if (toRemove.length > 0) {
    log.info("unregister", `${toRemove.length}건: ${toRemove.join(", ")}`);
    await chrome.scripting.unregisterContentScripts({ ids: toRemove });
  }

  // 단계 4: 추가 대상
  const toAdd = [...desired.entries()].filter(([id]) => !registeredIds.has(id));
  if (toAdd.length > 0) {
    log.info("register", `${toAdd.length}건: ${toAdd.map(([, d]) => d).join(", ")}`);
    await chrome.scripting.registerContentScripts(
      toAdd.map(([id, domain]) => ({
        id,
        matches: originsForDomain(domain),
        js: [CONTENT_SCRIPT_FILE],
        runAt: "document_idle" as const,
        allFrames: false,
        persistAcrossSessions: true,
      }))
    );
  }

  log.info("sync_done", `active=${desired.size} removed=${toRemove.length} added=${toAdd.length}`);
  return desired.size;
}
