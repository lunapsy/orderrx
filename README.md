# OrderRx (PharmPilot)

약국 주문 사이트 workflow 학습·자동화 플랫폼. 본 리포지토리는 문서팩과 Milestone 1 범위의 초기 코드를 포함한다.

## 프로젝트 본질
"좋은 모델을 붙이는 것"이 아니라 **사이트별 workflow 지식 베이스와 안전한 자동화 실행 구조를 만드는 것**. 상세는 `01_master/master_instruction.md`.

## 현재 상태
- Milestone 0 (Decisions only): **CLOSED** (2026-04-07)
- Milestone 1 (Training Data Collection Extension): **DONE** — 0.1.0 첫 실배포 (2026-04-08)
- Milestone 1.5 (동의 절차 + 자동 업로드): **DONE** — 0.2.0 (2026-07-13)
- 0.3.0 (2026-07-13): Web Store 제출 대비 — 설치 시 host 권한 0개, 등록 도메인에만 런타임 권한 요청 + 동적 주입. 제출 자료: `PRIVACY.md`, `06_execution/webstore_listing_draft.md`
  - popup 첫 실행 참여 동의 게이트 (`apps/extension/CONSENT.md` v1.0.0, 동의 기록 저장·서버 전송)
  - 수집 이벤트 Supabase 자동 업로드(1분 주기) 후 로컬 자동 삭제 — 로컬 용량 문제 해소
  - 서버는 anon INSERT-only RLS (참여자 단말에서 타인 데이터 조회 불가)
  - 이벤트에 `app_version` 스탬프, 다중 참여자 병합 도구 `tools/merge_events.py`

## 디렉토리
- `00_overview/` ~ `09_checklists/` — 문서팩 (single source of truth)
- `apps/extension/` — Chrome Extension (TypeScript + Vite + MV3)
- `packages/schema/` — JSON Schema 원본 + 생성 타입
- `tools/` — Python 변환 스크립트 (export_training_data.py)

## 주요 문서
- `01_master/master_instruction.md` — 최상위 원칙
- `06_execution/solo_milestones.md` — 솔로 운영 마일스톤 정의
- `08_repo/stack_decision.md` — 기술 스택 결정
- `08_repo/coding_rules.md` — 코딩 규칙
- `03_architecture/event_schema_m1_detail.md` — M1 이벤트 스키마 상세

## 로컬 개발

### 사전 요구
- Node.js 20 이상
- pnpm 9 이상
- Python 3.11 이상 (tools/ 용)

### 설치
```bash
pnpm install
```

### 스키마 타입 생성
```bash
pnpm schema:gen
```
TS 타입은 `packages/schema/generated/ts/` 에 생성된다. Python 타입은 `packages/schema/README.md` 참조.

### Extension 빌드
```bash
pnpm ext:build
```
`apps/extension/dist/` 가 생성되면 Chrome의 `chrome://extensions` → "개발자 모드" → "압축해제된 확장 프로그램을 로드합니다" 로 dist 폴더를 선택.

### Extension 개발 (watch)
```bash
pnpm ext:dev
```

### Export 도구 (Python)
```bash
pip install -r tools/requirements.txt
python tools/export_training_data.py \
  --input ./orderRx-events-xxx.json \
  --output ./train-gemma3.jsonl \
  --target gemma3
```

## 보안/프라이버시 원칙
- 비밀번호, 카드, 주민번호, 환자 정보 등은 절대 수집하지 않는다 (차단·마스킹).
- 모든 수집은 사용자가 popup에서 명시적으로 활성화한 상태에서만 이뤄진다.
- M1에서는 서버 업로드가 없으며 모든 데이터는 브라우저 로컬에만 저장된다.
- 상세는 `04_policies/privacy_and_data_collection.md` 와 `event_schema_m1_detail.md`.

## 저장소 구조 개요
```
/
├── apps/
│   └── extension/          # Chrome MV3 extension
├── packages/
│   └── schema/             # JSON Schema SSoT
├── tools/
│   └── export_training_data.py
├── 00_overview/            # 문서팩 시작
├── 01_master/
├── ...
├── 09_checklists/
├── package.json            # pnpm workspace root
├── pnpm-workspace.yaml
└── tsconfig.base.json
```
