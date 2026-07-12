# Solo Milestones

본 문서는 `kickoff_sequence.md`의 팀 기반 Week 계획을 솔로/저자원 운영 환경에 맞춰 재구성한 것이다. 원문 `kickoff_sequence.md`, `parallel_work_plan.md`, `release_plan.md`를 대체하지 않고 보완한다. 충돌 시 본 문서는 솔로 운영 판단에 한해 우선한다.

## 운영 전제
- 솔로 개발자(lunap) 한 명이 모든 stream을 직렬로 수행한다.
- Training Track 참여자는 lunap 혼자가 아니라 여러 약국의 테스터가 동시에 진행한다.
- 각 테스터는 자신의 사이트를 직접 등록한다. 1인당 약 20~30개 도메인까지 등록 가능해야 한다.
- 초기 학습 대상 모델은 Gemma3이지만, event schema는 모델 중립이어야 하며 모델별 학습 포맷 변환은 export 단계에서 분리한다.

---

## Milestone 0 — Decisions Only (코드 없음)

### 목표
코드 없이 확정 가능한 항목만 정리하여 M1 진입 조건을 만든다.

### 작업
- ~~이벤트 taxonomy 확정~~ → **M1 6종 확정 및 필드 상세 정의 완료 (2026-04-07)**. 상세: `03_architecture/event_schema_m1_detail.md`.
- ~~민감정보 차단 규칙 확정~~ → **필드명 패턴 9종 + 페이지 텍스트 redaction 패턴 5종 + token class 12종 정의 완료 (2026-04-07)**. 상세: `03_architecture/event_schema_m1_detail.md`.
- ~~Admin frontend 프레임워크 결정~~ → **SvelteKit 확정 (2026-04-07)**.
- ~~`packages/schema` 타입 생성 도구 선정~~ → **`json-schema-to-typescript` + `datamodel-code-generator` 확정 (2026-04-07)**.

### 뒤로 미룸
- 대상 사이트 사전 선정: Training Track 모델상 테스터가 직접 등록하므로 사전 선정 불필요.
- 파일럿 약국 범위 정의: 참여자 모집 단계에서 처리.
- 배포 fallback 초안: M2 이후.

### 완료 기준
- ✅ M1에서 구현할 이벤트 6종이 `event_schema_m1_detail.md`로 확정됨 (2026-04-07).
- ✅ Admin frontend 프레임워크와 schema 타입 생성 도구가 `stack_decision.md`에 기록됨 (2026-04-07).
- ✅ 민감정보 차단 규칙이 구체 패턴으로 확정됨 (2026-04-07).

**M0 상태: CLOSED (2026-04-07)**

---

## Milestone 1 — Training Data Collection Extension (Release 0.1)

### 목표
> 다중 테스터가 각자 자율 등록한 약국 사이트에서 모델 중립 schema로 workflow 이벤트를 안전하게 수집하고, 그 결과를 Gemma3 fine-tuning 형식으로 export 할 수 있다.

이 한 문장이 만족되면 M1 종료. Backend 없음, 업로드 없음, executor 없음, LLM 직접 호출 없음.

### 포함 범위

**Extension (`/apps/extension`)**
- TypeScript + Vite + Manifest V3 부트스트랩
- 설치 시점에 `participant_id`(UUID v4) 1회 생성, `chrome.storage.local`에 영구 저장, popup에 표시
- Popup UI:
  - 전체 Consent / Pause / Resume 토글
  - 도메인 목록 관리 (최대 30개, 개별 ON/OFF, 추가/삭제)
  - 도메인 목록 JSON 가져오기/내보내기
  - 수집된 이벤트 개수, 저장소 사용량, 최근 5건 미리보기
  - "내 데이터 내보내기" 버튼 (중립 JSON 파일)
  - "전체 삭제" 버튼
  - 민감정보 redaction 상태 설명 텍스트
- Content script:
  - 등록된 도메인에서만 활성화
  - 이벤트 6종 캡처: `page_enter`, `click`, `field_focus`, `submit`, `navigate`, `result_rendered`
  - `field_focus`는 `field_name`, `length`, `token_class`만 저장. 값 저장 금지.
