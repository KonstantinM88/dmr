export type MediaUploadResult = {
  key: string;
  url: string;
  byteSize: number;
  mimeType: string;
};

export const MEDIA_STORAGE_PROVIDERS = ['local', 'bundled', 's3'] as const;
export type MediaStorageProvider = (typeof MEDIA_STORAGE_PROVIDERS)[number];

/**
 * Запись пока поддерживает только локальный development adapter.
 * `bundled` означает read-only файлы, включённые в deployment.
 */
export function canMutateMenuMedia(
  provider: MediaStorageProvider,
  nodeEnv: 'development' | 'test' | 'production',
): boolean {
  return provider === 'local' && nodeEnv !== 'production';
}

/** Разрешённые типы загрузки (docs/security-threat-model.md §2). */
export const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;
export const ALLOWED_VIDEO_MIME = ['video/mp4', 'video/webm'] as const;

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 40 * 1024 * 1024;
