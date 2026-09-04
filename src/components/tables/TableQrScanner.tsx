'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  detectCameraHelpPlatform,
  parseTrustedTableQrUrl,
  type CameraHelpPlatform,
} from '@/domains/tables/shared/table-qr';

type ScannerControls = { stop: () => void };
type CameraStage =
  | 'checking'
  | 'permission'
  | 'starting'
  | 'scanning'
  | 'invalid'
  | 'denied'
  | 'missing'
  | 'unavailable';

function cameraFailureStage(error: unknown): Extract<CameraStage, 'denied' | 'missing' | 'unavailable'> {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return 'denied';
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') return 'missing';
  }

  return 'unavailable';
}

export function TableQrScanner(props: {
  configuredSiteUrl: string;
  currentTableLabel?: string;
}) {
  const t = useTranslations('tableQrScanner');
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const scannerRunRef = useRef(0);
  const [isOpen, setIsOpen] = useState(false);
  const [stage, setStage] = useState<CameraStage>('checking');
  const [platform, setPlatform] = useState<CameraHelpPlatform>('other');

  const stopScanner = useCallback(() => {
    scannerRunRef.current += 1;
    controlsRef.current?.stop();
    controlsRef.current = null;

    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startScanner = useCallback(async () => {
    stopScanner();

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStage('unavailable');
      return;
    }

    const runId = scannerRunRef.current;
    setStage('starting');

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
          if (!result || runId !== scannerRunRef.current) return;

          const target = parseTrustedTableQrUrl(result.getText(), [
            window.location.origin,
            props.configuredSiteUrl,
          ]);

          if (!target) {
            setStage('invalid');
            return;
          }

          activeControls.stop();
          window.location.assign(target);
        },
      );

      if (runId !== scannerRunRef.current) {
        controls.stop();
        return;
      }

      controlsRef.current = controls;
      setStage('scanning');
    } catch (error) {
      if (runId === scannerRunRef.current) setStage(cameraFailureStage(error));
    }
  }, [props.configuredSiteUrl, stopScanner]);

  const requestCameraAccess = useCallback(async () => {
    stopScanner();
    setStage('checking');

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStage('unavailable');
      return;
    }

    if (navigator.permissions?.query) {
      try {
        const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
        if (status.state === 'denied') {
          setStage('denied');
          return;
        }
      } catch {
        // Safari и некоторые встроенные браузеры не поддерживают camera descriptor.
        // Сам getUserMedia всё равно покажет нативный prompt после явного клика.
      }
    }

    await startScanner();
  }, [startScanner, stopScanner]);

  useEffect(
    () => () => stopScanner(),
    [stopScanner],
  );

  function openScanner() {
    setPlatform(detectCameraHelpPlatform(navigator.userAgent));
    setStage('permission');
    setIsOpen(true);
  }

  function closeScanner() {
    stopScanner();
    setIsOpen(false);
  }

  const showsVideo = stage === 'starting' || stage === 'scanning' || stage === 'invalid';
  const deniedSteps =
    platform === 'android'
      ? ['deniedAndroid1', 'deniedAndroid2', 'deniedAndroid3'] as const
      : platform === 'ios'
        ? ['deniedIos1', 'deniedIos2', 'deniedIos3'] as const
        : ['deniedOther1', 'deniedOther2', 'deniedOther3'] as const;

  return (
    <>
      <button
        type="button"
        onClick={openScanner}
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
          className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:items-center sm:p-6"
        >
          <section className="w-full max-w-lg overflow-hidden rounded-[1.25rem] border border-[var(--color-ink-700)] bg-[var(--color-ink-950)] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--color-ink-800)] p-5">
              <div>
                <p className="eyebrow">QR</p>
                <h2 id="table-qr-scanner-title" className="mt-1 font-[family-name:var(--font-display)] text-2xl">
                  {t('title')}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeScanner}
                aria-label={t('close')}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--color-ink-700)] text-xl text-[var(--color-paper-dim)]"
              >
                ×
              </button>
            </div>

            <div className="p-4 sm:p-5">
              {showsVideo && (
                <div className="relative aspect-square overflow-hidden rounded-[var(--radius-card)] bg-black">
                  <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-[13%] rounded-2xl border-2 border-[var(--color-brass)] shadow-[0_0_0_999px_rgba(0,0,0,0.28)]"
                  />
                </div>
              )}

              {stage === 'checking' && (
                <div className="rounded-[var(--radius-card)] border border-[var(--color-ink-800)] p-6 text-center">
                  <span aria-hidden="true" className="text-3xl text-[var(--color-brass)]">◌</span>
                  <p className="mt-3 text-sm text-[var(--color-paper-dim)]">{t('checking')}</p>
                </div>
              )}

              {stage === 'permission' && (
                <div className="rounded-[var(--radius-card)] border border-[var(--color-brass-dim)] bg-[var(--color-brass)]/5 p-5">
                  <span aria-hidden="true" className="text-4xl">▣</span>
                  <h3 className="mt-3 font-[family-name:var(--font-display)] text-xl">{t('permissionTitle')}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--color-paper-dim)]">{t('permissionBody')}</p>
                  <button
                    type="button"
                    onClick={() => void requestCameraAccess()}
                    className="mt-5 min-h-12 w-full rounded-full bg-[var(--color-brass)] px-5 py-3 font-semibold text-[var(--color-ink-950)]"
                  >
                    {t('allowCamera')}
                  </button>
                </div>
              )}

              {stage === 'denied' && (
                <div className="rounded-[var(--radius-card)] border border-[var(--color-clay)]/50 bg-[var(--color-clay)]/10 p-5">
                  <h3 className="font-[family-name:var(--font-display)] text-xl">{t('deniedTitle')}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--color-paper-dim)]">{t('deniedBody')}</p>
                  <ol className="mt-4 space-y-3">
                    {deniedSteps.map((key, index) => (
                      <li key={key} className="flex gap-3 text-sm leading-relaxed">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-paper)] text-xs font-bold text-[var(--color-ink-950)]">
                          {index + 1}
                        </span>
                        <span>{t(key)}</span>
                      </li>
                    ))}
                  </ol>
                  <button
                    type="button"
                    onClick={() => void requestCameraAccess()}
                    className="mt-5 min-h-11 w-full rounded-full border border-[var(--color-brass)] px-5 py-2.5 font-semibold text-[var(--color-brass)]"
                  >
                    {t('retryPermission')}
                  </button>
                </div>
              )}

              {(stage === 'missing' || stage === 'unavailable') && (
                <div className="rounded-[var(--radius-card)] border border-[var(--color-clay)]/50 bg-[var(--color-clay)]/10 p-5">
                  <h3 className="font-[family-name:var(--font-display)] text-xl">{t(stage === 'missing' ? 'cameraMissingTitle' : 'cameraErrorTitle')}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--color-paper-dim)]">
                    {t(stage === 'missing' ? 'cameraMissing' : 'cameraError')}
                  </p>
                </div>
              )}

              {showsVideo && (
                <p
                  aria-live="polite"
                  className={`mt-4 text-sm ${stage === 'invalid' ? 'text-[var(--color-clay)]' : 'text-[var(--color-paper-dim)]'}`}
                >
                  {t(stage === 'starting' ? 'starting' : stage === 'invalid' ? 'invalidQr' : 'aimCamera')}
                </p>
              )}

              <div className="mt-4 border-t border-[var(--color-ink-800)] pt-4">
                <p className="text-xs leading-relaxed text-[var(--color-paper-faint)]">{t('nativeCameraHint')}</p>
                <p className="mt-2 text-xs leading-relaxed text-[var(--color-paper-faint)]">{t('privacy')}</p>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
