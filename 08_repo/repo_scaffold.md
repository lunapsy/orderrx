# Repo Scaffold

## Top-level directories
- `/apps/extension`
- `/apps/cli`
- `/apps/admin`
- `/services/api`
- `/packages/schema`
- `/packages/adapters`
- `/packages/executor`
- `/packages/llm-core`
- `/packages/shared`
- `/docs`

## Notes
- schema와 adapter는 독립 버전 관리
- extension와 cli는 shared contracts를 참조
- 문서팩은 `/docs/final-reference`로 복제 가능

## M1 Minimal Scaffold
Milestone 1(`06_execution/solo_milestones.md` 참조)에서 실제로 생성/수정하는 디렉토리만 나열한다. 나머지는 M2 이후 단계에서 추가한다.

```text
/apps/extension/
  ├── src/
  │   ├── background/           # service worker: participant_id 생성, 설정 관리
  │   ├── content/              # content script: 이벤트 캡처
  │   ├── popup/                # popup UI: consent, 도메인 관리, transparency
  │   ├── storage/              # IndexedDB 래퍼, chrome.storage 래퍼 (분리)
  │   ├── redaction/            # 민감정보 1차 필터 (단독 모듈)
  │   ├── events/               # 이벤트 생성/검증 (schema 참조)
  │   └── logging/              # 단계별 로거 (debug/info/warn/error)
  ├── public/                   # manifest.json, 아이콘
  ├── tests/                    # 단위 테스트 (redaction, storage, event shape)
  └── vite.config.ts

/packages/schema/
  ├── json/                     # JSON Schema 원본 (single source of truth)
  ├── generated/
  │   ├── ts/                   # extension이 import
  │   └── python/               # export tool이 import
  └── scripts/                  # 타입 생성 스크립트

/tools/
  └── export_training_data.py   # 중립 JSON → Gemma3 학습 포맷 변환 (adapter 분리)

/docs/                          # 기존 문서팩 참조
```

### M1에서 만들지 않는 것
- `/apps/cli`, `/apps/admin`
- `/services/api`
- `/packages/adapters`, `/packages/executor`, `/packages/llm-core`, `/packages/shared`

### 구조 원칙
- 각 하위 디렉토리는 단일 역할만 담당한다 (`coding_rules.md`의 역할별 분리 규칙).
- `redaction/`, `storage/`, `logging/`은 다른 모듈이 의존하는 저수준 모듈로, 서로 순환 참조하지 않는다.
- `events/` 모듈만 `/packages/schema`의 생성 타입을 import하며, content/popup/background는 `events/`를 통해서만 이벤트를 생성한다.
