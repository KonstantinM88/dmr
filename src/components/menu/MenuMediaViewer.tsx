'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import type { MenuMedia } from '@/domains/menu/shared/types';

type Props = {
  itemName: string;
  media: MenuMedia[];
};

/**
 * Выразительное превью карточки и полноэкранный просмотр media.
 * Видео намеренно ставится первым: тап по постеру сразу открывает ролик,
 * остальные изображения остаются доступны в той же галерее.
 */
export function MenuMediaViewer({ itemName, media }: Props) {
  const t = useTranslations('menu');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const orderedMedia = useMemo(
    () => [...media].sort((first, second) => Number(second.kind === 'VIDEO') - Number(first.kind === 'VIDEO')),
    [media],
  );
  const primary = orderedMedia[0];
  const primaryFallbackImage = orderedMedia.find((asset) => asset.kind === 'IMAGE');
  const hasVideo = orderedMedia.some((asset) => asset.kind === 'VIDEO');

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const triggerElement = triggerRef.current;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
      if (event.key === 'ArrowLeft') {
        setActiveIndex((current) => (current - 1 + orderedMedia.length) % orderedMedia.length);
      }
      if (event.key === 'ArrowRight') {
        setActiveIndex((current) => (current + 1) % orderedMedia.length);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      triggerElement?.focus();
    };
  }, [isOpen, orderedMedia.length]);

  if (!primary) return null;

  const openViewer = () => {
    setActiveIndex(0);
    setIsOpen(true);
  };
  const activeMedia = orderedMedia[activeIndex] ?? primary;
  const previous = () => setActiveIndex((current) => (current - 1 + orderedMedia.length) % orderedMedia.length);
  const next = () => setActiveIndex((current) => (current + 1) % orderedMedia.length);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openViewer}
        aria-label={t('mediaOpen', { name: itemName })}
        className="group/media relative block aspect-[16/10] w-full cursor-zoom-in overflow-hidden bg-[var(--color-ink-850)] text-left"
      >
        <MediaPreview
          media={primary}
          fallbackUrl={primaryFallbackImage?.url ?? null}
          alt={primary.altText ?? itemName}
          className="transition duration-700 ease-out group-hover/media:scale-[1.035]"
        />
        <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_48%,rgba(6,9,7,0.56)_100%)]" />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 sm:p-5">
          <span className="font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-[0.16em] text-white/80">
            {hasVideo ? t('mediaVideo') : t('mediaView')}
          </span>
          <span className="grid h-11 w-11 place-items-center rounded-full border border-white/30 bg-black/35 text-white shadow-xl backdrop-blur-md transition group-hover/media:scale-105 group-hover/media:bg-black/50">
            <span aria-hidden="true" className="translate-x-px text-sm">{hasVideo ? '▶' : '↗'}</span>
          </span>
        </span>
        {orderedMedia.length > 1 && (
          <span className="pointer-events-none absolute right-4 top-4 rounded-full border border-white/20 bg-black/40 px-2.5 py-1 font-[family-name:var(--font-mono)] text-[0.65rem] text-white backdrop-blur-md">
            1 / {orderedMedia.length}
          </span>
        )}
      </button>

      {isOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t('mediaDialog', { name: itemName })}
              className="fixed inset-0 z-[100] flex flex-col bg-black/92 backdrop-blur-xl"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setIsOpen(false);
              }}
            >
              <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3 sm:px-7">
                <div className="min-w-0">
                  <p className="truncate font-[family-name:var(--font-display)] text-lg text-white sm:text-xl">{itemName}</p>
                  <p className="mt-0.5 font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-[0.14em] text-white/45">
                    {t('mediaCounter', { current: activeIndex + 1, total: orderedMedia.length })}
                  </p>
                </div>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={() => setIsOpen(false)}
                  aria-label={t('mediaClose')}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/20 bg-white/5 text-2xl font-light text-white transition hover:bg-white/15"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>

              <div className="relative flex min-h-0 flex-1 items-center justify-center p-3 sm:p-7">
                <div className="relative flex h-full w-full max-w-6xl items-center justify-center overflow-hidden rounded-xl bg-black/35">
                  {activeMedia.kind === 'VIDEO' ? (
                    <video
                      key={activeMedia.id}
                      src={activeMedia.url}
                      poster={activeMedia.posterUrl ?? primaryFallbackImage?.url ?? undefined}
                      controls
                      autoPlay
                      muted
                      playsInline
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={activeMedia.id}
                      src={activeMedia.url}
                      alt={activeMedia.altText ?? itemName}
                      className="max-h-full max-w-full object-contain"
                    />
                  )}

                  {orderedMedia.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={previous}
                        aria-label={t('mediaPrevious')}
                        className="absolute left-3 grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-black/45 text-xl text-white backdrop-blur-md transition hover:bg-black/70 sm:left-5"
                      >
                        <span aria-hidden="true">‹</span>
                      </button>
                      <button
                        type="button"
                        onClick={next}
                        aria-label={t('mediaNext')}
                        className="absolute right-3 grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-black/45 text-xl text-white backdrop-blur-md transition hover:bg-black/70 sm:right-5"
                      >
                        <span aria-hidden="true">›</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {orderedMedia.length > 1 && (
                <div className="flex justify-center gap-2 overflow-x-auto border-t border-white/10 px-4 py-3">
                  {orderedMedia.map((asset, index) => (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => setActiveIndex(index)}
                      aria-label={t('mediaSelect', { number: index + 1 })}
                      aria-current={index === activeIndex}
                      className={
                        index === activeIndex
                          ? 'relative h-14 w-20 shrink-0 overflow-hidden rounded-lg border border-[var(--color-brass)] bg-white/10'
                          : 'relative h-14 w-20 shrink-0 overflow-hidden rounded-lg border border-white/15 bg-white/5 opacity-55 transition hover:opacity-100'
                      }
                    >
                      <MediaPreview media={asset} fallbackUrl={primaryFallbackImage?.url ?? null} alt="" />
                      {asset.kind === 'VIDEO' && <span aria-hidden="true" className="absolute inset-0 grid place-items-center text-xs text-white">▶</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function MediaPreview(props: {
  media: MenuMedia;
  fallbackUrl: string | null;
  alt: string;
  className?: string;
}) {
  const previewUrl = props.media.kind === 'VIDEO'
    ? (props.media.posterUrl ?? props.fallbackUrl)
    : props.media.url;

  if (previewUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={previewUrl}
        alt={props.alt}
        loading="lazy"
        className={`h-full w-full object-cover ${props.className ?? ''}`}
      />
    );
  }

  return (
    <video
      src={props.media.url}
      muted
      playsInline
      preload="metadata"
      aria-label={props.alt}
      className={`h-full w-full object-cover ${props.className ?? ''}`}
    />
  );
}
