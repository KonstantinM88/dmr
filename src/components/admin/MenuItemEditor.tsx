'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { AdminMenuCategoryView, AdminMenuItemView, MenuEditorReferenceData } from '@/domains/menu/shared/types';
import { formatPriceInput } from '@/domains/menu/shared/editor';

type SaveResult = { ok: boolean; reason?: string };
type Translation = AdminMenuItemView['translations']['de'];

export function MenuItemEditor(props: { item?: AdminMenuItemView; categories: Pick<AdminMenuCategoryView, 'id' | 'title'>[]; references: MenuEditorReferenceData; action: (payload: unknown) => Promise<SaveResult> }) {
  const t = useTranslations('admin');
  const item = props.item;
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? props.categories[0]?.id ?? '');
  const [stationId, setStationId] = useState(item?.stationId ?? '');
  const [taxProfileId, setTaxProfileId] = useState(item?.taxProfileId ?? props.references.taxProfiles.find((p) => p.isDefault)?.id ?? '');
  const [slug, setSlug] = useState(item?.slug ?? '');
  const [price, setPrice] = useState(item ? formatPriceInput(item.basePriceCents) : '');
  const [sortOrder, setSortOrder] = useState(String(item?.sortOrder ?? 0));
  const [spiceLevel, setSpiceLevel] = useState(item?.spiceLevel ?? 'NONE');
  const [isPublished, setIsPublished] = useState(item?.isPublished ?? false);
  const [isAvailable, setIsAvailable] = useState(item?.isAvailable ?? true);
  const [allergenIds, setAllergenIds] = useState<string[]>(item?.allergenIds ?? []);
  const [de, setDe] = useState(item?.translations.de ?? emptyTranslation());
  const [ru, setRu] = useState(item?.translations.ru ?? emptyTranslation());
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [reason, setReason] = useState('');
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setStatus('idle');
    startTransition(async () => {
      const result = await props.action({ ...(item ? { id: item.id } : {}), categoryId, stationId: stationId || null, taxProfileId: taxProfileId || null, slug, price, sortOrder: Number(sortOrder), spiceLevel, isPublished, isAvailable, allergenIds, translations: { de, ru } });
      setReason(result.reason ?? ''); setStatus(result.ok ? 'saved' : 'error');
      if (result.ok && !item) { setSlug(''); setPrice(''); setAllergenIds([]); setDe(emptyTranslation()); setRu(emptyTranslation()); }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField label={t('editorCategory')} value={categoryId} onChange={setCategoryId} required options={props.categories.map((c) => ({ value: c.id, label: c.title }))} />
        <SelectField label={t('editorStation')} value={stationId} onChange={setStationId} options={[{ value: '', label: t('stationUnassigned') }, ...props.references.stations.map((s) => ({ value: s.id, label: `${s.name} · ${stationLabel(s.kind, t)}` }))]} />
        <SelectField label={t('editorTax')} value={taxProfileId} onChange={setTaxProfileId} options={[{ value: '', label: t('editorNoTax') }, ...props.references.taxProfiles.map((p) => ({ value: p.id, label: `${p.name} · ${p.rateBasisPoints / 100} %` }))]} />
        <SelectField label={t('editorSpice')} value={spiceLevel} onChange={(value) => setSpiceLevel(value as typeof spiceLevel)} options={(['NONE', 'MILD', 'MEDIUM', 'HOT'] as const).map((value) => ({ value, label: t(`spice${value}`) }))} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('editorSlug')}><input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={80} value={slug} onChange={(e) => setSlug(e.target.value)} className="admin-input" /></Field>
        <Field label={t('editorPrice')}><input required inputMode="decimal" pattern="\d{1,5}([,.]\d{1,2})?" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="12,50" className="admin-input" /></Field>
        <Field label={t('editorSortOrder')}><input required type="number" min="0" max="10000" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="admin-input" /></Field>
      </div>
      <ItemTranslationFields locale="DE" value={de} setValue={setDe} />
      <ItemTranslationFields locale="RU" value={ru} setValue={setRu} />
      <fieldset className="rounded-[var(--radius-card)] border border-[var(--color-ink-800)] p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <legend className="eyebrow">{t('editorAllergens')}</legend>
            <p className="mt-1 text-xs text-[var(--color-paper-faint)]">{t('editorAllergensHint')}</p>
          </div>
          <span className="rounded-full bg-[var(--color-ink-850)] px-2.5 py-1 font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-paper-dim)]">
            {t('editorAllergensSelected', { count: allergenIds.length })}
          </span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {props.references.allergens.map((allergen) => {
            const checked = allergenIds.includes(allergen.id);
            return (
              <label key={allergen.id} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition ${checked ? 'border-[var(--color-brass-dim)] bg-[var(--color-brass)]/8 text-[var(--color-paper)]' : 'border-[var(--color-ink-800)] text-[var(--color-paper-dim)] hover:border-[var(--color-ink-700)]'}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => setAllergenIds((current) => event.target.checked ? [...current, allergen.id] : current.filter((id) => id !== allergen.id))}
                />
                <span className="min-w-0"><span className="block">{allergen.name}</span><span className="font-[family-name:var(--font-mono)] text-[10px] text-[var(--color-paper-faint)]">{allergen.code}</span></span>
              </label>
            );
          })}
        </div>
        {allergenIds.length > 0 && <button type="button" onClick={() => setAllergenIds([])} className="mt-3 text-xs text-[var(--color-brass)] underline underline-offset-4">{t('editorClearAllergens')}</button>}
      </fieldset>
      <div className="flex flex-wrap gap-5"><Check label={t('editorPublished')} checked={isPublished} onChange={setIsPublished} /><Check label={t('editorAvailable')} checked={isAvailable} onChange={setIsAvailable} /></div>
      <div className="flex flex-wrap items-center gap-3"><button type="submit" disabled={isPending || props.categories.length === 0} className="min-h-10 rounded-full border border-[var(--color-brass)] px-4 text-sm text-[var(--color-brass)] disabled:opacity-50">{isPending ? t('editorSaving') : item ? t('editorSaveItem') : t('editorCreateItem')}</button>{status === 'saved' && <span role="status" className="text-xs text-[var(--color-sage)]">{t('editorSaved')}</span>}{status === 'error' && <span role="alert" className="text-xs text-[var(--color-clay)]">{reason === 'duplicate_slug' ? t('editorDuplicateSlug') : reason === 'invalid_reference' ? t('editorInvalidReference') : t('editorInvalid')}</span>}</div>
    </form>
  );
}

