"""
역할: 여러 참여자가 내보낸 이벤트 JSON 파일들을 병합·검증한다.

다중 테스터(약 20개 약국) 운영에서 필요한 전처리를 한 곳에서 수행:
    1. 다중 파일 입력 (파일 경로 나열 또는 glob)
    2. event_id 기준 중복 제거 (같은 참여자가 두 번 export 해도 안전)
    3. site_id 정규화 (www. 접두사 제거 + 선택적 alias 매핑)
    4. 금지 토큰 자동 스캔 (extension redaction과 동일 패턴 + 세션 키워드)
    5. 스키마 필수 필드 검증
    6. 참여자/사이트/버전별 요약 리포트

출력 파일은 export_training_data.py 의 --input 으로 바로 사용 가능하다.

사용 예:
    python tools/merge_events.py \\
        --input ./collected/orderRx-events-*.json \\
        --output ./merged-events.json \\
        --alias ./site_aliases.json          # 선택

    # alias 파일 형식: { "pharm-a.kr": "pharm-a.co.kr", ... }  (key를 value로 치환)

종료 코드:
    0 = 정상 (금지 토큰 0건)
    1 = 인자/입력 오류
    2 = 금지 토큰 발견 — 출력 파일은 생성되지 않음. 리포트 확인 후 원본 격리 필요.

상세 문서:
    03_architecture/event_schema_m1_detail.md  (redaction 패턴 원본)
    apps/extension/PARTICIPANT_GUIDE.md §6     (참여자 셀프 검증 — 이 도구는 운영자측 자동화)
"""

from __future__ import annotations

import argparse
import glob
import json
import logging
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any

logging.basicConfig(
    level=logging.INFO,
    format="[%(levelname)s][%(name)s][%(funcName)s] %(message)s",
)
log = logging.getLogger("orderrx.merge")

# ---------------------------------------------------------------------------
# 금지 토큰 패턴 — extension의 text_patterns.ts 와 동일한 5종 + 세션/인증 키워드.
# extension redaction이 정상 동작했다면 병합 입력에서 단 1건도 매치되면 안 된다.
# 매치 발견 = redaction 버그 또는 조작된 파일 → 병합 중단이 안전하다.
# ---------------------------------------------------------------------------
FORBIDDEN_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("card", re.compile(r"\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b")),
    ("rrn", re.compile(r"\b\d{6}[-\s]?\d{7}\b")),
    ("phone", re.compile(r"01\d[-.\s]?\d{3,4}[-.\s]?\d{4}")),
    ("email", re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")),
    ("session_param", re.compile(r"(?i)(jsessionid|phpsessid|aspsessionid|access_token|refresh_token)=")),
]

#: 이벤트 객체에 존재해서는 안 되는 키 (값 원문 저장 금지 원칙)
FORBIDDEN_KEYS = {"value", "field_value", "input_value", "password", "raw_value"}

#: 금지 패턴 스캔에서 제외하는 ID 필드.
#: UUID의 숫자-only 그룹(예: 1111-1111-4111-…)이 card 패턴에 오탐되는 것을 방지.
ID_FIELDS = {"event_id", "session_id", "participant_id", "update_of", "trigger_event_id"}

#: 스키마 공통 필수 필드 (event_base.schema.json 의 required와 동기)
REQUIRED_FIELDS = [
    "schema_version",
    "event_id",
    "session_id",
    "participant_id",
    "site_id",
    "event_type",
    "event_time",
    "redaction_status",
    "url_canonical",
]

VALID_EVENT_TYPES = {
    "page_enter",
    "click",
    "field_focus",
    "submit",
    "navigate",
    "result_rendered",
}


# ---------------------------------------------------------------------------
# 입력 로드
# ---------------------------------------------------------------------------
def load_input_files(patterns: list[str]) -> list[tuple[str, list[dict[str, Any]]]]:
    """
    파일 경로/glob 패턴 목록을 확장해 (파일명, 이벤트 리스트) 쌍으로 반환.

    Args:
        patterns: 파일 경로 또는 glob 패턴 목록.

    Raises:
        FileNotFoundError: 매치되는 파일이 하나도 없을 때.
        ValueError: JSON 최상위가 배열이 아닐 때.
    """
    paths: list[Path] = []
    for p in patterns:
        matched = sorted(glob.glob(p))
        if matched:
            paths.extend(Path(m) for m in matched)
        elif Path(p).exists():
            paths.append(Path(p))
    if not paths:
        raise FileNotFoundError(f"입력 파일 없음: {patterns}")

    result = []
    for path in paths:
        log.info("읽기: %s", path)
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, list):
            raise ValueError(f"{path}: 최상위는 이벤트 배열이어야 합니다.")
        log.info("읽기 완료: %s → %d건", path.name, len(data))
        result.append((path.name, data))
    return result


