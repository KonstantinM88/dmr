import 'server-only';
import { z } from 'zod';

/**
 * Контракт переменных окружения (docs/hostinger-deployment.md §3).
 * Fail-fast: при первом обращении к env отсутствующий обязательный секрет
 * останавливает процесс с понятной ошибкой, а не падает позже в рантайме.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL обязателен (Neon pooled)'),
  DIRECT_DATABASE_URL: z.string().min(1, 'DIRECT_DATABASE_URL обязателен (Neon direct)'),

  NEXT_PUBLIC_SITE_URL: z.string().url('NEXT_PUBLIC_SITE_URL должен быть абсолютным URL'),

  STAFF_SESSION_SECRET: z
    .string()
    .min(32, 'STAFF_SESSION_SECRET должен быть не короче 32 символов'),

  // Этап 4. Пустые значения = онлайн-оплата выключена fail-closed.
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_PUBLISHABLE_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),

  MEDIA_STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  MEDIA_STORAGE_BUCKET: z.string().default(''),
  MEDIA_STORAGE_REGION: z.string().default(''),
  MEDIA_STORAGE_ENDPOINT: z.string().default(''),
  MEDIA_STORAGE_ACCESS_KEY_ID: z.string().default(''),
  MEDIA_STORAGE_SECRET_ACCESS_KEY: z.string().default(''),
  MEDIA_STORAGE_PUBLIC_BASE_URL: z.string().default(''),

  // Fail-closed: без CRON_SECRET cron-эндпоинты отвечают 503.
  CRON_SECRET: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

function parseEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    // Значения переменных никогда не попадают в сообщение об ошибке.
    throw new Error(`Некорректная конфигурация окружения:\n${details}`);
  }

  const value = parsed.data;

  // `next build` always sets NODE_ENV=production while collecting page data,
  // even for a local verification build. Enforce deployment-only constraints
  // when the built application actually starts, not during compilation.
  const isNextProductionBuild = process.env.NEXT_PHASE === 'phase-production-build';

  if (value.NODE_ENV === 'production' && !isNextProductionBuild) {
    if (value.MEDIA_STORAGE_PROVIDER === 'local') {
      throw new Error(
        'MEDIA_STORAGE_PROVIDER=local запрещён в production: локальный диск процесса ' +
          'не персистентен на Hostinger (docs/hostinger-deployment.md §6).',
      );
    }
    if (!value.NEXT_PUBLIC_SITE_URL.startsWith('https://')) {
      throw new Error('NEXT_PUBLIC_SITE_URL в production должен использовать https.');
    }
  }

  const stripeValues = [
    value.STRIPE_SECRET_KEY,
    value.STRIPE_PUBLISHABLE_KEY,
    value.STRIPE_WEBHOOK_SECRET,
  ];
  const configuredStripeValues = stripeValues.filter((entry) => entry !== '').length;

  if (configuredStripeValues !== 0 && configuredStripeValues !== stripeValues.length) {
    throw new Error(
      'Stripe должен быть настроен полностью: нужны STRIPE_SECRET_KEY, ' +
        'STRIPE_PUBLISHABLE_KEY и STRIPE_WEBHOOK_SECRET, либо все три значения пустые.',
    );
  }

  if (configuredStripeValues === stripeValues.length) {
    if (!value.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
      throw new Error('Этап 4 разрешает только Stripe test mode (STRIPE_SECRET_KEY=sk_test_…).');
    }
    if (!value.STRIPE_PUBLISHABLE_KEY.startsWith('pk_test_')) {
      throw new Error('Этап 4 разрешает только Stripe test mode (STRIPE_PUBLISHABLE_KEY=pk_test_…).');
    }
    if (!value.STRIPE_WEBHOOK_SECRET.startsWith('whsec_')) {
      throw new Error('STRIPE_WEBHOOK_SECRET должен быть отдельным секретом webhook (whsec_…).');
    }
  }

  return value;
}

export function getEnv(): Env {
  cached ??= parseEnv();
  return cached;
}

/** Признак того, что Stripe сконфигурирован (Этап 4). */
export function isStripeConfigured(): boolean {
  const env = getEnv();
  return (
    env.STRIPE_SECRET_KEY !== '' &&
    env.STRIPE_PUBLISHABLE_KEY !== '' &&
    env.STRIPE_WEBHOOK_SECRET !== ''
  );
}
