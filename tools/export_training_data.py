"""
역할: extension이 내보낸 중립 이벤트 JSON을 학습 데이터 포맷으로 변환한다.

핵심 원칙:
    - 변환 로직은 모델별 adapter로 완전히 분리한다.
    - event schema는 모델 중립을 유지한다.
    - 새 모델 지원은 GemmaAdapter 처럼 Adapter 클래스를 추가하는 것으로 끝.

사용 예:
    python tools/export_training_data.py \\
        --input ./orderRx-events-xxx.json \\
        --output ./train-gemma3.jsonl \\
        --target gemma3

상세 문서:
    06_execution/solo_milestones.md  (M1 DoD 9번)
    03_architecture/event_schema_m1_detail.md
"""

from __future__ import annotations

import argparse
import json
import logging
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# 로깅 설정 — coding_rules.md 의 "로깅 규칙" 준수.
# 민감정보는 이미 extension 단계에서 제거되어 있지만, 여기서도 값 출력은 금지.
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="[%(levelname)s][%(name)s][%(funcName)s] %(message)s",
)
log = logging.getLogger("orderrx.export")


# ---------------------------------------------------------------------------
# Adapter 인터페이스
# ---------------------------------------------------------------------------
class TrainingDataAdapter(ABC):
    """
    학습 데이터 포맷 변환기 기본 인터페이스.

    새 모델을 추가하려면 이 클래스를 상속하여 `transform()` 만 구현한다.
    application 레이어(main)는 어떤 adapter가 선택되었는지에 무관하게 동작해야 한다.
    """

    #: adapter 식별자 (CLI --target 에서 사용)
    name: str = "base"

    @abstractmethod
    def transform(self, events: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """
        이벤트 목록을 학습 샘플 목록으로 변환한다.

        Args:
            events: extension에서 내보낸 중립 이벤트 객체 리스트.

        Returns:
            adapter별 학습 샘플 리스트. 각 샘플은 JSON 직렬화 가능해야 한다.
        """


# ---------------------------------------------------------------------------
# Gemma3 adapter (M1 초기 구현 스텁)
# ---------------------------------------------------------------------------
class Gemma3Adapter(TrainingDataAdapter):
    """
    Gemma3 fine-tuning 용 instruction / input / output 포맷.

    M1 스텁: workflow 재구성 휴리스틱은 단순하다.
        - page_enter / navigate / click / submit / result_rendered 이벤트를 시간 순으로 묶고
        - click + submit + result_rendered 로 이어지는 최소 단위를 "workflow step" 으로 본다.
        - 각 step을 하나의 instruction-response 샘플로 변환한다.

    제대로 된 workflow 클러스터링은 M2 이후 별도 모듈에서 수행한다.
    이 adapter는 프레임워크의 동작 확인용 최소 구현일 뿐 품질 보장 대상은 아니다.
    """

    name = "gemma3"

    def transform(self, events: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """
        단계 1: 이벤트를 event_time 기준 정렬
        단계 2: session_id 로 그룹핑
        단계 3: 각 세션에서 workflow step 후보를 추출
        단계 4: step → {instruction, input, output} 로 매핑
        """
        log.info("변환 시작: 입력 이벤트 %d건", len(events))

        # 단계 1
        sorted_events = sorted(events, key=lambda e: e.get("event_time", ""))
        log.debug("정렬 완료")

        # 단계 2
        by_session: dict[str, list[dict[str, Any]]] = {}
        for e in sorted_events:
            sid = str(e.get("session_id", "unknown"))
            by_session.setdefault(sid, []).append(e)
        log.info("세션 %d개 발견", len(by_session))

        # 단계 3-4
        samples: list[dict[str, Any]] = []
        for sid, session_events in by_session.items():
            log.debug("세션 %s: 이벤트 %d건", sid[:8], len(session_events))
            step_sample = _session_to_sample(session_events)
            if step_sample is not None:
                samples.append(step_sample)

        log.info("변환 완료: 출력 샘플 %d건", len(samples))
        return samples


def _session_to_sample(session_events: list[dict[str, Any]]) -> dict[str, Any] | None:
    """
    하나의 세션에서 Gemma3 학습 샘플 1건을 추출한다.

    현재 구현은 극도로 단순한 휴리스틱:
        instruction: "다음 페이지에서 사용자가 취한 workflow를 설명하세요."
        input: 이벤트들의 요약 리스트 (민감정보 이미 제거됨)
        output: "" (M1에서는 라벨링 미수행, M2 이후 사람이 채움)

    라벨이 비어 있더라도 학습 스크립트가 데이터 구조를 검증할 수 있게 하는 것이 목적.
    """
    if not session_events:
        return None

    summary_lines = []
    for e in session_events:
        etype = e.get("event_type", "?")
        url = e.get("url_canonical", "")
        extra = ""
        if etype == "click":
            extra = f' text="{e.get("target_text_redacted", "")}"'
        elif etype == "submit":
            extra = f' fields={e.get("field_count", 0)}'
        elif etype == "result_rendered":
            extra = f' items={e.get("item_count", 0)} guess={e.get("result_type_guess", "")}'
        summary_lines.append(f"- [{etype}] {url}{extra}")

    return {
        "instruction": "다음 이벤트 시퀀스로부터 사용자의 workflow를 설명하세요.",
        "input": "\n".join(summary_lines),
        "output": "",  # M1에서는 공란. 라벨링은 수동 단계에서 채움.
        "meta": {
            "session_id": session_events[0].get("session_id"),
            "participant_id": session_events[0].get("participant_id"),
            "event_count": len(session_events),
            "schema_version": session_events[0].get("schema_version"),
        },
    }


# ---------------------------------------------------------------------------
# Adapter 레지스트리
# ---------------------------------------------------------------------------
ADAPTERS: dict[str, type[TrainingDataAdapter]] = {
    "gemma3": Gemma3Adapter,
}


def get_adapter(target: str) -> TrainingDataAdapter:
    """
    target 이름으로 adapter 인스턴스를 반환.
    존재하지 않으면 ValueError.
    """
    if target not in ADAPTERS:
        raise ValueError(f"unknown adapter: {target}. available: {list(ADAPTERS)}")
    return ADAPTERS[target]()


# ---------------------------------------------------------------------------
# I/O
# ---------------------------------------------------------------------------
def load_events(path: Path) -> list[dict[str, Any]]:
    """
    extension 이 내보낸 JSON 파일을 읽어 이벤트 리스트를 반환.

    파일은 최상위가 배열인 JSON 을 기대한다.
    """
    log.info("읽기: %s", path)
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("입력 파일의 최상위는 이벤트 배열이어야 합니다.")
    log.info("읽기 완료: %d건", len(data))
    return data


def write_jsonl(path: Path, samples: list[dict[str, Any]]) -> None:
    """
    샘플 리스트를 JSONL (한 줄에 한 객체) 로 쓴다. 학습 스크립트가 읽기 쉬운 형식.
    """
    log.info("쓰기: %s (%d건)", path, len(samples))
    with path.open("w", encoding="utf-8") as f:
        for s in samples:
            f.write(json.dumps(s, ensure_ascii=False) + "\n")
    log.info("쓰기 완료")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def parse_args() -> argparse.Namespace:
    """CLI 인자 파싱."""
    p = argparse.ArgumentParser(description="OrderRx 학습 데이터 변환기")
    p.add_argument("--input", required=True, type=Path, help="입력 이벤트 JSON 파일 경로")
    p.add_argument("--output", required=True, type=Path, help="출력 JSONL 파일 경로")
    p.add_argument(
        "--target",
        required=False,
        default="gemma3",
        choices=sorted(ADAPTERS.keys()),
        help="변환 대상 모델 (기본: gemma3)",
    )
    return p.parse_args()


def main() -> int:
    """엔트리 포인트. 단계별 로그 남김."""
    args = parse_args()

    log.info("단계 1/4: 이벤트 로드")
    events = load_events(args.input)

    log.info("단계 2/4: adapter 선택 — target=%s", args.target)
    adapter = get_adapter(args.target)

    log.info("단계 3/4: 변환")
    samples = adapter.transform(events)

    log.info("단계 4/4: 출력")
    write_jsonl(args.output, samples)

    log.info("완료. 입력=%d건 → 출력=%d건", len(events), len(samples))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
