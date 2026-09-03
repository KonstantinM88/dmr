import 'server-only';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getEnv } from '@/lib/env';
import type { MediaUploadResult } from '@/domains/media/shared/types';

/**
 * Единый интерфейс хранилища медиа (docs/architecture.md §4).
 * Домены и UI никогда не знают конкретного провайдера — он подставляется
 * по MEDIA_STORAGE_PROVIDER. Local adapter разрешён только для разработки.
 */
export interface MediaStorageAdapter {
  readonly providerName: string;
  putObject(input: {
    key: string;
    body: Uint8Array;
    contentType: string;
  }): Promise<MediaUploadResult>;
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
  deleteObject(key: string): Promise<void>;
}

/**
 * Заглушка для локальной разработки. В production запрещена явной проверкой
 * в src/lib/env.ts: нужен реальный object storage/CDN — открытый вопрос
 * Этапа 0 (docs/implementation-plan.md, вопрос 1).
 */
class LocalDevStorageAdapter implements MediaStorageAdapter {
  readonly providerName = 'local';

  async putObject(input: {
    key: string;
    body: Uint8Array;
    contentType: string;
  }): Promise<MediaUploadResult> {
    const target = resolveLocalMediaPath(input.key);
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, input.body, { flag: 'wx' });
    await rename(temporary, target);
    return {
      key: input.key,
      url: `/uploads/${input.key.replaceAll('\\', '/')}`,
      byteSize: input.body.byteLength,
      mimeType: input.contentType,
    };
  }

  async getSignedUrl(key: string): Promise<string> {
    resolveLocalMediaPath(key);
    return `/uploads/${key.replaceAll('\\', '/')}`;
  }

  async deleteObject(key: string): Promise<void> {
    await rm(resolveLocalMediaPath(key), { force: true });
  }
}

const LOCAL_UPLOAD_ROOT = path.resolve(process.cwd(), 'public', 'uploads');
const SAFE_LOCAL_KEY = /^menu\/(images|videos|posters)\/[a-f0-9-]+\.(webp|webm)$/;

function resolveLocalMediaPath(key: string): string {
  const normalized = key.replaceAll('\\', '/');
  if (!SAFE_LOCAL_KEY.test(normalized)) throw new Error('Недопустимый ключ локального media.');
  const target = path.resolve(LOCAL_UPLOAD_ROOT, ...normalized.split('/'));
  if (!target.startsWith(`${LOCAL_UPLOAD_ROOT}${path.sep}`)) {
    throw new Error('Media path выходит за разрешённый каталог.');
  }
  return target;
}

let cached: MediaStorageAdapter | null = null;

export function getMediaStorage(): MediaStorageAdapter {
  if (cached) return cached;

  const env = getEnv();
  switch (env.MEDIA_STORAGE_PROVIDER) {
    case 'local':
      cached = new LocalDevStorageAdapter();
      return cached;
    case 's3':
      // Реализация S3-совместимого адаптера добавляется после выбора
      // провайдера владельцем; интерфейс при этом не меняется.
      throw new Error('S3-адаптер ещё не сконфигурирован: провайдер не подтверждён владельцем.');
    default:
      throw new Error('Неизвестный MEDIA_STORAGE_PROVIDER.');
  }
}
