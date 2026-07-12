# Master Instruction

## 목적
이 문서는 모든 참여자와 LLM이 따라야 하는 최상위 지시서다.

## 프로젝트의 본질
이 프로젝트의 핵심은 "좋은 모델을 붙이는 것"이 아니라 **사이트별 workflow 지식 베이스와 안전한 자동화 실행 구조를 만드는 것**이다.

## 절대 순서
1. Training Track을 먼저 만든다.
2. 사이트별 workflow를 먼저 수집하고 구조화한다.
3. deterministic executor를 먼저 만든다.
4. 그 위에 LLM abstraction layer를 올린다.
5. 사용자용 CLI/운영 제품은 그 다음이다.

## 절대 금지
- 좌표 기반 클릭 자동화
- 화면 녹화형 매크로 재생
- 아이디/비밀번호/OTP 원문 수집
- 환자 개인정보 수집
- 결제정보 수집
- 특정 모델(Gemma 포함) 전용 구조 고정
- 공개 Chrome Web Store 승인만 가정한 설계
- 사용자가 수집 내용을 볼 수 없는 구조
- Pause / site-off / withdraw / delete request 없는 Training Track
- "LLM이 알아서 해결할 것"이라는 전제

## 필수 트랙
### Track A: Training Track
참여자용 Chrome extension 기반 수집 프로그램.

필수 기능:
- 수집 상태 표시
- 최근 수집 이벤트 미리보기
- 수집 항목 설명
- 사이트별 ON/OFF
- 전체 Pause / Resume
- 참여 철회
- 업로드 데이터 삭제 요청
- 민감정보 마스킹 상태 설명

### Track B: Execution Track
CLI + deterministic executor + site adapter registry + optional LLM abstraction.

## 설계 원칙
### 1. Workflow-first
모델보다 workflow가 먼저다.

### 2. Deterministic-first
LLM 없이도 최소 기능이 돌아가야 한다.

### 3. LLM independence
LLM은 공급자 교체가 쉬워야 한다.

### 4. Privacy-first
민감정보는 업로드 전에 차단한다.

### 5. Transparency-first
사용자는 수집 내용을 확인하고 언제든 멈출 수 있어야 한다.

### 6. Release fallback ready
Web Store 승인 실패를 전제로도 프로젝트가 지속 가능해야 한다.

## 최종 목표
약국 주문 사이트 자동화를 안전하고 유지보수 가능하게 구현하되, 정책/신뢰/배포 리스크 때문에 프로젝트가 멈추지 않게 한다.
