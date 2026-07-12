// 역할: popup UI 초기화와 이벤트 바인딩.
// popup은 service worker와 같은 확장 컨텍스트에서 실행되므로 background 모듈을 직접 import 가능.

import { createLogger } from "../logging/logger.js";
import { getParticipantId } from "../background/participant_id.js";
import {
  getConsentState,
  setConsentState,
  getAllowedSites,
  addAllowedSite,
  removeAllowedSite,
  toggleAllowedSite,
  normalizeDomain,
  MAX_ALLOWED_SITES,
} from "../background/settings.js";
import { originsForDomain } from "../background/script_registry.js";
import { countEvents, getAllEvents, clearEvents } from "../storage/indexed_db.js";
import type { AllowedSite } from "../storage/chrome_storage.js";
import {
  CONSENT_VERSION,
  getConsentRecord,
  hasValidConsent,
  recordConsent,
} from "../background/consent_record.js";
import { getUploadLog } from "../background/uploader.js";

const log = createLogger("popup.main");

/**
 * 요소 조회 헬퍼. 없으면 throw.
 */
function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`popup element not found: ${id}`);
  return el;
}

/**
 * 참여자 ID 표시.
 */
async function renderParticipantId(): Promise<void> {
  const pid = await getParticipantId();
  $("pid").textContent = pid ?? "(설치 직후 — 잠시 후 다시 열어주세요)";
}

/**
 * consent 토글과 상태 표시.
 */
async function renderConsent(): Promise<void> {
  const state = await getConsentState();
  const cb = $("consent-toggle") as HTMLInputElement;
  cb.checked = state === "active";
  $("consent-state").textContent = state === "active" ? "(수집 중)" : "(일시 정지)";
}

/**
 * 도메인 목록을 렌더링.
 */
async function renderSites(): Promise<void> {
  const sites = await getAllowedSites();
  const container = $("sites-list");
  container.innerHTML = "";
  for (const s of sites) {
    const row = document.createElement("div");
    row.className = "site-row";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = s.enabled;
    cb.addEventListener("change", async () => {
      await toggleAllowedSite(s.domain, cb.checked);
      log.info("toggled", s.domain);
      await syncScripts();
    });
    const label = document.createElement("span");
    label.className = "site-domain";
    label.textContent = s.domain;
    const rm = document.createElement("button");
    rm.textContent = "삭제";
    rm.addEventListener("click", async () => {
      await removeAllowedSite(s.domain);
      await syncScripts();
      await renderSites();
    });
    row.appendChild(cb);
    row.appendChild(label);
    row.appendChild(rm);
    container.appendChild(row);
  }
  $("site-count").textContent = String(sites.length);
}

/**
 * 이벤트 카운트와 최근 미리보기.
 */
async function renderEvents(): Promise<void> {
  const count = await countEvents();
  $("event-count").textContent = String(count);
  const all = await getAllEvents();
  const recent = all.slice(-5).reverse();
  $("recent-events").innerHTML = recent
    .map(
      (e) =>
        `<div>· ${String(e.event_type)} @ ${String(e.event_time).slice(11, 19)} (${String(
          e.redaction_status
        )})</div>`
    )
    .join("");
}

/**
 * 업로드 로그 표시: 누적 업로드 수, 마지막 성공/오류, 최근 업로드 요약.
 */
async function renderUploadLog(): Promise<void> {
  const uploadLog = await getUploadLog();
  $("upload-total").textContent = String(uploadLog.uploaded_total);
  const statusEl = $("upload-status");
  if (uploadLog.last_error) {
    statusEl.textContent = `마지막 시도 실패 — 데이터는 보존되며 1분 내 자동 재시도됩니다.`;
    statusEl.classList.add("danger");
  } else if (uploadLog.last_success_at) {
    statusEl.textContent = `마지막 업로드: ${uploadLog.last_success_at.slice(0, 19).replace("T", " ")}`;
    statusEl.classList.remove("danger");
  } else {
    statusEl.textContent = "아직 업로드된 데이터가 없습니다.";
  }
  $("upload-recent").innerHTML = uploadLog.recent
    .map((e) => `<div>↑ ${e.event_type} @ ${e.event_time.slice(11, 19)} (${e.redaction_status})</div>`)
    .join("");
}

/**
 * 도메인들의 host permission을 요청한다 (반드시 사용자 제스처 컨텍스트에서 호출).
 * 0.3.0부터 content script는 허가된 도메인에만 동적 주입되므로,
 * 권한이 거부되면 해당 도메인에서는 수집이 불가능하다.
 * @returns granted 여부
 */
async function requestSitePermissions(domains: string[]): Promise<boolean> {
  const origins = domains.flatMap((d) => originsForDomain(d));
  try {
    const granted = await chrome.permissions.request({ origins });
    log.info("perm_request", `granted=${granted} domains=${domains.join(",")}`);
    return granted;
  } catch (err) {
    log.error("perm_request_fail", "권한 요청 실패", err);
    return false;
  }
}

/**
 * background에 동적 content script 재동기화를 요청.
 */
async function syncScripts(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: "sync_scripts" });
  } catch (err) {
    log.error("sync_fail", "sync_scripts 메시지 실패", err);
  }
}

/**
 * 도메인 목록 JSON 파일 다운로드.
 */
function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  log.info("downloaded", filename);
}

/**
 * 이벤트 핸들러 일괄 바인딩.
 */
