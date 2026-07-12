// 역할: JSON Schema 원본으로부터 TypeScript 타입을 자동 생성한다.
// 입력: ../json/event_base.schema.json, ../json/events/*.schema.json
// 출력: ../generated/ts/{TypeName}.ts, ../generated/ts/index.ts
// 주의: generated/ 폴더의 파일은 수동 수정 금지. 수정은 항상 JSON Schema 원본에서.

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileFromFile } from "json-schema-to-typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_ROOT = resolve(__dirname, "..", "json");
const OUT_DIR = resolve(__dirname, "..", "generated", "ts");

/**
 * 단계별 로그 출력.
 * @param {string} step - 단계 이름
 * @param {string} message - 메시지
 */
function log(step, message) {
  // 모든 단계를 prefix와 함께 출력해 에러 위치 추적이 쉽도록 한다.
  console.log(`[schema:gen:ts][${step}] ${message}`);
}

/**
 * 출력 디렉토리를 보장한다. 없으면 재귀적으로 생성.
 * @param {string} dir - 절대 경로
 */
function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

/**
 * 주어진 schema 파일 경로에서 TS 소스를 생성한다.
 * @param {string} schemaPath - JSON Schema 절대 경로
 * @returns {Promise<{name: string, source: string}>}
 */
async function compileOne(schemaPath) {
  log("compile", `시작: ${schemaPath}`);
  // cwd를 해당 스키마 디렉토리로 맞춰 $ref 상대경로가 올바르게 해석되게 한다.
  const source = await compileFromFile(schemaPath, {
    cwd: dirname(schemaPath),
    bannerComment:
      "/* 자동 생성 파일. 수정 금지. 수정은 packages/schema/json/*.schema.json 에서. */",
    additionalProperties: true,
    declareExternallyReferenced: true,
  });
  // 파일 내용의 첫 번째 export interface 이름을 타입명으로 추출한다.
  const match = source.match(/export interface (\w+)/);
  const name = match ? match[1] : "Unknown";
  log("compile", `완료: ${name}`);
  return { name, source };
}

/**
 * 엔트리 포인트. base + events/*.schema.json 을 모두 컴파일하고 index.ts 를 만든다.
 */
async function main() {
  log("init", `schema root = ${SCHEMA_ROOT}`);
  log("init", `out dir     = ${OUT_DIR}`);
  ensureDir(OUT_DIR);

  const results = [];

  // 1. base schema
  const basePath = join(SCHEMA_ROOT, "event_base.schema.json");
  results.push(await compileOne(basePath));

  // 2. event schemas
  const eventsDir = join(SCHEMA_ROOT, "events");
  const eventFiles = readdirSync(eventsDir).filter((f) =>
    f.endsWith(".schema.json")
  );
  log("scan", `이벤트 스키마 ${eventFiles.length}개 발견`);
  for (const f of eventFiles) {
    results.push(await compileOne(join(eventsDir, f)));
  }

  // 3. 각 결과를 개별 파일로 쓰기
  for (const { name, source } of results) {
    const outPath = join(OUT_DIR, `${name}.ts`);
    writeFileSync(outPath, source, "utf8");
    log("write", outPath);
  }

  // 4. index.ts 작성: 모든 생성 타입을 re-export
  const indexLines = [
    "/* 자동 생성 파일. 수정 금지. */",
    ...results.map(({ name }) => `export * from "./${name}";`),
  ];
  const indexPath = join(OUT_DIR, "index.ts");
  writeFileSync(indexPath, indexLines.join("\n") + "\n", "utf8");
  log("write", indexPath);

  log("done", `생성된 타입 ${results.length}개`);
}

// 에러를 콘솔에 명확히 남기고 실패 시 non-zero exit.
main().catch((err) => {
  console.error("[schema:gen:ts][fatal]", err);
  process.exit(1);
});
