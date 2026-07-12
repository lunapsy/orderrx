// 역할: 이벤트 저장용 IndexedDB 래퍼.
// chrome.storage.local(5MB 한도)로는 30 사이트 × 수백 이벤트를 감당 못하므로 IndexedDB 사용.
// schema: DB 1개, object store 1개 (events), keyPath = event_id, secondary index = event_time.

import { createLogger } from "../logging/logger.js";

const log = createLogger("storage.indexed_db");

const DB_NAME = "orderrx_events";
const DB_VERSION = 1;
const STORE = "events";

/**
 * DB를 열고 필요 시 스키마를 생성한다.
 * 모든 호출은 이 Promise를 재사용한다 (재오픈 방지).
 */
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  log.info("open", `DB=${DB_NAME} version=${DB_VERSION}`);
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      log.info("upgrade", "스키마 생성 중");
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "event_id" });
        store.createIndex("by_time", "event_time", { unique: false });
        store.createIndex("by_session", "session_id", { unique: false });
      }
    };
    req.onsuccess = () => {
      log.info("open_success", "DB 오픈 완료");
      resolve(req.result);
    };
    req.onerror = () => {
      log.error("open_error", "DB 오픈 실패", req.error);
      reject(req.error);
    };
  });
  return dbPromise;
}

/**
 * 이벤트 1건을 저장한다. keyPath 충돌 시 덮어쓴다.
 * 호출 전에 redaction이 반드시 적용되어 있어야 한다.
 * @param event 이벤트 객체 (event_id 필수)
 */
export async function putEvent(event: Record<string, unknown>): Promise<void> {
  const db = await openDb();
  log.debug("put", `event_id=${String(event.event_id)}`);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(event);
    tx.oncomplete = () => resolve();
    tx.onerror = () => {
      log.error("put_error", "put 실패", tx.error);
      reject(tx.error);
    };
  });
}

/**
 * 저장된 모든 이벤트를 event_time 오름차순으로 반환한다.
 * "내 데이터 내보내기" 및 popup의 미리보기에서 사용.
 */
export async function getAllEvents(): Promise<Record<string, unknown>[]> {
  const db = await openDb();
  log.debug("get_all", "전체 조회 시작");
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).index("by_time").getAll();
    req.onsuccess = () => {
      log.info("get_all_success", `조회 ${req.result.length}건`);
      resolve(req.result as Record<string, unknown>[]);
    };
    req.onerror = () => {
      log.error("get_all_error", "조회 실패", req.error);
      reject(req.error);
    };
  });
}

/**
 * 이벤트 개수.
 */
export async function countEvents(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * event_time 오름차순으로 최대 limit건을 반환한다. 업로더의 배치 조회용.
 * @param limit 최대 반환 개수
 */
export async function getEventsBatch(limit: number): Promise<Record<string, unknown>[]> {
  const db = await openDb();
  log.debug("get_batch", `limit=${limit}`);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).index("by_time").openCursor();
    const out: Record<string, unknown>[] = [];
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor && out.length < limit) {
        out.push(cursor.value as Record<string, unknown>);
        cursor.continue();
      } else {
        resolve(out);
      }
    };
    req.onerror = () => {
      log.error("get_batch_error", "배치 조회 실패", req.error);
      reject(req.error);
    };
  });
}

/**
 * event_id 목록에 해당하는 이벤트를 삭제한다. 업로드 성공분 정리용.
 * @param eventIds 삭제할 event_id 배열
 */
export async function deleteEvents(eventIds: string[]): Promise<void> {
  if (eventIds.length === 0) return;
  const db = await openDb();
  log.info("delete_batch", `${eventIds.length}건 삭제`);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const id of eventIds) store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => {
      log.error("delete_batch_error", "삭제 실패", tx.error);
      reject(tx.error);
    };
  });
}

/**
 * 모든 이벤트를 삭제한다. popup의 "전체 삭제" 버튼에서 호출.
 */
export async function clearEvents(): Promise<void> {
  const db = await openDb();
  log.warn("clear", "IndexedDB events 전체 삭제");
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
