# CLAUDE.md — OrderRx 세션 인수인계

> **새 Claude 세션이 이 프로젝트에서 시작되면 맨 먼저 이 파일부터 읽으세요.**
> 이 파일은 대화 히스토리가 사라져도 다음 세션의 Claude가 10초 안에
> 현재 위치를 파악하게 하기 위한 인수인계 문서입니다.
> 마지막 업데이트: 2026-07-12

---

## 1. 이 프로젝트는 무엇인가

OrderRx (PharmPilot 브랜드) 는 약국 도매 주문 사이트의 workflow 학습 데이터를 수집하는 Chrome MV3 확장입니다.

**핵심 원칙**: "좋은 모델을 붙이는 것"이 아니라 사이트별 workflow 지식 베이스와 안전한 자동화 실행 구조를 만드는 것.

**Training Track 우선**: 초기 목표는 사용자용 주문 자동화 CLI가 아니라, 참여자용 학습/튜닝 데이터 수집 프로그램.

전체 원칙은 `01_master/master_instruction.md` 를 참조.

---

## 2. 현재 단계 (2026-04-09 기준)

- **Milestone 0** — Decisions Only: **CLOSED** (2026-04-07)
- **Milestone 1** — Training Data Collection Extension: **M1 DoD 11개 항목 모두 통과, 빌드 zip 생성 완료. 첫 실사용 세팅 완료(운영자 본인 약국, 2026-04-08). GitHub private repo 연결 완료(2026-04-09).**

### 방금 도달한 이정표

- 2026-04-07: M1 코드 완성, Layer 2 Pause 리팩토링, hashchange 리스너 추가, 새 teal Rx 아이콘 적용, `orderrx-extension-0.1.0.zip` 빌드
- 2026-04-07: `apps/extension/PARTICIPANT_GUIDE.md` 작성 (§6 참여자 셀프 검증 섹션 포함)
- 2026-04-08: **첫 실사용 배포 — 운영자 본인 약국에 확장 세팅 완료.** 이때부터 실제 워크플로 데이터가 쌓이기 시작.
- 2026-04-09: **GitHub repo `lunapsy/orderrx` 생성 및 최초 push 완료.** 이 시점부터 GitHub이 source of truth. 세션 복구는 `git clone` + `CLAUDE.md` 만으로 가능.
- 2026-07-12: **repo 공개(public) 전환.** 내부 메모 정리 후 히스토리를 새로 만들어 push. 공개 repo 원칙: raw 수집 데이터·참여자 정보·내부 전략 메모는 커밋 금지 (로컬 `.private/` 사용, gitignore 처리됨).
- 2026-07-13: **0.3.0 — Web Store 제출 대비 권한 구조 개편.** manifest에서 `<all_urls>` 정적 content script 제거. 도메인 등록 시 popup에서 `chrome.permissions.request`(사용자 제스처) → background `script_registry.ts`가 `scripting.registerContentScripts`로 해당 도메인에만 동적 주입. content script는 crxjs 해시 청크와 별개로 `vite.content.config.ts` 2차 빌드가 `dist/content/orderrx-content.js` 고정 경로 IIFE로 번들 (동적 등록은 고정 경로 필요). `PRIVACY.md` + `06_execution/webstore_listing_draft.md` 작성.
- 2026-07-13: **M1.5 — 확장 0.2.0.** 20개 약국 배포 대비 고도화: (1) 이벤트 `app_version` 스탬프, (2) `tools/merge_events.py` 다중 참여자 병합·dedupe·금지토큰 자동 스캔·site_id 정규화(www 제거), (3) popup 첫 실행 **참여 동의 게이트** (`CONSENT.md` v1.0.0, 동의 없으면 수집·업로드 전면 차단, 동의 기록 로컬+서버 저장), (4) **Supabase 자동 업로드** — 1분 주기 배치 업로드 후 로컬 삭제(용량 문제 해소), 실패 시 보존·재시도, 409 중복은 성공 처리. 서버: rxstock 프로젝트(cjppuaqctoqazzkgtlmz, 서울)의 `orderrx_events`/`orderrx_consents`, anon INSERT-only RLS (읽기 차단 검증 완료). RLS가 SELECT를 막으면 PostgREST ignore-duplicates가 42501로 실패하므로 일반 INSERT + 409 처리 방식 사용 (uploader.ts 주석 참조).

### 다음에 해야 할 일 (우선순위)

