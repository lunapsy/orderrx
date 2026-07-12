// 역할: 빌드 채널 플래그. vite.config.ts 의 define 으로 주입된다.
//   - store 채널: 도메인 등록 시 런타임 host 권한 요청 + 동적 content script 주입
//   - pilot 채널: <all_urls> 정적 주입 (권한 프롬프트 없음) — 권한 요청·동적 등록은 꺼짐
// 테스트(vitest)처럼 define 이 없는 환경에서는 pilot 으로 간주한다.

declare const __ORDERRX_STORE_BUILD__: boolean | undefined;

/** true면 Web Store 심사용 빌드 (도메인별 런타임 권한 모델) */
export const IS_STORE_BUILD: boolean =
  typeof __ORDERRX_STORE_BUILD__ !== "undefined" ? __ORDERRX_STORE_BUILD__ : false;
