# PharmOrder Ultimate Final Pack

이 문서팩은 약국 주문 자동화 프로젝트의 **단일 기준(reference source of truth)** 이다.

목적:
- 병렬 작업 가능한 기준 문서 제공
- LLM(Claude/Codex 등) 투입 시 혼선 방지
- 제품 정의 / 아키텍처 / 보안 / 역할 / 실행 순서 / 체크리스트를 하나의 팩으로 고정

핵심 원칙:
- Training Track 먼저, Execution Track은 그 다음
- LLM은 교체 가능한 모듈로 설계
- 사용자 투명성, 중단권, 철회권, 삭제 요청은 필수
- Chrome Web Store 승인이 안 나도 프로젝트가 멈추지 않게 설계
- 좌표 기반 자동화 금지, DOM/의미 기반 접근 우선

추천 읽기 순서:
1. `01_master/master_instruction.md`
2. `01_master/final_kickoff_prompt.md`
3. `02_product/product_definition.md`
4. `03_architecture/system_architecture.md`
5. `06_execution/kickoff_sequence.md`
6. 역할별 문서
7. 정책 및 체크리스트

문서 우선순위:
1. `01_master` 최상위 지시서
2. `02_product` 제품 정의
3. `03_architecture` 아키텍처 규격
4. `04_policies` 정책
5. `05_roles` 역할별 작업 문서
6. `06_execution`, `08_repo`, `09_checklists` 실행 보조 문서
