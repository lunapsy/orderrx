// 역할: DOM 이벤트 → 중립 이벤트 객체 생성.
// 이 모듈만 schema 타입을 import한다. content/popup/background는 이 모듈을 통해서만 이벤트를 만든다.
// 모든 이벤트는 redaction이 적용된 상태로 반환된다.

import { createLogger } from "../logging/logger.js";
import { redactText } from "../redaction/text_patterns.js";
import { canonicalizeUrl, extractHost } from "../redaction/url_canonicalize.js";
import { checkFieldSensitivity, maskFieldName } from "../redaction/field_patterns.js";
import { buildSelector } from "./selector.js";
import { classifyToken, type TokenClass } from "./token_class.js";
import { nextSequence } from "./session.js";

const log = createLogger("events.event_factory");

const SCHEMA_VERSION = "0.1.0";

/**
 * 확장 빌드 버전 (manifest.json의 version).
 * 다중 참여자 환경에서 어떤 빌드가 만든 데이터인지 구분하기 위해 모든 이벤트에 스탬프.
 * 테스트(jsdom)처럼 chrome API가 없는 환경에서는 "unknown".
 */
const APP_VERSION: string = (() => {
  try {
    if (typeof chrome !== "undefined" && chrome.runtime?.getManifest) {
      return chrome.runtime.getManifest().version;
    }
  } catch {
    // ignore — 아래 fallback
  }
  return "unknown";
})();

/** 모든 이벤트가 공유하는 공통 필드 */
interface BaseEvent {
  schema_version: "0.1.0";
  app_version: string;
  event_id: string;
  session_id: string;
  participant_id: string;
  site_id: string;
  page_type: "login" | "search" | "product_detail" | "cart" | "order" | "unknown";
  event_type: string;
  event_time: string;
  upload_status: "local_only" | "uploaded";
  redaction_status: "clean" | "redacted" | "blocked";
  url_canonical: string;
  viewport: { width: number; height: number };
  dom_ready: boolean;
  sequence_number: number;
}

/**
 * 팩토리에 주입되는 실행 컨텍스트.
 * participant_id와 site_id는 호출 측(content script)이 관리.
 */
export interface EventContext {
  participant_id: string;
  site_id: string;
}

/**
 * 공통 필드를 채운다. 모든 event_factory.* 함수가 이 헬퍼를 먼저 호출.
 */
function baseFields(
  ctx: EventContext,
  eventType: string,
  redactionStatus: BaseEvent["redaction_status"]
): BaseEvent {
  const { session_id, sequence_number } = nextSequence();
  return {
    schema_version: SCHEMA_VERSION,
    app_version: APP_VERSION,
    event_id: crypto.randomUUID(),
    session_id,
    participant_id: ctx.participant_id,
    site_id: ctx.site_id,
    page_type: "unknown", // M1은 기본 unknown. M2 adapter가 결정.
    event_type: eventType,
    event_time: new Date().toISOString(),
    upload_status: "local_only",
    redaction_status: redactionStatus,
    url_canonical: canonicalizeUrl(location.href),
    viewport: { width: window.innerWidth, height: window.innerHeight },
    dom_ready: document.readyState === "complete",
    sequence_number,
  };
}

/**
 * page_enter 이벤트 생성.
 * @param ctx 실행 컨텍스트
 * @param referrerSiteId referrer가 허용 도메인이면 해당 site_id, 아니면 null
 */
export function createPageEnterEvent(
  ctx: EventContext,
  referrerSiteId: string | null
): BaseEvent & Record<string, unknown> {
  log.debug("create", "page_enter");
  // 단계 1: title redaction
  const { text: titleRedacted, did_redact } = redactText(document.title, 80);
  const base = baseFields(ctx, "page_enter", did_redact ? "redacted" : "clean");

  // 단계 2: load_duration_ms 근삿값 (performance API)
  let loadDuration = 0;
  try {
    const nav = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (nav) loadDuration = Math.max(0, nav.loadEventEnd - nav.startTime);
  } catch (err) {
    log.warn("load_duration_fail", "performance 측정 실패", err);
  }

  return {
    ...base,
    page_title_redacted: titleRedacted,
    referrer_site_id: referrerSiteId,
    load_duration_ms: loadDuration,
  };
}