function emptyTranslation(): Translation { return { name: '', shortDescription: '', fullDescription: '', ingredients: '' }; }
function ItemTranslationFields(props: { locale: string; value: Translation; setValue: (value: Translation) => void }) {
  const t = useTranslations('admin'); const set = (key: keyof Translation, value: string) => props.setValue({ ...props.value, [key]: value });
  return <fieldset className="rounded-[var(--radius-card)] border border-[var(--color-ink-800)] p-3"><legend className="eyebrow px-1">{props.locale}</legend><div className="grid gap-3 md:grid-cols-2"><Field label={t('editorItemName')}><input required maxLength={160} value={props.value.name} onChange={(e) => set('name', e.target.value)} className="admin-input" /></Field><Field label={t('editorShortDescription')}><textarea maxLength={300} value={props.value.shortDescription} onChange={(e) => set('shortDescription', e.target.value)} className="admin-input min-h-20 py-2" /></Field><Field label={t('editorFullDescription')}><textarea maxLength={4000} value={props.value.fullDescription} onChange={(e) => set('fullDescription', e.target.value)} className="admin-input min-h-24 py-2" /></Field><Field label={t('editorIngredients')}><textarea maxLength={2000} value={props.value.ingredients} onChange={(e) => set('ingredients', e.target.value)} className="admin-input min-h-24 py-2" /></Field></div></fieldset>;
}
function Field(props: { label: string; children: React.ReactNode }) { return <label className="text-xs text-[var(--color-paper-dim)]"><span className="mb-1 block">{props.label}</span>{props.children}</label>; }
function Check(props: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--color-paper-dim)]"><input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />{props.label}</label>; }
function SelectField(props: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; required?: boolean }) { return <Field label={props.label}><select required={props.required} value={props.value} onChange={(e) => props.onChange(e.target.value)} className="admin-input">{props.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>; }
type Translator = ReturnType<typeof useTranslations<'admin'>>;
function stationLabel(kind: 'KITCHEN' | 'BAR' | 'OTHER', t: Translator) { return kind === 'KITCHEN' ? t('stationKitchen') : kind === 'BAR' ? t('stationBar') : t('stationOther'); }
