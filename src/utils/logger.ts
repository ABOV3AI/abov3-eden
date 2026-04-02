/**
 * ABOV3 Eden - Logger Utility
 * Simple console-based logging with levels and timestamps
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_COLORS = {
  debug: '\x1b[36m', // cyan
  info: '\x1b[32m',  // green
  warn: '\x1b[33m',  // yellow
  error: '\x1b[31m', // red
  reset: '\x1b[0m',
};

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: LogLevel, message: string, ...args: unknown[]): string {
  const color = LOG_COLORS[level];
  const reset = LOG_COLORS.reset;
  const timestamp = formatTimestamp();
  const levelStr = level.toUpperCase().padEnd(5);

  let formattedArgs = '';
  if (args.length > 0) {
    formattedArgs = ' ' + args.map(arg =>
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
  }

  return `${color}[${timestamp}] [${levelStr}]${reset} ${message}${formattedArgs}`;
}

export const logger = {
  debug(message: string, ...args: unknown[]): void {
    if (shouldLog('debug')) {
      console.log(formatMessage('debug', message, ...args));
    }
  },

  info(message: string, ...args: unknown[]): void {
    if (shouldLog('info')) {
      console.log(formatMessage('info', message, ...args));
    }
  },

  warn(message: string, ...args: unknown[]): void {
    if (shouldLog('warn')) {
      console.warn(formatMessage('warn', message, ...args));
    }
  },

  error(message: string, ...args: unknown[]): void {
    if (shouldLog('error')) {
      console.error(formatMessage('error', message, ...args));
    }
  },

  // Log with custom prefix for tool execution
  tool(toolName: string, action: string, details?: unknown): void {
    if (shouldLog('info')) {
      const detailStr = details ? ` - ${JSON.stringify(details)}` : '';
      console.log(formatMessage('info', `[Tool:${toolName}] ${action}${detailStr}`));
    }
  },

  // Log MCP protocol messages
  mcp(direction: 'in' | 'out', method: string, id?: string | number): void {
    if (shouldLog('debug')) {
      const arrow = direction === 'in' ? '→' : '←';
      const idStr = id !== undefined ? ` (id: ${id})` : '';
      console.log(formatMessage('debug', `[MCP] ${arrow} ${method}${idStr}`));
    }
  },
};

export default logger;
