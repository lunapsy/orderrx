// 역할: Vite 빌드 설정. @crxjs/vite-plugin 으로 Manifest V3 extension을 번들한다.
// 산출물: dist/ (Chrome에 unpacked로 로드 가능한 폴더)

import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import manifest from "./public/manifest.json" assert { type: "json" };

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
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
