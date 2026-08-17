import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';

/**
 * Собственная промис-обёртка вместо util.promisify: типы promisify не
 * покрывают перегрузку scrypt с options, а параметры (N/r/p/maxmem) нам нужны.
 */
function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

/**
 * Хеширование паролей персонала.
 *
 * Модуль намеренно НЕ помечен `server-only`: он используется и приложением,
 * и CLI-сидом (prisma/seed.ts), который выполняется вне React-окружения.
 * Секретов внутри нет — только чистые криптографические функции.
 *
 * Этап 1 использует Node-встроенный scrypt (проверенный KDF из стандартной
 * библиотеки, не собственная криптография) — это исключает нативную сборку
 * argon2 на shared hosting. Формат строки версионирован: при переходе на
 * argon2id добавляется префикс `argon2id$` и ветка проверки, существующие
 * хеши остаются валидными (docs/rbac-matrix.md §3).
 */
const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 2 ** 14;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
// 128 * N * r ≈ 16 МБ на вычисление; лимит задаётся явно, иначе Node падает
// на дефолтном maxmem в 32 МБ. Значение осознанно умеренное: Hostinger
// Business — shared hosting с ограниченной памятью процесса.
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) {
    throw new Error('Пароль должен быть не короче 12 символов.');
  }
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize('NFKC'), salt, SCRYPT_KEYLEN, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
    maxmem: SCRYPT_MAXMEM,
  });

  return [
    'scrypt',
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const cost = Number(parts[1]);
  const blockSize = Number(parts[2]);
  const parallelization = Number(parts[3]);
  const salt = Buffer.from(parts[4] ?? '', 'base64');
  const expected = Buffer.from(parts[5] ?? '', 'base64');

  if (!Number.isInteger(cost) || !Number.isInteger(blockSize) || !Number.isInteger(parallelization)) {
    return false;
  }

  const derived = await scrypt(password.normalize('NFKC'), salt, expected.length, {
    N: cost,
    r: blockSize,
    p: parallelization,
    maxmem: SCRYPT_MAXMEM,
  });

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** Хеш токена сессии — в БД не хранится сам секрет. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Хеш IP для аудита без хранения самого адреса (GDPR-минимизация). */
export function hashIp(ip: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

export function generateOpaqueToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('base64url');
}