- Local redaction filter: 이벤트 생성 시점 1차 검증. 금지 필드(`password*`, `otp*`, `card*`, 환자 식별 키워드 등) 패턴 매칭 후 차단/마스킹.
- 저장소: IndexedDB (이벤트), chrome.storage.local (설정/상태/participant_id).

**Schema (`/packages/schema`)**
- 중립 event schema v0.1 (JSON Schema 원본)
- TS 타입 자동 생성 (도구는 M0에서 확정)
- Gemma 종속 0%

**Export tool (`tools/export_training_data.py`)**
- 입력: extension에서 수출한 중립 이벤트 JSON 파일
- 출력: Gemma3 fine-tuning 포맷 (예: instruction / input / output 구조)
- 변환 로직을 "Gemma adapter" 1개로 분리. 다른 모델은 adapter 추가로 확장.

**품질/안전**
- 모든 코드 파일에 헤더 주석, 함수 주석, 단계별 로그 적용 (`08_repo/coding_rules.md`)
- 단위 테스트: 모든 기록된 이벤트에 금지 필드가 포함되지 않음을 자동 검증

### 포함하지 않음 (의도적)
- Backend (`/services/api`) 및 업로드
- 다른 참여자 데이터 병합 기능
- pause / site-off / withdraw / delete의 서버 연동
- Executor, CLI, LLM 직접 호출
- Real-time workflow 자동 클러스터링
- 저장소 자동 순환 삭제 (M1은 상한 경고만)

### 완료 기준 (Definition of Done)
1. Vite로 빌드한 extension을 Chrome에 unpacked로 로드 가능
2. 설치 시 `participant_id`가 1회 생성되어 popup에 표시됨
3. 도메인을 1개부터 30개까지 등록 가능하며 각 도메인 개별 ON/OFF 가능
4. 도메인 목록 JSON 가져오기/내보내기 동작
5. 등록된 도메인에서 workflow 1건(검색→상품 클릭→장바구니 추가 등) 진행 시 6종 이벤트가 IndexedDB에 기록됨
6. 기록된 모든 이벤트에 입력 원문, 비밀번호, 결제, 환자 식별 정보가 없음을 단위 테스트로 검증
7. Popup에서 Pause 시 새 이벤트가 기록되지 않음
8. Popup에서 "내 데이터 내보내기" → `orderRx-events-{participant_id}-{timestamp}.json` 파일 생성
9. `tools/export_training_data.py`로 그 파일을 Gemma3 학습 포맷으로 변환 성공
10. Popup에서 "전체 삭제" 동작
11. 모든 코드가 코딩 규칙(`coding_rules.md`) 준수

---

## Milestone 2 — Backend & Multi-tester Infrastructure (Release 0.2~0.3)

### 목표
여러 테스터의 수집 데이터를 안전하게 집계하고 withdraw/delete를 정식으로 처리한다.

### 포함 범위 (요약)
- `/services/api` (FastAPI) 최소 구현: ingestion, schema validator, redaction verifier(2차), 업로드 인증
- Extension의 upload queue + secure upload client
- Withdraw / delete request flow 실제 구현
- Admin dashboard 최소 화면 (수집량, 참여자 상태, 삭제 요청 처리)
- 저장소 사용량 상한 및 순환 정책

### 뒤로 미룸
- Adapter draft 자동 생성
- Executor

---

## Milestone 3 — Deterministic Executor Prototype (Release 0.4)

### 목표
LLM 없이도 최소 workflow 1건을 deterministic하게 실행할 수 있는 executor 프로토타입.

### 포함 범위 (요약)
- `/packages/executor` (Python + Playwright)
- `/packages/adapters` 첫 번째 선언형 adapter
- `/apps/cli` (Typer) 최소 명령

---

## Milestone 4 — LLM Abstraction Attach (Release 0.5)

### 목표
`/packages/llm-core`를 executor에 교체 가능한 모듈로 연결하고, local/API provider 최소 2개를 A/B 비교 가능.

---

## 결정 일자
2026-04-07
