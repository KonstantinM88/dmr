import 'server-only';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const REDACTED = '[redacted]';

const SENSITIVE_KEYS = [
  'password',
  'passwordhash',
  'token',
  'tokenhash',
  'secret',
  'cookie',
  'authorization',
  'clientsecret',
  'stripe_secret_key',
  'card',
  'pan',
  'cvc',
  'iban',
];

/**
 * Structured logging с обязательным маскированием секретов
 * (docs/security-threat-model.md §2 «Утечка секретов в логах»).
 */
function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return REDACTED;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((entry) => redact(entry, depth + 1));

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    result[key] = SENSITIVE_KEYS.some((needle) => key.toLowerCase().includes(needle))
      ? REDACTED
      : redact(entry, depth + 1);
  }
  return result;
}

function write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  const payload = {
    level,
    message,
    at: new Date().toISOString(),
    ...(context ? { context: redact(context) } : {}),
  };
  const line = JSON.stringify(payload);

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => write('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => write('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => write('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => write('error', message, context),
};
