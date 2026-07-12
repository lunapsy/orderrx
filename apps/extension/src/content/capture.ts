// 역할: DOM 이벤트 리스너 등록 및 이벤트 팩토리 호출.
// 저장은 background service worker에 위임 (chrome.runtime.sendMessage).
// 이유: content script의 IndexedDB는 페이지 origin에 격리되어 popup이 접근 불가.
//       background는 extension origin이므로 popup과 동일 DB를 공유.
// 등록하는 이벤트: click, focusin/focusout, submit, popstate, hashchange, DOM mutation(result_rendered heuristic)
//
// 라이프사이클:
//   - startCapture(ctx) 는 CaptureHandle 을 반환한다.
//   - handle.stop() 호출 시 등록한 모든 리스너와 MutationObserver 를 해제한다.
//   - content/index.ts 가 chrome.storage.onChanged 를 받아 consent/allowed_sites 변경 시
//     stop / 재시작을 오케스트레이션한다.

import { createLogger } from "../logging/logger.js";
import {
  createPageEnterEvent,
  createClickEvent,
  createFieldFocusEvent,
  computeFieldValueStats,
  createSubmitEvent,
  createNavigateEvent,
  createResultRenderedEvent,
  createFieldFocusUpdateEvent,
  type EventContext,
} from "../events/event_factory.js";

const log = createLogger("content.capture");

/** 직전 click/submit 이벤트 id를 추적 (navigate의 trigger_event_id 용). */
let lastInteractionEventId: string | null = null;

/**
 * field_focus 이벤트는 focus 시점에 생성하여 저장하고, blur 시점에 value stats로 갱신한다.
 * 갱신을 위해 event_id별 원본 el 참조를 약하게 유지.
 */
const focusedFieldRegistry = new WeakMap<Element, { event_id: string; wasBlocked: boolean }>();

/**
 * 이벤트를 background service worker에 전송하여 저장한다.
 * 실패해도 페이지 동작을 방해하지 않도록 catch.
 *
 * background.index.ts 의 onMessage 핸들러에서 "put_event" 타입을 처리한다.
 */
async function safeSave(event: Record<string, unknown>): Promise<void> {
  try {
    const res = (await chrome.runtime.sendMessage({ type: "put_event", event })) as
      | { ok: boolean; error?: string }
      | undefined;
    if (!res || !res.ok) {
      log.error("save_fail", `background 응답 실패: ${res?.error ?? "no response"}`);
      return;
    }
    log.debug("saved", `event_id=${event.event_id} type=${event.event_type}`);
  } catch (err) {
    log.error("save_fail", "sendMessage 실패", err);
  }
}

/**
 * startCapture 호출자가 받는 핸들. stop()을 호출하면 모든 리스너가 해제된다.
 */
export interface CaptureHandle {
  stop(): void;
}

/**
 * 이벤트 캡처를 시작한다.
 * @param ctx 실행 컨텍스트 (participant_id, site_id)
 * @returns CaptureHandle — stop() 호출 시 모든 리스너 해제
 */
