import { describe, expect, it } from 'vitest';
import {
  detectCameraHelpPlatform,
  parseTrustedTableQrUrl,
} from '@/domains/tables/shared/table-qr';

const token = 'abcdefghijklmnop_1234567890-ABCD';
const productionOrigin = 'https://dmr.example.com';

describe('trusted table QR URL parser', () => {
  it('accepts an exact table route on a trusted origin', () => {
    expect(
      parseTrustedTableQrUrl(`${productionOrigin}/t/${token}`, [productionOrigin]),
    ).toBe(`${productionOrigin}/t/${token}`);
  });

  it('accepts the current deployment origin in addition to the canonical origin', () => {
    expect(
      parseTrustedTableQrUrl(`https://preview.example.com/t/${token}`, [
        productionOrigin,
        'https://preview.example.com',
      ]),
    ).toBe(`https://preview.example.com/t/${token}`);
  });

  it.each([
    `https://evil.example/t/${token}`,
    `${productionOrigin}/de/t/${token}`,
    `${productionOrigin}/t/short`,
    `${productionOrigin}/t/${token}/extra`,
    `${productionOrigin}/t/${token}?next=https://evil.example`,
    `${productionOrigin}/t/${token}#fragment`,
    `javascript:alert(1)`,
    'not-a-url',
  ])('rejects an untrusted or malformed QR value: %s', (value) => {
    expect(parseTrustedTableQrUrl(value, [productionOrigin])).toBeNull();
  });
});

describe('camera help platform', () => {
  it.each([
    ['Mozilla/5.0 (Linux; Android 15)', 'android'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'ios'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'other'],
  ] as const)('maps %s to %s', (userAgent, expected) => {
    expect(detectCameraHelpPlatform(userAgent)).toBe(expected);
  });
});
