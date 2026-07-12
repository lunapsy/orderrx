# API Contract (Initial)

## 목적
Training Track과 Backend 간 최소 API 규약을 고정한다.

## Endpoints
- `POST /v1/events/batch`
- `POST /v1/participants/withdraw`
- `POST /v1/participants/delete-request`
- `GET /v1/participants/status`
- `GET /v1/sites/allowed`

## Rules
- 모든 이벤트 batch는 schema_version 포함
- 서버는 redaction_status 검증 수행
- 삭제 요청은 비동기 처리 가능하나 상태 조회 가능해야 함
- allowed sites는 버전/갱신 시각 포함
