'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { MenuItemView } from '@/domains/menu/shared/types';
import { displayPriceCents, hasMultiplePrices } from '@/domains/menu/shared/types';
import { formatCents } from '@/lib/money';

type Props = {
  item: MenuItemView;
  locale: string;
  currency: string;
};

/**
 * Карточка блюда (docs/product-spec.md §2.4).
 *
 * Поведение видео: тап запускает, повторный тап ставит на паузу; вне
 * viewport воспроизведение останавливается (IntersectionObserver);
 * при prefers-reduced-motion автозапуск не предлагается вовсе.
 */
export function MenuItemCard({ item, locale, currency }: Props) {
  const t = useTranslations('menu');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const image = item.media.find((asset) => asset.kind === 'IMAGE');
  const video = item.media.find((asset) => asset.kind === 'VIDEO');

  useEffect(() => {
    const element = containerRef.current;
    const videoElement = videoRef.current;
    if (!element || !videoElement) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting && !videoElement.paused) {
            videoElement.pause();
            setIsPlaying(false);
          }
        }
      },
      { threshold: 0.25 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const toggleVideo = useCallback(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (videoElement.paused) {
      void videoElement.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      videoElement.pause();
      setIsPlaying(false);
    }
  }, []);

  const price = formatCents(displayPriceCents(item), locale, currency);

  return (
    <article
      ref={containerRef}
      className="border-b border-[var(--color-ink-800)] py-5 last:border-b-0"
      aria-labelledby={`item-${item.id}-name`}
    >
      <div className="flex gap-4">
        {(image ?? video) && (
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-ink-850)]">
            {video ? (
              <>
                <video
                  ref={videoRef}
                  src={video.url}
                  poster={video.posterUrl ?? image?.url ?? undefined}
                  muted
                  loop
                  playsInline
                  preload="none"
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={toggleVideo}
                  aria-label={isPlaying ? t('videoPause') : t('videoPlay')}
                  className="absolute inset-0 grid place-items-center bg-black/20 text-xs text-[var(--color-paper)]"
                >
                  <span aria-hidden="true">{isPlaying ? '❚❚' : '▶'}</span>
                </button>
              </>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image?.url ?? ''}
                alt={image?.altText ?? item.name}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            )}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="price-rail">
            <h3
              id={`item-${item.id}-name`}
              className="font-[family-name:var(--font-display)] text-[1.0625rem] leading-tight"
            >
              {item.name}
            </h3>
            <span className="price-rail__leader" aria-hidden="true" />
            <span className="price-rail__value">
              {hasMultiplePrices(item) ? `${t('from')} ${price}` : price}
            </span>
          </div>

          {item.shortDescription && (
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-paper-dim)]">
              {item.shortDescription}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {!item.isAvailable && (
              <span className="rounded-full bg-[var(--color-clay)]/15 px-2 py-0.5 text-xs text-[var(--color-clay)]">
                {t('soldOut')}
              </span>
            )}
            {item.dietaryTags.map((tag) => (
              <span key={tag} className="text-xs text-[var(--color-sage)]">
                {tag}
              </span>
            ))}
            {item.spiceLevel !== 'NONE' && (
              <span className="text-xs text-[var(--color-paper-faint)]">
                {t(`spiceLevel.${item.spiceLevel}`)}
              </span>
            )}
          </div>

          {(item.fullDescription ?? item.ingredients ?? item.allergens.length > 0) && (
            <>
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                aria-expanded={expanded}
                aria-controls={`item-${item.id}-details`}
                className="mt-3 text-xs text-[var(--color-brass)] underline underline-offset-4"
              >
                {expanded ? '−' : '+'} {t('ingredients')}
              </button>

              {expanded && (
                <div id={`item-${item.id}-details`} className="mt-3 space-y-2 text-xs">
                  {item.fullDescription && (
                    <p className="text-[var(--color-paper-dim)]">{item.fullDescription}</p>
                  )}
                  {item.ingredients && (
                    <p className="text-[var(--color-paper-faint)]">{item.ingredients}</p>
                  )}
                  {item.variants.length > 0 && (
                    <ul className="space-y-1">
                      {item.variants.map((variant) => (
                        <li key={variant.id} className="price-rail">
                          <span className="text-[var(--color-paper-dim)]">
                            {variant.name}
                            {variant.amountValue !== null && variant.amountUnit
                              ? ` · ${variant.amountValue} ${variant.amountUnit}`
                              : ''}
                          </span>
                          <span className="price-rail__leader" aria-hidden="true" />
                          <span className="price-rail__value">
                            {formatCents(variant.priceCents, locale, currency)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {item.allergens.length > 0 && (
                    <p className="text-[var(--color-paper-faint)]">
                      <span className="eyebrow">{t('allergens')}</span>{' '}
                      {item.allergens.join(', ')}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  );
}
