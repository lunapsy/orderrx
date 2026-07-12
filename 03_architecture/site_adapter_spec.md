# Site Adapter Spec

## 목적
사이트마다 다른 DOM 구조와 사용자 흐름을 선언형으로 다루기 위한 규격.

## 최소 구성
- site_id
- host_patterns
- page_classifiers
- login_flow
- search_flow
- detail_flow
- stock_check_flow
- cart_flow
- recovery_hints
- adapter_version

## 권장 구조 예시
```yaml
site_id: wholesaler_a
host_patterns:
  - order.example-a.co.kr
adapter_version: 1
page_classifiers:
  login:
    text_markers: ["로그인", "아이디", "비밀번호"]
  search:
    selector_candidates:
      - "input[name='keyword']"
      - "input[placeholder*='검색']"
flows:
  login:
    username_candidates:
      - "input[name='id']"
    password_candidates:
      - "input[type='password']"
    submit_candidates:
      - "button[type='submit']"
      - "text('로그인')"
```

## 금지
- 절대 좌표 기반 단계 저장
- 하드코딩된 해상도 의존 로직
- 사이트 전체 DOM 덤프 업로드
