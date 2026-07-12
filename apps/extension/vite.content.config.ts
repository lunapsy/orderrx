// 역할: content script 전용 2차 빌드 설정.
// chrome.scripting.registerContentScripts(동적 등록)는 고정 경로의 클래식 스크립트가 필요한데,
// @crxjs 메인 빌드는 해시된 청크 + loader 구조라 경로가 매 빌드 바뀐다.
// 그래서 content/index.ts 를 self-contained IIFE 단일 파일로 별도 번들한다.
// 산출물: dist/content/orderrx-content.js  (background/script_registry.ts 가 이 경로를 등록)

import { defineConfig } from "vite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // public/ (manifest, icons)은 메인 빌드가 처리한다 — 여기서 복사하면 dist/content에 중복 생성됨.
  publicDir: false,
  build: {
    outDir: "dist/content",
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: resolve(__dirname, "src/content/index.ts"),
      formats: ["iife"],
      name: "orderrxContent",
      fileName: () => "orderrx-content.js",
    },
  },
  resolve: {
    alias: {
      "@orderrx/schema": resolve(__dirname, "../../packages/schema/generated/ts"),
    },
  },
});
