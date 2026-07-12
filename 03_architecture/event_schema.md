# Event Schema

## 원칙
- 원문 민감정보 저장 금지
- 필요한 최소 이벤트만 저장
- 사람이 읽을 수 있는 미리보기 가능
- 버전 관리 필수

## 공통 필드
- schema_version
- event_id
- session_id (rotating pseudonymous id)
- participant_id (pseudonymous)
- site_id
- page_type
- event_type
- event_time
- upload_status
- redaction_status

## 이벤트 타입 예시
- page_enter
- field_focus
- field_input
- click
- submit
- navigate
- result_rendered
- error
- retry
- pause_collection
- resume_collection
- site_off
- withdraw_request
- delete_request

## 금지 필드
- password_raw
- username_raw
- otp_raw
- payment_raw
- patient_name
- patient_phone
- cookies
- auth_tokens

## 입력값 처리 규칙
- 기본 저장 금지
- 저장이 필요하면 `length`, `token_class`, `hashed_representation`만 고려
- password 계열 필드는 값 처리 자체를 금지

## 참조
- Milestone 1 범위의 이벤트 6종, URL 정규화, redaction 패턴, token class 분류 규칙은 `event_schema_m1_detail.md`를 참조한다.
