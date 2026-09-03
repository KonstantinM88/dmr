'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { parseTrustedTableQrUrl } from '@/domains/tables/shared/table-qr';

type ScannerControls = { stop: () => void };

function cameraErrorKey(error: unknown): 'cameraDenied' | 'cameraMissing' | 'cameraError' {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return 'cameraDenied';
    }
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return 'cameraMissing';
    }
  }

  return 'cameraError';
}

export function TableQrScanner(props: {
  configuredSiteUrl: string;
  currentTableLabel?: string;
}) {
  const t = useTranslations('tableQrScanner');
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [messageKey, setMessageKey] = useState<
    'starting' | 'aimCamera' | 'invalidQr' | 'cameraDenied' | 'cameraMissing' | 'cameraError'
  >('starting');

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    async function startScanner() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setMessageKey('cameraError');
        return;
      }

      setMessageKey('starting');

      try {
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        const reader = new BrowserQRCodeReader(undefined, {
          delayBetweenScanAttempts: 250,
          delayBetweenScanSuccess: 750,
        });
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current ?? undefined,
          (result, _error, activeControls) => {
            if (!result) return;

            const target = parseTrustedTableQrUrl(result.getText(), [
              window.location.origin,
              props.configuredSiteUrl,
            ]);

            if (!target) {
              setMessageKey('invalidQr');
              return;
            }

            activeControls.stop();
            window.location.assign(target);
          },
        );

        if (cancelled) {
          controls.stop();
          return;
        }

        controlsRef.current = controls;
        setMessageKey('aimCamera');
      } catch (error) {
        if (!cancelled) setMessageKey(cameraErrorKey(error));
      }
    }

    void startScanner();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [isOpen, props.configuredSiteUrl]);

  function closeScanner() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setIsOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[var(--color-brass)] bg-[var(--color-brass)]/10 px-5 py-2.5 text-sm font-semibold text-[var(--color-brass)] transition hover:bg-[var(--color-brass)] hover:text-[var(--color-ink-950)]"
      >
        <span aria-hidden="true">⌗</span>
        {props.currentTableLabel ? t('scanAnother') : t('open')}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="table-qr-scanner-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-3 backdrop-blur-sm sm:items-center sm:p-6"
        >
          <section className="w-full max-w-lg overflow-hidden rounded-[1.25rem] border border-[var(--color-ink-700)] bg-[var(--color-ink-950)] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--color-ink-800)] p-5">
              <div>
                <p className="eyebrow">QR</p>
                <h2
                  id="table-qr-scanner-title"
                  className="mt-1 font-[family-name:var(--font-display)] text-2xl"
                >
                  {t('title')}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeScanner}
                aria-label={t('close')}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-ink-700)] text-xl text-[var(--color-paper-dim)]"
              >
                ×
              </button>
            </div>

            <div className="p-4 sm:p-5">
              <div className="relative aspect-square overflow-hidden rounded-[var(--radius-card)] bg-black">
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  className="h-full w-full object-cover"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-[13%] rounded-2xl border-2 border-[var(--color-brass)] shadow-[0_0_0_999px_rgba(0,0,0,0.28)]"
                />
              </div>
              <p
                aria-live="polite"
                className={`mt-4 text-sm ${messageKey === 'invalidQr' || messageKey.startsWith('camera') ? 'text-[var(--color-clay)]' : 'text-[var(--color-paper-dim)]'}`}
              >
                {t(messageKey)}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-[var(--color-paper-faint)]">
                {t('privacy')}
              </p>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
