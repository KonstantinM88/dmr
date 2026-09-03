'use client';

/* eslint-disable @next/next/no-img-element -- URLs come from the replaceable media storage adapter. */

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { MenuMedia } from '@/domains/menu/shared/types';

type Translator = ReturnType<typeof useTranslations<'admin'>>;

export function MenuMediaManager(props: { itemId: string; media: MenuMedia[]; writable: boolean }) {
  const t = useTranslations('admin');
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [altText, setAltText] = useState('');
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setStatus('idle');
    startTransition(async () => {
      const body = new FormData();
      body.set('itemId', props.itemId); body.set('altText', altText); body.set('file', file);
      const response = await fetch('/api/admin/menu/media', { method: 'POST', body });
      const result = await response.json().catch(() => ({ error: 'processing_failed' }));
      if (!response.ok) { setError(result.error ?? 'processing_failed'); setStatus('error'); return; }
      if (fileRef.current) fileRef.current.value = '';
      setAltText(''); setStatus('saved'); router.refresh();
    });
  }

  function remove(mediaId: string) {
    if (!window.confirm(t('mediaDeleteConfirm'))) return;
    setStatus('idle');
    startTransition(async () => {
      const response = await fetch('/api/admin/menu/media', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mediaId }) });
      if (!response.ok) { setError('delete_failed'); setStatus('error'); return; }
      setStatus('saved'); router.refresh();
    });
  }

  return (
    <div className="mt-4 border-t border-[var(--color-ink-800)] pt-4">
      <h4 className="text-sm text-[var(--color-paper)]">{t('mediaTitle')}</h4>
      <p className="mt-1 text-xs leading-relaxed text-[var(--color-paper-faint)]">{t('mediaUploadHint')}</p>
      {props.media.length > 0 && <ul className="mt-3 grid gap-2 sm:grid-cols-2">{props.media.map((asset) => <li key={asset.id} className="rounded-[var(--radius-card)] border border-[var(--color-ink-800)] p-2"><div className="aspect-video overflow-hidden rounded bg-[var(--color-ink-950)]">{asset.kind === 'VIDEO' ? <video src={asset.url} poster={asset.posterUrl ?? undefined} controls muted className="h-full w-full object-cover" /> : <img src={asset.url} alt={asset.altText ?? ''} className="h-full w-full object-cover" />}</div>{props.writable && <button type="button" disabled={isPending} onClick={() => remove(asset.id)} className="mt-2 text-xs text-[var(--color-clay)] disabled:opacity-50">{t('mediaDelete')}</button>}</li>)}</ul>}
      {!props.writable && <p className="mt-3 rounded-[var(--radius-card)] border border-[var(--color-brass-dim)] bg-[var(--color-brass)]/5 p-3 text-xs leading-relaxed text-[var(--color-paper-dim)]">{t('mediaReadOnly')}</p>}
      {props.writable && <form onSubmit={upload} className="mt-3 space-y-3">
        <input ref={fileRef} required type="file" accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm" className="block w-full text-xs text-[var(--color-paper-dim)] file:mr-3 file:rounded-full file:border file:border-[var(--color-brass)] file:bg-transparent file:px-3 file:py-2 file:text-[var(--color-brass)]" />
        <label className="block text-xs text-[var(--color-paper-dim)]"><span className="mb-1 block">{t('mediaAltText')}</span><input maxLength={300} value={altText} onChange={(e) => setAltText(e.target.value)} className="admin-input" /></label>
        <button type="submit" disabled={isPending} className="min-h-10 rounded-full border border-[var(--color-brass)] px-4 text-sm text-[var(--color-brass)] disabled:opacity-50">{isPending ? t('mediaProcessing') : t('mediaUpload')}</button>
        {status === 'saved' && <span role="status" className="ml-3 text-xs text-[var(--color-sage)]">{t('editorSaved')}</span>}
        {status === 'error' && <span role="alert" className="ml-3 text-xs text-[var(--color-clay)]">{mediaError(error, t)}</span>}
      </form>}
    </div>
  );
}

function mediaError(error: string, t: Translator): string {
  if (error === 'file_too_large' || error === 'converted_file_too_large') return t('mediaTooLarge');
  if (error === 'unsupported_type' || error === 'invalid_media') return t('mediaInvalid');
  if (error === 'media_limit') return t('mediaLimit');
  if (error === 'local_upload_disabled') return t('mediaLocalOnly');
  if (error === 'storage_read_only') return t('mediaReadOnly');
  return t('mediaFailed');
}
