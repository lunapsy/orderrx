// 역할: Vitest 설정. jsdom 환경으로 DOM/window/location/document 사용 가능.
// crypto.randomUUID 는 Node 20 이상 글로벌에서 제공되므로 별도 폴리필 불필요.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
    globals: false,
    // jsdom 기본 URL을 명시 (location.href 가 about:blank 이면 redaction 테스트가 부정확)
    environmentOptions: {
      jsdom: {
        url: "https://example-pharm.co.kr/",
      },
    },
  },
});
