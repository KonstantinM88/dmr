import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import sharp from 'sharp';
import {
  ALLOWED_IMAGE_MIME,
  ALLOWED_VIDEO_MIME,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
} from '@/domains/media/shared/types';
import { getMediaStorage } from '@/domains/media/server/storage.adapter';

export type ProcessedMenuMedia = {
  kind: 'IMAGE' | 'VIDEO';
  url: string;
  posterUrl: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  byteSize: number;
  mimeType: string;
  storageKeys: string[];
};

export class MediaValidationError extends Error {}

export async function processMenuMedia(file: File): Promise<ProcessedMenuMedia> {
  if ((ALLOWED_IMAGE_MIME as readonly string[]).includes(file.type)) {
    return processImage(file);
  }
  if ((ALLOWED_VIDEO_MIME as readonly string[]).includes(file.type)) {
    return processVideo(file);
  }
  throw new MediaValidationError('unsupported_type');
}

async function processImage(file: File): Promise<ProcessedMenuMedia> {
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) throw new MediaValidationError('file_too_large');
  const storage = getMediaStorage();
  if (storage.providerName !== 'local') throw new MediaValidationError('local_upload_disabled');

  let output: Buffer;
  try {
    output = await sharp(Buffer.from(await file.arrayBuffer()), { failOn: 'error' })
      .rotate()
      .resize({ width: 1600, height: 900, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 5 })
      .toBuffer();
  } catch {
    throw new MediaValidationError('invalid_media');
  }

  const metadata = await sharp(output).metadata();
  const key = `menu/images/${randomUUID()}.webp`;
  const saved = await storage.putObject({ key, body: output, contentType: 'image/webp' });
  return {
    kind: 'IMAGE',
    url: saved.url,
    posterUrl: null,
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    durationMs: null,
    byteSize: saved.byteSize,
    mimeType: saved.mimeType,
    storageKeys: [key],
  };
}

async function processVideo(file: File): Promise<ProcessedMenuMedia> {
  if (file.size <= 0 || file.size > MAX_VIDEO_BYTES) throw new MediaValidationError('file_too_large');
  if (!ffmpegPath) throw new Error('FFmpeg binary is unavailable for this platform.');
  const storage = getMediaStorage();
  if (storage.providerName !== 'local') throw new MediaValidationError('local_upload_disabled');

  const jobId = randomUUID();
  const workDir = path.resolve(process.cwd(), 'temp', 'media-processing', jobId);
  const inputExtension = file.type === 'video/webm' ? 'webm' : 'mp4';
  const inputPath = path.join(workDir, `input.${inputExtension}`);
  const videoPath = path.join(workDir, 'output.webm');
  const posterSourcePath = path.join(workDir, 'poster.png');
  await mkdir(workDir, { recursive: true });

  try {
    await writeFile(inputPath, Buffer.from(await file.arrayBuffer()), { flag: 'wx' });
    const stderr = await runFfmpeg([
      '-y', '-i', inputPath,
      '-map_metadata', '-1',
      '-vf', "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease",
      '-c:v', 'libvpx-vp9', '-crf', '34', '-b:v', '0', '-row-mt', '1',
      '-c:a', 'libopus', '-b:a', '96k',
      videoPath,
    ]);
    await runFfmpeg([
      '-y', '-ss', '0.5', '-i', videoPath, '-frames:v', '1',
      '-vf', "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease",
      posterSourcePath,
    ]);

    const videoBody = await readFile(videoPath);
    if (videoBody.byteLength > MAX_VIDEO_BYTES) throw new MediaValidationError('converted_file_too_large');
    const posterBody = await sharp(await readFile(posterSourcePath))
      .webp({ quality: 82, effort: 5 })
      .toBuffer();
    const posterMetadata = await sharp(posterBody).metadata();
    const videoKey = `menu/videos/${jobId}.webm`;
    const posterKey = `menu/posters/${jobId}.webp`;
    const videoSaved = await storage.putObject({
      key: videoKey,
      body: videoBody,
      contentType: 'video/webm',
    });
    try {
      const posterSaved = await storage.putObject({
        key: posterKey,
        body: posterBody,
        contentType: 'image/webp',
      });
      return {
        kind: 'VIDEO',
        url: videoSaved.url,
        posterUrl: posterSaved.url,
        width: posterMetadata.width ?? null,
        height: posterMetadata.height ?? null,
        durationMs: parseDurationMs(stderr),
        byteSize: videoSaved.byteSize,
        mimeType: videoSaved.mimeType,
        storageKeys: [videoKey, posterKey],
      };
    } catch (error) {
      await storage.deleteObject(videoKey);
      throw error;
    }
  } catch (error) {
    if (error instanceof MediaValidationError) throw error;
    if (error instanceof Error && error.message.startsWith('FFmpeg failed')) {
      throw new MediaValidationError('invalid_media');
    }
    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

function runFfmpeg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath as string, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('FFmpeg failed: processing timeout'));
    }, 120_000);
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      if (stderr.length < 100_000) stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(stderr);
      else reject(new Error(`FFmpeg failed with exit code ${code ?? 'unknown'}`));
    });
  });
}

function parseDurationMs(stderr: string): number | null {
  const match = /Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr);
  if (!match) return null;
  return Math.round((Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000);
}
