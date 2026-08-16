export const FONT_SIZES: readonly number[] = Array.from({ length: 39 }, (_, index) => index + 10);

export function normalizeCodeLanguage(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_+.-]{0,39}$/.test(value)
    ? value
    : undefined;
}
export const TEXT_ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const;
export type TextAlignment = (typeof TEXT_ALIGNMENTS)[number];
export const PARAGRAPH_INDENTS = [0, 1, 2, 3, 4] as const;
export const PARAGRAPH_LINE_HEIGHTS = [1.2, 1.4, 1.6, 1.8, 2] as const;
export const HIGHLIGHT_COLORS = {
  mint: '#deeee4',
  blue: '#e0eafa',
  pink: '#f5e2e9',
  lilac: '#ebe3f6',
  butter: '#f5edcf',
} as const;
export type HighlightColor = keyof typeof HIGHLIGHT_COLORS | `#${string}`;

export function normalizeTextColor(value: unknown): string | undefined {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : undefined;
}

export function highlightCssColor(value: unknown): string | undefined {
  const color = normalizeHighlightColor(value);
  return (
    color &&
    (color.startsWith('#') ? color : HIGHLIGHT_COLORS[color as keyof typeof HIGHLIGHT_COLORS])
  );
}

export function normalizeParagraphIndent(value: unknown): number | undefined {
  return PARAGRAPH_INDENTS.find((indent) => indent === value);
}

export function normalizeParagraphLineHeight(value: unknown): number | undefined {
  return PARAGRAPH_LINE_HEIGHTS.find((height) => height === value);
}

export function normalizeHighlightColor(value: unknown): HighlightColor | undefined {
  return (
    (normalizeTextColor(value) as HighlightColor | undefined) ??
    (typeof value === 'string' && Object.hasOwn(HIGHLIGHT_COLORS, value)
      ? (value as HighlightColor)
      : undefined)
  );
}

export function normalizeFontSize(value: unknown): string | undefined {
  return typeof value === 'string' && FONT_SIZES.some((size) => value === `${size}px`)
    ? value
    : undefined;
}

export function normalizeTextAlign(value: unknown): TextAlignment | undefined {
  return TEXT_ALIGNMENTS.find((alignment) => alignment === value);
}