export function startCapture(ctx: EventContext): CaptureHandle {
  log.info("start", `site_id=${ctx.site_id}`);

  // 이 startCapture 호출 동안 등록한 모든 cleanup 함수 모음.
  // stop() 시 역순으로 호출하지는 않고 단순 순회 — 리스너 간 의존성 없음.
  const cleanups: Array<() => void> = [];

  /**
   * addEventListener + cleanup 등록을 한 번에 처리하는 헬퍼.
   * 모든 리스너 등록은 이 함수를 거쳐야 stop() 시 해제된다.
   */
  const on = (
    target: EventTarget,
    type: string,
    fn: EventListener,
    options?: AddEventListenerOptions
  ): void => {
    target.addEventListener(type, fn, options);
    cleanups.push(() => target.removeEventListener(type, fn, options));
  };

  // ───── page_enter ─────
  try {
    const ev = createPageEnterEvent(ctx, null);
    void safeSave(ev);
  } catch (err) {
    log.error("page_enter_fail", "page_enter 생성 실패", err);
  }

  // ───── click ─────
  on(
    document,
    "click",
    ((e: Event) => {
      const me = e as MouseEvent;
      const target = me.target as Element | null;
      if (!target) return;
      try {
        const ev = createClickEvent(ctx, target, {
          ctrl: me.ctrlKey,
          shift: me.shiftKey,
          alt: me.altKey,
          meta: me.metaKey,
        });
        lastInteractionEventId = String(ev.event_id);
        void safeSave(ev);
      } catch (err) {
        log.error("click_fail", "click 생성 실패", err);
      }
    }) as EventListener,
    { capture: true }
  );

  // ───── focusin ─────
  on(
    document,
    "focusin",
    ((e: Event) => {
      const t = e.target as Element | null;
      if (
        !(
          t instanceof HTMLInputElement ||
          t instanceof HTMLTextAreaElement ||
          t instanceof HTMLSelectElement
        )
      ) {
        return;
      }
      try {
        const ev = createFieldFocusEvent(ctx, t);
        focusedFieldRegistry.set(t, {
          event_id: String(ev.event_id),
          wasBlocked: Boolean(ev.is_sensitive),
        });
        void safeSave(ev);
      } catch (err) {
        log.error("focusin_fail", "field_focus 생성 실패", err);
      }
    }) as EventListener,
    { capture: true }
  );

  // ───── focusout (blur) : value stats 갱신 ─────
  on(
    document,
    "focusout",
    ((e: Event) => {
      const t = e.target as Element | null;
      if (
        !(
          t instanceof HTMLInputElement ||
          t instanceof HTMLTextAreaElement ||
          t instanceof HTMLSelectElement
        )
      ) {
        return;
      }
      const reg = focusedFieldRegistry.get(t);
      if (!reg) return;
      try {
        const stats = computeFieldValueStats(t, reg.wasBlocked);
        // blur 시점에는 "update" 성격의 작은 레코드를 별도 저장.
        // (기존 field_focus 레코드 덮어쓰기보다 이력 보존이 training data 품질에 유리)
        // 반드시 factory 경유 — 직접 객체 조립 시 url_canonical 에 raw URL 이 섞여
        // jsessionid/phone 같은 쿼리 파라미터가 유출된 과거 버그 있음.
        const ev = createFieldFocusUpdateEvent(ctx, reg.event_id, reg.wasBlocked, stats);
        void safeSave(ev);
      } catch (err) {
        log.error("focusout_fail", "field value stats 실패", err);
      }
    }) as EventListener,
    { capture: true }
  );

  // ───── submit ─────
  on(
    document,
    "submit",
    ((e: Event) => {
      const form = e.target as HTMLFormElement | null;
      if (!(form instanceof HTMLFormElement)) return;
      try {
        const ev = createSubmitEvent(ctx, form, "button_click");
        lastInteractionEventId = String(ev.event_id);
        void safeSave(ev);
      } catch (err) {
        log.error("submit_fail", "submit 생성 실패", err);
      }
    }) as EventListener,
    { capture: true }
  );

  // ───── navigate (popstate + hashchange) ─────
  let prevUrl = location.href;
  const onNav = (navType: "history" | "reload"): void => {
    try {
      const ev = createNavigateEvent(ctx, prevUrl, location.href, navType, lastInteractionEventId);
      prevUrl = location.href;
      void safeSave(ev);
    } catch (err) {
      log.error("nav_fail", "navigate 생성 실패", err);
    }
  };
  on(window, "popstate", (() => onNav("history")) as EventListener);
  // hashchange: SPA 사이트가 hash routing 만 사용하는 경우에도 navigate 이벤트를 잡기 위해 추가.
  // popstate 와 동일하게 history 타입으로 분류 (둘 다 같은 페이지 내 라우팅).
  on(window, "hashchange", (() => onNav("history")) as EventListener);

  // ───── result_rendered : 단순 heuristic MutationObserver ─────
  const HEURISTIC_SELECTORS = [
    '[class*="result"]',
    '[class*="list"]',
    '[role="listbox"]',
    '[role="alert"]',
  ];
  const renderTsByContainer = new WeakMap<Element, number>();
  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of Array.from(m.addedNodes)) {
        if (!(node instanceof Element)) continue;
        for (const sel of HEURISTIC_SELECTORS) {
          const container = node.matches(sel) ? node : node.querySelector(sel);
          if (!container) continue;
          const firstSeen = renderTsByContainer.get(container) ?? performance.now();
          renderTsByContainer.set(container, firstSeen);
          const renderDuration = performance.now() - firstSeen;
          const guess =
            sel.includes("alert")
              ? "error_message"
              : sel.includes("list") || sel.includes("listbox")
                ? "product_list"
                : "search_results";
          try {
            const ev = createResultRenderedEvent(ctx, container, guess as any, renderDuration);
            void safeSave(ev);
          } catch (err) {
            log.error("result_rendered_fail", "생성 실패", err);
          }
        }
      }
    }
  });
  try {
    mo.observe(document.body, { childList: true, subtree: true });
    cleanups.push(() => mo.disconnect());
  } catch (err) {
    log.warn("mutation_observer_fail", "MutationObserver 등록 실패", err);
  }

  log.info("start_done", `모든 리스너 등록 완료 (cleanup ${cleanups.length}개)`);

  return {
    /**
     * 등록된 모든 리스너와 MutationObserver 를 해제한다.
     * 멱등(idempotent) — 두 번 호출해도 안전하지만 cleanups 는 1회만 처리된다.
     */
    stop(): void {
      log.info("stop", `리스너 ${cleanups.length}개 해제 시작`);
      let failCount = 0;
      for (const fn of cleanups) {
        try {
          fn();
        } catch (err) {
          failCount += 1;
          log.warn("cleanup_fail", "리스너 해제 중 예외", err);
        }
      }
      cleanups.length = 0;
      log.info("stop", `해제 완료 (실패 ${failCount}건)`);
    },
  };
}
