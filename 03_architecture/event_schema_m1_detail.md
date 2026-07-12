# Event Schema — M1 Detail

본 문서는 `03_architecture/event_schema.md`의 원칙을 Milestone 1 범위에 맞춰 구체화한 보조 문서다. 원본과 충돌 시 원본을 우선한다. 본 문서는 M1 구현에서 사용할 이벤트 6종의 정확한 필드 구성, URL 정규화 규칙, 민감정보 리댁션 규칙, 토큰 클래스 분류 규칙을 정의한다.

## Schema Version
- `schema_version`: `"0.1.0"`
- Milestone 1 전용. M2 이후 backend와 연동되며 버전 bump 예상.

## M1 이벤트 6종
M1에서 수집하는 이벤트는 아래 6종으로 고정한다. `event_schema.md`의 `event_type` 목록 중 M1 범위에 해당하는 부분집합이다.

1. `page_enter`
2. `click`
3. `field_focus`
4. `submit`
5. `navigate`
6. `result_rendered`

운영용 이벤트(`pause_collection`, `resume_collection`, `site_off`, `withdraw_request`, `delete_request`)는 M2에서 backend와 함께 활성화한다.
`field_input`은 M1에서 활성화하지 않는다. 입력 메타 정보는 `field_focus`의 blur 시점 업데이트로만 남긴다.

## 공통 필드 (모든 이벤트)
`event_schema.md`의 공통 필드 위에 M1에서 아래 필드를 추가한다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `schema_version` | string | `"0.1.0"` 고정 |
| `event_id` | string (UUID v4) | 이벤트 고유 ID |
| `session_id` | string | 브라우저 세션 단위 rotating pseudonymous ID. 세션은 탭 단위 또는 30분 비활성 기준으로 회전. |
| `participant_id` | string (UUID v4) | 설치 시 생성된 참여자 ID |
| `site_id` | string | 등록된 도메인의 해시(또는 사용자 지정 별칭의 해시). 원문 도메인 저장 금지 여부는 M2에서 재검토. M1은 원문 도메인 저장 허용. |
| `page_type` | string | `login` / `search` / `product_detail` / `cart` / `order` / `unknown` 등. M1은 `unknown` 기본값 허용. |
| `event_type` | string | 위 6종 중 하나 |
| `event_time` | string (ISO 8601) | 클라이언트 기준 |
| `upload_status` | string | M1은 항상 `"local_only"` |
| `redaction_status` | string | `"clean"` / `"redacted"` / `"blocked"` |
| `url_canonical` | string | 아래 URL 정규화 규칙 적용된 값 |
| `viewport` | object | `{width: number, height: number}` — 재현 컨텍스트 |
| `dom_ready` | boolean | 이벤트 발생 시점에 `document.readyState === "complete"` 여부 |
| `sequence_number` | number | 세션 내 단조 증가 번호 |

## URL 정규화 규칙 (`url_canonical`)
대상 사이트는 약국용 **제품 주문 사이트**이며 한국에서는 일반적으로 URL에 환자 식별자가 포함되지 않는다. query string에는 검색어, 상품 ID, 카테고리 필터, 페이지네이션 등 **workflow 재구성에 필수적인 정보**가 들어 있으므로 기본적으로 유지한다. 대신 세션/인증 관련 파라미터와 민감 패턴 값만 선별적으로 제거한다.

### 유지 / 제거 규칙
- 유지: `protocol`, `host`, `path`, `query` (필터링 후)
- 제거: `fragment`, `userinfo`

### Query string 필터링
1. **파라미터 이름 블랙리스트** — 아래 이름과 case-insensitive 매치되는 파라미터는 통째로 제거한다.
   - 세션: `session`, `sid`, `jsessionid`, `phpsessid`, `aspsessionid`, `sessionid`
   - 토큰: `token`, `access_token`, `refresh_token`, `id_token`, `auth`, `authorization`, `api_key`, `apikey`
   - CSRF: `csrf`, `csrf_token`, `xsrf`, `_csrf`
   - 기타: `password`, `pwd`, `otp`, `code` (auth 컨텍스트)

2. **파라미터 값 redaction** — 블랙리스트에 걸리지 않은 파라미터의 값에 대해 아래 "페이지 텍스트 redaction 패턴" 5종을 순서대로 적용한다. 예: `?q=타이레놀&order=%EC%9D%B4%EB%A6%84:01012345678` → `?q=타이레놀&order=%EC%9D%B4%EB%A6%84:[PHONE]`.

### 예시
- 입력: `https://example-pharm.co.kr/search?q=타이레놀&cat=analgesic&page=2#top`
- 출력: `https://example-pharm.co.kr/search?q=타이레놀&cat=analgesic&page=2`

- 입력: `https://example-pharm.co.kr/product?id=12345&jsessionid=ABCDEF123456`
- 출력: `https://example-pharm.co.kr/product?id=12345`

