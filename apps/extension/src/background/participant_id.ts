// 역할: 설치 시점 1회 participant_id 생성. 이후 재생성 금지.
// 저장 위치: chrome.storage.local

import { createLogger } from "../logging/logger.js";
import { KEY, getItem, setItem } from "../storage/chrome_storage.js";

const log = createLogger("background.participant_id");

/**
 * 기존 participant_id를 반환하거나, 없으면 1회 생성 후 저장.
 * onInstalled 리스너와 popup 초기화 양쪽에서 호출되어도 안전.
 */
export async function ensureParticipantId(): Promise<string> {
  log.debug("check", "기존 participant_id 조회");
  const existing = await getItem<string>(KEY.PARTICIPANT_ID);
  if (existing && typeof existing === "string" && existing.length > 0) {
    log.debug("found", "기존 ID 사용");
    return existing;
  }

  const fresh = crypto.randomUUID();
  log.info("create", `새 participant_id 생성 (UUID v4)`);
  await setItem(KEY.PARTICIPANT_ID, fresh);
  await setItem(KEY.INSTALLED_AT, new Date().toISOString());
  return fresh;
}

/**
 * popup 표시용 getter. 없으면 null.
 */
export async function getParticipantId(): Promise<string | null> {
  const v = await getItem<string>(KEY.PARTICIPANT_ID);
  return typeof v === "string" ? v : null;
}
