// 역할: 세션 단위 rotating pseudonymous ID 생성과 sequence_number 관리.
// 세션 회전 조건: 탭 단위 또는 30분 이상 비활성.
// 참여자 ID와 별도 (참여자 ID는 영구, 세션 ID는 짧은 주기로 회전).

import { createLogger } from "../logging/logger.js";

const log = createLogger("events.session");

const SESSION_INACTIVITY_MS = 30 * 60 * 1000; // 30분

interface SessionState {
  session_id: string;
  last_event_at: number;
  sequence_number: number;
}

/** content script 인스턴스 내 세션 상태 (탭 단위). */
let state: SessionState | null = null;

/**
 * 새 세션을 강제로 시작한다.
 * @returns 새로 생성된 session_id
 */
function startNewSession(): string {
  const id = crypto.randomUUID();
  state = {
    session_id: id,
    last_event_at: Date.now(),
    sequence_number: 0,
  };
  log.info("new_session", `session_id=${id}`);
  return id;
}

/**
 * 현재 유효한 세션을 반환한다. 없거나 비활성 초과 시 새 세션 시작.
 * 동시에 sequence_number를 1 증가시켜 해당 이벤트에 할당할 번호를 반환.
 */
export function nextSequence(): { session_id: string; sequence_number: number } {
  const now = Date.now();
  if (!state || now - state.last_event_at > SESSION_INACTIVITY_MS) {
    startNewSession();
  }
  // non-null 보장 (startNewSession이 state를 설정)
  state!.sequence_number += 1;
  state!.last_event_at = now;
  return {
    session_id: state!.session_id,
    sequence_number: state!.sequence_number,
  };
}
