// 역할: 수집 이벤트의 자동 업로드와 업로드 성공분의 로컬 삭제.
// 동작: chrome.alarms 주기마다 flushNow() —
//   1) 유효한 참여 동의 없으면 아무것도 하지 않음 (전면 차단)
//   2) 동의 기록이 서버 미전송 상태면 orderrx_consents에 먼저 업로드
//   3) IndexedDB에서 배치 조회 → orderrx_events POST → 성공분 삭제, 빌 때까지 반복
// 실패 시 데이터는 로컬에 그대로 남고 다음 알람에서 재시도된다 (at-least-once,
// 서버 PK(event_id) + ignore-duplicates로 중복은 서버에서 무시).

import { createLogger } from "../logging/logger.js";
import { getEventsBatch, deleteEvents } from "../storage/indexed_db.js";
import { KEY, getItem, setItem } from "../storage/chrome_storage.js";
import { getConsentRecord, hasValidConsent } from "./consent_record.js";
import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  UPLOAD_BATCH_SIZE,
  UPLOAD_LOG_RECENT_COUNT,
} from "./upload_config.js";

const log = createLogger("background.uploader");

/** popup 표시용 업로드 로그. chrome.storage.local(KEY.UPLOAD_LOG)에 저장. */
export interface UploadLog {
  /** 마지막 시도 시각 (ISO 8601) */
  last_attempt_at: string | null;
  /** 마지막 성공 시각 */
  last_success_at: string | null;
  /** 마지막 오류 메시지 (성공 시 null) */
  last_error: string | null;
  /** 지금까지 업로드된 누적 이벤트 수 */
  uploaded_total: number;
  /** 최근 업로드된 이벤트 요약 (미리보기용 메타데이터만) */
  recent: Array<{ event_type: string; event_time: string; redaction_status: string }>;
}

/** flush 동시 실행 방지 플래그 (알람과 수동 트리거가 겹칠 수 있음) */
let flushing = false;

/**
 * Supabase REST에 rows를 INSERT한다.
 *
 * 중복 처리 참고: RLS가 SELECT를 차단하는 구조에서는 PostgREST의
 * resolution=ignore-duplicates(ON CONFLICT DO NOTHING)가 42501로 실패한다
 * (Postgres가 conflict 검사에 SELECT 정책을 요구). 따라서 일반 INSERT를 쓰고,
 * PK 충돌(409)은 호출 측에서 "이미 업로드됨 = 성공"으로 처리한다.
 *
 * @param table 대상 테이블명
 * @param rows 삽입할 행 배열
 * @returns HTTP status (201 = 삽입됨, 409 = 전부/일부 중복)
 */
async function postRows(table: string, rows: Record<string, unknown>[]): Promise<number> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok && res.status !== 409) {
    const body = await res.text().catch(() => "");
    throw new Error(`POST ${table} 실패: HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  return res.status;
}

/**
 * 이벤트 배치를 업로드한다. 배치 전체가 409(중복 포함)면 이벤트별 개별 재전송으로
 * 폴백하고, 개별 409는 성공으로 간주한다 (업로드 후 삭제 직전에 크래시가 나면
 * 같은 이벤트가 재전송될 수 있는데, 서버 PK가 중복을 거부해 주는 정상 경로).
 */
async function uploadEventRows(rows: Record<string, unknown>[]): Promise<void> {
  const status = await postRows("orderrx_events", rows);
  if (status !== 409) return;

  log.warn("upload_conflict", `배치에 중복 존재 — ${rows.length}건 개별 재전송`);
  for (const row of rows) {
    await postRows("orderrx_events", [row]); // 201 또는 409 둘 다 성공
  }
}

/**
 * 중립 이벤트 → orderrx_events 테이블 행 매핑.
 * payload에는 이벤트 전문을 넣되 upload_status를 uploaded로 갱신.
 */
function toEventRow(e: Record<string, unknown>): Record<string, unknown> {
  return {
    event_id: e.event_id,
    participant_id: e.participant_id,
    session_id: e.session_id,
    site_id: e.site_id,
    event_type: e.event_type,
    event_time: e.event_time,
    schema_version: e.schema_version,
    app_version: e.app_version ?? null,
    redaction_status: e.redaction_status,
    payload: { ...e, upload_status: "uploaded" },
  };
}

/**
 * 동의 기록이 서버 미전송 상태면 orderrx_consents에 업로드하고 uploaded=true로 갱신.
 */
async function uploadConsentIfNeeded(): Promise<void> {
  const record = await getConsentRecord();
  if (!record || record.uploaded) return;
  log.info("consent_upload", `version=${record.consent_version}`);
  await postRows("orderrx_consents", [
    {
      participant_id: record.participant_id,
      consent_version: record.consent_version,
      agreed_at: record.agreed_at,
      app_version: record.app_version,
    },
  ]);
  await setItem(KEY.CONSENT_RECORD, { ...record, uploaded: true });
  log.info("consent_upload", "완료");
}

/**
 * 업로드 로그를 읽는다. 없으면 초기값.
 */
export async function getUploadLog(): Promise<UploadLog> {
  const v = await getItem<UploadLog>(KEY.UPLOAD_LOG);
  return (
    v ?? {
      last_attempt_at: null,
      last_success_at: null,
      last_error: null,
      uploaded_total: 0,
      recent: [],
    }
  );
}

/**
 * 대기 중인 이벤트를 전부 업로드하고 성공분을 로컬에서 삭제한다.
 * 어떤 단계에서든 실패하면 로그에 남기고 종료 — 데이터는 보존되어 다음 주기에 재시도.
 */
export async function flushNow(trigger: string): Promise<void> {
  if (flushing) {
    log.debug("flush", "이미 진행 중 — 건너뜀");
    return;
  }
  flushing = true;
  const logRecord = await getUploadLog();
  logRecord.last_attempt_at = new Date().toISOString();

  try {
    // 단계 1: 동의 게이트 — 유효 동의 없으면 업로드 자체 금지
    if (!(await hasValidConsent())) {
      log.debug("flush", "유효한 동의 없음 — 업로드 안 함");
      return;
    }

    // 단계 2: 동의 기록 서버 전송 (1회)
    await uploadConsentIfNeeded();

    // 단계 3: 배치 반복 업로드
    let totalThisRun = 0;
    for (;;) {
      const batch = await getEventsBatch(UPLOAD_BATCH_SIZE);
      if (batch.length === 0) break;

      log.info("flush", `배치 업로드 ${batch.length}건 (trigger=${trigger})`);
      await uploadEventRows(batch.map(toEventRow));

      const ids = batch.map((e) => String(e.event_id));
      await deleteEvents(ids);
      totalThisRun += batch.length;

      // 미리보기 요약 갱신 (메타데이터만)
      logRecord.recent = batch
        .slice(-UPLOAD_LOG_RECENT_COUNT)
        .map((e) => ({
          event_type: String(e.event_type),
          event_time: String(e.event_time),
          redaction_status: String(e.redaction_status),
        }))
        .reverse();
    }

    logRecord.uploaded_total += totalThisRun;
    logRecord.last_success_at = new Date().toISOString();
    logRecord.last_error = null;
    if (totalThisRun > 0) {
      log.info("flush", `완료: ${totalThisRun}건 업로드 후 로컬 삭제`);
    } else {
      log.debug("flush", "업로드할 이벤트 없음");
    }
  } catch (err) {
    logRecord.last_error = String(err);
    log.error("flush_fail", "업로드 실패 — 데이터 보존, 다음 주기 재시도", err);
  } finally {
    await setItem(KEY.UPLOAD_LOG, logRecord);
    flushing = false;
  }
}