# ---------------------------------------------------------------------------
# 검증
# ---------------------------------------------------------------------------
def scan_forbidden(events: list[dict[str, Any]], source: str) -> list[str]:
    """
    이벤트 목록 전체를 JSON 직렬화해 금지 패턴/금지 키를 스캔한다.

    Returns:
        발견된 문제 설명 리스트 (값 원문은 절대 포함하지 않는다 — 종류와 위치만).
    """
    problems: list[str] = []
    for i, e in enumerate(events):
        # 금지 키 검사 (중첩 1단계까지 — M1 이벤트는 평탄 구조)
        bad_keys = FORBIDDEN_KEYS & set(e.keys())
        if bad_keys:
            problems.append(f"{source}[{i}] 금지 키 존재: {sorted(bad_keys)}")

        scannable = {k: v for k, v in e.items() if k not in ID_FIELDS}
        serialized = json.dumps(scannable, ensure_ascii=False)
        for name, pattern in FORBIDDEN_PATTERNS:
            if pattern.search(serialized):
                eid = str(e.get("event_id", "?"))[:8]
                problems.append(
                    f"{source}[{i}] (event_id={eid}…) 금지 패턴 매치: {name}"
                )
    return problems


def validate_required(events: list[dict[str, Any]], source: str) -> list[str]:
    """공통 필수 필드 존재와 event_type 유효성을 검사한다."""
    problems: list[str] = []
    for i, e in enumerate(events):
        missing = [f for f in REQUIRED_FIELDS if f not in e]
        if missing:
            problems.append(f"{source}[{i}] 필수 필드 누락: {missing}")
        etype = e.get("event_type")
        if etype not in VALID_EVENT_TYPES:
            problems.append(f"{source}[{i}] 알 수 없는 event_type: {etype}")
    return problems


# ---------------------------------------------------------------------------
# 정규화 / 병합
# ---------------------------------------------------------------------------
def normalize_site_id(site_id: str, aliases: dict[str, str]) -> str:
    """
    site_id 를 정규화한다.

    규칙:
        1. 소문자화 + 공백 제거
        2. "www." 접두사 제거 (테스터마다 www 유무가 갈려 site_id가 쪼개지는 문제 대응)
        3. alias 맵 적용 (운영자가 수동으로 지정한 동일 사이트 묶기)
    """
    s = site_id.strip().lower()
    if s.startswith("www."):
        s = s[4:]
    return aliases.get(s, s)