1. **0.2.0 실사용 검증** — 운영자 본인 약국에 0.2.0 재설치(동의 게이트 통과) 후 며칠 사용, Supabase 대시보드에서 `orderrx_events` 적재 확인 + `tools/merge_events.py`로 내려받은 덤프 검증.
2. **Chrome Web Store 비공개(unlisted) 제출** — 제출 준비 완료(0.3.0): 권한 구조 개편(설치 시 host 권한 0개, 도메인 등록 시 런타임 요청+동적 주입), `PRIVACY.md`(공개 URL), `06_execution/webstore_listing_draft.md`(폼 초안). 남은 것: CWS 개발자 계정 등록($5, Play 계정과 별개), 동의 화면 스크린샷 1280×800 촬영, 대시보드 제출. 반려 시 사유를 listing draft에 기록하고 재제출.
3. **테스터 모집 재검토** — 현재 보류 상태. 사전 준비(§7 준수 사항 반영) 완료 후 재개.
4. **M2 나머지 범위** — admin dashboard(수집량/참여자 현황), withdraw/delete 처리 플로우 정식화. ingestion은 M1.5 Supabase로 선행 구현됨.

---

## 3. 절대 위반 금지 원칙 (`master_instruction.md` 요약)

- **LLM vendor 종속 설계 금지** (Gemma 포함). Event schema는 모델 중립이어야 함.
- **DOM 의미 기반 자동화만**, 화면 좌표·마우스 위치 기반 방식 금지.
- **민감정보 수집·저장·로그 금지**: 비밀번호, 결제정보, 환자 개인정보, 세션 토큰.
- **참여자 통제권 항상 보장**: OFF, 사이트별 OFF, 삭제, 철회 가능.
- **Workflow-first 순서**: 사이트 workflow 이해 → 이벤트 구조화 → site adapter → deterministic executor → LLM layer.
- **문서 우선**: 충돌 시 `01_master` / `03_architecture` / `09_checklists` 우선.
- **범위 무단 확장 금지**: 현재 단계에서 필요한 최소 기능부터.

---

## 4. 핵심 문서 읽는 순서

새 세션의 Claude가 이 프로젝트에서 작업하려면 아래 순서로 읽을 것.

1. `CLAUDE.md` (이 파일) — 현재 위치 파악
2. `README.md` — 디렉토리 구조
3. `01_master/master_instruction.md` — 최상위 원칙
4. `06_execution/solo_milestones.md` — 마일스톤 정의 (M1~M4)
5. `03_architecture/event_schema_m1_detail.md` — 이벤트 스키마 상세
6. `04_policies/privacy_and_data_collection.md` — 프라이버시 정책
7. `08_repo/coding_rules.md` — 파일/함수 주석, 단계별 로그 규칙
8. `apps/extension/PARTICIPANT_GUIDE.md` — 테스터 가이드 (배포본)

그리고 `/mnt/.auto-memory/MEMORY.md` 도 자동 로드되지만 명시적으로 한 번 훑어볼 것.

---

## 5. 파일 맵 (중요 경로)

```
orderRx/
├── 01_master/                # 최상위 원칙, kickoff prompt
├── 03_architecture/          # event schema, data flow
├── 04_policies/              # 프라이버시·투명성 정책
├── 06_execution/             # milestones, release plan
├── 08_repo/                  # stack decision, coding rules
├── apps/extension/           # Chrome MV3 확장 (M1 본체)
│   ├── src/
│   │   ├── content/
│   │   │   ├── capture.ts    # DOM 이벤트 리스너 + CaptureHandle 패턴
│   │   │   ├── guard.ts      # 도메인 매칭 + 수집 허가 체크
│   │   │   └── index.ts      # orchestrator, storage.onChanged 구독
│   │   ├── events/
│   │   │   └── event_factory.ts   # 6종 이벤트 생성 단일 진입점
│   │   ├── redaction/
│   │   │   ├── url_canonicalize.ts    # 세션 토큰·PII 파라미터 제거
│   │   │   └── field_sensitivity.ts   # 민감 필드 판정
│   │   ├── background/       # service worker, settings, storage relay
│   │   └── popup/            # popup UI + JSON export
│   ├── fixtures/test-form.html       # result_rendered 휴리스틱 테스트용
│   ├── screenshots/          # 가이드용 4장
│   └── PARTICIPANT_GUIDE.md  # 테스터 배포 가이드 (최신)
├── packages/schema/          # JSON Schema 단일 sot + 생성 TS 타입
├── tools/
│   └── export_training_data.py    # JSONL → Gemma3 instruction/input/output 변환
├── orderrx-extension-0.1.0.zip    # 배포 빌드 (sourcemap 제외)
└── CLAUDE.md                 # 이 파일
```

