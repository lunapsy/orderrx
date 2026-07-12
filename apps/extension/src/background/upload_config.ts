// 역할: 자동 업로드 대상/동작 설정 상수.
// 이 파일만 수정하면 수집 서버를 교체할 수 있다 (코드 로직 무변경).

/**
 * Supabase 프로젝트 REST 엔드포인트.
 * 테이블: orderrx_events, orderrx_consents (RLS: anon INSERT-only)
 */
export const SUPABASE_URL = "https://cjppuaqctoqazzkgtlmz.supabase.co";

/**
 * Supabase publishable key.
 * 공개되어도 되는 키다: RLS 정책상 이 키로는 INSERT만 가능하며,
 * 조회/수정/삭제 정책이 없어 다른 참여자의 데이터를 읽을 수 없다.
 */
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_OX3WSAVGbO6IErS0QUZjXA_QOEcoCDr";

/** 한 번의 flush에서 배치당 업로드할 이벤트 수 */
export const UPLOAD_BATCH_SIZE = 200;

/** 업로드 알람 주기 (분). MV3 chrome.alarms 최소 0.5분. */
export const UPLOAD_PERIOD_MINUTES = 1;

/** popup 미리보기용으로 업로드 로그에 남길 최근 이벤트 요약 개수 */
export const UPLOAD_LOG_RECENT_COUNT = 5;