def merge_events(
    files: list[tuple[str, list[dict[str, Any]]]], aliases: dict[str, str]
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """
    파일들을 병합한다: site_id 정규화 → event_id dedupe → event_time 정렬.

    Returns:
        (병합된 이벤트 리스트, 리포트용 통계 dict)
    """
    seen_ids: set[str] = set()
    merged: list[dict[str, Any]] = []
    dup_count = 0
    site_renames = 0

    for source, events in files:
        for e in events:
            # 단계 1: site_id 정규화
            original_site = str(e.get("site_id", ""))
            normalized = normalize_site_id(original_site, aliases)
            if normalized != original_site:
                e = {**e, "site_id": normalized, "site_id_original": original_site}
                site_renames += 1

            # 단계 2: dedupe
            eid = str(e.get("event_id", ""))
            if eid in seen_ids:
                dup_count += 1
                continue
            seen_ids.add(eid)
            merged.append(e)

    # 단계 3: 시간 정렬
    merged.sort(key=lambda e: str(e.get("event_time", "")))

    stats = {
        "input_files": len(files),
        "input_events": sum(len(ev) for _, ev in files),
        "output_events": len(merged),
        "duplicates_removed": dup_count,
        "site_ids_normalized": site_renames,
    }
    return merged, stats


# ---------------------------------------------------------------------------
# 리포트
# ---------------------------------------------------------------------------
def print_report(merged: list[dict[str, Any]], stats: dict[str, Any]) -> None:
    """참여자/사이트/버전 분포와 병합 통계를 로그로 출력한다. 값 원문은 출력하지 않는다."""
    by_participant = Counter(str(e.get("participant_id", "?"))[:8] for e in merged)
    by_site = Counter(str(e.get("site_id", "?")) for e in merged)
    by_type = Counter(str(e.get("event_type", "?")) for e in merged)
    by_app_version = Counter(str(e.get("app_version", "(없음<0.1.1)")) for e in merged)
    times = [str(e.get("event_time", "")) for e in merged if e.get("event_time")]

    log.info("=== 병합 리포트 ===")
    log.info("입력 파일 %d개 / 입력 %d건 → 출력 %d건 (중복 제거 %d건, site_id 정규화 %d건)",
             stats["input_files"], stats["input_events"], stats["output_events"],
             stats["duplicates_removed"], stats["site_ids_normalized"])
    log.info("참여자 %d명: %s", len(by_participant),
             {k: v for k, v in by_participant.most_common()})
    log.info("사이트 %d곳: %s", len(by_site), {k: v for k, v in by_site.most_common()})
    log.info("이벤트 유형: %s", dict(by_type))
    log.info("확장 버전 분포: %s", dict(by_app_version))
    if times:
        log.info("수집 기간: %s ~ %s", min(times), max(times))


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def parse_args() -> argparse.Namespace:
    """CLI 인자 파싱."""
    p = argparse.ArgumentParser(description="OrderRx 다중 참여자 이벤트 병합·검증기")
    p.add_argument("--input", required=True, nargs="+",
                   help="입력 이벤트 JSON 파일 경로 또는 glob 패턴 (복수 가능)")
    p.add_argument("--output", required=True, type=Path, help="병합 결과 JSON 경로")
    p.add_argument("--alias", type=Path, default=None,
                   help="site_id alias 매핑 JSON 파일 (선택). 형식: {\"별칭\": \"정규 site_id\"}")
    p.add_argument("--allow-invalid", action="store_true",
                   help="필수 필드 누락 이벤트를 건너뛰고 계속 진행 (기본: 경고만 하고 포함)")
    return p.parse_args()


def main() -> int:
    """엔트리 포인트. 단계별 로그 남김."""
    args = parse_args()

    log.info("단계 1/5: 입력 로드")
    try:
        files = load_input_files(args.input)
    except (FileNotFoundError, ValueError, json.JSONDecodeError) as err:
        log.error("입력 로드 실패: %s", err)
        return 1

    aliases: dict[str, str] = {}
    if args.alias:
        log.info("alias 로드: %s", args.alias)
        aliases = json.loads(args.alias.read_text(encoding="utf-8"))

    log.info("단계 2/5: 금지 토큰 스캔")
    forbidden: list[str] = []
    for source, events in files:
        forbidden.extend(scan_forbidden(events, source))
    if forbidden:
        for msg in forbidden[:50]:
            log.error("금지 토큰: %s", msg)
        log.error("금지 토큰 %d건 발견 — 병합 중단. 해당 원본 파일 격리 후 redaction 버그 조사 필요.",
                  len(forbidden))
        return 2

    log.info("단계 3/5: 스키마 검증")
    invalid: list[str] = []
    for source, events in files:
        invalid.extend(validate_required(events, source))
    for msg in invalid[:20]:
        log.warning("검증 경고: %s", msg)
    if invalid:
        log.warning("검증 경고 총 %d건 (%s)", len(invalid),
                    "해당 이벤트 제외" if args.allow_invalid else "포함하고 진행")

    log.info("단계 4/5: 병합")
    if args.allow_invalid and invalid:
        # 필수 필드가 없는 이벤트를 제외
        bad_index: set[tuple[str, int]] = set()
        for msg in invalid:
            src, idx = msg.split("[", 1)[0], int(msg.split("[", 1)[1].split("]", 1)[0])
            bad_index.add((src, idx))
        files = [
            (src, [e for i, e in enumerate(evts) if (src, i) not in bad_index])
            for src, evts in files
        ]
    merged, stats = merge_events(files, aliases)

    log.info("단계 5/5: 출력")
    args.output.write_text(
        json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    log.info("쓰기 완료: %s", args.output)

    print_report(merged, stats)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
