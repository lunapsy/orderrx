// 역할: service worker 엔트리.
//   1) 설치/업데이트 시 participant_id 보장
//   2) content script ↔ extension 사이 메시지 라우팅
//   3) **이벤트 저장의 단일 진입점**.
//      content script는 page origin에서 실행되므로 자체 IndexedDB는 popup에서 접근 불가.
//      반드시 background로 메시지를 보내 extension origin DB에 저장해야 popup이 같은 데이터를 본다.

import { createLogger } from "../logging/logger.js";
import { ensureParticipantId } from "./participant_id.js";
import { putEvent } from "../storage/indexed_db.js";
import { flushNow } from "./uploader.js";
import { UPLOAD_PERIOD_MINUTES } from "./upload_config.js";

const log = createLogger("background.index");

log.info("boot", "service worker 시작");

/** 업로드 알람 이름 (재생성해도 동일 이름이면 갱신됨) */
const UPLOAD_ALARM = "orderrx_upload";

// service worker가 깨어날 때마다 알람 존재를 보장 (create는 같은 이름이면 갱신이라 멱등)
chrome.alarms.create(UPLOAD_ALARM, { periodInMinutes: UPLOAD_PERIOD_MINUTES });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== UPLOAD_ALARM) return;
  void flushNow("alarm");
});

// 설치/업데이트 시 participant_id 보장
chrome.runtime.onInstalled.addListener(async (details) => {
  log.info("on_installed", `reason=${details.reason}`);
  try {
    const id = await ensureParticipantId();
    log.info("on_installed", `participant_id 확보 완료 (앞 8자리만): ${id.slice(0, 8)}...`);
  } catch (err) {
    log.error("on_installed", "participant_id 생성 실패", err);
  }
});

/**
 * 메시지 라우터.
 * 지원 타입:
 *   - "ping"         : 헬스체크. {ok:true} 응답
 *   - "put_event"    : payload.event 를 IndexedDB에 저장. {ok, error?} 응답
 *   - "flush_upload" : 즉시 업로드 시도 (popup의 "지금 업로드" 버튼). {ok} 응답
 */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  log.debug("on_message", `type=${msg?.type}`);

  if (msg?.type === "ping") {
    sendResponse({ ok: true });
    return false;
  }

  if (msg?.type === "put_event" && msg?.event && typeof msg.event === "object") {
    // 비동기 응답: true 반환 후 sendResponse 호출 보장.
    putEvent(msg.event as Record<string, unknown>)
      .then(() => {
        log.debug("put_event", `ok event_id=${(msg.event as { event_id?: string }).event_id}`);
        sendResponse({ ok: true });
      })
      .catch((err) => {
        log.error("put_event", "저장 실패", err);
        sendResponse({ ok: false, error: String(err) });
      });
    return true; // async sendResponse 사용
  }

  if (msg?.type === "flush_upload") {
    flushNow("manual")
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // async sendResponse 사용
  }

  return false;
});
