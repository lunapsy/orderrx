// 역할: event_factory 의 모든 산출물이 금지 필드/원본 민감값을 포함하지 않음을 검증.
// DoD: solo_milestones.md M1 #6 — "민감 입력 시 이벤트에 원본이 단 한 글자도 포함되지 않음".
//
// 검증 전략:
//   1) 각 factory를 다양한 민감/일반 입력으로 호출
//   2) 반환 객체를 JSON.stringify 후 금지 토큰 부재 검사
//   3) password / 민감 필드명일 때 redaction_status === "blocked"

import { describe, it, expect, beforeEach } from "vitest";
import {
  createPageEnterEvent,
  createClickEvent,
  createFieldFocusEvent,
  computeFieldValueStats,
  createSubmitEvent,
  createNavigateEvent,
  createResultRenderedEvent,
  type EventContext,
} from "../../src/events/event_factory.js";

const CTX: EventContext = {
  participant_id: "11111111-1111-4111-8111-111111111111",
  site_id: "example-pharm.co.kr",
};

/**
 * 절대 금지 토큰 — 어떤 이벤트 객체에도 출현하면 안 됨.
 * 테스트 입력에 사용하는 모든 가짜 민감값을 모아둔다.
 */
const FORBIDDEN_TOKENS = [
  "P@ssw0rd!",                  // password value
  "supersecretpwd",              // password value 2
  "901011-1234567",              // RRN
  "9010111234567",
  "010-1234-5678",               // phone
  "01012345678",
  "user@secret.com",             // email
  "4111-1111-1111-1111",         // card
  "4111111111111111",
  "환자홍길동",                    // patient name
  "주민등록번호1234567",           // RRN label content
  "ABCDEF123456",                // session token
  "secret-api-key-zzz",
];

/** 객체 직렬화 후 금지 토큰 미포함 단언 */
function expectNoForbidden(obj: unknown) {
  const json = JSON.stringify(obj);
  for (const tok of FORBIDDEN_TOKENS) {
    expect(json, `forbidden token leaked: ${tok}`).not.toContain(tok);
  }
}

beforeEach(() => {
  document.body.innerHTML = "";
  document.title = "주문 - example pharm";
});

describe("createPageEnterEvent", () => {
  it("기본 필드 채움 + 금지 토큰 없음", () => {
    const ev = createPageEnterEvent(CTX, null);
    expect(ev.event_type).toBe("page_enter");
    expect(ev.schema_version).toBe("0.1.0");
    // app_version은 항상 존재해야 함. chrome API가 없는 테스트 환경에서는 "unknown".
    expect(typeof ev.app_version).toBe("string");
    expect((ev.app_version as string).length).toBeGreaterThan(0);
    expect(ev.participant_id).toBe(CTX.participant_id);
    expect(ev.url_canonical).toContain("example-pharm.co.kr");
    expectNoForbidden(ev);
  });

  it("title에 민감정보가 들어가도 redaction 적용", () => {
    document.title = "주문 010-1234-5678 user@secret.com";
    const ev = createPageEnterEvent(CTX, null);
    expectNoForbidden(ev);
    expect(ev.redaction_status).toBe("redacted");
  });
});

describe("createClickEvent", () => {
  it("anchor href와 textContent 둘 다 redacted", () => {
    const a = document.createElement("a");
    a.href = "https://example-pharm.co.kr/u?phone=010-1234-5678";
    a.textContent = "연락처 010-1234-5678";
    document.body.appendChild(a);

    const ev = createClickEvent(CTX, a, {
      ctrl: false, shift: false, alt: false, meta: false,
    });
    expectNoForbidden(ev);
    expect(ev.target_tag).toBe("a");
  });
});

describe("createFieldFocusEvent — 민감 필드 차단", () => {
  it("password 필드: redaction_status=blocked, name=[REDACTED], length=-1", () => {
    const input = document.createElement("input");
    input.type = "password";
    input.name = "user_password";
    input.id = "pwd";
    input.value = "P@ssw0rd!";
    document.body.appendChild(input);

    const ev = createFieldFocusEvent(CTX, input);
    expect(ev.redaction_status).toBe("blocked");
    expect(ev.field_name).toBe("[REDACTED]");
    expect(ev.input_length).toBe(-1);
    expect(ev.token_class).toBe("blocked");
    expect(ev.is_sensitive).toBe(true);
    expectNoForbidden(ev);
  });

  it("일반 필드명이지만 label이 민감하면 blocked", () => {
    const input = document.createElement("input");
    input.type = "text";
    input.name = "f1";
    input.id = "f1";
    const label = document.createElement("label");
    label.htmlFor = "f1";
    label.textContent = "주민등록번호1234567";
    document.body.appendChild(label);
    document.body.appendChild(input);

    const ev = createFieldFocusEvent(CTX, input);
    expect(ev.is_sensitive).toBe(true);
    expect(ev.redaction_status).toBe("blocked");
    expectNoForbidden(ev);
  });

  it("일반 검색 필드: clean, name 노출 OK", () => {
    const input = document.createElement("input");
    input.type = "text";
    input.name = "search_query";
    document.body.appendChild(input);

    const ev = createFieldFocusEvent(CTX, input);
    expect(ev.is_sensitive).toBe(false);
    expect(ev.redaction_status).toBe("clean");
    expect(ev.field_name).toBe("search_query");
    expectNoForbidden(ev);
  });
});

