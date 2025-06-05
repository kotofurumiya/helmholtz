export type HelmholtzLoggerOptions = {
  readonly loglevel: LogLevel;
};

export type Logger = {
  debug(payload: Record<string, unknown>): void;
  info(payload: Record<string, unknown>): void;
  notice(payload: Record<string, unknown>): void;
  warn(payload: Record<string, unknown>): void;
  error(payload: Record<string, unknown>): void;
  critical(payload: Record<string, unknown>): void;
};

export type LogLevel = {
  label: string;
  value: number;
};

export const LogLevels: Record<'DEBUG' | 'INFO' | 'NOTICE' | 'WARN' | 'ERROR' | 'CRITICAL', LogLevel> = {
  DEBUG: {
    label: 'debug',
    value: 100,
  },
  INFO: {
    label: 'info',
    value: 200,
  },
  NOTICE: {
    label: 'notice',
    value: 300,
  },
  WARN: {
    label: 'warn',
    value: 400,
  },
  ERROR: {
    label: 'error',
    value: 500,
  },
  CRITICAL: {
    label: 'critical',
    value: 600,
  },
};

export class JsonLogger implements Logger {
  #logLevel: LogLevel = LogLevels.INFO;

  constructor(level: LogLevel = LogLevels.INFO) {
    this.#logLevel = level;
  }

  log(level: LogLevel, payload: Record<string, unknown>) {
    if (level.value < this.#logLevel.value) {
      return;
    }

    const p = { ...payload, severity: level.label };
    const pstr = JSON.stringify(p);

    if (level.value === LogLevels.WARN.value) {
      console.warn(pstr);
    } else if (level.value >= LogLevels.ERROR.value) {
      console.error(pstr);
    } else {
      console.log(pstr);
    }
  }

  debug(payload: Record<string, unknown>) {
    this.log(LogLevels.DEBUG, payload);
  }

  info(payload: Record<string, unknown>) {
    this.log(LogLevels.INFO, payload);
  }

  notice(payload: Record<string, unknown>) {
    this.log(LogLevels.NOTICE, payload);
  }

  warn(payload: Record<string, unknown>) {
    this.log(LogLevels.WARN, payload);
  }

  error(payload: Record<string, unknown>) {
    this.log(LogLevels.ERROR, payload);
  }

  critical(payload: Record<string, unknown>) {
    this.log(LogLevels.CRITICAL, payload);
  }
}

export const createLogger = (options: HelmholtzLoggerOptions): Logger => {
  return new JsonLogger(options.loglevel);
};