---

## 6. 비자명한 설계 결정 이력

다음 결정들은 코드나 git log만 봐서는 **왜** 그렇게 했는지 알기 어려우므로 여기에 기록.

### Layer 2 Pause (2026-04-07)
- **문제**: 초기엔 content script 주입 시점에만 guard를 체크해서, popup에서 수집 OFF 해도 이미 열린 탭에서는 계속 이벤트가 쌓이는 버그가 있었음.
- **해결**: `capture.ts` 의 `startCapture()` 가 `CaptureHandle` (stop() 포함)을 반환하도록 리팩토링. `cleanups: Array<() => void>` 로 모든 리스너 해제를 단일 지점에서 관리. `content/index.ts` 가 `chrome.storage.onChanged` 를 구독해서 consent/sites 변경 시 `evaluate()` 재실행.
- **적용 규칙**: 새 리스너 추가 시 반드시 `on()` helper를 써서 cleanups에 등록할 것. 직접 `addEventListener` 하지 말 것.

### URL canonicalization — focusout leak fix (2026-04-07)
- **문제**: focusout 핸들러가 이벤트 객체를 수동으로 조립하면서 `url_canonical: location.href` (raw) 로 저장해서, `jsessionid`, `phone` 등이 5건 유출되는 사고가 있었음.
- **해결**: `createFieldFocusUpdateEvent()` factory 추가. 모든 이벤트 생성이 `baseFields()` → `canonicalizeUrl()` 경로를 통과하도록 강제.
- **적용 규칙**: 이벤트 객체를 직접 `{ ... }` 로 만들지 말고 반드시 `event_factory.ts` 의 factory 함수를 경유할 것.

### normalizeDomain 은 www 제거 안 함 (2026-04-07)
- **상태**: 테스터마다 `pharm-a.co.kr` vs `www.pharm-a.co.kr` 로 갈라 등록하면 site_id가 쪼개질 수 있음.
- **결정**: 지금은 M1 범위를 넘지 않기 위해 수정 안 함. 후처리(`tools/export_training_data.py`) 단계에서 site_id 정규화로 대응하기로 합의.
- **후속 조치 필요**: M2에서 backend 도입 시 site_id alias table 설계.

### result_rendered 휴리스틱과 테스트 픽스처 (2026-04-07)
- **문제**: MutationObserver 휴리스틱이 `[class*="result"]`, `[class*="list"]` 를 찾는데 fixtures/test-form.html 의 ul 요소에 class가 없어서 테스트가 안 잡혔음.
- **해결**: 테스트 픽스처의 삽입 ul에 `class="search-result-list"`, `class="order-result-list"` 추가.

### iCloud/OneDrive 경고를 가이드에 명시 (2026-04-07)
- **이유**: unpacked 확장을 클라우드 동기화 폴더에 두면 파일이 일시적으로 evict 되어 확장이 깨지는 경우가 있음.
- **적용**: `PARTICIPANT_GUIDE.md` §3.1 에 경고 박스 명시.

---

## 7. 약관·프라이버시 준수 설계 (M1 기준)

OrderRx M1이 구조적으로 지키는 안전 원칙:

1. **HTTP 요청 0건**: `fetch()`, `XMLHttpRequest`, `chrome.webRequest` 인터셉트 전부 사용 안 함. 사이트에 새 트래픽을 발생시키지 않음.
2. **API 엔드포인트 미추출/미저장**: 어떤 URL이 호출되는지 알지 못하고 저장하지도 않음.
3. **응답 본문 미저장**: 응답을 캡처할 경로 자체가 없음.
4. **페이지 텍스트 최소 캡처**: `textContent` 를 40자 truncate + redaction. 페이지 전체 innerHTML 이나 카탈로그 데이터는 건드리지 않음.
5. **사용자 본인 행위만 기록**: 로그인한 본인이 수행한 클릭/입력의 메타데이터. 가장 가까운 유사물은 세션 리코더(Hotjar류) / 웹 분석 SDK.
6. **공개 없음**: 데이터는 본인 브라우저에만 저장. 본인이 명시적으로 export 해야 운영자에게 도달. 운영자도 raw 형태 공개 금지.
7. **명시적 사전 동의**: 테스터가 본인 손으로 사이트 등록, 가이드로 무엇이 수집되는지 확인, 언제든 OFF/삭제 가능.

