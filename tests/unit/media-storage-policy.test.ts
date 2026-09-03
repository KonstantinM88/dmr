import { describe, expect, it } from 'vitest';
import { canMutateMenuMedia, MEDIA_STORAGE_PROVIDERS } from '@/domains/media/shared/types';

describe('media storage runtime policy', () => {
  it('keeps local media writable outside production', () => {
    expect(canMutateMenuMedia('local', 'development')).toBe(true);
    expect(canMutateMenuMedia('local', 'test')).toBe(true);
  });

  it('blocks local writes in production', () => {
    expect(canMutateMenuMedia('local', 'production')).toBe(false);
  });

  it('keeps bundled deployment media read-only', () => {
    expect(MEDIA_STORAGE_PROVIDERS).toContain('bundled');
    expect(canMutateMenuMedia('bundled', 'development')).toBe(false);
    expect(canMutateMenuMedia('bundled', 'production')).toBe(false);
  });

  it('does not claim S3 writes before its adapter is implemented', () => {
    expect(canMutateMenuMedia('s3', 'production')).toBe(false);
  });
});
