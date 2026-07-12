# OrderRx M1 Smoke Test

이 디렉토리는 빌드된 extension을 실제 Chrome에 로드해서 6종 이벤트가 모두 정상적으로
수집되는지 확인하는 수동 테스트 절차입니다.

## 목표

- DoD #6: 민감 필드(password, jumin, card_number, phone, patient_name)가 모두 `redaction_status="blocked"`로 기록되는지 확인
- 6종 이벤트(`page_enter`, `click`, `field_focus`, `submit`, `navigate`, `result_rendered`)가 모두 IndexedDB에 쌓이는지
- popup의 export JSON에 원본 민감값이 단 한 글자도 없는지

## 사전 조건

- `pnpm install`, `pnpm schema:gen` 완료
- `pnpm --filter @orderrx/extension test` 통과 (101/101)

## 1단계 — extension 빌드

```bash
pnpm --filter @orderrx/extension build
```

성공하면 `apps/extension/dist/` 폴더가 생기고 그 안에 번들된 manifest.json,
content script, service worker, popup이 들어있어요.

## 2단계 — 로컬 HTTP 서버로 fixture 띄우기

`file://` URL은 Chrome MV3에서 별도 권한 없이는 content script가 안 붙으므로
간단한 로컬 서버를 사용합니다.

```bash
cd apps/extension/fixtures
python3 -m http.server 8765
```

브라우저에서 `http://localhost:8765/test-form.html` 열면 더미 폼이 보입니다.
**아직 어떤 값도 입력하지 마세요. extension 로드부터 먼저 합니다.**

## 3단계 — Chrome에 unpacked load

1. Chrome 주소창 → `chrome://extensions`
2. 우상단 "개발자 모드" 켜기
3. "압축해제된 확장 프로그램을 로드합니다" 클릭
4. `apps/extension/dist` 폴더 선택
5. 로드된 카드에 "OrderRx Training Track 0.1.0" 표시 확인
6. 카드 우측 "오류" 버튼이 있으면 클릭해서 service worker 로그 확인 (없으면 OK)

## 4단계 — 도메인 등록 및 수집 활성화

1. Chrome 툴바의 OrderRx 아이콘(없으면 퍼즐 아이콘에서 핀 고정) 클릭 → popup 열림
2. 참여자 ID 표시 확인 (UUID 형식)
3. "도메인 추가" 입력란에 `localhost` 입력 → "추가" 클릭
4. 목록에 `localhost` 가 추가되고 체크박스가 켜져 있음을 확인
5. 상단 consent 토글을 켜서 "수집 중" 상태로 전환
6. popup 닫기

## 5단계 — fixture에서 워크플로 실행

`http://localhost:8765/test-form.html` 탭으로 돌아가 **새로고침**(이때 page_enter 이벤트가 잡힘).

다음 순서로 조작:

### 5-1. 검색 워크플로
1. 검색어 입력란 클릭(focus) → "타이레놀" 입력
2. 카테고리에서 "진통제" 선택
3. "검색" 버튼 클릭
4. 0.35초 후 결과 목록이 렌더링됨 → result_rendered 이벤트 발생 기대

### 5-2. 로그인 (민감 필드 차단 검증)
1. 아이디 입력란 클릭 → `testuser` 입력
2. **비밀번호 입력란 클릭 → 아무거나 입력 (예: `dummy123`)**
3. "로그인" 버튼 클릭

### 5-3. 주문 폼 (혼합)
1. 상품 ID 클릭 (clean)
2. 수량 클릭 (clean)
3. **환자 이름 클릭 → `홍길동` 입력 (blocked 기대)**
4. **연락처 클릭 → `01012345678` 입력 (blocked 기대)**
5. **카드번호 클릭 → `4111-1111-1111-1111` 입력 (blocked 기대)**
6. **주민번호 클릭 → `901011-1234567` 입력 (blocked 기대)**
7. "주문하기" 버튼 클릭 → 결과 영역 렌더링

### 5-4. 네비게이션
1. 페이지 하단 "같은 페이지 재방문" 링크 클릭
2. URL이 `?from=order&jsessionid=ABCDEF123&phone=01012345678#anchor` 인 페이지로 이동
3. extension은 이 URL을 정규화하여 `jsessionid` 제거 + `phone` 값 `[PHONE]` 마스킹 기대

## 6단계 — popup에서 결과 검증

1. extension popup 다시 열기
2. "수집된 이벤트 수" 가 10개 이상인지 확인
3. "최근 이벤트 5개" 미리보기에서 `field_focus`, `click`, `submit`, `result_rendered`, `navigate`, `page_enter` 등이 보이는지
4. **"이벤트 내보내기"** 클릭 → JSON 파일 다운로드

## 7단계 — JSON 검증 (가장 중요)

다운로드된 `orderRx-events-*.json` 파일을 에디터로 열어 다음을 grep:

```bash
# 절대 나오면 안 되는 토큰들 (실제 입력값)
grep -F 'dummy123'           orderRx-events-*.json   # password
grep -F '홍길동'              orderRx-events-*.json   # patient name
grep -F '01012345678'         orderRx-events-*.json   # phone
grep -F '4111-1111-1111-1111' orderRx-events-*.json   # card
grep -F '901011-1234567'      orderRx-events-*.json   # rrn
grep -F 'ABCDEF123'           orderRx-events-*.json   # session token in URL
```

**위 6개 grep이 모두 0건이면 DoD #6 통과.**

추가로 확인할 것:

- `field_name` 이 민감 필드는 모두 `"[REDACTED]"` 인지
- `token_class` 가 민감 필드에서는 `"blocked"` 인지
- `input_length` 가 민감 필드에서는 `-1` 인지
- `redaction_status` 가 민감 필드 focus 이벤트에서 `"blocked"` 인지
- navigate 이벤트의 `to_url_canonical` 에서 `jsessionid` 가 제거됐는지, `phone` 값이 `[PHONE]` 으로 바뀌었는지

## 8단계 — 정리

검증 끝나면:

1. popup에서 "전체 삭제" 클릭하여 IndexedDB 비우기
2. consent 토글 끄기
3. `chrome://extensions` 에서 OrderRx 카드 "제거" 또는 "사용 안함"
4. 로컬 HTTP 서버 종료 (Ctrl+C)

## 트러블슈팅

- **popup이 안 열림 / 빈 화면**: `chrome://extensions` 에서 OrderRx 카드 "오류" 버튼 → service worker / popup 콘솔 메시지 확인
- **이벤트 수가 0**: consent 가 active 인지, 도메인 목록에 `localhost` 가 있고 체크박스가 켜져 있는지 확인
- **content script 로그 안 보임**: fixture 페이지에서 우클릭 → 검사 → Console 탭. `[orderrx:` prefix 로그가 나와야 함
- **빌드 에러**: `pnpm schema:gen` 을 먼저 돌렸는지 확인
