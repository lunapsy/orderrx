// 역할: chrome.storage.local 래퍼. 참여자 ID, consent 상태, 도메인 목록 등 "설정"을 저장.
// 이벤트 데이터는 저장하지 않는다 (이벤트는 indexed_db.ts).

import { createLogger } from "../logging/logger.js";

const log = createLogger("storage.chrome_storage");

/** 저장 키 상수. 오타 방지를 위해 모두 여기 정의. */
export const KEY = {
  PARTICIPANT_ID: "participant_id",
  CONSENT_STATE: "consent_state",
  CONSENT_RECORD: "consent_record",
  ALLOWED_SITES: "allowed_sites",
  INSTALLED_AT: "installed_at",
  UPLOAD_LOG: "upload_log",
} as const;

/** consent 상태 (수집 ON/OFF 토글) */
export type ConsentState = "paused" | "active";

/**
 * 참여 동의 기록 (CONSENT.md 기반 명시적 동의).
 * consent_state 토글과 별개 — 이 기록이 없으면 수집·업로드 자체가 차단된다.
 */
export interface ConsentRecord {
  /** 동의한 동의서 문서 버전 (CONSENT.md의 문서 버전) */
  consent_version: string;
  /** 동의 시각 (ISO 8601) */
  agreed_at: string;
  /** 동의 시점의 확장 버전 */
  app_version: string;
  /** 동의한 참여자 ID */
  participant_id: string;
  /** 서버 consents 테이블 업로드 완료 여부 */
  uploaded: boolean;
}

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