- 입력: `https://example-pharm.co.kr/cart?items=3&phone=01012345678`
- 출력: `https://example-pharm.co.kr/cart?items=3&phone=[PHONE]`

### 근거
- 제품 주문 사이트의 URL query는 workflow 학습의 핵심 신호다 (검색어, 상품 ID, 필터).
- 환자 식별자는 해당 도메인에서 URL에 노출되지 않는 것이 일반적이다 (2026-04-07 lunap 확인).
- 그럼에도 세션/인증 토큰과 이메일/전화/카드 같은 패턴은 모든 사이트에서 공통적으로 위험하므로 이름 블랙리스트와 값 redaction을 적용한다.

## 이벤트별 필드 상세

### 1. `page_enter`
페이지가 허용 도메인에서 로드될 때 1회 발생.

| 필드 | 타입 | 설명 |
|---|---|---|
| `page_title_redacted` | string | 페이지 타이틀에 redaction 패턴 적용 후 저장. 길이 상한 80자. |
| `referrer_site_id` | string \| null | referrer가 다른 허용 도메인이면 그 `site_id`, 아니면 `null` |
| `load_duration_ms` | number | `performance.timing` 기반 근삿값 |

### 2. `click`
허용 도메인 내에서 발생한 모든 마우스 클릭. **좌표는 저장하지 않는다.**

| 필드 | 타입 | 설명 |
|---|---|---|
| `target_selector` | string | 안정적 CSS selector (`id` 우선, 없으면 `data-*` 속성, 없으면 `tag:nth-of-type` 체인) |
| `target_tag` | string | 예: `button`, `a`, `div` |
| `target_role` | string \| null | ARIA `role` 속성 값 |
| `target_text_redacted` | string | 요소의 가시 텍스트에 redaction 적용 후 앞 40자 |
| `target_href_canonical` | string \| null | `<a>`인 경우 URL 정규화 적용된 href |
| `modifier_keys` | object | `{ctrl, shift, alt, meta}` boolean |

### 3. `field_focus`
`input`, `textarea`, `select` 요소에 focus가 들어올 때 발생. blur 시 동일 `event_id`로 `input_length`와 `token_class`를 업데이트한다.
**필드 값(value) 자체는 어떠한 형태로도 저장하지 않는다. 해시 포함 금지.**

| 필드 | 타입 | 설명 |
|---|---|---|
| `field_selector` | string | 안정적 CSS selector |
| `field_name` | string | `name` 속성. 민감 패턴 매치 시 `"[REDACTED]"` |
| `field_type` | string | `type` 속성 값 (text, email, password, number …) |
| `field_autocomplete` | string \| null | `autocomplete` 속성 |
| `field_label_redacted` | string \| null | 연결된 `<label>` 텍스트에 redaction 적용 후 앞 40자 |
| `input_length` | number | blur 시점 값의 길이. focus 시에는 0. |
| `token_class` | string | 아래 토큰 클래스 분류 |
| `is_sensitive` | boolean | 민감 필드로 판정되었는지 |
| `sensitive_reason` | string \| null | 판정 규칙 이름 (예: `"field_name_pattern:password"`) |

`field_type === "password"`인 경우: 어떠한 입력값 관련 메타도 기록하지 않는다. `input_length`는 `-1`, `token_class`는 `"blocked"`.

### 4. `submit`
form 제출 시 발생.

| 필드 | 타입 | 설명 |
|---|---|---|
| `form_selector` | string | 안정적 CSS selector |
| `form_action_domain` | string | form `action`의 호스트만. path 저장 금지. |
| `field_count` | number | form 내 input/textarea/select 개수 |
| `field_names_redacted` | string[] | form의 각 필드 이름. 민감 패턴 매치 항목은 `"[REDACTED]"` |
| `submit_trigger` | string | `"button_click"` / `"enter_key"` / `"programmatic"` |

### 5. `navigate`
SPA 내비게이션 또는 전체 페이지 이동.

| 필드 | 타입 | 설명 |
|---|---|---|
| `from_url_canonical` | string | 정규화된 이전 URL |
| `to_url_canonical` | string | 정규화된 다음 URL |
| `navigation_type` | string | `"link_click"` / `"form_submit"` / `"history"` / `"reload"` / `"unknown"` |
| `trigger_event_id` | string \| null | 이 내비게이션을 유발한 직전 `click`/`submit` 이벤트의 `event_id` |

### 6. `result_rendered`
검색 결과 / 상품 리스트 / 에러 메시지 같은 "응답" 렌더링 감지.
M1 구현: `MutationObserver`로 주요 컨테이너 셀렉터 후보(`[class*="result"]`, `[class*="list"]`, `[role="listbox"]`, `[role="alert"]`, 기타 M1에서 harcode된 heuristic 리스트)를 관찰한다. 사이트별 정밀한 selector 매핑은 M2 adapter 단계.

