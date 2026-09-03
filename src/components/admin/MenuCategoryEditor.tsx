'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { AdminMenuCategoryView } from '@/domains/menu/shared/types';

type SaveResult = { ok: boolean; reason?: string };

export function MenuCategoryEditor(props: {
  category?: AdminMenuCategoryView;
  action: (payload: unknown) => Promise<SaveResult>;
}) {
  const t = useTranslations('admin');
  const category = props.category;
  const [slug, setSlug] = useState(category?.slug ?? '');
  const [sortOrder, setSortOrder] = useState(String(category?.sortOrder ?? 0));
  const [isPublished, setIsPublished] = useState(category?.isPublished ?? false);
  const [deTitle, setDeTitle] = useState(category?.translations.de.title ?? '');
  const [deDescription, setDeDescription] = useState(category?.translations.de.description ?? '');
  const [ruTitle, setRuTitle] = useState(category?.translations.ru.title ?? '');
  const [ruDescription, setRuDescription] = useState(category?.translations.ru.description ?? '');
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [reason, setReason] = useState('');
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('idle');
    startTransition(async () => {
      const result = await props.action({
        ...(category ? { id: category.id } : {}),
        slug,
        sortOrder: Number(sortOrder),
        isPublished,
        translations: {
          de: { title: deTitle, description: deDescription },
          ru: { title: ruTitle, description: ruDescription },
        },
      });
      setReason(result.reason ?? '');
      setStatus(result.ok ? 'saved' : 'error');
      if (result.ok && !category) {
        setSlug(''); setDeTitle(''); setDeDescription(''); setRuTitle(''); setRuDescription('');
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <Field label={t('editorSlug')}><input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={80} value={slug} onChange={(e) => setSlug(e.target.value)} className="admin-input" /></Field>
        <Field label={t('editorSortOrder')}><input required type="number" min="0" max="10000" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="admin-input" /></Field>
      </div>
      <TranslationFields locale="DE" title={deTitle} description={deDescription} setTitle={setDeTitle} setDescription={setDeDescription} />
      <TranslationFields locale="RU" title={ruTitle} description={ruDescription} setTitle={setRuTitle} setDescription={setRuDescription} />
      <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--color-paper-dim)]"><input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />{t('editorPublished')}</label>
      <SubmitState isPending={isPending} status={status} reason={reason} create={!category} />
    </form>
  );
}

function TranslationFields(props: { locale: string; title: string; description: string; setTitle: (value: string) => void; setDescription: (value: string) => void }) {
  const t = useTranslations('admin');
  return (
    <fieldset className="rounded-[var(--radius-card)] border border-[var(--color-ink-800)] p-3">
      <legend className="eyebrow px-1">{props.locale}</legend>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={t('editorCategoryTitle')}><input required maxLength={120} value={props.title} onChange={(e) => props.setTitle(e.target.value)} className="admin-input" /></Field>
        <Field label={t('editorCategoryDescription')}><textarea maxLength={500} value={props.description} onChange={(e) => props.setDescription(e.target.value)} className="admin-input min-h-20 py-2" /></Field>
      </div>
    </fieldset>
  );
}

function Field(props: { label: string; children: React.ReactNode }) { return <label className="text-xs text-[var(--color-paper-dim)]"><span className="mb-1 block">{props.label}</span>{props.children}</label>; }
function SubmitState(props: { isPending: boolean; status: string; reason: string; create: boolean }) {
  const t = useTranslations('admin');
  return <div className="flex flex-wrap items-center gap-3"><button type="submit" disabled={props.isPending} className="min-h-10 rounded-full border border-[var(--color-brass)] px-4 text-sm text-[var(--color-brass)] disabled:opacity-50">{props.isPending ? t('editorSaving') : props.create ? t('editorCreateCategory') : t('editorSaveCategory')}</button>{props.status === 'saved' && <span role="status" className="text-xs text-[var(--color-sage)]">{t('editorSaved')}</span>}{props.status === 'error' && <span role="alert" className="text-xs text-[var(--color-clay)]">{props.reason === 'duplicate_slug' ? t('editorDuplicateSlug') : t('editorInvalid')}</span>}</div>;
}
