// 역할: Vite 빌드 설정. @crxjs/vite-plugin 으로 Manifest V3 extension을 번들한다.
// 산출물: dist/ (Chrome에 unpacked로 로드 가능한 폴더)
//
// 빌드 채널 (ORDERRX_CHANNEL 환경변수, 기본 "pilot"):
//   - pilot: zip 직접 배포용. content script를 <all_urls>로 정적 주입 (수집 여부는 guard가 판정).
//            도메인 추가 시 권한 프롬프트가 없어 참여자 UX가 단순하다.
//   - store: Chrome Web Store 심사용. 정적 주입 없음 — 설치 시 host 권한 0개,
//            도메인 등록 시 런타임 권한 요청 + 동적 주입 (script_registry.ts).
// public/manifest.json 은 store 형태(최소 권한)를 기준으로 두고, pilot 빌드가 주입 항목을 추가한다.

import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import baseManifest from "./public/manifest.json" assert { type: "json" };

const __dirname = dirname(fileURLToPath(import.meta.url));

const channel = process.env.ORDERRX_CHANNEL === "store" ? "store" : "pilot";

const manifest = structuredClone(baseManifest) as typeof baseManifest & {
  content_scripts?: unknown[];
};
if (channel === "pilot") {
  manifest.content_scripts = [
    {
      matches: ["<all_urls>"],
      js: ["src/content/index.ts"],
      run_at: "document_idle",
      all_frames: false,
    },
  ];
}

export default defineConfig({
  define: {
    __ORDERRX_STORE_BUILD__: JSON.stringify(channel === "store"),
  },
  plugins: [crx({ manifest })],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  resolve: {
    alias: {
      // 워크스페이스 schema 패키지의 생성 산출물을 직접 가리킨다.
      // package.json exports만으로는 vite의 ESM resolver가 .ts 진입점을 못 잡는 경우가 있어 alias를 별도 유지.
      "@orderrx/schema": resolve(__dirname, "../../packages/schema/generated/ts"),
    },
  },
});