| 필드 | 타입 | 설명 |
|---|---|---|
| `container_selector` | string | 변화가 감지된 컨테이너의 selector |
| `item_count` | number | 컨테이너 내 직계 자식 수 (근삿값) |
| `result_type_guess` | string | `"search_results"` / `"product_list"` / `"error_message"` / `"stock_info"` / `"other"` |
| `render_duration_ms` | number | 직전 `navigate`/`submit`으로부터의 경과 시간 |

## 토큰 클래스 (`token_class`) 분류
`field_focus`의 blur 시점에 필드 값으로부터 **메모리 내에서만** 계산하고, 계산 직후 값 참조를 해제한다. 결과는 아래 중 하나.

| 값 | 설명 |
|---|---|
| `empty` | 길이 0 |
| `digits` | 숫자만 |
| `alpha_lower` | 영문 소문자만 |
| `alpha_upper` | 영문 대문자만 |
| `alpha_mixed` | 영문 대소문자 혼합 |
| `alphanumeric` | 영문+숫자 |
| `korean` | 한글만 |
| `korean_mixed` | 한글+영문 또는 한글+숫자 |
| `email_like` | `@`와 `.`을 포함한 전형적 이메일 패턴 |
| `phone_like` | 숫자와 `-`만으로 구성된 전형적 전화 패턴 |
| `mixed_symbols` | 위 어디에도 해당하지 않음 |
| `blocked` | password 계열 — 값에 접근하지 않고 고정 반환 |

금지: 값 저장, 값 해시, 값의 부분 문자열, 값의 n-gram.

## 민감정보 차단 규칙

### 필드명 패턴 (case-insensitive, 정규식)
아래 패턴 중 하나라도 매치되면 해당 필드는 `is_sensitive = true`, `field_name`은 `"[REDACTED]"`, `token_class` 계산 생략(`"blocked"`).

| 카테고리 | 패턴 | sensitive_reason |
|---|---|---|
| 비밀번호 | `password|passwd|pwd|pass` | `field_name_pattern:password` |
| 인증 코드 | `otp|otc|2fa|auth.?code|verify.?code` | `field_name_pattern:otp` |
| 카드 | `card|cvv|cvc|exp.?date|expiry` | `field_name_pattern:card` |
| 주민번호 | `ssn|jumin|rrn|resident|주민` | `field_name_pattern:rrn` |
| 환자/개인 | `patient|환자|name|이름|birth|생년|dob` | `field_name_pattern:patient` |
| 연락처 | `phone|tel|mobile|휴대|연락` | `field_name_pattern:phone` |
| 면허/자격 | `license|면허|cert` | `field_name_pattern:license` |
| 계좌 | `bank|account|계좌|routing` | `field_name_pattern:bank` |
| 토큰/세션 | `token|session|cookie|auth.?key|api.?key` | `field_name_pattern:token` |

### 페이지 텍스트 redaction 패턴
`page_title_redacted`, `target_text_redacted`, `field_label_redacted` 저장 전에 아래 정규식 치환을 순서대로 적용한다.

| 패턴 | 치환 |
|---|---|
| 한국 주민번호 `\d{6}[-\s]?\d{7}` | `[RRN]` |
| 국내 휴대전화 `01\d[-.\s]?\d{3,4}[-.\s]?\d{4}` | `[PHONE]` |
| 이메일 `[\w.+-]+@[\w-]+\.[\w.-]+` | `[EMAIL]` |
| 카드 번호 `\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b` | `[CARD]` |
| 10자리 이상 숫자열 `\b\d{10,}\b` | `[DIGITS]` |

치환이 1회 이상 발생한 이벤트는 `redaction_status = "redacted"`. 필드명 패턴에 막혀 값 자체가 수집되지 않은 이벤트는 `redaction_status = "blocked"`. 그 외 `"clean"`.

### 절대 저장 금지 (`event_schema.md`의 금지 필드 재확인)
- `password_raw`, `username_raw`, `otp_raw`, `payment_raw`
- `patient_name`, `patient_phone`
- `cookies`, `auth_tokens`
- 추가: field value(평문), field value 해시, field value의 부분 문자열, URL fragment 원문, URL query string의 블랙리스트 파라미터(세션/토큰/CSRF 등) 원문

## 검증 요구사항
M1 DoD 6번을 만족하기 위해 아래 자동 테스트를 작성한다.

1. 모든 이벤트 샘플에서 위 "절대 저장 금지" 필드/값이 포함되지 않음을 단위 테스트로 검증
2. 필드명 패턴 매칭 테스트: 각 패턴당 positive/negative 케이스 최소 3개
3. 페이지 텍스트 redaction 테스트: 각 패턴에 대한 치환 전후 비교
4. URL 정규화 테스트: fragment 제거, 블랙리스트 파라미터 제거, 허용 파라미터 유지, 값 redaction 적용 확인
5. `field_type === "password"` 시 `input_length = -1`, `token_class = "blocked"` 확인

## 결정 일자
2026-04-07
