'use client';

import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { unseenOperationalSignalIds } from '@/domains/realtime/shared/operational-signals';

type Props = {
  channel: string;
  signalIds: string[];
};

const SOUND_PREFERENCE_KEY = 'dmr-operational-sound';
const SOUND_PREFERENCE_EVENT = 'dmr-operational-sound-change';

/** Опциональный локальный звук: браузер разрешает его только после жеста пользователя. */
export function OperationalSignal({ channel, signalIds }: Props) {
  const t = useTranslations('operationalSignal');
  const soundEnabled = useSyncExternalStore(
    subscribeToSoundPreference,
    readSoundPreference,
    () => false,
  );
  const seenRef = useRef(new Set<string>());
  const stableSignalIds = useMemo(() => [...new Set(signalIds)].sort(), [signalIds]);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.sessionStorage.getItem(`dmr-signals:${channel}`) ?? '[]');
      if (Array.isArray(stored)) {
        seenRef.current = new Set(stored.filter((value): value is string => typeof value === 'string'));
      }
    } catch {
      seenRef.current = new Set();
    }
  }, [channel]);

  useEffect(() => {
    if (!soundEnabled) return;
    const unseen = unseenOperationalSignalIds(stableSignalIds, seenRef.current);
    if (unseen.length === 0) return;

    for (const id of stableSignalIds) seenRef.current.add(id);
    try {
      window.sessionStorage.setItem(
        `dmr-signals:${channel}`,
        JSON.stringify([...seenRef.current].slice(-200)),
      );
    } catch {
      // Visual queue remains authoritative if browser storage is unavailable.
    }
    playAttentionTone();
    navigator.vibrate?.([120, 80, 120]);
  }, [channel, soundEnabled, stableSignalIds]);

  const toggleSound = () => {
    const next = !soundEnabled;
    try {
      window.localStorage.setItem(SOUND_PREFERENCE_KEY, next ? 'on' : 'off');
    } catch {
      return;
    }
    window.dispatchEvent(new Event(SOUND_PREFERENCE_EVENT));
    if (next && stableSignalIds.length === 0) playAttentionTone();
  };

  return (
    <button
      type="button"
      onClick={toggleSound}
      aria-pressed={soundEnabled}
      className="rounded-full border border-[var(--color-ink-700)] px-3 py-1.5 text-xs text-[var(--color-paper-dim)]"
    >
      {soundEnabled ? t('disableSound') : t('enableSound')}
    </button>
  );
}

function subscribeToSoundPreference(onStoreChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === SOUND_PREFERENCE_KEY) onStoreChange();
  };
  window.addEventListener('storage', handleStorage);
  window.addEventListener(SOUND_PREFERENCE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(SOUND_PREFERENCE_EVENT, onStoreChange);
  };
}

function readSoundPreference(): boolean {
  try {
    return window.localStorage.getItem(SOUND_PREFERENCE_KEY) === 'on';
  } catch {
    return false;
  }
}

function playAttentionTone() {
  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor) return;
  const context = new AudioContextConstructor();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(880, context.currentTime);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.23);
  oscillator.addEventListener('ended', () => void context.close(), { once: true });
}