/**
 * click 이벤트 생성. 좌표는 절대 저장하지 않는다.
 */
export function createClickEvent(
  ctx: EventContext,
  el: Element,
  modifiers: { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean }
): BaseEvent & Record<string, unknown> {
  log.debug("create", "click");
  const rawText = (el.textContent ?? "").trim();
  const { text: redactedText, did_redact } = redactText(rawText, 40);

  // anchor의 href는 canonicalizeUrl 적용
  let href: string | null = null;
  if (el.tagName.toLowerCase() === "a") {
    const raw = (el as HTMLAnchorElement).href;
    href = raw ? canonicalizeUrl(raw) : null;
  }

  const base = baseFields(ctx, "click", did_redact ? "redacted" : "clean");
  return {
    ...base,
    target_selector: buildSelector(el),
    target_tag: el.tagName.toLowerCase(),
    target_role: el.getAttribute("role"),
    target_text_redacted: redactedText,
    target_href_canonical: href,
    modifier_keys: modifiers,
  };
}

/**
 * field_focus 이벤트 생성.
 *
 * **절대 금지**: 이 함수는 value 매개변수를 받지 않는다. blur 시 별도 updateFieldFocusOnBlur로
 * input_length와 token_class만 업데이트한다. value는 호출 측에서 지역 변수로만 다루고 즉시 폐기.
 */
export function createFieldFocusEvent(
  ctx: EventContext,
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
): BaseEvent & Record<string, unknown> {
  log.debug("create", "field_focus");
  // 단계 1: 민감도 판정
  const labelEl = el.labels && el.labels.length > 0 ? el.labels[0] : null;
  const labelText = labelEl ? labelEl.textContent : null;
  const sens = checkFieldSensitivity(
    el.getAttribute("name"),
    el.id,
    el.getAttribute("autocomplete"),
    labelText
  );

  // 단계 2: password 필드는 값 접근 자체 차단
  const isPassword = (el as HTMLInputElement).type === "password";
  const blocked = sens.is_sensitive || isPassword;

  // 단계 3: label 텍스트 redaction
  //   - blocked 필드(민감 판정 또는 password)의 경우 label 자체가 민감 정보일 수 있으므로
  //     redactText가 개별 패턴을 못 잡아도 무조건 null로 차단한다.
  //   - 일반 필드는 패턴 기반 redaction 결과를 그대로 사용.
  const labelRedacted = blocked
    ? null
    : redactText(labelText ?? null, 40).text || null;

  const base = baseFields(ctx, "field_focus", blocked ? "blocked" : "clean");
  return {
    ...base,
    field_selector: buildSelector(el),
    field_name: blocked ? "[REDACTED]" : el.getAttribute("name") ?? "",
    field_type: (el as HTMLInputElement).type ?? el.tagName.toLowerCase(),
    field_autocomplete: el.getAttribute("autocomplete"),
    field_label_redacted: labelRedacted,
    input_length: blocked ? -1 : 0, // focus 시점은 0, blur에서 갱신. blocked는 -1 고정.
    token_class: (blocked ? "blocked" : "empty") as TokenClass,
    is_sensitive: blocked,
    sensitive_reason: isPassword ? "field_type:password" : sens.reason,
  };
}

/**
 * blur 시 input_length와 token_class를 계산하는 헬퍼.
 * 호출 측은 반환값을 기존 event_focus 이벤트에 병합하거나 새 이벤트로 저장.
 *
 * **value는 이 함수 내부에서만 존재**하고 반환 전에 참조를 놓아야 한다.
 *
 * @param el 필드 요소
 * @param wasBlocked createFieldFocusEvent에서 is_sensitive였는지
 * @returns { input_length, token_class }
 */
