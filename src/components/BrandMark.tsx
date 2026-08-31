import { useI18n } from '../i18n';
export default function BrandMark({ size = 40 }: { size?: number }) {
  useI18n();
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" aria-hidden="true">
      <path d="M8 5h21l8 9v23a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3V5Z" fill="var(--color-mint)" />
      <path
        d="M29 5v7a2 2 0 0 0 2 2h6"
        stroke="var(--color-ink)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M15 15v17h15"
        stroke="var(--color-ink)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m21 24 4-4 4 4M25 20v8"
        stroke="var(--color-ink)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 13V8a6 6 0 0 1 6-6h9"
        stroke="var(--color-lilac-deep)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
