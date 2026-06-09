export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = Record<string, string | number | boolean | undefined>;

export function createLogger(scope: string) {
  function log(level: LogLevel, message: string, context?: LogContext): void {
    const entry = {
      ts: new Date().toISOString(),
      level,
      scope,
      message,
      ...context,
    };
    const line = JSON.stringify(entry);
    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  }
  return {
    debug: (msg: string, ctx?: LogContext) => log('debug', msg, ctx),
    info: (msg: string, ctx?: LogContext) => log('info', msg, ctx),
    warn: (msg: string, ctx?: LogContext) => log('warn', msg, ctx),
    error: (msg: string, ctx?: LogContext) => log('error', msg, ctx),
  };
}