export function computeFieldValueStats(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  wasBlocked: boolean
): { input_length: number; token_class: TokenClass } {
  if (wasBlocked) {
    return { input_length: -1, token_class: "blocked" };
  }
  // 지역 스코프에서만 value를 다룬다.
  const value =
    el instanceof HTMLSelectElement ? el.value ?? "" : (el as HTMLInputElement).value ?? "";
  const length = value.length;
  const klass = classifyToken(value);
  // NOTE: 여기서 value 변수는 함수 종료와 함께 GC 대상.
  return { input_length: length, token_class: klass };
}

/**
 * blur 시점 field_focus "update" 이벤트 생성.
 *
 * 왜 별도 함수인가:
 *   - 기존 createFieldFocusEvent는 focus 시점에만 호출되며, input_length=0/token_class=empty로 고정.
 *   - blur 시점에는 computeFieldValueStats 결과로 input_length/token_class를 갱신해야 한다.
 *   - 덮어쓰지 않고 별도 레코드로 저장하여 이력 보존 (training data 품질).
 *
 * content/capture.ts 가 직접 이벤트 객체를 조립하면 baseFields()를 우회하여
 * url_canonical에 raw URL이 들어가는 버그가 발생한다 (실제 발생 사례 있음).
 * 반드시 이 팩토리 경유.
 *
 * @param ctx 실행 컨텍스트
 * @param originalEventId 갱신 대상 field_focus의 event_id
 * @param wasBlocked 원본 field_focus가 blocked였는지
 * @param stats computeFieldValueStats 결과
 */
export function createFieldFocusUpdateEvent(
  ctx: EventContext,
  originalEventId: string,
  wasBlocked: boolean,
  stats: { input_length: number; token_class: TokenClass }
): BaseEvent & Record<string, unknown> {
  log.debug("create", "field_focus_update");
  const base = baseFields(ctx, "field_focus", wasBlocked ? "blocked" : "clean");
  return {
    ...base,
    update_of: originalEventId,
    input_length: stats.input_length,
    token_class: stats.token_class,
  };
}

/**
 * submit 이벤트 생성.
 */
export function createSubmitEvent(
  ctx: EventContext,
  form: HTMLFormElement,
  trigger: "button_click" | "enter_key" | "programmatic"
): BaseEvent & Record<string, unknown> {
  log.debug("create", "submit");
  const fields = Array.from(form.elements).filter(
    (e): e is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
      e instanceof HTMLInputElement ||
      e instanceof HTMLTextAreaElement ||
      e instanceof HTMLSelectElement
  );
  const fieldNames = fields.map((f) => maskFieldName(f.getAttribute("name") ?? ""));
  const base = baseFields(ctx, "submit", "clean");
  return {
    ...base,
    form_selector: buildSelector(form),
    form_action_domain: extractHost(form.action ?? "", location.href),
    field_count: fields.length,
    field_names_redacted: fieldNames,
    submit_trigger: trigger,
  };
}

/**
 * navigate 이벤트 생성.
 */
export function createNavigateEvent(
  ctx: EventContext,
  fromUrl: string,
  toUrl: string,
  navigationType: "link_click" | "form_submit" | "history" | "reload" | "unknown",
  triggerEventId: string | null
): BaseEvent & Record<string, unknown> {
  log.debug("create", "navigate");
  const base = baseFields(ctx, "navigate", "clean");
  return {
    ...base,
    from_url_canonical: canonicalizeUrl(fromUrl),
    to_url_canonical: canonicalizeUrl(toUrl),
    navigation_type: navigationType,
    trigger_event_id: triggerEventId,
  };
}

/**
 * result_rendered 이벤트 생성.
 */
export function createResultRenderedEvent(
  ctx: EventContext,
  container: Element,
  resultTypeGuess: "search_results" | "product_list" | "error_message" | "stock_info" | "other",
  renderDurationMs: number
): BaseEvent & Record<string, unknown> {
  log.debug("create", "result_rendered");
  const base = baseFields(ctx, "result_rendered", "clean");
  return {
    ...base,
    container_selector: buildSelector(container),
    item_count: container.children.length,
    result_type_guess: resultTypeGuess,
    render_duration_ms: Math.max(0, renderDurationMs),
  };
}
