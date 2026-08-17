import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword, hashToken, generateOpaqueToken } from '@/lib/hash';

describe('пароли персонала', () => {
  it('верный пароль проходит проверку', async () => {
    const hash = await hashPassword('KorrektesPasswort1!');
    expect(await verifyPassword('KorrektesPasswort1!', hash)).toBe(true);
  }, 20_000);

  it('неверный пароль не проходит', async () => {
    const hash = await hashPassword('KorrektesPasswort1!');
    expect(await verifyPassword('FalschesPasswort1!', hash)).toBe(false);
  }, 20_000);

  it('одинаковые пароли дают разные хеши (случайная соль)', async () => {
    const [first, second] = await Promise.all([
      hashPassword('KorrektesPasswort1!'),
      hashPassword('KorrektesPasswort1!'),
    ]);
    expect(first).not.toBe(second);
  }, 20_000);

  it('короткий пароль отклоняется', async () => {
    await expect(hashPassword('kurz')).rejects.toThrow();
  });

  it('повреждённый хеш не проходит проверку и не бросает', async () => {
    expect(await verifyPassword('egal', 'nicht-ein-hash')).toBe(false);
  });
});

describe('токены', () => {
  it('opaque-токен непрогнозируем и не повторяется', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateOpaqueToken(24)));
    expect(tokens.size).toBe(100);
  });

  it('хеш токена детерминирован и не равен самому токену', () => {
    const token = generateOpaqueToken(24);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(token);
  });
});
