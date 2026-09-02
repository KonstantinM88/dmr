'use client';

export function PrintButton(props: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-full bg-[var(--color-brass)] px-5 py-2 text-sm text-[var(--color-ink-950)]"
    >
      {props.label}
    </button>
  );
}

