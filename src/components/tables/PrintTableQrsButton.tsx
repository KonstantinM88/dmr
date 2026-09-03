'use client';

export function PrintTableQrsButton(props: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-full bg-[var(--color-brass)] px-5 py-2.5 text-sm font-semibold text-[var(--color-ink-950)]"
    >
      {props.label}
    </button>
  );
}
