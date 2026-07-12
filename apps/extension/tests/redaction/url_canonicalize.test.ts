// 역할: URL 정규화 동작 검증.
// 규칙 출처: 03_architecture/event_schema_m1_detail.md "URL 정규화 규칙"

import { describe, it, expect } from "vitest";
import {
  canonicalizeUrl,
  extractHost,
} from "../../src/redaction/url_canonicalize.js";

describe("canonicalizeUrl", () => {
  it("fragment 제거", () => {
    const out = canonicalizeUrl(
      "https://example-pharm.co.kr/search?q=%ED%83%80%EC%9D%B4%EB%A0%88%EB%86%80&cat=analgesic&page=2#top"
    );
    expect(out).not.toContain("#");
    expect(out).toContain("q=");
    expect(out).toContain("cat=analgesic");
    expect(out).toContain("page=2");
  });

  it("블랙리스트 파라미터(jsessionid) 제거", () => {
    const out = canonicalizeUrl(
      "https://example-pharm.co.kr/product?id=12345&jsessionid=ABCDEF123456"
    );
    expect(out).toContain("id=12345");
    expect(out.toLowerCase()).not.toContain("jsessionid");
    expect(out).not.toContain("ABCDEF123456");
  });

  it("블랙리스트 파라미터 다종 (token, csrf, api_key, session)", () => {
    const out = canonicalizeUrl(
      "https://example-pharm.co.kr/api?id=1&token=xxx&csrf=yyy&api_key=zzz&session=abc"
    );
    expect(out).toContain("id=1");
    expect(out).not.toContain("xxx");
    expect(out).not.toContain("yyy");
    expect(out).not.toContain("zzz");
    expect(out).not.toContain("abc");
  });

  it("허용 파라미터 값에 redaction 적용 (phone)", () => {
    const out = canonicalizeUrl(
      "https://example-pharm.co.kr/cart?items=3&phone=010-1234-5678"
    );
    expect(out).toContain("items=3");
    expect(out).toContain("%5BPHONE%5D"); // [PHONE] URL-encoded
    expect(out).not.toContain("010-1234-5678");
  });

  it("허용 파라미터 값에 redaction 적용 (email)", () => {
    const out = canonicalizeUrl(
      "https://example-pharm.co.kr/order?to=user@example.com"
    );
    expect(out).not.toContain("user@example.com");
    expect(out).toContain("%5BEMAIL%5D");
  });

  it("userinfo 제거", () => {
    const out = canonicalizeUrl("https://alice:secret@example-pharm.co.kr/path");
    expect(out).not.toContain("alice");
    expect(out).not.toContain("secret");
    expect(out).toContain("example-pharm.co.kr");
  });

  it("query 없는 URL 그대로 유지", () => {
    const out = canonicalizeUrl("https://example-pharm.co.kr/about");
    expect(out).toBe("https://example-pharm.co.kr/about");
  });

  it("파싱 실패 시 빈 문자열", () => {
    expect(canonicalizeUrl("not a url")).toBe("");
    expect(canonicalizeUrl("")).toBe("");
  });

  it("password/pwd/otp 파라미터 제거", () => {
    const out = canonicalizeUrl(
      "https://example-pharm.co.kr/login?user=foo&password=bar&otp=999"
    );
    expect(out).toContain("user=foo");
    expect(out).not.toContain("bar");
    expect(out).not.toContain("999");
  });
});

describe("extractHost", () => {
  it("절대 URL host 추출", () => {
    expect(extractHost("https://example-pharm.co.kr/path", "https://x/")).toBe(
      "example-pharm.co.kr"
    );
  });

  it("상대 URL은 baseHref 기준으로 host 추출", () => {
    expect(extractHost("/api/order", "https://example-pharm.co.kr/")).toBe(
      "example-pharm.co.kr"
    );
  });

  it("파싱 실패 시 빈 문자열", () => {
    expect(extractHost("::::", "::::")).toBe("");
  });
});
