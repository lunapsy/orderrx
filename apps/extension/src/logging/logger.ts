// 역할: 단계별 로그 유틸리티. 모든 모듈이 이 logger를 거쳐 콘솔에 출력한다.
// 원칙:
//   1. 레벨 4종 구분 (debug/info/warn/error)
//   2. 모든 로그에 모듈명 prefix 포함 → 에러 발생 위치 추적 용이
//   3. 민감정보는 절대 로그에 싣지 않는다. 호출 측 책임.

/** 로그 레벨 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** 전역 최소 로그 레벨. 이보다 낮은 레벨은 무시된다. */
let MIN_LEVEL: LogLevel = "debug";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * 전역 최소 로그 레벨을 설정한다.
 * 프로덕션 빌드에서는 "info" 이상으로 올리는 것을 권장.
 * @param level 새 최소 레벨
 */
export function setMinLevel(level: LogLevel): void {
  MIN_LEVEL = level;
}

/**
 * 모듈별 logger를 생성한다.
 * 사용 예:
 *   const log = createLogger("redaction.field_patterns");
 *   log.info("match", "pattern=password field=pw");
 * @param moduleName 모듈 식별자 (dot-separated 권장)
 */
export function createLogger(moduleName: string) {
  /**
   * 지정 레벨로 출력. 단계 이름과 메시지를 함께 남긴다.
   * @param level 로그 레벨
   * @param step 단계 이름 (예: "validate", "save", "lookup")
   * @param message 사람이 읽을 메시지
   * @param extra 선택적 추가 객체 (민감정보 금지)
   */
  function emit(level: LogLevel, step: string, message: string, extra?: unknown): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;
    const prefix = `[orderrx:${moduleName}][${level}][${step}]`;
    // Chrome extension 환경에서는 console.* 가 DevTools로 라우팅된다.
    switch (level) {
      case "debug":
        extra === undefined ? console.debug(prefix, message) : console.debug(prefix, message, extra);
        break;
      case "info":
        extra === undefined ? console.info(prefix, message) : console.info(prefix, message, extra);
        break;
      case "warn":
        extra === undefined ? console.warn(prefix, message) : console.warn(prefix, message, extra);
        break;
      case "error":
        extra === undefined ? console.error(prefix, message) : console.error(prefix, message, extra);
        break;
    }
  }

  return {
    debug: (step: string, message: string, extra?: unknown) => emit("debug", step, message, extra),
    info: (step: string, message: string, extra?: unknown) => emit("info", step, message, extra),
    warn: (step: string, message: string, extra?: unknown) => emit("warn", step, message, extra),
    error: (step: string, message: string, extra?: unknown) => emit("error", step, message, extra),
  };
}
