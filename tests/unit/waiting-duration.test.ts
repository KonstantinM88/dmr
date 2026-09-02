import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WaitingDuration } from '@/components/service/WaitingDuration';

describe('таймер ожидания', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('рендерит стабильный placeholder на сервере независимо от текущего времени', () => {
    vi.useFakeTimers();

    vi.setSystemTime(new Date('2026-08-18T12:00:14.000Z'));
    const firstRender = renderToStaticMarkup(
      createElement(WaitingDuration, {
        since: '2026-08-18T12:00:00.000Z',
        prefix: 'Wartezeit',
      }),
    );

    vi.setSystemTime(new Date('2026-08-18T12:00:15.000Z'));
    const secondRender = renderToStaticMarkup(
      createElement(WaitingDuration, {
        since: '2026-08-18T12:00:00.000Z',
        prefix: 'Wartezeit',
      }),
    );

    expect(firstRender).toBe('<span>Wartezeit: --:--</span>');
    expect(secondRender).toBe(firstRender);
  });
});
