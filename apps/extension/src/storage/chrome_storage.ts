// 역할: chrome.storage.local 래퍼. 참여자 ID, consent 상태, 도메인 목록 등 "설정"을 저장.
// 이벤트 데이터는 저장하지 않는다 (이벤트는 indexed_db.ts).

import { createLogger } from "../logging/logger.js";

const log = createLogger("storage.chrome_storage");

/** 저장 키 상수. 오타 방지를 위해 모두 여기 정의. */
export const KEY = {
  PARTICIPANT_ID: "participant_id",
  CONSENT_STATE: "consent_state",
  ALLOWED_SITES: "allowed_sites",
  INSTALLED_AT: "installed_at",
} as const;

/** consent 상태 */
export type ConsentState = "paused" | "active";

/** 도메인 등록 항목 */
export interface AllowedSite {
  domain: string;
  enabled: boolean;
  added_at: string;
}

/**
 * 단일 키를 읽는다. 존재하지 않으면 undefined.
 * @param key 키 이름
 */
export async function getItem<T>(key: string): Promise<T | undefined> {
  log.debug("get", `key=${key}`);
  const raw = await chrome.storage.local.get(key);
  return raw[key] as T | undefined;
}

/**
 * 단일 키를 쓴다.
 * @param key 키 이름
 * @param value 값
 */
export async function setItem<T>(key: string, value: T): Promise<void> {
  log.debug("set", `key=${key}`);
  await chrome.storage.local.set({ [key]: value });
}

/**
 * 단일 키를 삭제한다.
 * @param key 키 이름
 */
export async function removeItem(key: string): Promise<void> {
  log.debug("remove", `key=${key}`);
  await chrome.storage.local.remove(key);
}

/**
 * 모든 설정을 삭제한다. "전체 삭제" 버튼에서 호출.
 */
export async function clearAll(): Promise<void> {
  log.warn("clear_all", "chrome.storage.local 전체 삭제");
  await chrome.storage.local.clear();
}
