# @orderrx/schema

OrderRx 이벤트 스키마의 **single source of truth**. JSON Schema 원본을 `json/`에 두고 TS/Python 타입을 자동 생성한다.

## 구조
```
json/                       # 원본 JSON Schema (수정은 여기서만)
  event_base.schema.json    # 공통 필드
  events/
    page_enter.schema.json
    click.schema.json
    field_focus.schema.json
    submit.schema.json
    navigate.schema.json
    result_rendered.schema.json
generated/
  ts/                       # TS 타입 (자동 생성물, 수정 금지)
  python/                   # Python 타입 (자동 생성물, 수정 금지)
scripts/
  generate_ts.mjs           # json-schema-to-typescript 러너
```

## 타입 생성
TS: `pnpm gen:ts` (또는 루트에서 `pnpm schema:gen`)

Python: tools/ 디렉토리에서 다음 명령으로 생성 (Python 환경이 tools/ 쪽에 있음)
```bash
cd tools
datamodel-codegen \
  --input ../packages/schema/json \
  --input-file-type jsonschema \
  --output ../packages/schema/generated/python/events.py \
  --output-model-type pydantic_v2.BaseModel
```

## 스키마 버전
- 현재: `0.1.0` (M1)
- 변경 시 `event_base.schema.json`의 `schema_version` enum도 동시 업데이트할 것.

## 관련 문서
- `03_architecture/event_schema.md`
- `03_architecture/event_schema_m1_detail.md`