function bindEvents(): void {
  // consent
  $("consent-toggle").addEventListener("change", async (e) => {
    const next = (e.target as HTMLInputElement).checked ? "active" : "paused";
    await setConsentState(next);
    await renderConsent();
  });

  // 도메인 추가: 권한 요청(사용자 제스처) → 저장 → content script 동기화
  $("add-domain-btn").addEventListener("click", async () => {
    const input = $("new-domain") as HTMLInputElement;
    const v = input.value.trim();
    if (!v) return;
    const domain = normalizeDomain(v);
    if (!domain) {
      alert("도메인 형식을 확인해 주세요.");
      return;
    }
    const granted = await requestSitePermissions([domain]);
    if (!granted) {
      alert("사이트 접근 권한이 거부되어 이 도메인에서는 수집할 수 없습니다.");
      return;
    }
    const ok = await addAllowedSite(domain);
    if (!ok) {
      alert(`도메인 추가 실패. 최대 ${MAX_ALLOWED_SITES}개까지 등록 가능합니다.`);
    }
    input.value = "";
    await syncScripts();
    await renderSites();
  });

  // 도메인 목록 내보내기
  $("export-sites-btn").addEventListener("click", async () => {
    const sites = await getAllowedSites();
    downloadJson("orderrx-allowed-sites.json", sites);
  });

  // 도메인 목록 가져오기
  $("import-sites-btn").addEventListener("click", () => {
    ($("import-sites-file") as HTMLInputElement).click();
  });
  $("import-sites-file").addEventListener("change", async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as AllowedSite[];
      if (!Array.isArray(parsed)) throw new Error("not an array");
      const domains = parsed
        .filter((s) => typeof s.domain === "string")
        .map((s) => normalizeDomain(s.domain))
        .filter(Boolean);
      if (domains.length === 0) throw new Error("no valid domains");
      // 목록 전체 권한을 한 번의 제스처로 요청 (도메인별 반복 프롬프트 방지)
      const granted = await requestSitePermissions(domains);
      if (!granted) {
        alert("사이트 접근 권한이 거부되어 가져오기를 중단합니다.");
        return;
      }
      for (const d of domains) await addAllowedSite(d);
      await syncScripts();
      await renderSites();
    } catch (err) {
      log.error("import_fail", "파일 파싱 실패", err);
      alert("JSON 파일 파싱 실패");
    }
  });

  // 이벤트 내보내기
  $("export-events-btn").addEventListener("click", async () => {
    const pid = (await getParticipantId()) ?? "unknown";
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const all = await getAllEvents();
    downloadJson(`orderRx-events-${pid}-${ts}.json`, all);
  });

  // 전체 삭제
  $("clear-events-btn").addEventListener("click", async () => {
    if (!confirm("수집된 이벤트를 모두 삭제합니다. 계속할까요?")) return;
    await clearEvents();
    await renderEvents();
  });

  // 지금 업로드 (service worker에 위임 — 업로드 로직 단일 진입점 유지)
  $("flush-upload-btn").addEventListener("click", async () => {
    const btn = $("flush-upload-btn") as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = "업로드 중…";
    try {
      await chrome.runtime.sendMessage({ type: "flush_upload" });
    } catch (err) {
      log.error("flush_fail", "flush_upload 메시지 실패", err);
    }
    btn.disabled = false;
    btn.textContent = "지금 업로드";
    await Promise.all([renderEvents(), renderUploadLog()]);
  });
}

/**
 * 동의 게이트 렌더링.
 * 유효한 동의 기록이 없으면 동의 섹션만 표시하고 본 UI를 숨긴다.
 * 동의 완료 시 기록 저장 후 본 UI로 전환.
 */
async function renderConsentGate(): Promise<boolean> {
  const agreed = await hasValidConsent();
  $("consent-gate").style.display = agreed ? "none" : "block";
  $("main-ui").style.display = agreed ? "block" : "none";
  if (agreed) {
    const record = await getConsentRecord();
    if (record) {
      $("consent-info").textContent =
        `동의서 v${record.consent_version} — ${record.agreed_at.slice(0, 10)} 동의함`;
    }
    return true;
  }

  const check = $("consent-agree-check") as HTMLInputElement;
  const btn = $("consent-agree-btn") as HTMLButtonElement;
  check.addEventListener("change", () => {
    btn.disabled = !check.checked;
  });
  btn.addEventListener("click", async () => {
    if (!check.checked) return;
    const record = await recordConsent();
    log.info("consent_agreed", `version=${record.consent_version}`);
    // popup 전체를 다시 로드해 본 UI 초기화(main)가 처음부터 실행되게 한다.
    location.reload();
  });
  log.info("consent_gate", `동의 필요 (요구 버전=${CONSENT_VERSION})`);
  return false;
}

/**
 * 진입점.
 */
async function main(): Promise<void> {
  log.info("boot", "popup 렌더 시작");
  const agreed = await renderConsentGate();
  if (!agreed) {
    log.info("boot", "동의 대기 — 본 UI 렌더 보류");
    return;
  }
  bindEvents();
  await Promise.all([
    renderParticipantId(),
    renderConsent(),
    renderSites(),
    renderEvents(),
    renderUploadLog(),
  ]);
  log.info("boot", "popup 렌더 완료");
}

main().catch((err) => {
  log.error("boot_fail", "popup 초기화 실패", err);
});
