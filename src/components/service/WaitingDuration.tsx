'use client';

import { useEffect, useState } from 'react';

export function WaitingDuration(props: { since: string; prefix: string; className?: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const updateNow = () => setNow(Date.now());
    updateNow();

    const timer = window.setInterval(updateNow, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  if (now === null) {
    return (
      <span className={props.className}>
        {props.prefix}: --:--
      </span>
    );
  }

  const seconds = Math.max(0, Math.floor((now - new Date(props.since).getTime()) / 1_000));
  const minutesPart = Math.floor(seconds / 60);
  const secondsPart = String(seconds % 60).padStart(2, '0');

  return (
    <span className={props.className}>
      {props.prefix}: {minutesPart}:{secondsPart}
    </span>
  );
}
