import 'server-only';
import { getEnv } from '@/lib/env';
import type { MediaUploadResult } from '@/domains/media/shared/types';

/**
 * Единый интерфейс хранилища медиа (docs/architecture.md §4).
 * Домены и UI никогда не знают конкретного провайдера — он подставляется
 * по MEDIA_STORAGE_PROVIDER. Файлы НЕ хранятся в public/ процесса
 * (docs/hostinger-deployment.md §6).
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

  async putObject(): Promise<MediaUploadResult> {
    throw new Error(
      'Загрузка медиа ещё не реализована: провайдер object storage не выбран ' +
        '(открытый вопрос Этапа 0). На Этапе 1 меню использует внешние URL из сида.',
    );
  }

  async getSignedUrl(key: string): Promise<string> {
    return `/media/${key}`;
  }

  async deleteObject(): Promise<void> {
    throw new Error('Удаление медиа недоступно у локального адаптера.');
  }
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