### 여전히 남은 주의사항

- **사이트 ToS**: 일부 도매 사이트 약관의 "자동화 도구", "데이터 수집 금지" 조항 검토 필요.
- **clicked element textContent 40자 누적**: 다수 테스터 × 다수 사이트로 집계될 경우를 대비해 redaction 강화 옵션 검토 (textContent 제거, aria-label/role만 저장).
- **M3 executor 진입 전**: 자동 조작 단계는 관찰과 성격이 다르므로 진입 전 전문가 검토를 거친다.

### 현재(M1) 안전 조치

1. 참여자 동의의 명시적 기록 보관.
2. raw 수집 데이터 공개 repo 업로드 금지.
3. PARTICIPANT_GUIDE 에 "동의 명문화" 섹션 추가 검토 (현재 미완).

---

## 8. 직전 진행 상황 (끝나지 않은 실타래)

### 대기 중 / 보류 중
- **테스터 모집글**: 작성은 완료(초안 2단계). 보류 상태. 재개 시점 — 본인 약국 실사용 며칠 후.
- **PARTICIPANT_GUIDE 보강 대기**: "동의 명문화 절차", textContent 캡처 최소화 옵션 설명. 본인 약국 데이터 보고 난 뒤 우선순위 조정.

### 완료
- M1 DoD 11개 통과 (빌드, participant_id, 도메인 관리, 6종 이벤트 수집, redaction, Pause, export, 전체 삭제, Gemma3 변환, 코딩 규칙 준수).
- `orderrx-extension-0.1.0.zip` 배포 빌드 생성 (25KB, sourcemap 제외).
- PARTICIPANT_GUIDE.md 작성 완료, 스크린샷 4장 삽입, iCloud 경고 포함.
- 본인 약국 첫 세팅 (2026-04-08).

---

## 9. 세션 재개 protocol

새 Claude 세션이 시작될 때 다음 순서로 진행:

1. **이 파일 (CLAUDE.md) 전체 읽기**.
2. `/mnt/.auto-memory/MEMORY.md` 확인 (자동 로드되지만 명시적으로 한 번).
3. `README.md` + `01_master/master_instruction.md` 훑기.
4. 현재 디렉토리 상태 확인:
   ```bash
   ls apps/extension/         # PARTICIPANT_GUIDE, zip, screenshots 존재 확인
   ls /sessions/.../.auto-memory/   # project_* 메모리 파일들 확인
   ```
5. 사용자에게 "§8 직전 진행 상황 중 어느 것을 이어갈지" 먼저 합의.
6. 작업 시작.

### 세션 종료 루틴 (vibe 코딩 저장 지점)
중요한 진전이 있을 때마다:

1. 실제 코드/문서 변경을 파일로 저장.
2. `CLAUDE.md` §2 "현재 단계" + §8 "직전 진행 상황" 업데이트.
3. 중요한 설계 결정이면 §6 "비자명한 설계 결정 이력" 에 추가.
4. 세션 간 살아남아야 할 맥락은 `/mnt/.auto-memory/` 에 project memory 로 저장.
5. (git 초기화 시) 커밋.

### Git 상태 (2026-07-12)
- Remote: `https://github.com/lunapsy/orderrx` (**public**, 2026-07-12 전환)
- 공개 전환 시 히스토리를 새로 생성(squash). 이전 private 히스토리는 로컬 `.private/` 백업으로만 보존.
- 공개 repo 커밋 금지 항목: raw 수집 데이터, 참여자 식별 정보, 내부 전략/협의 메모.
- 세션 복구 경로: `git clone https://github.com/lunapsy/orderrx.git` → `CLAUDE.md` 읽기 → §9 재개 프로토콜

---

## 10. 스타일 규칙 (lunap 선호, 반드시 준수)

- **역할별 파일 분리**: 하나의 파일이 여러 역할을 겸하지 말 것.
- **파일 헤더 주석**: 각 파일 최상단에 목적/책임 주석.
- **함수 주석**: public/export 함수는 JSDoc/docstring 필수.
- **단계별 상세 로그**: 주요 동작마다 `log.info/debug` 로 단계 기록 (디버깅 시 사용자가 console에서 흐름을 따라갈 수 있게).
- 상세: `08_repo/coding_rules.md`.