describe("computeFieldValueStats", () => {
  it("blocked인 필드는 값 접근 자체 안 함 (-1, blocked)", () => {
    const input = document.createElement("input");
    input.type = "password";
    input.value = "supersecretpwd";
    const r = computeFieldValueStats(input, true);
    expect(r.input_length).toBe(-1);
    expect(r.token_class).toBe("blocked");
    expectNoForbidden(r);
  });

  it("일반 필드는 길이/클래스만 반환, 값 노출 없음", () => {
    const input = document.createElement("input");
    input.type = "text";
    input.value = "타이레놀500";
    const r = computeFieldValueStats(input, false);
    expect(r.input_length).toBe(7);
    expect(r.token_class).toBe("korean_mixed");
    // 결과 자체는 값 미포함이 자명하지만, 형태 단언
    expect(JSON.stringify(r)).not.toContain("타이레놀");
  });
});

describe("createSubmitEvent", () => {
  it("필드명은 maskFieldName으로 처리 + 금지 토큰 없음", () => {
    const form = document.createElement("form");
    form.action = "https://example-pharm.co.kr/submit";
    const u = document.createElement("input");
    u.name = "username";
    const p = document.createElement("input");
    p.type = "password";
    p.name = "user_password";
    p.value = "P@ssw0rd!";
    form.appendChild(u);
    form.appendChild(p);
    document.body.appendChild(form);

    const ev = createSubmitEvent(CTX, form, "button_click");
    expect(ev.field_count).toBe(2);
    expect(ev.field_names_redacted).toContain("username");
    expect(ev.field_names_redacted).toContain("[REDACTED]");
    expect(ev.form_action_domain).toBe("example-pharm.co.kr");
    expectNoForbidden(ev);
  });
});

describe("createNavigateEvent", () => {
  it("from/to URL 모두 canonicalize 및 블랙리스트 제거", () => {
    const ev = createNavigateEvent(
      CTX,
      "https://example-pharm.co.kr/a?jsessionid=ABCDEF123456",
      "https://example-pharm.co.kr/b?phone=010-1234-5678",
      "link_click",
      null
    );
    expect(ev.from_url_canonical).not.toContain("jsessionid");
    expect(ev.to_url_canonical).not.toContain("010-1234-5678");
    expectNoForbidden(ev);
  });
});

describe("createResultRenderedEvent", () => {
  it("item_count 정확 + 금지 토큰 없음", () => {
    const c = document.createElement("ul");
    for (let i = 0; i < 3; i++) {
      const li = document.createElement("li");
      li.textContent = `item ${i}`;
      c.appendChild(li);
    }
    document.body.appendChild(c);

    const ev = createResultRenderedEvent(CTX, c, "search_results", 123);
    expect(ev.item_count).toBe(3);
    expect(ev.render_duration_ms).toBe(123);
    expectNoForbidden(ev);
  });
});

describe("DoD #6 — 어떤 factory도 원본 민감값을 누출하지 않는다", () => {
  it("password 필드 + form submit 전체 흐름 검증", () => {
    const form = document.createElement("form");
    form.action = "https://example-pharm.co.kr/login";

    const user = document.createElement("input");
    user.type = "text";
    user.name = "username";
    user.value = "환자홍길동";

    const pwd = document.createElement("input");
    pwd.type = "password";
    pwd.name = "user_password";
    pwd.value = "P@ssw0rd!";

    form.appendChild(user);
    form.appendChild(pwd);
    document.body.appendChild(form);

    const focus1 = createFieldFocusEvent(CTX, user);
    const focus2 = createFieldFocusEvent(CTX, pwd);
    const stats1 = computeFieldValueStats(user, focus1.is_sensitive as boolean);
    const stats2 = computeFieldValueStats(pwd, focus2.is_sensitive as boolean);
    const submit = createSubmitEvent(CTX, form, "button_click");

    for (const obj of [focus1, focus2, stats1, stats2, submit]) {
      expectNoForbidden(obj);
    }
  });
});
