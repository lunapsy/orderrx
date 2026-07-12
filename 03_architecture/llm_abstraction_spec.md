# LLM Abstraction Spec

## 목표
LLM을 핵심 엔진이 아니라 교체 가능한 추론 모듈로 다룬다.

## 필수 인터페이스
```text
LLMProvider
- generate_plan(task_context) -> Plan
- summarize_session(event_stream) -> Summary
- rank_selectors(candidates, dom_context) -> RankedList
- classify_step(page_context) -> StepClassification
- propose_recovery(error_context) -> RecoveryPlan
```

## 규칙
- 특정 모델 응답 형식을 내부 표준으로 삼지 않는다.
- prompt builder와 response validator를 분리한다.
- local provider와 API provider를 동일 인터페이스로 감싼다.
- provider 교체 시 application layer를 수정하지 않는다.

## 예시 provider
- GemmaLocalProvider
- OllamaProvider
- vLLMProvider
- OpenAIProvider
- GeminiProvider
- AnthropicProvider
