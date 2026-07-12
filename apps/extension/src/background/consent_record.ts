// 역할: 참여 동의(CONSENT.md) 기록의 생성·조회.
// consent_state(수집 ON/OFF 토글)와 구분된다: 동의 기록은 참여 계약의 성립 증거이며,
// 이 기록이 없거나 동의서 버전이 오래되면 수집·업로드가 전면 차단된다.

import { createLogger } from "../logging/logger.js";
import { KEY, getItem, setItem, type ConsentRecord } from "../storage/chrome_storage.js";
import { getParticipantId } from "./participant_id.js";

const log = createLogger("background.consent_record");

/**
 * 현재 배포 중인 동의서(CONSENT.md) 버전.
 * 동의서 내용이 의미 있게 변경되면 여기와 CONSENT.md 문서 버전을 함께 올린다.
 * 버전이 올라가면 기존 참여자에게 재동의 화면이 다시 표시된다.
 */
export const CONSENT_VERSION = "1.0.0";

/**
 * 저장된 동의 기록을 조회한다. 없으면 undefined.
 */
export async function getConsentRecord(): Promise<ConsentRecord | undefined> {
  return getItem<ConsentRecord>(KEY.CONSENT_RECORD);
}

/**
 * 현재 동의서 버전에 대해 유효한 동의가 존재하는지 판정.
 * 구버전 동의서에만 동의한 상태면 false (재동의 필요).
 */
export async function hasValidConsent(): Promise<boolean> {
  const record = await getConsentRecord();
  const valid = record !== undefined && record.consent_version === CONSENT_VERSION;
  log.debug("check", `valid=${valid} recorded=${record?.consent_version ?? "none"}`);
  return valid;
}

/**
 * 동의를 기록한다. popup의 "동의하고 시작" 버튼에서 호출.
 * @returns 저장된 동의 기록
 */
export async function recordConsent(): Promise<ConsentRecord> {
  const pid = (await getParticipantId()) ?? "unknown";
  let appVersion = "unknown";
  try {
    appVersion = chrome.runtime.getManifest().version;
  } catch {
    // 테스트 환경 등 chrome API 부재 시 unknown 유지
  }
  const record: ConsentRecord = {
    consent_version: CONSENT_VERSION,
    agreed_at: new Date().toISOString(),
    app_version: appVersion,
    participant_id: pid,
    uploaded: false,
  };
  await setItem(KEY.CONSENT_RECORD, record);
  log.info("recorded", `version=${CONSENT_VERSION} participant=${pid.slice(0, 8)}…`);
  return record;
}
