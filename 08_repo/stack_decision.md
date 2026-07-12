# Stack Decision

## 결정 일자
2026-04-07

## 결정 요약
| 컴포넌트 | 언어 / 프레임워크 | 비고 |
|---|---|---|
| `/apps/extension` | TypeScript + Vite + Manifest V3 | Chrome Extension. 언어 선택지 없음. schema 타입 강제 목적으로 TS 채택. |
| `/apps/admin` (frontend) | TypeScript + SvelteKit | `packages/schema` 타입 공유 목적. 2026-04-07 확정. |
| `/services/api` | Python + FastAPI + Pydantic | ingestion, redaction verifier, deletion/withdrawal service 포함. |
| DB | PostgreSQL | ORM은 SQLModel 또는 SQLAlchemy. |
| `/apps/cli`, `/packages/executor` | Python + Playwright (Python) + Typer | DOM 의미 기반. 좌표 자동화 금지 규칙 준수. |
| `/packages/adapters` | 선언형 YAML/JSON + Python 코드 훅 | `site_adapter_spec.md`의 "선언형 우선" 규칙 준수. |
| `/packages/llm-core` | Python (ABC 인터페이스) | provider별 어댑터 분리. vendor 응답 객체를 내부 표준으로 삼지 않음. |
| `/packages/schema` | JSON Schema (원본) → TS: `json-schema-to-typescript`, Python: `datamodel-code-generator` | extension·api 양쪽이 동일 schema 참조. 2026-04-07 확정. |
| 모노레포 | `pnpm workspaces` (JS) + `uv` 또는 `poetry` (Python) | 하이브리드. |

## 결정 근거
- executor는 LLM 없이 작동해야 하므로 Playwright 기반 deterministic 자동화가 핵심. Python binding이 1급 시민이며 참여자 스킬셋과 일치.
- Extension은 Manifest V3 제약상 TS/JS 외 선택 불가. 민감정보 redactor 같은 고위험 코드의 컴파일 단계 검증을 위해 TS 채택.
- Admin frontend도 TS로 통일하여 `packages/schema` 타입을 extension과 공유.
- LLM provider 종속 금지 원칙(`llm_abstraction_spec.md`)에 따라 `llm-core`는 ABC 인터페이스만 정의하고 provider는 plugin 형태로 attach/detach.

## 비목표
- Flutter는 본 프로젝트 핵심 경로에 포함하지 않는다. 모바일 admin 요구가 발생하면 재논의.
- vanilla JS로 Extension을 시작했다가 후속 마이그레이션하는 경로는 채택하지 않는다.
- Node 기반 Playwright는 채택하지 않는다 (executor 언어를 Python으로 단일화).

## 학습 항목
- TypeScript: extension / admin 양쪽에서 사용. 우선 학습 대상.
- Playwright (Python): DOM 셀렉터 기반 자동화.
- FastAPI + Pydantic: schema validator 통합.
- PostgreSQL: SQL 점진 학습.

## 미결 항목
- (없음) 2026-04-07 모든 미결 항목 확정 완료.

## 변경 이력
- 2026-04-07 초안 작성, Admin frontend / schema 타입 생성 도구 미결.
- 2026-04-07 Admin frontend = SvelteKit 확정. Schema 타입 생성 도구 = `json-schema-to-typescript` + `datamodel-code-generator` 확정.

## 관련 문서
- `03_architecture/system_architecture.md`
- `03_architecture/llm_abstraction_spec.md`
- `03_architecture/site_adapter_spec.md`
- `08_repo/repo_scaffold.md`
- `08_repo/coding_rules.md`
