// 역할: DOM 요소로부터 안정적인 CSS selector 문자열을 생성한다.
// 우선순위: id → data-* 속성 → tag:nth-of-type 체인 (최대 5단계)
// 좌표는 절대 사용 금지.

import { createLogger } from "../logging/logger.js";

const log = createLogger("events.selector");

const MAX_DEPTH = 5;

/**
 * CSS.escape 안전 래퍼.
 * 브라우저/Chrome MV3 환경에는 글로벌 CSS 객체가 있지만, 테스트 환경(jsdom)에는 없을 수 있다.
 * fallback은 CSS spec(https://drafts.csswg.org/cssom/#serialize-an-identifier)을 단순화한 구현으로,
 * 알파벳/숫자/하이픈/언더스코어/유니코드 문자만 통과시키고 그 외는 \HEX 형태로 이스케이프한다.
 * @param ident CSS 식별자 또는 속성값
 */
function safeCssEscape(ident: string): string {
  const g = globalThis as unknown as { CSS?: { escape?: (s: string) => string } };
  if (g.CSS && typeof g.CSS.escape === "function") {
    return g.CSS.escape(ident);
  }
  // 단순 fallback: 안전 문자(A-Za-z0-9_-, U+0080 이상)는 그대로, 나머지는 \코드포인트로
  let out = "";
  for (const ch of ident) {
    const code = ch.codePointAt(0)!;
    const isSafe =
      (code >= 0x30 && code <= 0x39) || // 0-9
      (code >= 0x41 && code <= 0x5a) || // A-Z
      (code >= 0x61 && code <= 0x7a) || // a-z
      code === 0x2d || // -
      code === 0x5f || // _
      code >= 0x80; // 비ASCII는 그대로
    out += isSafe ? ch : `\\${code.toString(16)} `;
  }
  return out;
}

/**
 * 주어진 요소의 안정적인 CSS selector를 생성한다.
 * @param el 대상 요소
 * @returns CSS selector 문자열
 */
export function buildSelector(el: Element): string {
  // 단계 1: id가 있으면 id만으로 충분
  if (el.id) {
    log.debug("strategy", "id");
    return `#${safeCssEscape(el.id)}`;
  }

  // 단계 2: data-* 속성이 있으면 우선 사용
  const dataAttr = Array.from(el.attributes).find((a) => a.name.startsWith("data-"));
  if (dataAttr) {
    log.debug("strategy", `data-attr=${dataAttr.name}`);
    return `${el.tagName.toLowerCase()}[${dataAttr.name}="${safeCssEscape(dataAttr.value)}"]`;
  }

  // 단계 3: tag:nth-of-type 체인
  log.debug("strategy", "nth-chain");
  const parts: string[] = [];
  let cur: Element | null = el;
  let depth = 0;
  while (cur && cur.nodeType === Node.ELEMENT_NODE && depth < MAX_DEPTH) {
    const tag = cur.tagName.toLowerCase();
    const parent = cur.parentElement;
    if (!parent) {
      parts.unshift(tag);
      break;
    }
    const siblings = Array.from(parent.children).filter(
      (c) => c.tagName === cur!.tagName
    );
    const index = siblings.indexOf(cur) + 1;
    parts.unshift(`${tag}:nth-of-type(${index})`);
    cur = parent;
    depth += 1;
  }
  return parts.join(" > ");
}
