// 역할: content script 엔트리이자 capture 라이프사이클 orchestrator.
// 이 파일은 직접 DOM 캡처를 하지 않는다. guard 평가와 capture start/stop 만 책임진다.
//
// 라이프사이클:
//   1. 페이지 로드 직후 evaluate() 1회 호출 → guard 통과 시 capture 시작
//   2. chrome.storage.onChanged 구독 → consent_state / allowed_sites 변경 시 evaluate() 재호출
//   3. evaluate() 는 현재 활성 상태와 guard 결과를 비교하여 start / stop 을 결정 (멱등)
//
// 이 구조 덕분에 사용자가 popup 에서 Pause 를 누르면 즉시 모든 리스너가 해제되고,
// Resume 시 자동으로 다시 부착된다. content script 자체를 재주입할 필요 없음.

import { createLogger } from "../logging/logger.js";
import { shouldCollect } from "./guard.js";
import { startCapture, type CaptureHandle } from "./capture.js";
import { getParticipantId } from "../background/participant_id.js";
import { KEY } from "../storage/chrome_storage.js";

const log = createLogger("content.index");

/** 현재 활성화된 capture 핸들. null 이면 비활성 상태. */
let activeHandle: CaptureHandle | null = null;

/**
 * guard 결과에 따라 capture 를 시작하거나 중단한다.
 * 이미 활성/비활성 상태와 일치하면 아무것도 하지 않는다 (멱등).
 *
 * @param reason 호출 원인 — 로그 추적용 (initial / storage:consent / storage:sites 등)
 */
async function evaluate(reason: string): Promise<void> {
  log.debug("evaluate", `reason=${reason}`);
  const guard = await shouldCollect();

  if (guard.allowed) {
    if (activeHandle) {
      log.debug("evaluate", "이미 active — 무시");
      return;
    }
    const participantId = await getParticipantId();
    if (!participantId) {
      log.warn("evaluate", "participant_id 미존재 — 시작 보류");
      return;
    }
    log.info("evaluate", `capture 시작 (site_id=${guard.site_id}, reason=${reason})`);
    activeHandle = startCapture({ participant_id: participantId, site_id: guard.site_id });
  } else {
    if (!activeHandle) {
      log.debug("evaluate", `이미 inactive — 무시 (${guard.reason})`);
      return;
    }
    log.info("evaluate", `capture 중단 (reason=${reason}, guard=${guard.reason})`);
    activeHandle.stop();
    activeHandle = null;
  }
}

/**
 * chrome.storage 변경 구독.
 * consent_state 또는 allowed_sites 가 바뀌면 evaluate() 재실행.
 *
 * 이게 Layer 2 Pause 핵심: popup 에서 토글이 일어나면 storage 가 변경되고
 * 이 리스너가 즉시 evaluate() 를 호출 → activeHandle.stop() 으로 모든 DOM 리스너 해제.
 */
function subscribeStorageChanges(): void {
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      const consentChanged = Boolean(changes[KEY.CONSENT_STATE]);
      const sitesChanged = Boolean(changes[KEY.ALLOWED_SITES]);
      if (!consentChanged && !sitesChanged) return;
      const reason =
        consentChanged && sitesChanged
          ? "consent+sites"
          : consentChanged
            ? "consent"
            : "sites";
      log.info("storage_change", `${reason} 변경 감지 → 재평가`);
      void evaluate(`storage:${reason}`);
    });
    log.info("subscribe", "chrome.storage.onChanged 구독 완료");
  } catch (err) {
    log.error("subscribe_fail", "chrome.storage.onChanged 구독 실패", err);
  }
}

/**
 * 진입점.
 *   1. storage change 구독 (Pause/Resume, 도메인 토글 즉시 반영)
 *   2. 초기 평가 1회
 */
async function init(): Promise<void> {
  log.info("boot", `url=${location.href}`);
  subscribeStorageChanges();
  await evaluate("initial");
}

// non-blocking 초기화. 오류는 콘솔에만 남기고 페이지 동작을 막지 않는다.
init().catch((err) => {
  log.error("boot_fail", "초기화 실패", err);
});
