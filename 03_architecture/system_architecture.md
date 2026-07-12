# System Architecture

## 전체 구조

```text
[Training Extension]
  -> consent manager
  -> transparency dashboard
  -> event logger
  -> sensitive-data redactor
  -> local queue
  -> secure upload client

[Backend]
  -> ingestion API
  -> schema validator
  -> redaction verifier
  -> workflow normalizer
  -> adapter registry
  -> deletion/withdrawal service
  -> admin dashboard

[Execution CLI]
  -> command parser
  -> deterministic executor
  -> site adapter registry
  -> browser bridge
  -> optional LLM abstraction layer
```

## 핵심 규칙
- executor는 LLM 없이도 작동 가능해야 한다.
- provider를 교체해도 event schema나 adapter를 수정하면 안 된다.
- 사이트별 adapter는 선언형 규칙 + 제한적 코드 훅 구조를 권장한다.
- 민감정보 필터는 UI 표시 전에, 업로드 전에, 서버 수신 후 3단계로 검증한다.
